/**
 * Created by tm on 11/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2017 (c) Thomas Malt
 * @license MIT
 */

const Gpio         = require('onoff').Gpio;
const EventEmitter = require('events').EventEmitter;
const CronEmitter  = require('cron-emitter');

/**
 * Constructor for the raspberry pi based power meter.
 * Takes a reference to the redis database object as argument
 *
 * @param {object} redis Instance of redis connection
 * @constructor
 */
class RaspberryMeter extends EventEmitter {
  constructor(redis, options = {}) {
    super();
    this.constructor.sensor = new Gpio(18, 'in', 'both');
    this.constructor.led    = new Gpio(17, 'out');

    this.emitter          = new CronEmitter();
    this.options          = options;
    this.resetCounterFlag = false;
    this.counter          = 0;
    this.pulses           = [];
    this.db               = redis;
    this.start            = new Date();

    this.limits = {
      seconds:       9000,
      minutes:       1560,
      fiveMinutes:   2304,
      thirtyMinutes: 1536,
      sixHours:      2200
    };

    this.handleSensorInterrupt = this.handleSensorInterrupt.bind(this);
    this.storeData             = this.storeData.bind(this);
    this.updateMeterTotal      = this.updateMeterTotal.bind(this);
    this.verifyLimit           = this.verifyLimit.bind(this);
    this.resetCounter          = this.resetCounter.bind(this);
  }

  get sensor() {
    return this.constructor.sensor;
  }

  get led() {
    return this.constructor.led;
  }

  /**
   * Starts the monitoring. Wathes the sensor
   * sets up event handler
   *
   * @emits 'started'
   * @returns {undefined}
   */
  startMonitor() {
    this.emit('started');

    this.sensor.watch(this.handleSensorInterrupt);

    this.emitter.add(`*/${this.options.interval} * * * * *`, 'time_to_store_data');
    this.emitter.on('time_to_store_data', () => this.storeData());

    return this;
  }

  /**
   * Handler for stuff to be done every second.
   *
   * @returns {Promise} resolved promise of what it does every second.
   */
  storeData() {
    var imps = this.options.impsPerKwh
    const kwh  = counter => counter / imps;
    const watt = (k, seconds) => k * 3600 * imps / seconds;

    // adding one to counter to combat skew.
    this.counter++;

    const data = {
      timestamp:  Date.now(),
      time:       (new Date()).toJSON(),
      pulses:     this.counter,
      kwh:        kwh(this.counter),
      watt:       watt(kwh(this.counter), this.options.interval),
      interval:   this.options.interval
    };

    return this.storeSecondInDb(data)
      .then(this.updateMeterTotal)
      .then(total => this.emit('stored_data', {data, total}))
      .then(() => this.verifyLimit())
      .then(() => (this.resetCounterFlag = true))
      .catch(error => console.log(
        'Error in storeData: ', error.message, error.stack, data
      ));
  }

  /**
   * @returns {undefined}
   * @private
   */
  resetCounter() {
    // this.emit('reset_counter', {counter: this.counter, pulses: this.pulses});
    this.counter = 0;
    this.pulses  = [];
    this.resetCounterFlag = false;
  }

  /**
   * Takes the data and stores it in the database
   *
   * @param {object} data A json object
   * @returns {Promise} the result of rpush
   * @private
   */
  storeSecondInDb(data) {
    return this.db.rpushAsync('seconds', JSON.stringify(data))
      .then(() => data);
  }

  /**
   * Increments the meter total with a new value every second.
   *
   * @param {object} data json
   * @returns {Promise} data
   */
  updateMeterTotal(data) {
    if (typeof data.kwh === 'undefined' || isNaN(data.kwh)) {
      throw new TypeError('A correct data json needs to be passed');
    }

    const db = this.db;
    return db.getAsync('meterTotal')
      .then((value = 0) => (parseFloat(value) + parseFloat(data.kwh)))
      .then(value => db.setAsync('meterTotal', value))
      .then(() => db.getAsync('meterTotal'));
  }

  /**
   * Checks length of seconds against limit and removes extra items
   *
   * @returns {boolean} true or false
   * @private
   */
  verifyLimit() {
    const db = this.db;
    return db.llenAsync('seconds')
      .then((length) => {
        if (length > this.limits.seconds) {
          db.ltrim('seconds', (length - this.limits.seconds), -1);
        }
      })
      .then(() => db.llenAsync('seconds'));
  }

  /**
   * @param {object} error error object
   * @param {integer} value integer value
   * @returns {boolean} true if state has changed, false if misfire.
   * @private
   */
  handleSensorInterrupt(error, value) {
    if (error) throw error;

    const pulseLength = this.getPulseLength();

    if (this.isSensorStateChanged(value) === false) {
      this.updateLastPulse(value, pulseLength);
      return false;
    }

    if (pulseLength < 5) return false;
    if (value === 1) this.counter++;
    if (value === 0 && this.resetCounterFlag === true) this.resetCounter();

    this.updateLed(value);
    this.addPulse(value, pulseLength);
    this.resetPulseStart();

    return true;
  }

  /**
   * @param {integer} value the value
   * @return {boolean} if sensor state has changed
   */
  isSensorStateChanged(value) {
    const last = this.getLastPulse();
    return (typeof last === 'undefined') ? true : value !== last.value;
  }

  /**
   * @param {integer} value 0 or 1 to write to the led.
   * @returns {undefined}
   * @private
   */
  updateLed(value) {
    this.led.writeSync(value);
  }

  /**
   * Calculates the interval since the last pulse event
   *
   * @returns {number} the length of pulse in milliseconds
   * @private
   */
  getPulseLength() {
    return Date.now() - this.start.getTime();
  }

  /**
   * @private
   * @returns {undefined}
   */
  resetPulseStart() {
    this.start = new Date();
  }

  /**
   * @returns {object} information about the last pulse
   */
  getLastPulse() {
    return this.pulses[this.pulses.length - 1];
  }

  updateLastPulse(value, length) {
    const last = this.getLastPulse();

    if (last.value !== value) {
      throw new Error('Value in input does not match value in array');
    }

    this.pulses[this.pulses.length - 1].length = last.length + length;
  }

  /**
   * @param {integer} value the value
   * @param {integer} length the length
   * @returns {undefined}
   * @private
   */
  addPulse(value, length) {
    this.pulses.push({value: value, length: length});
  }
}

module.exports = RaspberryMeter;

/*
 * MIT LICENSE
 *
 * Copyright (C) 2013-2017 Thomas Malt <thomas@malt.no>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
 * OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
