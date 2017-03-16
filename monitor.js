#!/usr/bin/env node

/**
 * Startup script that bootstraps monitoring of my power meter talking
 * to an Ardunio Uno over a serial connection, storing the data in a redis
 * database for later consumption.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2017 (c) Thomas Malt <thomas@malt.no>
 */

const Config = require('./lib/configParser');
const logger = require('winston');
const Meter = require('./lib/RaspberryMeter');
const Prom = require('bluebird');
const redis = Prom.promisifyAll(require('redis'));
const argv = require('minimist')(process.argv.slice(2));

function createMeter(config) {
  let Meter = null;

  switch (config.meterType) {
    case 'raspberry':
    case 'rpi':
      break;
    case 'verbose':
      Meter = require('./lib/verboseMeter').VerboseMeter;
      break;
    case 'arduino':
    case 'minimal':
      Meter = require('./lib/minimalMeter').MinimalMeter;
      break;
    default:
      Meter = require('./lib/minimalMeter').MinimalMeter;
      break;
  }

  const client = redis.createClient(config.redis.port, config.redis.host, config.redis.options);
  return new Meter(client);
}


let config = new Config();
checkArguments(config);
setupLogger(config);

console.log('Starting power-meter-monitor version: ' + config.version);
console.log('  Node version: ' + process.version);

logger.info('Starting power-meter-monitor version: ' + config.version);
logger.info('Node version: ' + process.version);

setupVitals();

console.log('  Redis host: ' + config.redis.host + ':' + config.redis.port);
logger.info('Redis host: %s:%s', config.redis.host, config.redis.port);

console.log('  Power Meter Type:', config.meterType);

const m = createMeter(config);
m.startMonitor();

console.log('Power Meter Monitor started.');
logger.info('Power meter monitoring v%s started in master script', config.version);

/*
 * MIT LICENSE
 *
 * Copyright (C) 2013-2017 Thomas Malt <thomas@malt.no>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
 * OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
