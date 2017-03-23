#!/usr/bin/env node

/**
 * Startup script that bootstraps monitoring of my power meter talking
 * to a RaspberryPi, storing the data in a redis database.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2017 (c) Thomas Malt <thomas@malt.no>
 */

const bluebird = require('bluebird');
const redis    = require('redis');
const Config   = require('../lib/ConfigParser');
const Meter    = require('../lib/RaspberryMeter');
const utils    = require('../lib/monitorUtils');

const config = new Config();
const logger = utils.setupLogger(config);

const errorExit = (error) => {
  console.log('got error:', error.message);
  logger.error(error.message);
  process.exit(1);
};

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

utils.printStartupMessage(config);
utils.setupVitals();

const client = redis.createClient(config.redis);
const meter = new Meter(client);

client.on('error', errorExit);

meter.on('started', () => {
  logger.info(
    `Power meter monitoring v${config.version} started in master script`
  );
});

meter.on('stored_data', (info) => {
  logger.info(
    'count:', info.data.pulseCount,
    ' watt:', parseFloat(info.data.watt).toFixed(4),
    ' kwh:', parseFloat(info.data.kwh).toFixed(4),
    ' meter:', parseFloat(info.total).toFixed(4)
  );
});

meter.startMonitor();

/* istanbul ignore next */
process.on('SIGINT', () => {
  console.log('RaspberryMeter: Dealing with SIGINT.');
  console.log('  Unexporting sensor.');
  meter.sensor.unexport();

  console.log('  Unexporting led.');
  meter.led.writeSync(0);
  meter.led.unexport();

  process.exit(1);
});

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
