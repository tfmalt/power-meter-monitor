/**
 * Library for connecting to a power meter using arduino and a serial 
 * interface.
 * 
 * @author Thomas Malt <thomas@malt.no>
 * @copyright (C) 2013-2014 Thomas Malt <thomas@malt.no>
 */

/*jslint plusplus: true, sloppy: true, vars: true, node: true */

var serialport = require('serialport');
var redis      = require('redis');
var u          = require('underscore');
var util       = require('util');
var logger     = require('winston');
var events     = require('events');
var Q          = require('q');

/**
 * Main meter object. Connects to the serial port hand handles all the power
 * meter readings comeing over the wire.
 */
function Meter() {
    "use strict";
    events.EventEmitter.call(this);

    this.port       = null;
    this.db         = null;
    this.hasBegun   = false;

    this.intervals  = {
        "tenSeconds":  10 * 1000,
        "aMinute":     60 * 1000,
        "fiveMinutes": 5 * 60 * 1000,
        "tenMinutes":  10 * 60 * 1000,
        "halfHour":    30 * 60 * 1000,
        "anHour":      60 * 60 * 1000,
        "aDay":        24 * 60 * 60 * 1000,
        "twelveHours": 12 * 60 * 60 * 1000,
    };

    this.limits = {
        "hour":  4200, // 3600 + 10 minutes // every second sum
        "day":   1560, // every minute sum 24 + 2 hour
        "week":  2304, // 5 minute sum 7 + 1 day.
        "month": 1536, // 30 min sum for 31 + 1 days.
        "year":  2200, // 6 hour sum 365 + 5 days.
    };

    var self = this;

    /**
     * Create a database client and return it
     */
    this.getRedisClient = function (config) {
        logger.info("Got config object: ", config);
        var db = redis.createClient(config.port, config.host, config.options);

        return db;
    };

    /**
     * This function is run by the monitoring job to actually start monitoring
     * the power meters serial connection and inserting that into the redis
     * database. 
     *
     * If this function is not called, the meter object can be used as a 
     * library. 
     */
    this.startMonitor = function (config) {
        logger.info("Starting power-meter readings.");
        this.port = new serialport.SerialPort("/dev/ttyACM0", {
            baudrate: 115200,
            parser:   serialport.parsers.readline("\n")
        });
        logger.info("Successfully connected to serial port /dev/ttyACM0");

        this.db = this.getRedisClient(config);

        this.port.on("data", this.handleData);
        this.db.on("error", function (err) {
            logger.error("Got redis error: ", err);
        });

        this.on("pulsecount",     this.handlePulseCount);
        this.on("aSecond",        this.storeSecondInHour);
        this.on("aSecond",        this.handleTimer);
        this.on("aSecond",        this.addTotalDelta);
        this.on("aMinute",        this.storeMinuteInDay);
        this.on("fiveMinutes",    this.storeFiveMinutesInWeek);
        this.on("halfHour",       this.storeThirtyMinutesInMonth);
        this.on("anHour",         this.storeHour);
        this.on("sixHours",       this.storeSixHoursInYear);
        this.on("midnight",       this.storeDay);
        this.on("aWeek",          this.storeWeek);
        this.on("listStoreDone",  this.verifyLimit);
    };


    /**
     * handle timer is fired every second by an event listener for the 
     * aSecond event It emits all the other timed trigger events to 
     * calculate and store usage in the database.
     */
    this.handleTimer = function () {
        var now = new Date();
        logger.info("in handletimer: ", now.toJSON());
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
    this.handleData = function (data) {
        data = data.toString().replace(/\r/g, "");
        if (self.hasBegun) {
            if (self.isValidData(data)) {
                logger.info("----");
                self.emit("pulsecount", JSON.parse(data));
            }
            return true;
        }

        self.hasBegun = self.isBeginning(data);
        if (self.hasBegun) {
            self.emit("started");
        }
    };


    this.isValidData = function (data) {
        try {
            JSON.parse(data);
        } catch (e) {
            logger.warn(
                "Got invalid data from JSON.parse: (%s)",
                data,
                e.message,
                e.stack
            );
            return false;
        }

        return true;
    };

    this.isBeginning = function (input) {
        if (!input.match(/BEGIN":\s1\}/)) {
            return false;
        }

        if (this.isValidData(input)) {
            return true;
        }

        return false;
    };

    /**
     * event handler for when a pulse count comes in every second.
     */
    this.handlePulseCount = function (power) {
        logger.info("got pulse count");
        this.emit("aSecond", power);
        logger.info("emitting aSecond");
    };

    this.average = function (array) {
        var sum = array.reduce(function (p, c) { return p + c; });
        return Math.round(sum / array.length);
    };

    this.median = function (array) {
        var sorted = array.sort(),
            middle = Math.floor(sorted.length / 2);

        if (sorted.length % 2) { return sorted[middle]; }
        return Math.round((sorted[middle] + sorted[middle - 1]) / 2);
    };


    this.splitPulsetimes = function (pulsetimes) {
        var pulses = {on: [], off: []};

        pulsetimes.forEach(function (item) {
            if (item === 0) { return; }

            var split = item.split(":");
            pulses[split[0]].push(parseInt(split[1], 10));
        });

        return pulses;
    };

    this.calcPulseStats = function (pulses) {
        var s = {};

        s.max           = u.max(pulses);
        s.min           = u.min(pulses);
        s.average       = this.average(pulses);
        s.median        = this.median(pulses);
        s.max_deviation = (s.max - s.median) / s.median;
        s.min_deviation = (s.median - s.min) / s.median;

        return s;
    };

    this.getPulseSum = function (pulses) {
        return pulses.on.concat(pulses.off).reduce(function (prev, curr) {
            return prev + curr;
        });
    };


    this.getAveragePulses = function (pulses) {
        var on  = pulses.on.sort();
        var off = pulses.off.sort();

        if (on.length > 3) {
            on.pop();
            on.shift();
        }

        if (off.length > 3) {
            off.pop();
            off.shift();
        }

        var onSum        = on.reduce(function (a, b) { return a + b; });
        var offSum       = off.reduce(function (a, b) { return a + b; });
        var onAverage    = onSum / on.length;
        var offAverage   = offSum / off.length;
        var averagePulse = 1000000 / (onAverage + offAverage);

        return averagePulse;
    };

    this.pulseCounters = {
        raw:          0,
        median:       0,
        average:      0,
        adjusted:     0,
        avgRemainder: 0,
        medRemainder: 0
    };

    this.storeSecondInHour = function (power) {
        var now           = new Date(),
            pulses        = this.splitPulsetimes(power.pulsetimes),
            on            = this.calcPulseStats(pulses.on),
            off           = this.calcPulseStats(pulses.off),
            pulseSum      = this.getPulseSum(pulses),
            medianPulse   = on.median + off.median,
            averagePulses = this.getAveragePulses(pulses),
            medianPulses  = pulseSum / medianPulse,
            adjustedCount = parseInt(power.pulseCount, 10);

        logger.info("    raw pulsecount:", adjustedCount);
        logger.info(
            "   raw mediancount:",
            medianPulses,
            this.pulseCounters.medRemainder
        );

        power.timestamp  = (now.getTime() - now.getMilliseconds());
        medianPulses += this.pulseCounters.medRemainder;

        var medCount     = Math.floor(medianPulses);
        var medRemainder = medianPulses - medCount;
        this.pulseCounters.medRemainder = medRemainder;

        this.pulseCounters.raw      += adjustedCount;
        this.pulseCounters.median   += medCount;
        this.pulseCounters.average  += averagePulses;


        logger.info(
            " median pulsecount:",
            medCount,
            "",
            medRemainder,
            "",
            medianPulses
        );
        logger.info(
            "average pulsecount:",
            Math.round(averagePulses),
            "",
            averagePulses
        );

        if (on.max_deviation > 0.5) {
            adjustedCount += 1;
            logger.warn(
                "deviated pulsecount:",
                adjustedCount,
                "on max deviation:",
                on.max_deviation
            );
        }
        if (on.min_deviation > 0.9) {
            adjustedCount += 1;
            logger.warn(
                "deviated pulsecount:",
                adjustedCount,
                "on min deviation",
                on.min_deviation
            );
        }
        if (off.max_deviation > 0.5) {
            adjustedCount += 1;
            logger.warn(
                "deviated pulsecount:",
                adjustedCount,
                "off max deviation:",
                off.max_deviation
            );
        }
        if (off.min_deviation > 0.5) {
            adjustedCount += 1;
            logger.warn(
                "deviated pulsecount:",
                adjustedCount,
                "off min deviation:",
                off.min_deviation
            );
        }

        this.pulseCounters.adjusted += adjustedCount;
        power.pulseCount = medCount;

        logger.info(
            "         total raw: %s",
            this.pulseCounters.raw
        );
        logger.info(
            "      total median: %s %s",
            this.pulseCounters.median,
            this.pulseCounters.medRemainder
        );
        logger.info(
            "     total average: %s %s",
            Math.round(this.pulseCounters.average),
            this.pulseCounters.average
        );
        logger.info(
            "    total adjusted: %s",
            this.pulseCounters.adjusted
        );

        Q.when(this.db.rpush("hour", JSON.stringify(power))).then(function () {
            logger.info("emitting listStoreDone");

            power.listType = "hour";
            self.emit("listStoreDone", power);
        });
    };

    this.addTotalDelta = function (power) {
        var value = (power.pulseCount / 10000).toFixed(4);
        logger.info("addTotalDelta: change since last: ", value);

        this.db.incrbyfloat("meterTotalDelta", value, function (err, reply) {
            logger.info("addTotalDelta; reply: ", reply, err);
        });
    };


    this.storeMinuteInDay = function () {
        this.db.lrange("hour", -60, -1, function (err, values) {
            if (err) {
                logger.error("Got error from lrange in storeMinuteInDay: ", err);
            }

            var pulseCounts = [],
                sum         = 0,
                i           = 0,
                average     = null,
                total       = null,
                item        = null,
                data        = {};

            for (i = 0; i < values.length; i += 1) {
                item = JSON.parse(values[i]);
                pulseCounts.push(item.pulseCount);
                sum += parseInt(item.pulseCount, 10);
            }

            average = sum / values.length;
            total   = parseInt(average * 60, 10);

            var timestamp = self.getStorageTimestamp();

            data = {
                "timestamp": timestamp,
                "timestr":   (new Date(timestamp)).toJSON(),
                "sum":       sum,
                "total":     total,
                "values":    pulseCounts,
                "max":       u.max(pulseCounts),
                "min":       u.min(pulseCounts),
                "average":   average
            };

            self.db.rpush("day", JSON.stringify(data));
            logger.info("store minute in day:", data);

            data.listType = "day";
            self.emit("listStoreDone", data);
        });
    };


    this.storeHour = function () {

        this.db.lrange("day", -60, -1, function (err, values) {
            if (err) {
                logger.error("Got error from lrange in storeHour: ", err);
                return;
            }

            var sum       = 0,
                i         = 0,
                data      = {},
                key       = null,
                timestamp = null,
                item      = null;

            for (i = 0; i < values.length; i++) {
                item = JSON.parse(values[i]);
                sum += item.total;
            }

            timestamp = self.getStorageTimestamp();

            data = {
                "timestamp": timestamp,
                "datestr":   (new Date(timestamp)).toJSON(),
                "total":     sum,
                "kwh":       (sum / 10000),
            };

            key = "hour:" + data.datestr;
            self.db.set(key, JSON.stringify(data));

            logger.info("store hour:", data);
        });
    };

    /**
     * Fetches data from the day storage list and calculates a full day of values
     * and stores that under the correct key.
     *
     * Listens on "midnight event" to calcualte the days usage at midnight.
     */
    this.storeDay = function () {

        var range = 60 * 24;

        this.db.lrange("day", (range * -1), -1, function (err, values) {

            if (err) {
                logger.error("Got error from lrange in storeDay: ", err);
                return;
            }

            var sum       = 0,
                timestamp = self.getStorageTimestamp(),
                timestr   = (new Date(timestamp)).toJSON(),
                data      = {},
                key       = null;

            values.forEach(function (item) {
                var j = JSON.parse(item);
                sum += j.total;
            });

            data = {
                "timestamp": timestamp,
                "timestr":   timestr,
                "total":     sum,
                "kwh":       (sum / 10000),
            };

            data.timestr = (new Date(data.timestamp)).toJSON();
            key = "day:" + data.timestr;
            self.db.set(key, JSON.stringify(data));

            logger.info("store day:", data);
        });
    };

    /**
     * Stores a week's worth of usage data in the database
     *
     * Listens to "aWeek" event and stores a week into the database
     */
    this.storeWeek = function () {
        logger.warn("storeWeek is not tested yet.");

        // 2016 = 7 days * 24 hours * 60 minutes / 5 minutes.
        this.db.lrange("week", -2016, -1, function (err, values) {

            if (err) {
                logger.error("Got error from lrange in storeWeek: ", err);
                return;
            }

            var sum       = 0,
                timestamp = self.getStorageTimestamp(),
                timestr   = (new Date(timestamp)).toJSON(),
                key       = null,
                data      = {};

            values = values.map(function (item) {
                var j = JSON.parse(item);
                sum += j.total;
                return j;
            });

            data = {
                "timestamp": timestamp,
                "timestr": timestr,
                "total": sum,
                "kwh": (sum / 10000)
            };

            key = "week:" + timestr;
            self.db.set(key, JSON.stringify(data));
            logger.info("store week: ", data);
        });
    };


    /**
     * Calculates the mean sum for 5 minutes and inserts it into the db.
     */
    this.storeFiveMinutesInWeek = function () {
        this.db.lrange("day", -5, -1, function (err, values) {
            if (err) {
                logger.error("got error from lrange in storeFiveMinutesInWeek: ", err);
                return;
            }

            var timestamp = self.getStorageTimestamp();
            var timestr   = (new Date(timestamp)).toJSON();
            var data   = {
                "timestamp": timestamp,
                "timestr":   timestr,
                "total":     0,
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
        });
    };

    /**
     * Listens to the half hour event and every thirty minutes inserts data
     * into the month list.
     */
    this.storeThirtyMinutesInMonth = function () {
        logger.warn(
            "store thirty minutes in month:",
            "this function is not tested yet"
        );
        this.db.lrange("day", -30, -1, function (err, values) {
            if (err) {
                logger.error(
                    "Got error from lrange in storeThirtyMinutesInMonth: ",
                    err
                );
                return;
            }

            var timestamp = self.getStorageTimestamp();
            var timestr   = (new Date(timestamp)).toJSON();
            var data = {
                "timestamp": timestamp,
                "timestr":   timestr,
                "total":     0,
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
        });
    };


    /**
     * Stores six hours of statistics into year list every 6 hours
     */
    this.storeSixHoursInYear = function () {
        logger.warn("store six hours in year is not tested yet");

        // 72 = 60 minutes / 5 minutes = 12 * 6 hours
        this.db.lrange("week", -72, -1, function (err, values) {
            if (err) {
                logger.error(
                    "Got error from lrange in store six hours in year: ",
                    err
                );
                return;
            }

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
        });
    };


    /**
     * trims the number of stored values in any of the registered lists 
     * accorting to limits to minimize memory footprint.
     *
     * listens to listStoreDone event
     */
    this.verifyLimit = function (data) {
        var type  = data.listType;
        var limit = this.limits[type];

        logger.info("verify limit for %s starting: limit=%s", type, limit);

        this.db.llen(type, function (err, length) {
            if (err) {
                logger.error("got error fron llen in verifyLimit: ", type, err);
                return;
            }

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
        });
    };

    /**
     * One of many ways I can make sure I get a timestamp on execution that 
     * zeros out seconds and microseconds.
     */
    this.getStorageTimestamp = function () {
        var stamp = (new Date()).toISOString().replace(/:\d\d\.\d\d\dZ$/, "Z");
        return (new Date(stamp)).getTime();
    };
}

util.inherits(Meter, events.EventEmitter);

module.exports = new Meter();

