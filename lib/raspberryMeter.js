/**
 * Created by tm on 11/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2015 (c) Thomas Malt
 * @license MIT
 */

var onoff  = require('onoff');
var Gpio   = onoff.Gpio;
var logger = require('winston');
var Q      = require('q');

if (process.env.NODE_ENV === 'test') {
    logger.remove(logger.transports.Console);
}

/**
 * Constructor for the raspberry pi based power meter.
 * Takes a reference to the redis database object as argument
 *
 * @param redis
 * @constructor
 */
function RaspberryMeter(redis) {
    this.counter = 0;
    this.pulses  = [];
    this.db = redis;
}

RaspberryMeter.clock  = new Date();
RaspberryMeter.start  = new Date();
RaspberryMeter.sensor = new Gpio(18, 'in', 'both');
RaspberryMeter.led    = new Gpio(17, 'out');
RaspberryMeter.self   = null;
RaspberryMeter.limits = {
    "seconds":       4200,
    "minutes":       1560,
    "fiveMinutes":   2304, // 5 minutes for 7 + 1 day.
    "thirtyMinutes": 1536, // 30 minutes for 31+ 1 days
    "sixHours":      2200  // 6 hours for 365 + 5 days.
};

/**
 * Starts the monitoring. Wathes the sensor
 * sets up event handler
 */
RaspberryMeter.prototype.startMonitor = function() {
    logger.info("Starting monitoring...");
    RaspberryMeter.self = this;
    RaspberryMeter.sensor.watch(this._handleSensorInterrupt);
    this.doEverySecond(this);
};

/**
 * Handler for stuff to be done every second. Since 'this' is dereferenced
 * from original object by setTimeout a reference to this is given as that
 *
 * @param that
 */
RaspberryMeter.prototype.doEverySecond = function(that) {
    logger.info("Doing every second: ", that.counter);
    logger.info(that.pulses);

    var data = {
        "timestamp": Date.now(),
        "time": (new Date()).toJSON(),
        "pulseCount": this.counter,
        "kWhs": parseFloat(parseFloat(this.counter/10000).toFixed(4)),
        "watt": parseFloat(parseFloat((this.counter/10000)*3600*1000).toFixed(4))
    };

    logger.info(data);

    that.storeSecondInDb(data);
    that.updateMeterTotal(data);
    that._verifyLimit();
    that.counter = 0;
    that.pulses = [];

    setTimeout(function () {
        that.doEverySecond(that);
    }, that._getTimeoutLength());
};

/**
 * Takes the data and stores it in the database
 *
 * @param data
 * @private
 */
RaspberryMeter.prototype.storeSecondInDb = function(data) {
    this.db.rpush("seconds", JSON.stringify(data));
};


RaspberryMeter.prototype.updateMeterTotal = function(data) {
    "use strict";
    console.log(data);
};

/**
 * Checks length of seconds against limit and removes extra items
 * @private
 */
RaspberryMeter.prototype._verifyLimit = function() {
    var that = this;
    return Q.ninvoke(that.db, "llen", "seconds").then(function(length) {
        logger.info("  Verify limit: %s of %s", length, RaspberryMeter.limits.seconds);

        if (length <= RaspberryMeter.limits.seconds) {
            return false;
        }

        var index = length - RaspberryMeter.limits.seconds;
        that.db.ltrim("seconds", index, -1);

        return true;
    });
};

RaspberryMeter.prototype._handleSensorInterrupt = function(err, value) {
    if (err) {
        throw err;
    }

    var that        = RaspberryMeter.self;
    var pulseLength = that._getPulseLength();

    if (that._isSensorStateChanged(value) === false) {
        that._updateLastPulse(value, pulseLength);
        return;
    }

    if (pulseLength < 5) {
        return;
    }

    if (value === 1) {
        that.counter++;
    }

    that._updateLed(value);
    that._addPulse(value, pulseLength);
    that._resetPulseStart();
};

RaspberryMeter.prototype._isSensorStateChanged = function(value) {
    var last = this._getLastPulse();

    if (last === undefined || last.value === undefined) {
        return true;
    }

    return value !== last.value;

};

RaspberryMeter.prototype._updateLed = function(value) {
    RaspberryMeter.led.writeSync(value);
};

RaspberryMeter.prototype._getTimeoutLength = function() {
    this._updateInternalClock();
    return (1000 + (RaspberryMeter.clock.getTime() - Date.now()));
};

/**
 * Increments the internal time keeping object with 1 second (1000 ms)
 *
 * @returns {number} timestamp
 * @private
 */
RaspberryMeter.prototype._updateInternalClock = function() {
    RaspberryMeter.clock.setTime(RaspberryMeter.clock.getTime() + 1000);
    return RaspberryMeter.clock.getTime();
};

/**
 * Calculates the interval since the last pulse event and returns the value
 * in milli seconds.
 *
 * @returns {number}
 * @private
 */
RaspberryMeter.prototype._getPulseLength = function() {
    return Date.now() - RaspberryMeter.start.getTime();
};

RaspberryMeter.prototype._resetPulseStart = function() {
    RaspberryMeter.start = new Date();
};

RaspberryMeter.prototype._getLastPulse = function() {
    return this.pulses[this.pulses.length - 1];
};

RaspberryMeter.prototype._updateLastPulse = function(value, length) {
    var last = this._getLastPulse();

    if (last.value !== value) {
        throw new Error("Value in input does not match value in array");
    }

    this.pulses[this.pulses.length -1].length = last.length + length;
};

RaspberryMeter.prototype._addPulse = function(value, length) {
    this.pulses.push({"value": value, "length": length});
};

process.on('SIGINT', function() {
    console.log("RaspberryMeter: Dealing with SIGINT.");
    console.log("  Unexporting sensor.");
    RaspberryMeter.sensor.unexport();

    console.log("  Unexporting led.");
    RaspberryMeter.led.writeSync(0);
    RaspberryMeter.led.unexport();
});

exports.RaspberryMeter = RaspberryMeter;

/*
 * MIT LICENSE
 *
 * Copyright (C) 2013-2015 Thomas Malt <thomas@malt.no>
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