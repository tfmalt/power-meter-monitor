/**
 *
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var cfg  = require('../config');
var argv = require('minimist')(process.argv.slice(2));

var configParser = cfg;

configParser.setup = function() {
    "use strict";
    this._overrideWithEnv();
    this._overrideWithArgs();
};

configParser._overrideWithEnv = function() {
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

};

configParser._overrideWithArgs = function() {
    if (typeof argv.meter === 'string' ) {
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
};

module.exports = configParser;
