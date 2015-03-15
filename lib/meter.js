/**
 * Library for connecting to a power meter using arduino and a serial
 * interface.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright (C) 2013-2015 Thomas Malt <thomas@malt.no>
 */

/*jslint plusplus: true, sloppy: true, vars: true, node: true */

var u      = require('underscore');
var util   = require('util');
var logger = require('winston');
var events = require('events');
var Q      = require('q');

/**
 * Main meter object. Connects to the serial port hand handles all the power
 * meter readings coming over the serialport.
 *
 * The Meter object is an event emitter and signals other part of the program
 * when it receives data and at given time intervals by emitting events.
 */
var Meter = function() {
    "use strict";
    events.EventEmitter.call(this);

    this.port     = null;
    this.db       = null;
    this.hasBegun = false;

    // List of how many data items I store in the set for each interval.
    // This is to have known limits to the amount of data I store in redis
    // to make sure the application scales properly when deployed in the
    // cloud or on a system with very limited resources like a raspberry pi.
    this.limits = {
        "hour": 4200, // 3600 + 10 minutes // every second sum
        "day": 1560, // every minute sum 24 + 2 hour
        "week": 2304, // 5 minute sum 7 + 1 day.
        "month": 1536, // 30 min sum for 31 + 1 days.
        "year": 2200 // 6 hour sum 365 + 5 days.
    };
};

util.inherits(Meter, events.EventEmitter);

/**
 * Fetches and return a serialport object
 *
 * @returns {serialport.SerialPort}
 */
Meter.prototype.getSerialPort = function (serialport, config) {
    logger.info("Connecting to serial port: ", config);

    if (typeof config.dev !== 'string') {
        throw new Error('config.dev was not a string');
    }

    var port = new serialport.SerialPort(config.dev, {
        baudrate: 115200,
        parser: serialport.parsers.readline("\n")
    }, false);

    var self = this;
    port.open(function () {
        logger.info("Successfully connected to serial port " + config.dev);
        port.on("data", self.handleData);

        /* istanbul ignore next */
        port.on("error", function (err) {
            logger.error("Got error from serialport:", err.message);
        });
    });

    return port;
};


/**
 * Create a database client and return it
 */
Meter.prototype.getRedisClient = function (redis, config) {
    logger.info("Creating Redis client: ", config);

    var db = redis.createClient(config.port, config.host, config.options);

    /* istanbul ignore next */
    db.on("error", function (err) {
        logger.error("Got redis error: ", err.message);
        process.exit();
    });

    return db;
};


/**
 * Run by the monitoring job to actually start
 * monitoring the power meters serial connection and inserting that
 * into the redis database.
 *
 * If this function is not called, the meter object can be used as a
 * library.
 */
Meter.prototype.startMonitor = function (options) {
    logger.info("Starting power-meter readings.");

    this.port = this.getSerialPort(options.serialport, options.config.serial);
    this.db   = this.getRedisClient(options.redis, options.config.redis);

    this.setupEventHandlers();
};

