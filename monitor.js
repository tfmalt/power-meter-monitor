#!/usr/bin/env node

/**
 * Startup script that bootstraps monitoring of my power meter talking
 * to a RaspberryPi, storing the data in a redis database.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2017 (c) Thomas Malt <thomas@malt.no>
 */

const bluebird = require('bluebird');
const redis = require('redis');
const Config = require('./lib/ConfigParser');
const Meter = require('./lib/RaspberryMeter');
const mc = require('./lib/monitorController');

const config = new Config();
const logger = mc.setupLogger(config);

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

mc.printStartupMessage(config)
mc.setupVitals();

const client = redis.createClient(config.redis);

client.on('error', (err) => {
  console.log('got error:', err.message);
  logger.error('error.message');
  process.exit(1);
});

bluebird.resolve(client)
  .then((c) => new Meter(c, logger))
  .then((meter) => meter.startMonitor())
  .then(() => console.log('Power Meter Monitor started.'))
  .then(() => (
    logger.info(
      `Power meter monitoring v${config.version} started in master script`
    )
  ))
  .catch(error => {
    console.log('got error:', error.message);
    logger.error('error.message');
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
