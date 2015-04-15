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
    if (this.clock.getMinutes() !== 0) {
        return false;
    }
    return this.clock.getHours() % 6 === 0;
};

updateMeter.isMidnight = function() {
    "use strict";
    if (this.isSixHours() === false) {
        return false;
    }
    return this.clock.getHours() === 0;
};

updateMeter.isWeek = function() {
    "use strict";
    if (this.isMidnight() === false) {
        return false;
    }
    return this.clock.getDay() === 0;
};

updateMeter.isMonth = function() {
    "use strict";
    if (this.isMidnight() === false) {
        return false;
    }

    return this.clock.getDate() === 1;
};

updateMeter.isYear = function() {
    "use strict";
    if (this.isMonth() === false) {
        return false;
    }
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
        data.watts   = parseFloat(parseFloat((data.average/10000) * 3600*1000).toFixed(4));
        data.total   = data.count;

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
    return this._insertIntoList("fiveMinutes");
};

/**
 * Inserts a list of 30 minutes into the half hour list
 *
 * @returns {any}
 */
updateMeter.handleHalfHour = function() {
    "use strict";
    logger.info("==> half hour");
    return this._insertIntoList("halfHours");
};

/**
 * Triggers insertion into the list for hours
 * @returns {any|*}
 */
updateMeter.handleHour = function() {
    "use strict";
    logger.info("==> hour");
    return this._insertIntoList("hours");
};

/**
 * Triggers insertion into the list for six hours
 * @returns {any|*}
 */
updateMeter.handleSixHours = function() {
    "use strict";
    logger.info("==> six hours");
    return this._insertIntoList("sixHours");
};

/**
 * Triggers insertion into the list for days
 * @returns {any|*}
 */
updateMeter.handleMidnight = function() {
    "use strict";
    logger.info("==> midnight");
    return this._insertIntoList("days");
};

/**
 * Triggers insertions into the list for weeks
 *
 * @returns {any|*}
 */
updateMeter.handleWeek = function() {
    "use strict";
    logger.info("==> week");
    return this._insertIntoList("weeks");
};

/**
 * Triggers insertion into the list for months
 *
 * @returns {any|*}
 */
updateMeter.handleMonth = function() {
    "use strict";
    logger.info("==> month");
    return this._insertIntoList("months");
};

/**
 * Triggers insertion into the list for years
 *
 * @returns {any|*}
 */
updateMeter.handleYear = function() {
    "use strict";
    logger.info("==> year");
    return this._insertIntoList("years");
};

/**
 * Helper function that returns the correct list to insert data into and which
 * list to fetch data from.
 *
 * @param name
 * @returns {*}
 * @private
 */
updateMeter._getListSource = function(name) {
    "use strict";

    var listSource = {
        "fiveMinutes": {
            "source": "minutes",
            "length": 5
        },
        "halfHours": {
            "source": "minutes",
            "length": 30
        },
        "hours": {
            "source": "minutes",
            "length": 60
        },
        "sixHours": {
            "source": "hours",
            "length": 6
        },
        "days": {
            "source": "hours",
            "length": 24
        },
        "weeks": {
            "source": "days",
            "length": 7
        },
        "months": {
            "source": "days",
            "length": this._getMonthDays()
        },
        "years": {
            "source": "months",
            "length": 12
        }
    };

    if (listSource[name] === undefined) {
        throw new TypeError("Argument must be a valid list source");
    }

    return listSource[name];
}

/**
 * Returns the correct number of days in any given month, including leap years.
 *
 * @returns {*}
 * @private
 */
updateMeter._getMonthDays = function() {
    "use strict";

    var days;

    switch(this.clock.getMonth()) {
        case 0:
        case 2:
        case 4:
        case 6:
        case 7:
        case 9:
        case 11:
            days = 31;
            break;
        case 3:
        case 5:
        case 8:
        case 10:
            days = 30;
            break;
        case 1:
            days = this._getDaysInFebruary();
            break;
    }

    return days;
};

/**
 * Returns the number of days in February correctly for leap years also.
 *
 * @returns {number}
 * @private
 */
updateMeter._getDaysInFebruary = function() {
    "use strict";
    // we already know it's February.
    return this._isLeapYear() ? 29 : 28;
};

/**
 * Helper function to tell if a year is leap or not correctly
 *
 * @returns {boolean}
 * @private
 */
updateMeter._isLeapYear = function() {
    var year = this.clock.getFullYear();

    if (year % 4 === 0 && year % 100 !== 0) {
        return true;
    }

    return year % 400 === 0;
};

/**
 * Inserts a data object specified for the specific list into the database.
 *
 * @param list
 * @returns {any|*}
 * @private
 */
updateMeter._insertIntoList = function(list) {
    "use strict";
    var src  = this._getListSource(list);
    var that = this;

    return that._getRangeFromDb(src.source, src.length).then(function(data) {
        that.db.rpush(list, JSON.stringify(data));
        logger.info("  Inserted data into '" + list +"':", data);
        return data;
    });
};

/**
 * Returns a promise with a range from the end of one of the redis lists
 *
 * @param name
 * @param number
 * @returns {any}
 * @private
 */
updateMeter._getRangeFromDb = function(name, number) {
    "use strict";

    var that = this;
    return Q.ninvoke(that.db, 'lrange', name, number * -1, -1).then(function(values) {
        var data = that._getDataStub();

        data.total = 0;
        data.perMinute = [];

        values.forEach(function(item) {
            var json = JSON.parse(item);
            data.perMinute.push(json.total);
            data.total += parseInt(json.total, 10);
        });

        data.kwh = parseFloat(parseFloat(data.total/10000).toFixed(4));

        return data;
    }, function(error) {
        logger.log('error', '_getRangeFromDb: ' + error.message);
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

/**
 * Calculate the timeout length to correct time skew.
 * @returns {number}
 * @private
 */
updateMeter._getTimeoutLength = function() {
    "use strict";
    var time    = updateMeter._updateInternalClock();
    var timeout = time - Date.now();

    if (timeout < 0) {
        timeout += 60000;
    }

    return timeout;
};

/**
 * Updates the internal clock by one minute every time we tick.
 *
 * @returns {number|*} timestamp
 * @private
 */
updateMeter._updateInternalClock = function() {
    "use strict";
    updateMeter.clock.setMilliseconds(0);
    updateMeter.clock.setSeconds(0);
    updateMeter.clock.setTime(updateMeter.clock.getTime() + 60000);

    return updateMeter.clock.getTime();
};

module.exports = updateMeter;
