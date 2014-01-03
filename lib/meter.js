/**
 * Library for connecting to a power meter using arduino and a serial interface.
 * 
 * @author Thomas Malt <thomas@malt.no>
 * @copyright (C) 2013 Thomas Malt <thomas@malt.no>
 */
var serialport = require('serialport'),
    redis      = require('redis'),
    u          = require('underscore'),
    util       = require('util'),
    logger     = require('winston'),
    events     = require('events');


function Meter () {
    events.EventEmitter.call(this);
   
    this.port       = null; 
    this.db         = redis.createClient();
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

    // setInterval(function () {self.emit("aMinute");},     this.intervals.aMinute);
    // setInterval(function () {self.emit("fiveMinutes");}, this.intervals.fiveMinutes);
    setInterval(function () {self.emit("tenMinutes");},  this.intervals.tenMinutes);
    setInterval(function () {self.emit("twelveHours");}, this.intervals.twelveHours);
    setInterval(function () {self.emit("fourDays");},    this.intervals.fourDays);

    /**
     * This function is run by the monitoring job to actually start monitoring
     * the power meters serial connection and inserting that into the redis
     * database. 
     *
     * If this function is not called, the meter object can be used as a library. 
     */
    this.startMonitor = function () { 
        logger.info("Starting power-meter readings.");
        this.port = new serialport.SerialPort("/dev/ttyACM0", {
            baudrate: 115200,
            parser:   serialport.parsers.readline("\n") 
        });
        logger.info("Successfully connected to serial port /dev/ttyACM0");

        this.port.on("data", this.handleData);
        this.db.on("error", function (err) {
            logger.error("Got redis error: ", err);
        });
  
        this.on("pulsecount",     this.handlePulseCount);

        this.on("aSecond",        this.storeSecondInHour);
        this.on("aSecond",        this.handleTimer);
        this.on("aMinute",        this.storeMinuteInDay);
        this.on("anHour",         this.storeHour);
        this.on("fiveMinutes",    this.storeFiveMinutesInWeek);
        this.on("twelveHours",    this.storeTwelveHoursInMonth);
        this.on("midnight",       this.storeDay);
        this.on("fourDays",       this.storeFourDaysInYear);
 
        this.on("hourStoreDone",  this.verifyHour);
        this.on("dayStoreDone",   this.verifyDay);
        this.on("weekStoreDone",  this.verifyWeek);
        this.on("monthStoreDone", this.verifyMonth);
        this.on("yearStoreDone",  this.verifyYear);
    };


    this.handleData = function (data) {
        data = data.toString().replace(/\r/g,"");
        if (self.hasBegun) {
            if (self.isValidData(data)) {
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
        this.emit("aSecond", power);
    };


    this.handleTimer = function() {
        var now = new Date();

        if (now.getSeconds() == 0) {
            this.emit("aMinute");
            if (now.getMinutes() == 0) {
                this.emit("anHour");
                if (now.getHours() == 0) {
                    this.emit("midnight");
                }
            }
            if ((now.getMinutes() % 5) == 0) {
                this.emit("fiveMinutes");
            }
        }
    };

    this.storeSecondInHour = function(power) {
        var now = new Date();
        
        power.timestamp = (now.getTime() - now.getMilliseconds());
        this.db.rpush("hour", JSON.stringify(power));
        this.emit("hourStoreDone", power);
    };


    this.verifyHour = function (data) {
        this.db.llen("hour", function (err, length) {
            if (length <= self.limits.hour) return true;

            self.emit("hourOverLimits", {
                "limit":  self.limits.hour,
                "length": length
            });

            var index = length-self.limits.hour;
            self.db.ltrim("hour", index, -1);
        });
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

            var data = {
                "timestamp": self.getStorageTimestamp(),
                "total":     sum,
                "kwh":       (sum/10000),
            };

            var key = "hour:" + (new Date(data.timestamp)).toJSON();
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

