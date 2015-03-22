/**
 * Library for connecting to a power meter using arduino and a serial
 * interface.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright (C) 2013-2015 Thomas Malt <thomas@malt.no>
 */

/*jslint plusplus: true, sloppy: true, vars: true, node: true */

var u      = require('underscore'),
    util   = require('util'),
    logger = require('winston'),
    events = require('events'),
    Q      = require('q');


/**
 * Main meter object. Connects to the serial port hand handles all the power
 * meter readings coming over the serialport.
 *
 * The Meter object is an event emitter and signals other part of the program
 * when it receives data and at given time intervals by emitting events.
 */
function MinimalMeter(redis) {
    "use strict";
    if (redis === null || redis === undefined) {
        throw new TypeError("argument needs to be a valid redis client connection");
    }

    this.db = redis;
    events.EventEmitter.call(this);
}

util.inherits(MinimalMeter, events.EventEmitter);

// MinimalMeter.prototype.db       = null;
MinimalMeter.prototype.hasBegun = false;

/**
 * List of how many data items I store in the set for each interval.
 * This is to have known limits to the amount of data I store in redis
 * to make sure the application scales properly when deployed in the
 * cloud or on a system with very limited resources like a raspberry pi.
 */
MinimalMeter.prototype.limits = {
    "hour": 4200, // 3600 + 10 minutes // every second sum
    "day": 1560, // every minute sum 24 + 2 hour
    "week": 2304, // 5 minute sum 7 + 1 day.
    "month": 1536, // 30 min sum for 31 + 1 days.
    "year": 2200  // 6 hour sum 365 + 5 days.
};

/**
 * If this function is not called, the meter object can be used as a
 * library.
 *
 * Setting up all event handlers for the different time intervals we store
 * statistics for.
 */
MinimalMeter.prototype.startMonitor = function () {
    logger.info("Setting up event handlers");

    this.on("pulsecount",    this.handlePulseCount);
    this.on("aSecond",       this.storeSecondInHour);
    this.on("aSecond",       this.handleTimer);
    this.on("aSecond",       this.addTotalDelta);
    this.on("aMinute",       this.storeMinuteInDay);
    this.on("fiveMinutes",   this.storeFiveMinutesInWeek);
    this.on("halfHour",      this.storeThirtyMinutesInMonth);
    this.on("anHour",        this.storeHour);
    this.on("sixHours",      this.storeSixHoursInYear);
    this.on("midnight",      this.storeDay);
    this.on("aWeek",         this.storeWeek);
    this.on("listStoreDone", this.verifyLimit);
};

/**
 * handle timer is fired every second by an event listener for the
 * aSecond event It emits all the other timed trigger events to
 * calculate and store usage in the database.
 */
MinimalMeter.prototype.handleTimer = function () {
    var now  = new Date();
    var test = {
        second: 0, minute: 0, fiveMinute: 0, halfHour: 0, hour: 0,
        sixHour: 0, twelveHour: 0, midnight: 0, week: 0, month: 0, year: 0
    };

    if (now.getSeconds() !== 0) {
        return test;
    }

    test.second = 1;
    test.minute = 1;
    logger.info("emitting aMinute");
    this.emit("aMinute");

    if (now.getMinutes() === 0) {
        test.hour = 1;
        logger.info("emitting anHour");
        this.emit("anHour");

        this.handleTimerAboveMinute(now, test);
    }

    if ((now.getMinutes() % 5) === 0) {
        test.fiveMinute = 1;
        logger.info("emitting fiveMinutes");
        this.emit("fiveMinutes");
    }

    if ((now.getMinutes() % 30) === 0) {
        test.halfHour = 1;
        logger.info("emitting halfHour");
        this.emit("halfHour");
    }

    return test;
};


MinimalMeter.prototype.handleTimerAboveMinute = function (date, test) {
    if (date.getHours() === 0) {
        test.midnight = 1;
        logger.info("emitting midnight");
        this.emit("midnight");

        this.handleTimerAboveHour(date, test);
    }

    if ((date.getHours() % 6) === 0) {
        test.sixHour = 1;
        logger.info("emitting sixHours");
        this.emit("sixHours");
    }

    if ((date.getHours() % 12) === 0) {
        test.twelveHour = 1;
        logger.info("emitting twelveHours");
        this.emit("twelveHours");
    }
};


