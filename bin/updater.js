#!/usr/bin/env node

/**
 * Script for doing updates to the database at regular intervals
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2017 (c) Thomas Malt
 */

const bluebird = require('bluebird');
const logger   = require('winston');
const redis    = require('redis');
const Config   = require('../lib/ConfigParser');
const Updater  = require('../lib/UpdateMeter');
const mc       = require('../lib/monitorController');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const cfg = new Config();
mc.setupLogger(cfg);

console.log('Starting power-meter-updater v' + cfg.version);

const client = redis.createClient(cfg.redis);
const up     = new Updater(client, logger);

client.on('error', (error) => {
  logger.error('Got error from redis server: ', error.message);
  process.exit(1);
});

client.on('ready', () => {
  up.start();
  logger.info('power-meter-updater v%s started', cfg.version);
});
