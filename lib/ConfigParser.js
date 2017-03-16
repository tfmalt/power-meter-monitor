/**
 * Reads in a config file and exposes a configuration object.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2015-2017 (c) Thomas Malt <thomas@malt.no>
 */

const config  = require('../config');
const args   = require('args');
const version = require('../package').version;

class ConfigParser {
  constructor() {
    args
      .option(
        'meter',
        'Which type of device - One of "rpi" or "arduino".',
        'rpi'
      )
      .option(
        ['h', 'redishost'],
        'hostname of redis server',
        'localhost'
      )
      .option(
        ['p', 'redisport'],
        'port of redis server',
        6379
      )
      .option(
        ['a', 'redisauth'],
        'password for redis server',
        ''
      )
      .option(
        'logfile',
        'the file to log to',
        'monitor.log'
      );

    this.config = args.parse(process.argv);
    this.version = version;

    for (let key in config) {
      if (config.hasOwnProperty(key)) {
        console.log('parsing config:', key);
        this[key] = config[key];
      }
    }

    this.overrideWithEnv();
  }

  /**
   * Sets default varialbles for configuration
   *
   * @returns {undefined}
   * @private
   */
  overrideWithEnv() {
    if (typeof process.env.REDIS_HOST === 'string') {
      this.redis.host = process.env.REDIS_HOST;
    }

    if (typeof process.env.REDIS_PORT !== 'undefined') {
      this.redis.port = process.env.REDIS_PORT;
    }

    if (typeof process.env.REDIS_AUTH === 'string') {
      this.redis.options.auth_pass = process.env.REDIS_AUTH;
    }

    if (typeof process.env.POWER_METER_TYPE === 'string') {
      this.meterType = process.env.POWER_METER_TYPE;
    }

    if (typeof process.env.POWER_METER_LOGFILE === 'string') {
      this.logfile = process.env.POWER_METER_LOGFILE;
    }
  }
}

module.exports = ConfigParser;
