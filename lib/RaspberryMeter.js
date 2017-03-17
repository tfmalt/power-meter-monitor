/**
 * Created by tm on 11/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2016 (c) Thomas Malt
 * @license MIT
 */

const Gpio   = require('onoff').Gpio;
const logger = require('winston');

if (process.env.NODE_ENV === 'test') {
  logger.remove(logger.transports.Console);
}

/**
 * Constructor for the raspberry pi based power meter.
 * Takes a reference to the redis database object as argument
 *
 * @param {object} redis Instance of redis connection
 * @constructor
 */
class RaspberryMeter {
  constructor(redis) {
    this.counter = 0;
    this.pulses = [];
    this.db = redis;
    this.clock = new Date();
    this.start = new Date();
    this.sensor = new Gpio(18, 'in', 'both');
    this.led = new Gpio(17, 'out');
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

  /**
   * Starts the monitoring. Wathes the sensor
   * sets up event handler
   *
   * @returns {undefined}
   */
  startMonitor() {
    logger.info('Starting monitoring...');
    this.self = this;
    this.sensor.watch(this.handleSensorInterrupt);
    this.doEverySecond();
  }

  /**
   * Handler for stuff to be done every second. Since 'this' is dereferenced
   * from original object by setTimeout a reference to this is given as that
   *
   * @returns {undefined}
   */
  doEverySecond() {
    logger.info('Doing every second:', this.counter);
    logger.info(this.pulses);

    const data = {
      timestamp:  Date.now(),
      time:       (new Date()).toJSON(),
      pulseCount: this.counter,
      kWhs:       parseFloat(parseFloat(this.counter / 10000).toFixed(4)),
      watt:       parseFloat(parseFloat((this.counter / 10000) * 3600 * 1000).toFixed(4))
    };

    logger.info(data);

    this.storeSecondInDb(data);
    this.updateMeterTotal(data);
    this.verifyLimit();
    this.counter = 0;
    this.pulses = [];

    setTimeout(() => {
      this.doEverySecond(this);
    }, this.getTimeoutLength());
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
    .then((value = 0) => (parseFloat(value) + parseFloat(data.kWhs)))
    .then((value) => {
      logger.info('update meter total before set:', value);
      return db.setAsync('meterTotal', parseFloat(value).toFixed(4));
    })
    .then(() => (db.getAsync('meterTotal')))
    .then((value) => {
      logger.info('update meter total after:', value);
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
    return db.llenAsync('seconds').then((length) => {
      logger.info('  Verify limit: %s of %s', length, this.limits.seconds);

      if (length <= this.limits.seconds) {
        return false;
      }

      const index = length - this.limits.seconds;
      db.ltrimAsync('seconds', index, -1);

      return true;
    });
  }

  /**
   * @param {object} err error object
   * @param {integer} value integer value
   * @returns {undefined}
   * @private
   */
  handleSensorInterrupt(err, value) {
    if (err) {
      throw err;
    }

    let pulseLength = this.getPulseLength();

    if (this.isSensorStateChanged(value) === false) {
      this.updateLastPulse(value, pulseLength);
      return;
    }

    if (pulseLength < 5) {
      return;
    }

    if (value === 1) {
      this.counter = this.counter + 1;
    }

    this.updateLed(value);
    this.addPulse(value, pulseLength);
    this.resetPulseStart();
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
  resetPulseStartfunction() {
    this.start = new Date();
  }

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

process.on('SIGINT', () => {
  console.log('RaspberryMeter: Dealing with SIGINT.');
  console.log('  Unexporting sensor.');
  RaspberryMeter.sensor.unexport();

  console.log('  Unexporting led.');
  RaspberryMeter.led.writeSync(0);
  RaspberryMeter.led.unexport();
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
