/**
 *
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */


var meterUtils = {};
meterUtils.getSeriesName = function(name) {
    "use strict";
    return "per" + name.charAt(0).toUpperCase() + name.slice(1, -1);
};


/**
 * Returns the correct number of days in any given month, including leap years.
 *
 * @returns {*}
 */
meterUtils.getMonthDays = function(date) {
    "use strict";

    // Hack since the date is exactly midnight we need the
    // previous month.
    var test = new Date(date.getTime());
    test.setSeconds(test.getSeconds() - 1);

    var days;

    switch(test.getMonth()) {
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
            days = this.getDaysInFebruary(date);
            break;
    }

    return days;
};

/**
 * Returns the number of days in February correctly for leap years also.
 *
 * @returns {number}
 */
meterUtils.getDaysInFebruary = function(date) {
    "use strict";
    return this.isLeapYear(date.getFullYear()) ? 29 : 28;
};

/**
 * Helper function to tell if a year is leap or not correctly
 *
 * @returns {boolean}
 */
meterUtils.isLeapYear = function(year) {
    if (year % 4 === 0 && year % 100 !== 0) {
        return true;
    }

    return year % 400 === 0;
};

module.exports = meterUtils;
