/**
 * Created by tm on 13/04/15.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2015 (c) Thomas Malt
 */

const logger = require('winston');
const EventEmitter = require('events').EventEmitter;
const utils = require('./meterUtils');
const timer = require('./timeEmitter');

/**
 * We create the updateMeter as an object literal inheriting directly from
 * an events.EventEmitter object.
 *   minutes: 1560,    // every minutes for 24 + 2 hours
 *   fiveMinutes: 2304 // 5 minute sum 7 + 1 day
 *
 * @type {EventEmitter.EventEmitter}
 */
class UpdateMeter extends EventEmitter {
  constructor(redis) {
    super();

    this.db = redis;
    this.limits = {
      minutes: 1560,
      fiveMinutes: 2304
    };

    this.handleMinute      = this.handleMinute.bind(this);
    this.handleFiveMinutes = this.handleFiveMinutes.bind(this);
    this.handleHalfHour    = this.handleHalfHour.bind(this);
    this.handleHour        = this.handleHour.bind(this);
    this.handleSixHours    = this.handleSixHours.bind(this);
    this.handleMidnight    = this.handleMidnight.bind(this);
    this.handleWeek        = this.handleWeek.bind(this);
    this.handleMonth       = this.handleMonth.bind(this);
    this.handleYear        = this.handleYear.bind(this);
  }

  /**
   * Starts the monitoring. Enters a loop of recursively triggered setTimeout.
   * setTimeout is chosen over setInterval to correct for time skew.
   *
   * @returns {UpdateMeter} reference to self.
   */
  start() {
    if (typeof process.env.POWER_SET_TIME !== 'undefined') {
      timer.setClock(new Date(parseInt(process.env.POWER_SET_TIME, 10)));
      logger.info('Setting internal time to: ' + timer.clock);
    }

    timer.on('every_minute',       this.handleMinute);
    timer.on('every_five_minutes', this.handleFiveMinutes);
    timer.on('every_half_hour',    this.handleHalfHour);
    timer.on('every_hour',         this.handleHour);
    timer.on('every_six_hours',    this.handleSixHours);
    timer.on('every_midnight',     this.handleMidnight);
    timer.on('every_week',         this.handleWeek);
    timer.on('every_month',        this.handleMonth);
    timer.on('every_year',         this.handleYear);

    setTimeout(() => timer.doEveryMinute(), timer.getTimeoutLength());

    return this;
  }

  /**
   * Inserting average data into the minutes list
   *
   * @returns {any|*} whatever data the function returns
   */
  handleMinute() {
    logger.info('==> minute');
    const max = v => v.reduce((a, b) => (a > b.pulseCount) ? a : b.pulseCount);
    const min = v => v.reduce((a, b) => (a < b.pulseCount) ? a : b.pulseCount);

    return this.db.lrangeAsync('seconds', -60, -1)
      .then(values => values.map(JSON.parse))
      .then((values) => {
        let data        = this.getDataStub();

        data.count   = values.reduce((a, b) => (a + b.pulseCount), 0);
        data.kwh     = values.reduce((a, b) => (a + b.kWhs), 0);
        data.max     = max(values);
        data.min     = min(values);
        data.average = parseFloat(data.count / values.length);
        data.watts   = parseFloat(data.average / 10000 * 3600 * 1000);
        data.total   = data.count;

        return data;
      })
      .then((data) => {
        data.kwh     = parseFloat(parseFloat(data.kwh).toFixed(4));
        data.average = parseFloat(parseFloat(data.average).toFixed(4));
        data.watts   = Math.round(data.watts);

        return data;
      })
      .then((data) => {
        this.db.rpush('minutes', JSON.stringify(data));
        logger.info('  Inserted data into "minutes":', data);

        return data;
      })
      .catch( (error) => {
        logger.error('Got error in handleMinute:', error.message);
        process.exit(1);
      });
  }

  /**
   * Handles every five minute insert into the database.
   *
   * @returns {any|*} return from insertIntoList
   */
  handleFiveMinutes() {
    logger.info('==> five minutes');
    return this.insertIntoList('fiveMinutes');
  }

