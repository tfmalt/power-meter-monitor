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
function Meter() {
    "use strict";
    events.EventEmitter.call(this);

    this.port       = null;
    this.db         = null;
    this.hasBegun   = false;

    // List of how many data items I store in the set for each interval.
    // This is to have known limits to the amount of data I store in redis
    // to make sure the application scales properly when deployed in the
    // cloud or on a system with very limited resources like a raspberry pi.
    this.limits = {
        "hour":  4200, // 3600 + 10 minutes // every second sum
        "day":   1560, // every minute sum 24 + 2 hour
        "week":  2304, // 5 minute sum 7 + 1 day.
        "month": 1536, // 30 min sum for 31 + 1 days.
        "year":  2200 // 6 hour sum 365 + 5 days.
    };

    var self = this;

    /**
     * Run by the monitoring job to actually start 
     * monitoring the power meters serial connection and inserting that 
     * into the redis database. 
     *
     * If this function is not called, the meter object can be used as a 
     * library. 
     */
    this.startMonitor = function (options) {
        logger.info("Starting power-meter readings.");

        this.port = this.getSerialPort(options);
        this.db   = this.getRedisClient(options);

        this.setupEventHandlers();
    };

    /**
     * Fetches and return a serialport object
     *
     * @returns {serialport.SerialPort}
     */
    this.getSerialPort = function (options) {
        logger.info("Connecting to serial port.");

        var config     = options.config.serial;
        var serialport = options.serialport;

        if (typeof config.dev !== 'string') {
            throw new Error('config.dev was not a string');
        }

        var port = new serialport.SerialPort(config.dev, {
            baudrate: 115200,
            parser:   serialport.parsers.readline("\n")
        }, false);

        port.open(function () {
            logger.info("Successfully connected to serial port " + config.dev);
            port.on("data", self.handleData);
            /* istanbul ignore next */
            port.on("error", function (err) {
                logger.error("Got error from serialport:", err);
            });
        });

        return port;
    };


    /**
     * Create a database client and return it
     */
    this.getRedisClient = function (options) {
        logger.info("Creating Redis client: ", options);

        var redis  = options.redis;
        var config = options.config.redis;
        var db     = redis.createClient(config.port, config.host, config.options);

        /* istanbul ignore next */
        db.on("error", function (err) {
            logger.error("Got redis error: ", err);
            process.exit();
        });

        return db;
    };


    this.setupEventHandlers = function () {
        logger.info("Setting up event handlers");

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
    this.handleData = function (data) {
        data = data.toString().replace(/\r/g, "");
        if (self.hasBegun === true) {
            if (self.isValidData(data)) {
                logger.info("----");
                self.emit("pulsecount", JSON.parse(data));
            }
            return true;
        }

        self.hasBegun = self.isBeginning(data);
    };

    /**
     * Verifies the input data is valid JSON
     *
     * @param data
     * @returns {boolean}
     */
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

    /**
     * Tests if we are beginning a session with the arduino yet
     *
     * @param input
     * @returns {boolean}
     */
    this.isBeginning = function (input) {
        if (!input.match(/BEGIN":\s1\}/)) {
            return false;
        }

        return this.isValidData(input);
    };

    /**
     * event handler for when a pulse count comes in every second.
     *
     * @param power
     */
    this.handlePulseCount = function (power) {
        logger.info("got pulse count: ", power);
        this.emit("aSecond", power);
        logger.info("emitting aSecond");
    };

    /**
     * Calculate average of pulse time, on or off, depending on which 
     * Average is always an integer.
     */
    this.average = function (array) {
        var sum = array.reduce(function (p, c) { return p + c; });
        return Math.round(sum / array.length);
    };

    /**
     * Calculate median of pulse time, either on or off. 
     * Median is aways an integer.
     */
    this.median = function (array) {
        var sorted = array.sort(),
            middle = Math.floor(sorted.length / 2);

        if (sorted.length % 2) { return sorted[middle]; }
        return Math.round((sorted[middle] + sorted[middle - 1]) / 2);
    };


    /**
     * Takes the array of pulsetimes from the power reading and split the
     * power cycles into individual on and off arrays and return that array
     *
     * @param pulsetimes
     * @returns {{on: Array, off: Array}}
     */
    this.splitPulsetimes = function (pulsetimes) {
        var pulses = {on: [], off: []};

        if (!(pulsetimes instanceof Array)) {
            throw new TypeError("argument to function must be an array");
        }

        pulsetimes.forEach(function (item) {
            if (item === 0) { return; }

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

    /**
     * Calculates the median pulse in a series
     *
     * @param p
     * @returns {number}
     */
    this.getMedianPulse = function (p) {
        p.stats = {
            on:  this.calcPulseStats(p.on),
            off: this.calcPulseStats(p.off)
        };

        return 1000000 / (p.stats.on.median + p.stats.off.median);
    };


    this.getAveragePulse = function (pulses) {
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

        return 1000000 / (onAverage + offAverage);
    };


    this.calcAdjustedCount = function (p) {
        var adjusted = 0;
        var types = {
            on_max: false,
            on_min: false,
            off_max: false,
            off_min: false
        };

        if (p.on.max_deviation  > 0.8) { types.on_max  = true; }
        if (p.on.min_deviation  > 1.0) { types.on_min  = true; }
        if (p.off.max_deviation > 0.8) { types.off_max = true; }
        if (p.off.min_deviation > 1.0) { types.off_min = true; }

        if (types.on_max || types.off_max) { adjusted += 1; }

        logger.info("Deviation:", types);
        logger.info("Adjusted: %d", adjusted);

        return adjusted;
    };


    this.printPulseCountersLog = function (pc) {
        logger.info("          total raw: %s", pc.raw);
        logger.info("       total median: %s %s", pc.median,  pc.medRemainder);
        logger.info("      total average: %s %s", pc.average, pc.avgRemainder);
        logger.info("     total adjusted: %s",    pc.adjusted);
    };

    this.pulseCounters = {
        raw:          0,
        median:       0,
        average:      0,
        adjusted:     0,
        avgRemainder: 0,
        medRemainder: 0
    };

    /**
     * Stores pulsecount into hour list every second and calculcats a bunch
     * of statistica data.
     */
    this.storeSecondInHour = function (power) {
        var now          = new Date(),
            pulseTimes   = this.splitPulsetimes(power.pulsetimes),
            averagePulse = this.getAveragePulse(pulseTimes),
            medianPulse  = this.getMedianPulse(pulseTimes),
            count        = parseInt(power.pulseCount, 10);

        power.timestamp  = (now.getTime() - now.getMilliseconds());

        // Addes the stored remainder from last cycle to this cycles 
        // calculated average and median
        medianPulse  += this.pulseCounters.medRemainder;
        averagePulse += this.pulseCounters.avgRemainder;

        // Fetches this rounds count and remainder
        var avgCount     = Math.floor(averagePulse);
        var medCount     = Math.floor(medianPulse);
        var avgRemainder = averagePulse - avgCount;
        var medRemainder = medianPulse - medCount;

        // Stores numbers into pulseCounter struct.
        this.pulseCounters.avgRemainder = avgRemainder;
        this.pulseCounters.medRemainder = medRemainder;
        this.pulseCounters.raw      += count;
        this.pulseCounters.median   += medCount;
        this.pulseCounters.average  += avgCount;

        // Logs some stuff.
        logger.info("     raw pulsecount:", count);
        logger.info("  median pulsecount:", medCount, medRemainder, medianPulse);
        logger.info(" average pulsecount:", avgCount, avgRemainder, averagePulse);

        this.pulseCounters.adjusted += count + this.calcAdjustedCount(pulseTimes);
        power.pulseCount = avgCount;

        this.printPulseCountersLog(this.pulseCounters);

        Q.when(this.db.rpush("hour", JSON.stringify(power))).then(function () {
            power.listType = "hour";
            self.emit("listStoreDone", power);
        });
    };


    /**
     * Currently I calculate the current power meter reading in this 
     * cumbersome way. Every time the user submit the power meter reading 
     * manually I calculate the skew manually every second.
     */
    this.addTotalDelta = function (power) {
        var value = power.pulseCount / 10000;
        this.db.incrbyfloat("meterTotalDelta", value, function (err, reply) {
            if (err) {
                logger.error("Got error from incrbyfloat:", err);
                return;
            }

            logger.info("addTotalDelta: change: %d", value);
            logger.info("                reply: %d", reply);
        });
    };


    this.storeMinuteInDay = function () {
        this.db.lrange("hour", -60, -1, function (err, values) {
            if (err) {
                logger.error("Got error from lrange in storeMinuteInDay: ", err);
            }

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

            var sum = 0, item;
            for (var i = 0; i < values.length; i++) {
                item = JSON.parse(values[i]);
                sum += item.total;
            }

            var timestamp = self.getStorageTimestamp();
            var data = {
                "timestamp": timestamp,
                "datestr":   (new Date(timestamp)).toJSON(),
                "total":     sum,
                "kwh":       (sum / 10000)
            };
            var key = "hour:" + data.datestr;

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
                timestr   = (new Date(timestamp)).toJSON();

            values.forEach(function (item) {
                var j = JSON.parse(item);
                sum += j.total;
            });

            var data = {
                "timestamp": timestamp,
                "timestr":   timestr,
                "total":     sum,
                "kwh":       (sum / 10000)
            };

            data.timestr = (new Date(data.timestamp)).toJSON();
            var key = "day:" + data.timestr;
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
                timestr   = (new Date(timestamp)).toJSON();

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

module.exports = Meter;

