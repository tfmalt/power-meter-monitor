/**
 * Created by tm on 13/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2015 (c) Thomas Malt
 */

var logger = require('winston');
var events = require('events');
var u      = require('underscore');
var Q      = require('q');
var utils  = require('./meterUtils');
var timer  = require('./timeEmitter');

/**
 * We create the updateMeter as an object literal inheriting directly from
 * an events.EventEmitter object.
 *
 * @type {EventEmitter.EventEmitter}
 */
var updateMeter = new events.EventEmitter();

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

    updateMeter.db = redis;
};

/**
 * Starts the monitoring. Enters a loop of recursively triggered setTimeout.
 * setTimeout is chosen over setInterval to correct for time skew.
 */
updateMeter.start = function() {
    "use strict";

    if (typeof process.env.POWER_SET_TIME !== 'undefined') {
        timer.setClock(new Date(parseInt(process.env.POWER_SET_TIME)));
        logger.info("Setting internal time to: " + timer.clock);
    }

    timer.on('every_minute',       updateMeter.handleMinute);
    timer.on('every_five_minutes', updateMeter.handleFiveMinutes);
    timer.on('every_half_hour',    updateMeter.handleHalfHour);
    timer.on('every_hour',         updateMeter.handleHour);
    timer.on('every_six_hours',    updateMeter.handleSixHours);
    timer.on('every_midnight',     updateMeter.handleMidnight);
    timer.on('every_week',         updateMeter.handleWeek);
    timer.on('every_month',        updateMeter.handleMonth);
    timer.on('every_year',         updateMeter.handleYear);

    setTimeout(function () {
        timer.doEveryMinute();
    }, timer.getTimeoutLength());
};


/**
 * Inserting average data into the minutes list
 *
 * @returns {any|*}
 */
updateMeter.handleMinute = function() {
    "use strict";
    logger.info("==> minute");
    var db = updateMeter.db;
    return Q.ninvoke(db, 'lrange', 'seconds', -60, -1).then(function(values) {
        var data        = updateMeter._getDataStub();
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
        updateMeter.db.rpush("minutes", JSON.stringify(data));
        logger.info("  Inserted data into 'minutes':", data);
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
    return updateMeter._insertIntoList("fiveMinutes");
};

/**
 * Inserts a list of 30 minutes into the half hour list
 *
 * @returns {any}
 */
updateMeter.handleHalfHour = function() {
    "use strict";
    logger.info("==> half hour");
    return updateMeter._insertIntoList("halfHours");
};

/**
 * Triggers insertion into the list for hours
 * @returns {any|*}
 */
updateMeter.handleHour = function() {
    "use strict";
    logger.info("==> hour");
    return updateMeter._insertIntoList("hours");
};

/**
 * Triggers insertion into the list for six hours
 * @returns {any|*}
 */
updateMeter.handleSixHours = function() {
    "use strict";
    logger.info("==> six hours");
    return updateMeter._insertIntoList("sixHours");
};

/**
 * Triggers insertion into the list for days
 * @returns {any|*}
 */
updateMeter.handleMidnight = function() {
    "use strict";
    logger.info("==> midnight");
    return updateMeter._insertIntoList("days");
};

/**
 * Triggers insertions into the list for weeks
 *
 * @returns {any|*}
 */
updateMeter.handleWeek = function() {
    "use strict";
    logger.info("==> week");
    return updateMeter._insertIntoList("weeks");
};

/**
 * Triggers insertion into the list for months
 *
 * @returns {any|*}
 */
updateMeter.handleMonth = function() {
    "use strict";
    logger.info("==> month");
    return updateMeter._insertIntoList("months");
};

/**
 * Triggers insertion into the list for years
 *
 * @returns {any|*}
 */
updateMeter.handleYear = function() {
    "use strict";
    logger.info("==> year");
    return updateMeter._insertIntoList("years");
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
            "length": utils.getMonthDays(timer.clock)
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

    return updateMeter._getRangeFromDb(src.source, src.length).then(function(data) {
        updateMeter.db.rpush(list, JSON.stringify(data));
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

    return Q.ninvoke(updateMeter.db, 'lrange', name, number * -1, -1).then(function(values) {
        var data = updateMeter._getDataStub();

        var total = 0;
        var totals = [];

        values.forEach(function(item) {
            var json = JSON.parse(item);
            totals.push(json.total);
            total += parseInt(json.total, 10);
        });

        data.total = total;
        data.kwh   = parseFloat(parseFloat((data.total/10000)).toFixed(4));
        data[utils.getSeriesName(name)] = totals;

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
    var stamp = new Date();

    return {
        timestamp: stamp.getTime(),
        time: stamp.toJSON()
    };
};

module.exports = updateMeter;
