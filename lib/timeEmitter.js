/**
 *
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var events = require('events');
var timeEmitter = new events.EventEmitter();

timeEmitter.clock = new Date();

/**
 * Every minute events are emitted if we have reached the condition for them
 * to be triggered
 *
 * @param that
 */
timeEmitter.doEveryMinute = function () {
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

    setTimeout(function () {
        timeEmitter.doEveryMinute();
    }, timeEmitter.getTimeoutLength());

};

/**
 * Calculate the timeout length to correct time skew.
 * @returns {number}
 * @private
 */
timeEmitter.getTimeoutLength = function() {
    "use strict";
    var time    = timeEmitter._updateInternalClock();
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
timeEmitter._updateInternalClock = function() {
    "use strict";
    timeEmitter.clock.setMilliseconds(0);
    timeEmitter.clock.setSeconds(0);
    timeEmitter.clock.setTime(timeEmitter.clock.getTime() + 60000);

    return timeEmitter.clock.getTime();
};


timeEmitter.isFiveMinutes = function() {
    "use strict";
    return this.clock.getMinutes() % 5 === 0;
};

timeEmitter.isHalfHour = function() {
    "use strict";
    return this.clock.getMinutes() % 30 === 0;
};

timeEmitter.isHour = function() {
    "use strict";
    return this.clock.getMinutes() === 0;
};

timeEmitter.isSixHours = function() {
    "use strict";
    if (this.clock.getMinutes() !== 0) {
        return false;
    }
    return this.clock.getHours() % 6 === 0;
};

timeEmitter.isMidnight = function() {
    "use strict";
    if (this.isSixHours() === false) {
        return false;
    }
    return this.clock.getHours() === 0;
};

timeEmitter.isWeek = function() {
    "use strict";
    if (this.isMidnight() === false) {
        return false;
    }
    return this.clock.getDay() === 0;
};

timeEmitter.isMonth = function() {
    "use strict";
    if (this.isMidnight() === false) {
        return false;
    }

    return this.clock.getDate() === 1;
};

timeEmitter.isYear = function() {
    "use strict";
    if (this.isMonth() === false) {
        return false;
    }
    return this.clock.getMonth() === 0;
};


module.exports = timeEmitter;
