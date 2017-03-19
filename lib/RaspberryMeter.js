/**
 * Created by tm on 11/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2016 (c) Thomas Malt
 * @license MIT
 */

const Gpio   = require('onoff').Gpio;

/**
 * Constructor for the raspberry pi based power meter.
 * Takes a reference to the redis database object as argument
 *
 * @param {object} redis Instance of redis connection
 * @constructor
 */
class RaspberryMeter {
  constructor(redis, logger) {
    this.constructor.sensor = new Gpio(18, 'in', 'both');
    this.constructor.led    = new Gpio(17, 'out');
    this.constructor.logger = logger;

    this.counter = 0;
    this.pulses = [];
    this.db = redis;
    this.clock = new Date();
    this.start = new Date();
    this.self = null;
    this.limits = {
      seconds:       90000,
      minutes:       1560,
      fiveMinutes:   2304,
      thirtyMinutes: 1536,
      sixHours:      2200
    };

    this.handleSensorInterrupt = this.handleSensorInterrupt.bind(this);
  }

  get sensor() {
    return this.constructor.sensor;
  }

  get led() {
    return this.constructor.led;
  }

  get logger() {
    return this.constructor.logger;
  }

  /**
   * Starts the monitoring. Wathes the sensor
   * sets up event handler
   *
   * @returns {undefined}
   */
  startMonitor() {
    this.logger.info('Starting monitoring...');

    this.self = this;
    this.sensor.watch(this.handleSensorInterrupt);
    this.doEverySecond();

    return this;
  }

  /**
   * Handler for stuff to be done every second. Since 'this' is dereferenced
   * from original object by setTimeout a reference to this is given as that
   *
   * @returns {undefined}
   */
  doEverySecond() {
    const data = {
      timestamp:  Date.now(),
      time:       (new Date()).toJSON(),
      pulseCount: this.counter,
      kWhs:       parseFloat(parseFloat(this.counter / 10000).toFixed(4)),
      watt:       parseFloat(parseFloat((this.counter / 10000) * 3600 * 1000).toFixed(4))
    };

    this.storeSecondInDb(data);
    this.updateMeterTotal(data);
    this.verifyLimit();
    this.resetCounter();

    this.logger.info(data);

    /* instanbul ignore next */
    setTimeout(() => this.doEverySecond(this), this.getTimeoutLength());
  }

  /**
   * @returns {undefined}
   * @private
   */
  resetCounter() {
    this.counter = 0;
    this.pulses  = [];
  }

  /**
   * Takes the data and stores it in the database
   *
   * @param {object} data A json object
   * @returns {undefined}
   * @private
   */
  storeSecondInDb(data) {
    this.db.rpush('seconds', JSON.stringify(data));
  }

  /**
   * Increments the meter total with a new value every second.
   *
   * @param {object} data json
   * @returns {any} data
   */
  updateMeterTotal(data) {
    if (typeof data.kWhs === 'undefined' || isNaN(data.kWhs)) {
      throw new TypeError('A correct data json needs to be passed');
    }

    const db = this.db;
    return db.getAsync('meterTotal')
      .then((v = 0) => (parseFloat(v) + parseFloat(data.kWhs)))
      .then((v)     => (db.setAsync('meterTotal', parseFloat(v).toFixed(4))))
      .then(()      => (db.getAsync('meterTotal')))
      .then((value) => {
        this.logger.info('Meter total value:', value);
        return value;
      });
  }

  /**
   * Checks length of seconds against limit and removes extra items
   *
   * @returns {boolean} true or false
   * @private
   */
  verifyLimit() {
    const db = this.db;
    return this.db.llenAsync('seconds')
      .then((length) => {
        if (length > this.limits.seconds) {
          db.ltrim('seconds', (length - this.limits.seconds), -1);
          return true;
        }
        return false;
      });
  }

  /**
   * @param {object} err error object
   * @param {integer} value integer value
   * @returns {boolean} true if state has changed, false if misfire.
   * @private
   */
  handleSensorInterrupt(err, value) {
    if (err) {
      throw err;
    }

    const pulseLength = this.getPulseLength();

    if (this.isSensorStateChanged(value) === false) {
      this.updateLastPulse(value, pulseLength);
      return false;
    }

    if (pulseLength < 5) {
      return false;
    }

    if (value === 1) {
      this.counter = this.counter + 1;
    }

    this.updateLed(value);
    this.addPulse(value, pulseLength);
    this.resetPulseStart();

    return true;
  }

  /**
   * @param {integer} value the value
   * @returns {boolean} if sensor state has changed
   */
  isSensorStateChanged(value) {
    let last = this.getLastPulse();

    if (typeof last === 'undefined' || typeof last.value === 'undefined') {
      return true;
    }

    return value !== last.value;
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
   * @returns {Integer} the length of the timeout
   * @private
   */
  getTimeoutLength() {
    this.updateInternalClock();
    return (1000 + (this.clock.getTime() - Date.now()));
  }

  /**
   * Increments the internal time keeping object with 1 second (1000 ms)
   *
   * @returns {number} timestamp
   * @private
   */
  updateInternalClock() {
    this.clock.setTime(this.clock.getTime() + 1000);
    return this.clock.getTime();
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
    let last = this.getLastPulse();

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

/* istanbul ignore next */
process.on('SIGINT', () => {
  console.log('RaspberryMeter: Dealing with SIGINT.');
  console.log('  Unexporting sensor.');
  RaspberryMeter.sensor.unexport();

  console.log('  Unexporting led.');
  RaspberryMeter.led.writeSync(0);
  RaspberryMeter.led.unexport();

  process.exit(1);
});

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
