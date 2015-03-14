/**
 * Startup script that bootstraps monitoring of my power meter talking
 * to an Ardunio Uno over a serial connection, storing the data in a redis
 * database for later consumption.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2015 (c) Thomas Malt <thomas@malt.no>
 */
var config     = require('./config'),
    Meter      = require('./lib/main').Meter,
    logger     = require('winston'),
    VitalSigns = require('vitalsigns'),
    serialport = require('serialport'),
    redis      = require('redis'),
    domain     = require('domain').create();

/**
 * Setup function for vitalsigns. Vital signs output statistics on server
 * performance to the logger at a given interval.
 */
var setupVitals = function () {
    logger.info("Setting up health check with VitalSigns.");

    var vitals = new VitalSigns({autoCheck: 30000});

    vitals.monitor('cpu', {});
    vitals.monitor('mem', {units: 'MB'});
    vitals.monitor('tick', {});

    vitals.on('healthChange', function (healthy, report, failed) {
        logger.warn(
            "Health Change: server is: %s\nReport: %s\nFailed: %s",
            (healthy ? 'healthy' : 'unhealthy'),
            report,
            failed
        );
    });

    vitals.on('healthCheck', function (healthy, report, failed) {
        var type = healthy ? 'info' : 'warn';
        logger.log(type, "Health Check");
        logger.log(type, '  healthy:', healthy);
        logger.log(type, '  report:', JSON.stringify(report));

        if (failed.length > 0) {
            logger.log(type, '  failed:', failed);
        }
    });
};

/**
 * Configure the logger properly. Different behaviour is added depending
 * if the logger is run in production or development.
 */
var setupLogger = function () {
    logger.remove(logger.transports.Console);

    if (process.env.POWER_ENV === "development") {
        console.log("Logging to: Console.\n");
        logger.add(logger.transports.Console, {
            colorize: true,
            timestamp: true
        });
    } else {
        console.log("Logging to: ", config.logfile, "\n");
        logger.add(logger.transports.File, {
            colorize:  true,
            timestamp: true,
            filename: config.logfile,
            json: false
        });
    }

};

domain.on("error", function (err) {
    "use strict";
    logger.error("Got an error event stack trace:", err.message, err.stack);
    process.exit(1);
});

process.on('SIGINT', function () {
    "use strict";
    logger.info("Got SIGINT. Told to exit. so bye.");
    process.exit(0);
});


domain.run(function () {
    "use strict";
    console.log("Starting power-meter-monitor version " + config.version);

    setupLogger();
    setupVitals();

    var meter = new Meter();
    meter.startMonitor({
        "redis":      redis,
        "serialport": serialport,
        "config":     config
    });

    logger.info(
        "Power meter monitoring v%s started in master script",
        config.version
    );
});

/*
 * MIT LICENSE
 *
 * Copyright (C) 2013-2015 Thomas Malt <thomas@malt.no>
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