Meter.prototype.setupEventHandlers = function () {
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
Meter.prototype.handleTimer = function () {
    var now = new Date();
    logger.info("in handletimer: ", now.toJSON());
    /* istanbul ignore if */
    if (now.getSeconds() === 0) {
        logger.info("emitting aMinute");
        this.emit("aMinute");
        if (now.getMinutes() === 0) {
            logger.info("emitting anHour");
            this.emit("anHour");
            if (now.getHours() === 0) {
                logger.info("emitting midnight");
                this.emit("midnight");
                if (now.getDay() === 0) {
                    logger.info("emitting aWeek");
                    this.emit("aWeek");
                }
                if (now.getDate() === 1) {
                    logger.info("emitting aMonth");
                    this.emit("aMonth");
                    if (now.getMonth() === 0) {
                        logger.info("emitting aYear");
                        this.emit("aYear");
                    }
                }
            }
            if ((now.getHours() % 6) === 0) {
                logger.info("emitting sixHours");
                this.emit("sixHours");
            }
            if ((now.getHours() % 12) === 0) {
                logger.info("emitting twelveHours");
                this.emit("twelveHours");
            }
        }
        if ((now.getMinutes() % 5) === 0) {
            logger.info("emitting fiveMinutes");
            this.emit("fiveMinutes");
        }
        if ((now.getMinutes() % 30) === 0) {
            logger.info("emitting halfHour");
            this.emit("halfHour");
        }
    }
};


/**
 * Called when data is received over the serial port
 */
Meter.prototype.handleData = function (data) {
    logger.info("handle data: ", data);
    data = data.toString().replace(/\r/g, "");

    if (this.hasBegun === true) {
        if (this.isValidData(data)) {
            logger.info("----");
            this.emit("pulsecount", JSON.parse(data));
        }
        return true;
    }

    this.hasBegun = this.isBeginning(data);
};

/**
 * Verifies the input data is valid JSON
 *
 * @param data
 * @returns {boolean}
 */
Meter.prototype.isValidData = function (data) {
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

    logger.info("Got valid data: ", data);
    return true;
};

/**
 * Tests if we are beginning a session with the arduino yet
 *
 * @param input
 * @returns {boolean}
 */
Meter.prototype.isBeginning = function (input) {
    if (!input.match(/BEGIN":\s1}/)) {
        logger.info("is beginning: not a match.");
        return false;
    }

    return this.isValidData(input);
};

/**
 * event handler for when a pulse count comes in every second.
 *
 * @param power
 */
Meter.prototype.handlePulseCount = function (power) {
    logger.info("got pulse count: ", power);

    if (power.hasOwnProperty("pulseCount")) {
        logger.info("emitting aSecond");
        this.emit("aSecond", power);
    }
    else {
        logger.error("got passed invalid pulse data. Probably testing :-)");
    }
};


/**
 * Stores pulsecount into hour list every second and calculcats a bunch
 * of statistica data.
 */
Meter.prototype.storeSecondInHour = function (power) {
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
 * Currently I calculate the current power meter reading in this
 * cumbersome way. Every time the user submit the power meter reading
 * manually I calculate the skew manually every second.
 */
Meter.prototype.addTotalDelta = function (power) {
    var value = power.pulseCount / 10000;

    return Q.ninvoke(this.db, 'incrbyfloat', "meterTotalDelta", value).then(function (reply) {
        logger.info("addTotalDelta: change: %d", value);
        logger.info("                reply: %d", reply);

        return reply;
    });
};

/**
 * Fetches the last minute from the database and stores it in the
 * day list.
 */
Meter.prototype.storeMinuteInDay = function () {
    var self = this;
    return Q.ninvoke(this.db, 'lrange', "hour", -60, -1).then(function (values) {

        var pulseCounts = [], sum = 0, item;

        for (var i = 0; i < values.length; i += 1) {
            item = JSON.parse(values[i]);
            pulseCounts.push(item.pulseCount);
            sum += parseInt(item.pulseCount, 10);
        }

        var average = sum / values.length;
        var total = parseInt(average * 60, 10);
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
 */
Meter.prototype.storeHour = function () {
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
Meter.prototype.storeDay = function () {

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
Meter.prototype.storeWeek = function () {
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
Meter.prototype.storeFiveMinutesInWeek = function () {
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
Meter.prototype.storeThirtyMinutesInMonth = function () {
    logger.warn(
        "store thirty minutes in month:",
        "this function is not tested yet"
    );

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
Meter.prototype.storeSixHoursInYear = function () {
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
Meter.prototype.verifyLimit = function (data) {
    var type = data.listType;
    var limit = this.limits[type];
    var self = this;

    logger.info("verify limit for %s starting: limit=%s", type, limit);

    return Q.ninvoke(this.db, "llen", type).then(function (length) {
        if (length <= limit) {
            logger.info(
                "verify limit: %s within limit %s: length: %s",
                type,
                limit,
                length
            );
            return false;
        }

        logger.info(
            "verify limit: %s over limit %s: length: %s",
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
Meter.prototype.getStorageTimestamp = function () {
    var stamp = (new Date()).toISOString().replace(/:\d\d\.\d\d\dZ$/, "Z");
    return (new Date(stamp)).getTime();
};


module.exports = Meter;

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
