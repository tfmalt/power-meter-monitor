/**
 * Library for connecting to a power meter using arduino and a serial
 * interface.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright (C) 2013-2015 Thomas Malt <thomas@malt.no>
 */

/*jslint plusplus: true, sloppy: true, vars: true, node: true */

var MinimalMeter = require('./minimalMeter').MinimalMeter;
var u      = require('underscore');
var util   = require('util');
var logger = require('winston');
var Q      = require('q');

/**
 * Main meter object. Connects to the serial port hand handles all the power
 * meter readings coming over the serialport.
 *
 * The Meter object is an event emitter and signals other part of the program
 * when it receives data and at given time intervals by emitting events.
 */
function VerboseMeter(redisClient) {
    "use strict";
    VerboseMeter.super_.call(this, redisClient);
}


util.inherits(VerboseMeter, MinimalMeter);


/**
 * Calculate average of pulse time, on or off, depending on which
 * Average is always an integer.
 *
 * @param array
 * @returns {number}
 */
VerboseMeter.prototype.average = function (array) {
    if (array.length === 0) {
        return undefined;
    }

    var sum = array.reduce(function (p, c) {
        return p + c;
    });
    return Math.round(sum / array.length);
};

/**
 * Calculate median of pulse time, either on or off.
 * Median is aways an integer.
 */
VerboseMeter.prototype.median = function (array) {
    var sorted = array.sort(),
        middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2) {
        return sorted[middle];
    }
    return Math.round((sorted[middle] + sorted[middle - 1]) / 2);
};


/**
 * Takes the array of pulsetimes from the power reading and split the
 * power cycles into individual on and off arrays and return that array
 *
 * @param pulsetimes
 * @returns {{on: Array, off: Array}}
 */
VerboseMeter.prototype.splitPulsetimes = function (pulsetimes) {
    var pulses = {on: [], off: []};

    if (!(pulsetimes instanceof Array)) {
        throw new TypeError("argument to function must be an array");
    }

    pulsetimes.forEach(function (item) {
        if (item === 0) {
            return;
        }

        var split = item.split(":");
        pulses[split[0]].push(parseInt(split[1], 10));
    });

    return pulses;
};


/**
 * Calculates some stats about the pulsetimes.
 *
 * @param pulses
 * @returns {{}}
 */
VerboseMeter.prototype.calcPulseStats = function (pulses) {
    var s = {};

    s.max = u.max(pulses);
    s.min = u.min(pulses);
    s.average = this.average(pulses);
    s.median = this.median(pulses);
    s.max_deviation = (s.max - s.median) / s.median;
    s.min_deviation = (s.median - s.min) / s.median;

    return s;
};

/**
 * Calculates the median pulse in a series
 *
 * @param p
 * @returns {number}
 */
VerboseMeter.prototype.getMedianPulse = function (p) {
    p.stats = {
        on: this.calcPulseStats(p.on),
        off: this.calcPulseStats(p.off)
    };

    return 1000000 / (p.stats.on.median + p.stats.off.median);
};


/**
 * Calculates the average pulse length.
 *
 * @param pulses
 * @returns {number}
 */
VerboseMeter.prototype.getAveragePulse = function (pulses) {
    var on = pulses.on.sort();
    var off = pulses.off.sort();

    if (on.length > 3) {
        on.pop();
        on.shift();
    }

    if (off.length > 3) {
        off.pop();
        off.shift();
    }

    var onSum = on.reduce(function (a, b) {
        return a + b;
    });
    var offSum = off.reduce(function (a, b) {
        return a + b;
    });
    var onAverage = onSum / on.length;
    var offAverage = offSum / off.length;

    return 1000000 / (onAverage + offAverage);
};


VerboseMeter.prototype.calcAdjustedCount = function (p) {
    var adjusted = 0;
    var types = {
        on_max: false,
        on_min: false,
        off_max: false,
        off_min: false
    };

    if (p.on.max_deviation > 0.8) {
        types.on_max = true;
    }
    if (p.on.min_deviation > 1.0) {
        types.on_min = true;
    }
    if (p.off.max_deviation > 0.8) {
        types.off_max = true;
    }
    if (p.off.min_deviation > 1.0) {
        types.off_min = true;
    }

    if (types.on_max || types.off_max) {
        adjusted += 1;
    }

    logger.info("Deviation:", types);
    logger.info("Adjusted: %d", adjusted);

    return adjusted;
};


VerboseMeter.prototype.printPulseCountersLog = function (pc) {
    logger.info("          total raw: %s", pc.raw);
    logger.info("       total median: %s %s", pc.median, pc.medRemainder);
    logger.info("      total average: %s %s", pc.average, pc.avgRemainder);
    logger.info("     total adjusted: %s", pc.adjusted);
};

VerboseMeter.prototype.pulseCounters = {
    raw: 0,
    median: 0,
    average: 0,
    adjusted: 0,
    avgRemainder: 0,
    medRemainder: 0
};

/**
 * Stores pulsecount into hour list every second and calculcats a bunch
 * of statistica data.
 */
VerboseMeter.prototype.storeSecondInHour = function (power) {
    var now          = new Date(),
        pulseTimes   = this.splitPulsetimes(power.pulsetimes),
        averagePulse = this.getAveragePulse(pulseTimes),
        medianPulse  = this.getMedianPulse(pulseTimes),
        count        = parseInt(power.pulseCount, 10);

    power.timestamp = (now.getTime() - now.getMilliseconds());

    // Addes the stored remainder from last cycle to this cycles
    // calculated average and median
    medianPulse += this.pulseCounters.medRemainder;
    averagePulse += this.pulseCounters.avgRemainder;

    // Fetches this rounds count and remainder
    var avgCount = Math.floor(averagePulse);
    var medCount = Math.floor(medianPulse);
    var avgRemainder = averagePulse - avgCount;
    var medRemainder = medianPulse - medCount;

    // Stores numbers into pulseCounter struct.
    this.pulseCounters.avgRemainder = avgRemainder;
    this.pulseCounters.medRemainder = medRemainder;
    this.pulseCounters.raw += count;
    this.pulseCounters.median += medCount;
    this.pulseCounters.average += avgCount;

    // Logs some stuff.
    logger.info("     raw pulsecount:", count);
    logger.info("  median pulsecount:", medCount, medRemainder, medianPulse);
    logger.info(" average pulsecount:", avgCount, avgRemainder, averagePulse);

    this.pulseCounters.adjusted += count + this.calcAdjustedCount(pulseTimes);
    power.pulseCount = avgCount;

    this.printPulseCountersLog(this.pulseCounters);

    var self = this;
    return Q.ninvoke(this.db, "rpush", "hour", JSON.stringify(power)).then(function () {
        power.listType = "hour";
        self.emit("listStoreDone", power);
        return power;
    });
};


exports.VerboseMeter = VerboseMeter;

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