/**
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var logger = require('winston');
var events = require('events');

var updateMeter = new events.EventEmitter();

updateMeter.clock = new Date();
updateMeter.db    = null;

updateMeter.setDbClient = function(redis) {
    "use strict";
    if (redis === null || redis === undefined || redis.rpush === undefined) {
        throw new TypeError("argument needs to be a valid redis client connection");
    }

    this.db = redis;
};

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
        updateMeter.doEveryMinute(that);
    }, this._getTimeoutLength());
};

updateMeter.doEveryMinute = function(that) {
    "use strict";

    this.emit("every_minute");

    if (this.isFiveMinutes()) this.emit("every_five_minutes");
    if (this.isHalfHour())    this.emit("every_half_hour");
    if (this.isHour())        this.emit("every_hour");
    if (this.isSixHours())    this.emit("every_six_hours");
    if (this.isMidnight())    this.emit("every_midnight");
    if (this.isWeek())        this.emit("every_week");
    if (this.isMonth())       this.emit("every_month");
    if (this.isYear())        this.emit("every_year");

    setTimeout(function() {
        updateMeter.doEveryMinute(that);
    }, that._getTimeoutLength());

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

updateMeter.handleMinute = function() {
    "use strict";

    logger.info("==> handle minute: got event");
};

updateMeter.handleFiveMinutes = function() {
    "use strict";

    logger.info("==> handle five minutes: got event");
};

updateMeter.handleHalfHour = function() {
    "use strict";

    logger.info("==> handle half hour: got event");
};

updateMeter.handleHour = function() {
    "use strict";

    logger.info("==> handle hour: got event");
};

updateMeter.handleSixHours = function() {
    "use strict";

    logger.info("handle six hours: got event");
};
updateMeter.handleMidnight = function() {
    "use strict";

    logger.info("==> handle midnight: got event");
};

updateMeter.handleWeek = function() {
    "use strict";

    logger.info("==> handle week: got event");
};

updateMeter.handleMonth = function() {
    "use strict";

    logger.info("==> handle month: got event");
};

updateMeter.handleYear = function() {
    "use strict";

    logger.info("==> handle year: got event");
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
