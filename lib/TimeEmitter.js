/**
 *
 * Created by tm on 16/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2015-2017 (c) Thomas Malt <thomas@malt.no>
 */

const events = require('events');

class TimeEmitter extends events.EventEmitter {
  constructor() {
    super();
    this.clock = new Date();

    this.isFiveMinutes = () => (this.clock.getMinutes() % 5 === 0);
    this.isHalfHour = () => (this.clock.getMinutes() % 30 === 0);
    this.isHour = () => (this.clock.getMinutes() === 0);
    this.isSixHours = () => (this.isHour()
      ? (this.clock.getHours() % 6 === 0)
      : false);
    this.isMidnight = () => (this.isSixHours()
      ? (this.clock.getHours() === 0)
      : false);
    this.isWeek = () => (this.isMidnight()
      ? (this.clock.getDay() === 0)
      : false);
    this.isMonth = () => (this.isMidnight()
      ? (this.clock.getDate() === 1)
      : false);
    this.isYear = () => (this.isMonth()
      ? (this.clock.getMonth() === 0)
      : false);
  }

  /**
   * Set the clock to a specific time.
   * Only used for debugging and testing.
   *
   * @param {Date} date a date object
   * @returns {TimeEmitter} this
   */
  setClock(date) {
    if (!(date instanceof Date)) {
      throw new TypeError('Argument needs to be a valid Date object');
    }

    this.clock = date;

    return this;
  }

  /**
   * Every minute events are emitted if we have reached the condition for them
   * to be triggered
   *
   * @returns {undefined}
   */
  doEveryMinute() {
    this.emit('every_minute');

    if (this.isFiveMinutes()) {
      this.emit('every_five_minutes');
    }

    if (this.isHalfHour()) {
      this.emit('every_half_hour');
    }

    if (this.isHour()) {
      this.emit('every_hour');
    }

    if (this.isSixHours()) {
      this.emit('every_six_hours');
    }

    if (this.isMidnight()) {
      this.emit('every_midnight');
    }

    if (this.isWeek()) {
      this.emit('every_week');
    }

    if (this.isMonth()) {
      this.emit('every_month');
    }

    if (this.isYear()) {
      this.emit('every_year');
    }

    setTimeout(() => this.doEveryMinute(), this.getTimeoutLength());
  }

  /**
   * Calculate the timeout length to correct time skew.
   * @returns {integer} milliseconds of remaining timeout.
   * @private
   */
  getTimeoutLength() {
    let timeout = this.updateInternalClock() - Date.now();
    return (timeout >= 0)
      ? timeout
      : timeout + 60000;
  }

  /**
   * Updates the internal clock by one minute every time we tick.
   *
   * @returns {number|*} timestamp
   * @private
   */
  updateInternalClock() {
    this.clock.setMilliseconds(0);
    this.clock.setSeconds(0);
    this.clock.setTime(this.clock.getTime() + 60000);

    return this.clock.getTime();
  }

}
module.exports = TimeEmitter;
