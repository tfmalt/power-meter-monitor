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
    this.setupArgs();
    this.parseArgs();
    this.overrideWithEnv();
  }

  setupArgs() {
    args
      .option(
        'meter',
        'Which type of device - One of "rpi" or "arduino".',
        config.meterType
      )
      .option(
        ['h', 'redishost'],
        'hostname of redis server',
        config.redis.host
      )
      .option(
        ['p', 'redisport'],
        'port of redis server',
        config.redis.port
      )
      .option(
        ['a', 'redisauth'],
        'password for redis server',
        config.redis.password
      )
      .option(
        'logfile',
        'the file to log to',
        config.logfile
      );
  }

  parseArgs() {
    this.flags = args.parse(process.argv);
    this.version = version;

    for (let key in config) {
      if (config.hasOwnProperty(key)) {
        this[key] = config[key];
      }
    }

    this.meterType = this.flags.meter;
    this.redis.host = this.flags.redishost;
    this.redis.port = this.flags.redisport;
    this.redis.password = this.flags.redisauth;
    this.logfile = this.flags.logfile;

    if (this.redis.password === '') {
      delete this.redis.password;
    }
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
      this.redis.password = process.env.REDIS_AUTH;
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
