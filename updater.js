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
const Config   = require('./lib/ConfigParser');
const Updater  = require('./lib/UpdateMeter');
const mc       = require('./lib/monitorController');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

/*
 * Configure the logger properly. Different behaviour is added depending
 * if the logger is run in production or development.
 */
const setupLogger = (cfg) => {
  logger.remove(logger.transports.Console);

  switch (process.env.NODE_ENV) {
    case 'development':
    case 'docker':
    case 'integration':
    case 'test':
      console.log(
        `Environment is ${process.env.NODE_ENV}, logging to: Console.`
      );
      logger.add(logger.transports.Console, {
        colorize:  true,
        timestamp: true,
        json:      false
      });
      break;
    default:
      console.log('Logging to: ', cfg.logfile);
      logger.add(logger.transports.File, {
        colorize:  true,
        timestamp: true,
        filename:  cfg.logfile,
        json:      false
      });
      break;
  }
};

const cfg = new Config();
setupLogger(cfg);
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