  /**
   * Inserts a list of 30 minutes into the half hour list
   *
   * @returns {any} return from insertIntoList
   */
  handleHalfHour() {
    logger.info('==> half hour');
    return this.insertIntoList('halfHours');
  }

  /**
   * Triggers insertion into the list for hours
   *
   * @returns {any|*} return from insertIntoList
   */
  handleHour() {
    logger.info('==> hour');
    return this.insertIntoList('hours');
  }

  /**
   * Triggers insertion into the list for six hours
   *
   * @returns {any|*} return from insertIntoList
   */
  handleSixHours() {
    logger.info('==> six hours');
    return this.insertIntoList('sixHours');
  }

  /**
   * Triggers insertion into the list for days
   *
   * @returns {any|*} return from insertIntoList
   */
  handleMidnight() {
    logger.info('==> midnight');
    return this.insertIntoList('days');
  }

  /**
   * Triggers insertions into the list for weeks
   *
   * @returns {any|*} return from insertIntoList
   */
  handleWeek() {
    logger.info('==> week');
    return this.insertIntoList('weeks');
  }

  /**
   * Triggers insertion into the list for months
   *
   * @returns {any|*} return from insertIntoList
   */
  handleMonth() {
    logger.info('==> month');
    return this.insertIntoList('months');
  }

  /**
   * Triggers insertion into the list for years
   *
   * @returns {any|*} return from insertIntoList
   */
  handleYear() {
    logger.info('==> year');
    return this.insertIntoList('years');
  }

  /**
   * Helper function that returns the correct list to insert data into and which
   * list to fetch data from.
   *
   * @param {string} name which resource
   * @returns {object} information about which list to insert data in
   * @private
   */
  getListSource(name) {
    const listSource = {
      fiveMinutes: {
        source: 'minutes',
        length: 5
      },
      halfHours: {
        source: 'minutes',
        length: 30
      },
      hours: {
        source: 'minutes',
        length: 60
      },
      sixHours: {
        source: 'hours',
        length: 6
      },
      days: {
        source: 'hours',
        length: 24
      },
      weeks: {
        source: 'days',
        length: 7
      },
      months: {
        source: 'days',
        length: utils.getMonthDays(timer.clock)
      },
      years: {
        source: 'months',
        length: 12
      }
    };

    if (!listSource.hasOwnProperty(name)) {
      throw new TypeError('Argument must be a valid list source');
    }

    return listSource[name];
  }

  /**
   * Inserts a data object specified for the specific list into the database.
   *
   * @param {string} list in redis database to fetch data from
   * @returns {Promise} the promise from getRangeFromDb
   * @private
   */
  insertIntoList(list) {
    const src = this.getListSource(list);

    return this.getRangeFromDb(src.source, src.length).then(data => {
      this.db.rpush(list, JSON.stringify(data));
      logger.info(`  Inserted data into ${list}:`, data);
      return data;
    });
  }

  /**
   * Returns a promise with a range from the end of one of the redis lists
   *
   * @param {string} name name of key
   * @param {integer} number of items the fetch from end.
   * @returns {Promise} A promise with the result form the range query.
   * @private
   */
  getRangeFromDb(name, number) {
    return this.db.lrangeAsync(name, number * -1, -1)
      .then(values => values.map(JSON.parse))
      .then(values => {
        let data = this.getDataStub();

        data.total = values.reduce((a, b) => (a + b.total), 0);
        data.kwh   = data.total / 10000;
        data[utils.getSeriesName(name)] = values.map(i => i.total);

        return data;
      })
      .then(data => {
        data.kwh = parseFloat(data.kwh.toFixed(4));
        return data;
      })
      .catch( (err) => logger.error(`error getRangeFromDb: ${err.message}`));
  }

  /**
   * Helper that generates the start of every json data object stored in the db.
   *
   * @returns {object} Timestamp object.
   * @private
   */
  getDataStub() {
    const stamp = new Date();
    return {timestamp: stamp.getTime(), time: stamp.toJSON()};
  }
}

module.exports = UpdateMeter;
