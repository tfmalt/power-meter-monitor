#!/usr/bin/env node

/**
 * Script for doing updates to the database at regular intervals
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2015 (c) tm
 */
var cfg     = require('./lib/configParser');
var updater = require('./lib/updateMeter');
var domain  = require('domain').create();
var logger = require('winston');
var redis   = require('redis');

/**
 * Configure the logger properly. Different behaviour is added depending
 * if the logger is run in production or development.
 */
var setupLogger = function () {
    logger.remove(logger.transports.Console);

    switch(process.env.NODE_ENV) {
        case "development":
        case "integration":
        case "test":
            console.log("Logging to: Console.");
            logger.add(logger.transports.Console, {
                colorize: true,
                timestamp: true,
                json: false
            });
            break;
        default:
            console.log("Logging to: ", cfg.logfile);
            logger.add(logger.transports.File, {
                colorize:  true,
                timestamp: true,
                filename: cfg.logfile,
                json: false
            });
            break;
    }
};


domain.run(function() {
    "use strict";
    cfg.setup();
    setupLogger();

    var client = redis.createClient(
        cfg.redis.port,
        cfg.redis.host,
        cfg.redis.options
    );

    updater.setDbClient(client);
    updater.start();

    logger.info("power-meter-updater v%s started", cfg.version);

});

domain.on("error", function(err) {
    "use strict";
    logger.log('error', err.message, "- will exit.");

    setTimeout(function() {
        process.exit();
    }, 10);
});




