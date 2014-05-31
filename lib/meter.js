/**
 * Library for connecting to a power meter using arduino and a serial 
 * interface.
 * 
 * @author Thomas Malt <thomas@malt.no>
 * @copyright (C) 2013-2014 Thomas Malt <thomas@malt.no>
 */
var serialport = require('serialport');
var redis      = require('redis');
var u          = require('underscore');
var util       = require('util');
var logger     = require('winston');
var events     = require('events');
var Q          = require('q');

function Meter () {
    events.EventEmitter.call(this);
   
    this.port       = null; 
    this.db         = null;
    this.hasBegun   = false;

    this.intervals  = {
        "tenSeconds":  10*1000,
        "aMinute":     60*1000,
        "fiveMinutes": 5*60*1000,
        "tenMinutes":  10*60*1000,
        "anHour":      60*60*1000,
        "aDay":        24*60*60*1000,
        "twelveHours": 12*60*60*1000,
        "fourDays":    4*24*60*60*1000
    };

    this.limits = {
        "hour":  4200, // 3600 + 10 minutes // every second sum
        "day":   1560, // every minute sum 24 + 2 hour
        "week":  2304, // 5 minute sum 7 + 1 day.
        "month": 1536, // 12 hour sum for 31 + 1 days.
        "year":  2200, // 4 day sum 365 + 5 days.
    };

    var self = this;

    setInterval(function () {self.emit("tenMinutes");},  this.intervals.tenMinutes);
    setInterval(function () {self.emit("twelveHours");}, this.intervals.twelveHours);
    setInterval(function () {self.emit("fourDays");},    this.intervals.fourDays);

    this.getRedisClient = function (config) {
        logger.info("Got config object: ", config);
        // TODO add exception when no config is passed
        
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
        this.on("anHour",         this.storeHour);
        this.on("fiveMinutes",    this.storeFiveMinutesInWeek);
        this.on("twelveHours",    this.storeTwelveHoursInMonth);
        this.on("midnight",       this.storeDay);
        this.on("fourDays",       this.storeFourDaysInYear);

        this.on("hourOverLimits", this.handleHourOverLimits); 
        
        this.on("hourStoreDone",  this.verifyHour);
        this.on("dayStoreDone",   this.verifyDay);
        this.on("weekStoreDone",  this.verifyWeek);
        this.on("monthStoreDone", this.verifyMonth);
        this.on("yearStoreDone",  this.verifyYear);
    };


    /**
     * Called when data is received over the serial port
     */ 
    this.handleData = function (data) {
        data = data.toString().replace(/\r/g,"");
        if (self.hasBegun) {
            if (self.isValidData(data)) {
                logger.info("----");
                self.emit("pulsecount", JSON.parse(data));
            }
            return true;
        }

        self.hasBegun = self.isBeginning(data);
        if (self.hasBegun) self.emit("started");
    };

    this.isValidData = function (data) {
        try {
            var test = JSON.parse(data);
        }
        catch (e) {
            logger.warn(
                "Got invalid data from JSON.parse: (%s)", data, 
                e.message, e.stack
            );
            return false;
        }

        return true;
    };

    this.isBeginning = function (input) {
        if (!input.match(/BEGIN.:.1}/)) return false;
        if (this.isValidData(input)) return true;

        return false;
    };

    /**
     * event handler for when a pulse count comes in every second.
     */
    this.handlePulseCount = function (power) {
        logger.info("got pulse count");
        this.emit("aSecond", power);
        logger.info("emitted aSecond");
    };

    /**
     * handle timer is fired every second by an event listener for the aSecond event
     * It emits all the other timed trigger events to calculate and store usage in 
     * the database.
     */
    this.handleTimer = function() {
        var now = new Date();
        logger.info("in handletimer: ", now.toJSON());
        if (now.getSeconds() == 0) {
            this.emit("aMinute");
            logger.info("emitted aMinute");
            if (now.getMinutes() == 0) {
                this.emit("anHour");
                logger.info("emitted anHour");
                if (now.getHours() == 0) {
                    this.emit("midnight");
                    logger.info("emitted midnight");
                    if (now.getDay() == 0) {
                        this.emit("aWeek");
                        logger.info("emitted aWeek");
                    }
                    if (now.getDate() == 1) {
                        this.emit("aMonth");
                        logger.info("emitted aMonth");
                        if (now.getMonth() == 0) {
                            this.emit("aYear");
                            logger.info("emitted aYear");
                        }
                    }
                }
            }
            if ((now.getMinutes() % 5) == 0) {
                this.emit("fiveMinutes");
                logger.info("emitted fiveMinutes");
            }
        }
    };

    this.average = function (array) {
        var sum = array.reduce(function (prev, curr) {
            return prev + curr;
        });

        return Math.round(sum / array.length);
    };

    this.median = function (array) {
        var sorted = array.sort();
        var middle = Math.floor(sorted.length/2);

        if (sorted.length % 2) return sorted[middle];
        return Math.round((sorted[middle] + sorted[middle-1])/2);
    };


    this.splitPulsetimes = function (pulsetimes) {
        var pulses = {on: [], off: []};

        pulsetimes.forEach( function (item) {
            if (item == 0) return;
            var split = item.split(":");
            pulses[split[0]].push(parseInt(split[1]));
        });
    
        return pulses;
    };

    this.calcPulseStats = function (pulses) {
        var s = {};

        s.max           = u.max(pulses),
        s.min           = u.min(pulses),
        s.average       = this.average(pulses),
        s.median        = this.median(pulses),
        s.max_deviation = (s.max - s.median) / s.median;
        s.min_deviation = (s.median - s.min) / s.median;

        return s;
    };

    this.getPulseSum = function (pulses) {
        return pulses.on.concat(pulses.off).reduce(function (prev, curr) {
            return prev + curr;
        });
    };

    this.storeSecondInHour = function(power) {
        var now = new Date();
       
        power.pulseCount = parseInt(power.pulseCount); 
        power.timestamp  = (now.getTime() - now.getMilliseconds());

        var pulses           = this.splitPulsetimes(power.pulsetimes);
        var on               = this.calcPulseStats(pulses.on);
        var off              = this.calcPulseStats(pulses.off);
        var pulseSum         = this.getPulseSum(pulses);
        var medianPulse      = on.median + off.median;
        var calculatedPulses = Math.round(sum/medianPulse);

        logger.info(
            "  original pulsecount: ", power.pulseCount
        );
        logger.info(
            "calculated pulsecount: ", calculatedPulses, 
            "", (sum/medianPulse)
        );
        
        if (on.max_deviation > 0.5) {
            power.pulseCount += 1;
            logger.warn(
                "  deviated pulsecount: ", power.pulseCount,
                " on max deviation above threshold: ", on.max_deviation
            );
        } 
        if (on.min_deviation > 0.9) {
            power.pulseCount += 1;
            logger.warn(
                "  deviated pulsecount: ", power.pulseCount,
                " on min deviation above threshold: ", on.min_deviation
            );
        } 
        if (off.max_deviation > 0.5) {
            power.pulseCount += 1;
            logger.warn(
                "  deviated pulsecount: ", power.pulseCount,
                " off max deviation above threshold: ", off.max_deviation
            );
        }
        if (off.min_deviation > 0.5) {
            power.pulseCount += 1;
            logger.warn(
                "  deviated pulsecount: ", power.pulseCount,
                " off min deviation above threshold: ", off.min_deviation
            );
        } 

        Q.when(this.db.rpush("hour", JSON.stringify(power)))
        .then(function () {
            logger.info("emitted hourStoreDone");
            self.emit("hourStoreDone", power)
        });
    };

    this.addTotalDelta = function (power) {
        var value = (power.pulseCount/10000).toFixed(4);
        logger.info("addTotalDelta: change since last: ", value);

        this.db.incrbyfloat("meterTotalDelta", value, function (err, reply) {
            logger.info("addTotalDelta; reply: ", reply, err);
        }); 
    };

    this.verifyHour = function (data) {
        this.db.llen("hour", function (err, length) {
            if (length <= self.limits.hour) return false;
            
            self.emit("hourOverLimits", {
                "limit":  self.limits.hour,
                "length": length
            });

            var index = length-self.limits.hour;
            self.db.ltrim("hour", index, -1);
        });
    };

    this.handleHourOverLimits = function (info) {
        logger.info("Got hour over limits: ", info);
    };

    this.storeMinuteInDay = function () {
        this.db.lrange("hour", -60, -1, function (err, values) {
            var pulseCounts = [];
            var sum         = 0;

            for (var i = 0; i < values.length; i++) {
                var item = JSON.parse(values[i]);
                pulseCounts.push(item.pulseCount);
                sum += parseInt(item.pulseCount);
            };
            
            var average = sum/values.length;
            var total   = parseInt(average*60);

            var data = {
                "timestamp": self.getStorageTimestamp(),
                "sum":       sum,
                "total":     total,
                "values":    pulseCounts,
                "max":       u.max(pulseCounts),
                "min":       u.min(pulseCounts),
                "average":   average
            };
            
            self.db.rpush("day", JSON.stringify(data));
            self.emit("dayStoreDone", data);

            logger.info("store minute in day: %s: ", 
                (new Date(data.timestamp).toJSON()), data
            );
        });
    };

    this.verifyDay = function (data) {
        this.db.llen("day", function (err, length) {
            if (length <= self.limits.day) return true;

            self.emit("dayOverLimits", {
                "limit": self.limits.day,
                "length": length,
            });

            var index = length - self.limits.day;
            self.db.ltrim("day", index, -1);
        });
    };


    this.storeHour = function () {
        
        this.db.lrange("day", -60, -1, function (err, values) {
            var sum = 0;

            for (var i = 0; i < values.length; i++) {
                var item = JSON.parse(values[i]);
                sum += item.total;
            }

            var timestamp = self.getStorageTimestamp();

            var data = {
                "timestamp": timestamp,
                "datestr":   (new Date(timestamp)).toJSON(),
                "total":     sum,
                "kwh":       (sum/10000),
            };

            var key = "hour:" + data.datestr;
            self.db.set(key, JSON.stringify(data));

            logger.info("store hour:", data);
        });
    
    };

    this.storeDay = function () {
        logger.warn("storeDay has not been tested yet.");

        var range = 60*24;
        this.db.lrange("day", (range*-1), -1, function (err, values) {
            var sum = 0;

            for (var i = 0; i < values.length; i++) {
                var item = JSON.parse(values[i]);
                sum += item.total;
            }

            var data = {
                "timestamp": self.getStorageTimestamp(),
                "total":     sum,
                "kwh":       (sum/10000),
            };

            var key = "day:" + (new Date(data.timestamp)).toJSON();
            self.db.set(key, JSON.stringify(data));

            logger.info("store day:", data);
        });


    }

    /**
     * Calculates the mean sum for 5 minutes and inserts it into the db.
     */
    this.storeFiveMinutesInWeek = function () {
        this.db.lrange("day", -5, -1, function (err, values) {
            var totals = [];
            var sum    = 0;

            for (var i = 0; i < values.length; i++) {
                var item = JSON.parse(values[i]);
                totals.push(item.total);
                sum += parseInt(item.total);
            }

            var data = {
                "timestamp": self.getStorageTimestamp(),
                "total": sum,
                "perMinute": totals
            };

            self.db.rpush("week", JSON.stringify(data));
            self.emit("weekStoreDone", data);

            logger.info("store 5 minutes in week: %s: ", 
                (new Date(data.timestamp).toISOString()), data
            );
        });
    };

    /**
     * If number of entries in week hash goes above the limit the hash is trimmed
     * to be within limits, removing oldest entries first.
     *
     * @emits weekOverLimits when an over limit event occurs
     */
    this.verifyWeek = function (data) {
        this.db.llen("week", function (err, length) {
            if (length <= self.limits.week) return true;

            self.emit("weekOverLimits", {
                "limit": self.limits.week,
                "length": length
            });

            var index = length - self.limits.week;
            self.db.ltrim("week", index, -1);
        });    
    };
   
    this.storeTwelveHoursInMonth = function () {
        logger.error("this function is not implemented yet");
        this.db.lrange("week", -144, -1, function (err, values) {
            var totals = [];
            var sum    = 0;
            
            for (var i = 0; i < values.length; i++) {
                var item = JSON.parse(values[i]);
                totals.push(item.total);
                sum += parseInt(item.total);
            }

            var data = {
                "timestamp": self.getStorageTimestamp(),
                "total": sum,
                "perFiveMinutes": totals
            };

            self.db.rpush("month", JSON.stringify(data));
            self.emit("weekStoreDone", data);

            logger.info("store 12 hours into month: %s: ",
                (new Date(data.timestamp).toJSON()), data
            );
        });
    };
    
    this.storeFourDaysInYear = function () {
        logger.error("this function is not implemented yet");
    }

    this.verifyMonth = function () {
        logger.error("this function is not implemented yet");
    }
    
    this.verifyYear = function () {
        logger.error("this function is not implemented yet");
    }


    this.getStorageTimestamp = function () {
        var stamp = (new Date()).toISOString().replace(/:\d\d.\d\d\dZ$/, "Z");
        return (new Date(stamp)).getTime();
    };
};

util.inherits(Meter, events.EventEmitter);

module.exports = new Meter();