MinimalMeter.prototype.handleTimerAboveHour = function (date, test) {
    if (date.getDay() === 0) {
        test.week = 1;
        logger.info("emitting aWeek");
        this.emit("aWeek");
    }

    if (date.getDate() === 1) {
        test.month = 1;
        logger.info("emitting aMonth");
        this.emit("aMonth");

        if (date.getMonth() === 0) {
            test.year = 1;
            logger.info("emitting aYear");
            this.emit("aYear");
        }
    }
};

/**
 * Called when data is received over the serial port
 *
 * @param data - json string
 * @param that - reference to meter object.
 *
 * @returns {boolean}
 */
MinimalMeter.prototype.handleData = function (data, that) {
    logger.info("handle data: ", data);
    data = data.toString().replace(/\r/g, "");

    if (that.hasBegun === true) {
        if (that.isValidData(data)) {
            that.emit("pulsecount", JSON.parse(data));
        }
        return true;
    }
    that.hasBegun = that.isBeginning(data);
    return that.hasBegun;
};



/**
 * Tests if we are beginning a session with the arduino yet
 *
 * @param input
 * @returns {boolean}
 */
MinimalMeter.prototype.isBeginning = function (input) {
    if (!input.match(/BEGIN":\s1}/)) {
        logger.info("  is beginning: not a match.");
        return false;
    }

    return this.isValidData(input);
};

/**
 * Verifies the input data is valid JSON
 *
 * @param data
 * @returns {boolean}
 */
MinimalMeter.prototype.isValidData = function (data) {
    try {
        JSON.parse(data);
    } catch (e) {
        logger.warn(
            "Got invalid data from JSON.parse: (%s)",
            data,
            e.message
        );
        return false;
    }
    return true;
};


/**
 * event handler for when a pulse count comes in every second.
 *
 * @param power - json object
 */
MinimalMeter.prototype.handlePulseCount = function (power) {
    if (power.hasOwnProperty("pulseCount")) {
        power.outsidePulse.pop();
        power.insidePulse.pop();
        logger.info("  got pulse count: %d, %d", power.pulseCount, power.insidePulse.length);
        if (power.pulseCount != power.insidePulse.length) {
            logger.error("    pulseCount and insidePulse not equal!");
        }
        logger.info("    outside pulse: ", power.outsidePulse);
        logger.info("    inside pulse:  ", power.insidePulse);

        logger.info("    emitting aSecond");
        this.emit("aSecond", power);
    }
    else {
        logger.error("got passed invalid pulse data. Probably testing :-)");
    }
};


/**
 * Currently I calculate the current power meter reading in this
 * cumbersome way. Every time the user submit the power meter reading
 * manually I calculate the skew manually every second.
 *
 * @param power
 *
 * @returns {any}
 */
MinimalMeter.prototype.addTotalDelta = function (power) {
    var skewFactor = 1.0; // Testing a naive factor to test for skew.
    var value      = (parseInt(power.pulseCount) / 10000) * skewFactor;
    var that       = this;

    return Q.ninvoke(that.db, 'incrbyfloat', "meterTotalDelta", value).then(function (reply) {
        logger.info("  addTotalDelta: change: %d, reply: %d", value, reply);
        return reply;
    }).then(function (delta) {
        return Q.ninvoke(that.db, "get", "meterTotal").then(function (reply) {
            var data = JSON.parse(reply);
            var total = parseInt(data.value) + parseFloat(delta);
            logger.info(
                "  meter: %d, total: %d, last update: %s",
                data.value, total, data.timestamp
            );
            return total;
        });
    });
};


/**
 * Stores pulsecount into hour list every second and calculcats a bunch
 * of statistica data.
 *
 * @param power - object from parsed json input
 * @returns promise with the processed power json.
 */
MinimalMeter.prototype.storeSecondInHour = function (power) {
    var now   = new Date();
    var self  = this;

    power.timestamp  = (now.getTime() - now.getMilliseconds());

    return Q.ninvoke(this.db, "rpush", "hour", JSON.stringify(power)).then(function () {
        power.listType = "hour";
        self.emit("listStoreDone", power);
        return power;
    });
};


/**
 * Fetches the last minute from the database and stores it in the
 * day list.
 */
MinimalMeter.prototype.storeMinuteInDay = function () {
    var self = this;
    return Q.ninvoke(this.db, 'lrange', "hour", -60, -1).then(function (values) {
        var pulseCounts = [], sum = 0, item;

        for (var i = 0; i < values.length; i += 1) {
            item = JSON.parse(values[i]);
            pulseCounts.push(item.pulseCount);
            sum += parseInt(item.pulseCount, 10);
        }

        var average   = sum / values.length;
        var total     = parseInt(average * 60, 10);
        var timestamp = self.getStorageTimestamp();

        var data = {
            "timestamp": timestamp,
            "timestr": (new Date(timestamp)).toJSON(),
            "sum": sum,
            "total": total,
            "values": pulseCounts,
            "max": u.max(pulseCounts),
            "min": u.min(pulseCounts),
            "average": average
        };

        self.db.rpush("day", JSON.stringify(data));
        logger.info("store minute in day:", data);

        data.listType = "day";
        self.emit("listStoreDone", data);

        return data;
    });
};

/**
 * Fetches the last 60 minutes from the day list and calculates an hour
 *
 * @returns promise with data object after updates.
 */
MinimalMeter.prototype.storeHour = function () {
    var self = this;
    return Q.ninvoke(this.db, "lrange", "day", -60, -1).then(function (values) {
        var sum = 0;

        values.forEach(function (item) {
            var j = JSON.parse(item);
            sum += j.total;
        });

        var timestamp = self.getStorageTimestamp();
        var data = {
            "timestamp": timestamp,
            "datestr": (new Date(timestamp)).toJSON(),
            "total": sum,
            "kwh": (sum / 10000)
        };
        var key = "hour:" + data.datestr;

        self.db.set(key, JSON.stringify(data));
        logger.info("store hour:", data);

        return data;
    });
};

/**
 * Fetches data from the day storage list and calculates a full day of values
 * and stores that under the correct key.
 *
 * Listens on "midnight event" to calcualte the days usage at midnight.
 */
MinimalMeter.prototype.storeDay = function () {

    var range = 60 * 24;
    var self  = this;

    return Q.ninvoke(this.db, "lrange", "day", (range * -1), -1).then(function (values) {

        var sum = 0,
            timestamp = self.getStorageTimestamp(),
            timestr = (new Date(timestamp)).toJSON();

        values.forEach(function (item) {
            var j = JSON.parse(item);
            sum += j.total;
        });

        var data = {
            "timestamp": timestamp,
            "timestr": timestr,
            "total": sum,
            "kwh": (sum / 10000)
        };

        data.timestr = (new Date(data.timestamp)).toJSON();
        var key = "day:" + data.timestr;
        self.db.set(key, JSON.stringify(data));

        logger.info("store day:", data);

        return data;
    });
};

/**
 * Stores a week's worth of usage data in the database
 *
 * Listens to "aWeek" event and stores a week into the database
 */
MinimalMeter.prototype.storeWeek = function () {
    logger.warn("storeWeek is not tested yet.");
    var self = this;
    // 2016 = 7 days * 24 hours * 60 minutes / 5 minutes.
    return Q.ninvoke(this.db, "lrange", "week", -2016, -1).then(function (values) {

        var sum = 0,
            timestamp = self.getStorageTimestamp(),
            timestr = (new Date(timestamp)).toJSON();

        values.map(function (item) {
            var j = JSON.parse(item);
            sum += j.total;
            return j;
        });

        var data = {
            "timestamp": timestamp,
            "timestr": timestr,
            "total": sum,
            "kwh": (sum / 10000)
        };

        var key = "week:" + timestr;
        self.db.set(key, JSON.stringify(data));
        logger.info("store week: ", data);

        return data;
    });
};


/**
 * Calculates the mean sum for 5 minutes and inserts it into the db.
 *
 * @returns unresolved promise with resulting data.
 */
MinimalMeter.prototype.storeFiveMinutesInWeek = function () {
    var self = this;
    return Q.ninvoke(this.db, "lrange", "day", -5, -1).then(function (values) {

        var timestamp = self.getStorageTimestamp();
        var timestr = (new Date(timestamp)).toJSON();

        var data = {
            "timestamp": timestamp,
            "timestr": timestr,
            "total": 0,
            "perMinute": []
        };

        values.forEach(function (item) {
            var j = JSON.parse(item);
            data.perMinute.push(j.total);
            data.total += parseInt(j.total, 10);
        });

        self.db.rpush("week", JSON.stringify(data));
        logger.info("store 5 minutes in week:", data);

        data.listType = "week";
        self.emit("listStoreDone", data);

        return data;
    });
};

/**
 * Listens to the half hour event and every thirty minutes inserts data
 * into the month list.
 */
MinimalMeter.prototype.storeThirtyMinutesInMonth = function () {
    var self = this;

    return Q.ninvoke(this.db, "lrange", "day", -30, -1).then(function (values) {

        var timestamp = self.getStorageTimestamp();
        var timestr = (new Date(timestamp)).toJSON();

        var data = {
            "timestamp": timestamp,
            "timestr": timestr,
            "total": 0,
            "perMinute": []
        };

        values.forEach(function (item) {
            var j = JSON.parse(item);
            data.perMinute.push(j.total);
            data.total += parseInt(j.total, 10);
        });

        self.db.rpush("month", JSON.stringify(data));
        logger.info("store 30 minutes in month:", data);

        data.listType = "month";
        self.emit("listStoreDone", data);

        return data;
    });
};


/**
 * Stores six hours of statistics into year list every 6 hours
 */
MinimalMeter.prototype.storeSixHoursInYear = function () {
    logger.warn("store six hours in year is not tested yet");
    var self = this;

    // 72 = 60 minutes / 5 minutes = 12 * 6 hours
    return Q.ninvoke(this.db, "lrange", "week", -72, -1).then(function (values) {
        var timestamp = self.getStorageTimestamp();

        var data = {
            "timestamp": timestamp,
            "timestr": (new Date(timestamp)).toJSON(),
            "total": 0,
            "perFiveMinutes": []
        };

        values.forEach(function (item) {
            var j = JSON.parse(item);
            data.perFiveMinutes.push(j.total);
            data.total += parseInt(j.total, 10);
        });

        self.db.rpush("year", JSON.stringify(data));
        logger.info("store 6 hours in year:", data);

        data.listType = "year";
        self.emit("listStoreDone", data);

        return data;
    });
};


/**
 * trims the number of stored values in any of the registered lists
 * accorting to limits to minimize memory footprint.
 *
 * listens to listStoreDone event
 */
MinimalMeter.prototype.verifyLimit = function (data) {
    var type = data.listType;
    var limit = this.limits[type];
    var self = this;

    logger.info("  verify limit for %s starting: limit=%s", type, limit);

    return Q.ninvoke(this.db, "llen", type).then(function (length) {
        if (length <= limit) {
            logger.info(
                "    verify limit: %s within limit %s: length: %s",
                type,
                limit,
                length
            );
            return false;
        }

        logger.info(
            "    verify limit: %s over limit %s: length: %s",
            type,
            limit,
            length
        );

        var index = length - limit;
        self.db.ltrim(type, index, -1);

        return true;
    });
};

/**
 * One of many ways I can make sure I get a timestamp on execution that
 * zeros out seconds and microseconds.
 */
MinimalMeter.prototype.getStorageTimestamp = function () {
    var stamp = (new Date()).toISOString().replace(/:\d\d\.\d\d\dZ$/, "Z");
    return (new Date(stamp)).getTime();
};

exports.MinimalMeter = MinimalMeter;

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
