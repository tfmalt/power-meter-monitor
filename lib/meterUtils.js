/**
 *
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

const meterUtils = {};

meterUtils.getSeriesName = (name) => (
  'per' + name.charAt(0).toUpperCase() + name.slice(1, -1)
);

/**
 * Returns the number of days in February correctly for leap years also.
 *
 * @param {Date} date object
 * @returns {integer} days in given February.
 */
meterUtils.getDaysInFebruary = (date) => {
  return meterUtils.isLeapYear(date.getFullYear())
    ? 29
    : 28;
};


/**
 * Returns the correct number of days in any given month, including
 * leap years.
 *
 * @param {Date} date a date object
 * @returns {integer} number of days in given month.
 */
meterUtils.getMonthDays = date => {
  // Hack since the date is exactly midnight we need the
  // previous month.
  let test = new Date(date.getTime());
  test.setSeconds(test.getSeconds() - 1);

  switch (test.getMonth()) {
    case 3:
    case 5:
    case 8:
    case 10:
      return 30;
    case 1:
      return meterUtils.getDaysInFebruary(date);
    default:
      return 31;
  }
};

/**
 * Helper function to tell if a year is leap or not correctly
 *
 * @param {integer} year to test
 * @returns {boolean} is leap year or not.
 */
meterUtils.isLeapYear = (year) => {
  if (year % 4 === 0 && year % 100 !== 0) {
    return true;
  }

  return year % 400 === 0;
};

module.exports = meterUtils;
