/**
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var logger = require('winston');
var events = require('events');
var u      = require('underscore');
var Q      = require('q');

/**
 * We create the updateMeter as an object literal inheriting directly from
 * an events.EventEmitter object.
 *
 * @type {EventEmitter.EventEmitter}
 */
var updateMeter = new events.EventEmitter();

// Clock is used as an internal clock keeping track of the time
updateMeter.clock = new Date();
// db is the redis database client.
updateMeter.db = null;

updateMeter.limits = {
    "minutes": 1560,    // every minutes for 24 + 2 hours
    "fiveMinutes": 2304 // 5 minute sum 7 + 1 day
};

/**
 * Sets the database client. The argument must be a valid redis client object.
 *
 * @param redis
 */
updateMeter.setDbClient = function(redis) {
    "use strict";
    if (redis === null || redis === undefined || redis.rpush === undefined) {
        throw new TypeError("argument needs to be a valid redis client connection");
    }

    this.db = redis;
};

/**
 * Starts the monitoring. Enters a loop of recursively triggered setTimeout.
 * setTimeout is chosen over setInterval to correct for time skew.
 */
updateMeter.start = function() {
    "use strict";
    var that = this;

    this.on('every_minute',       updateMeter.handleMinute);
    this.on('every_five_minutes', updateMeter.handleFiveMinutes);
    this.on('every_half_hour',    updateMeter.handleHalfHour);
    this.on('every_hour',         updateMeter.handleHour);
    this.on('every_six_hours',    updateMeter.handleSixHours);
    this.on('every_midnight',     updateMeter.handleMidnight);
    this.on('every_week',         updateMeter.handleWeek);
    this.on('every_month',        updateMeter.handleMonth);
    this.on('every_year',         updateMeter.handleYear);

    setTimeout(function () {
        updateMeter.doEveryMinute();
    }, this._getTimeoutLength());
};

/**
 * Every minute events are emitted if we have reached the condition for them
 * to be triggered
 *
 * @param that
 */
updateMeter.doEveryMinute = function() {
    "use strict";

    this.emit("every_minute");

    if (this.isFiveMinutes()) {
        this.emit("every_five_minutes");
    }

    if (this.isHalfHour()) {
        this.emit("every_half_hour");
    }

    if (this.isHour()) {
        this.emit("every_hour");
    }

    if (this.isSixHours()) {
        this.emit("every_six_hours");
    }

    if (this.isMidnight()) {
        this.emit("every_midnight");
    }

    if (this.isWeek()) {
        this.emit("every_week");
    }

    if (this.isMonth()) {
        this.emit("every_month");
    }

    if (this.isYear()) {
        this.emit("every_year");
    }

    setTimeout(function() {
        updateMeter.doEveryMinute();
    }, this._getTimeoutLength());

};

updateMeter.isFiveMinutes = function() {
    "use strict";
    return this.clock.getMinutes() % 5 === 0;
};

updateMeter.isHalfHour = function() {
    "use strict";
    return this.clock.getMinutes() % 30 === 0;
};

updateMeter.isHour = function() {
    "use strict";
    return this.clock.getMinutes() === 0;
};

updateMeter.isSixHours = function() {
    "use strict";
    if (this.clock.getMinutes() !== 0) return false;
    return this.clock.getHours() % 6 === 0;
};

updateMeter.isMidnight = function() {
    "use strict";
    if (this.isSixHours() === false) return false;
    return this.clock.getHours() === 0;
};

updateMeter.isWeek = function() {
    "use strict";
    if (this.isMidnight() === false) return false;
    return this.clock.getDay() === 0;
};

updateMeter.isMonth = function() {
    "use strict";
    if (this.isMidnight() === false) return false;

    return this.clock.getDate() === 1;
};

updateMeter.isYear = function() {
    "use strict";
    if (this.isMonth() === false) return false;
    return this.clock.getMonth() === 0;
};

/**
 * Inserting average data into the minutes list
 *
 * @returns {any|*}
 */
updateMeter.handleMinute = function() {
    "use strict";
    logger.info("==> minute");
    var that = this;
    return Q.ninvoke(that.db, 'lrange', 'seconds', -60, -1).then(function(values) {
        var data        = that._getDataStub();
        var countSum    = 0;
        var kwhSum      = 0;
        var pulseValues = [];

        values.forEach(function(item) {
            var json = JSON.parse(item);
            countSum += parseInt(json.pulseCount);
            kwhSum   += parseFloat(json.kWhs);

            pulseValues.push(json.pulseCount);
        });

        data.count   = countSum;
        data.kwh     = parseFloat(parseFloat(kwhSum).toFixed(4));
        data.max     = u.max(pulseValues);
        data.min     = u.min(pulseValues);
        data.average = parseFloat(parseFloat(countSum / values.length).toFixed(4));
        data.watts   = parseFloat((data.average/10000) * 3600*1000);
        data.total   = parseInt(data.average * 60, 10);

        return data;
    }).then(function(data) {
        that.db.rpush("minutes", JSON.stringify(data));
        logger.info("  Inserted data into minutes:", data);
        return data;
    });
};

/**
 * Handles every five minute insert into the database.
 *
 * @returns {any|*}
 */
updateMeter.handleFiveMinutes = function() {
    "use strict";
    logger.info("==> five minutes");
    var that = this;
    return Q.ninvoke(that.db, 'lrange', 'minutes', -5, -1).then(function(values) {
        var data = that._getDataStub();

        data.total = 0;
        data.perMinute = [];

        values.forEach(function(item) {
            var json = JSON.parse(item);
            data.perMinute.push(json.count);
            data.total += parseInt(json.count, 10);
        });

        data.kwh = parseFloat(parseFloat(data.total/10000).toFixed(4));

        return data;
    }).then(function(data) {
        that.db.rpush("fiveMinutes", JSON.stringify(data));
        logger.info("  Inserted data into fiveMinutes:", data);

        return data;
    });
};

/**
 * Helper that generates the start of every json data object stored in the db.
 *
 * @returns {{timestamp: number, time: (string|*)}}
 * @private
 */
updateMeter._getDataStub = function() {
    "use strict";
    var stamp = Date.now();
    return {
        timestamp: stamp,
        time: (new Date(stamp)).toJSON()
    };
};

updateMeter.handleHalfHour = function() {
    "use strict";
    logger.info("==> half hour");
};

updateMeter.handleHour = function() {
    "use strict";
    logger.info("==> hour");
};

updateMeter.handleSixHours = function() {
    "use strict";
    logger.info("six hours");
};
updateMeter.handleMidnight = function() {
    "use strict";
    logger.info("==> midnight");
};

updateMeter.handleWeek = function() {
    "use strict";
    logger.info("==> week");
};

updateMeter.handleMonth = function() {
    "use strict";
    logger.info("==> month");
};

updateMeter.handleYear = function() {
    "use strict";
    logger.info("==> year");
};

updateMeter._getTimeoutLength = function() {
    "use strict";
    var time    = updateMeter._updateInternalClock();
    var timeout = time - Date.now();

    if (timeout < 0) {
        timeout += 60000;
    }

    // console.log("clock:", updateMeter.clock.toJSON());
    // console.log("now:  ", (new Date).toJSON());
    // console.log("timeout: ", timeout);

    return timeout;
};

updateMeter._updateInternalClock = function() {
    "use strict";
    updateMeter.clock.setMilliseconds(0);
    updateMeter.clock.setSeconds(0);
    updateMeter.clock.setTime(updateMeter.clock.getTime() + 60000);

    return updateMeter.clock.getTime();
};

module.exports = updateMeter;
