/**
 *
 * @author tm
 * @copyright 2015-2017 (c) Thomas Malt <thomas@malt.no>
 */

const config  = require('../config');
const argv    = require('minimist')(process.argv.slice(2));
const version = require('../package').version;

class ConfigParser {
  constructor() {
    this.version = version;

    for (let key in config) {
      if (config.hasOwnProperty(key)) {
        console.log('parsing config:', key);
        this[key] = config[key];
      }
    }

    this.overrideWithEnv();
    this.overrideWithArgs();
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

  /**
   * Overides default settings from arguments
   *
   * @returns {undefined}
   * @private
   */
  overrideWithArgs() {
    if (typeof argv.meter === 'string') {
      this.meterType = argv.meter;
    }

    if (typeof argv.redishost === 'string') {
      this.redis.host = argv.redishost;
    }

    if (typeof argv.redisport !== 'undefined') {
      this.redis.port = argv.redisport;
    }

    if (typeof argv.redisauth === 'string') {
      this.redis.auth = argv.redisauth;
    }
  }
}

module.exports = ConfigParser;
