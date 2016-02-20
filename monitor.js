#!/usr/bin/env node
/**
 * Startup script that bootstraps monitoring of my power meter talking
 * to an Ardunio Uno over a serial connection, storing the data in a redis
 * database for later consumption.
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2015 (c) Thomas Malt <thomas@malt.no>
 */

var config     = require('./lib/configParser'),
    logger     = require('winston'),
    VitalSigns = require('vitalsigns'),
    serialport = require('serialport'),
    redis      = require('redis'),
    argv       = require('minimist')(process.argv.slice(2));
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

    switch(process.env.NODE_ENV) {
        case "development":
        case "integration":
        case "test":
            console.log("Logging to: Console.");
            logger.add(logger.transports.Console, {
                colorize: true,
                timestamp: true
            });
            break;
        default:
            console.log("Logging to: ", config.logfile);
            logger.add(logger.transports.File, {
                colorize:  true,
                timestamp: true,
                filename: config.logfile,
                json: false
            });
            break;
    }
};

/**
 * Setup the serial port and connect events to functions in the power-meter object.
 *
 * @param meter power meter object.
 */
var setupSerialport = function (meter) {
    "use strict";
    logger.info("Connecting to serial port: ", config.serial.dev);
    var sp = new serialport.SerialPort(config.serial.dev, {
        baudrate: 115200,
        parser: serialport.parsers.readline("\n")
    }, false);

    sp.open(function () {
        logger.info("Successfully connected to serial port " + config.serial.dev);
        sp.on("data", function (data) {
            meter.handleData(data, meter);
        });

        sp.on("error", function (err) {
            logger.error("Got error from serialport:", err.message);
            process.exit(1);
        });
    });
};

var createMeter = function() {
    "use strict";
    var Meter = null;

    switch(config.meterType) {
        case "raspberry":
        case "rpi":
            Meter = require('./lib/raspberryMeter').RaspberryMeter;
            break;
        case "verbose":
            Meter = require('./lib/verboseMeter').VerboseMeter;
            break;
        case "arduino":
        case "minimal":
            Meter = require('./lib/minimalMeter').MinimalMeter;
            break;
        default:
            Meter = require('./lib/minimalMeter').MinimalMeter;
            break;
    }

    var client = redis.createClient(
        config.redis.port,
        config.redis.host,
        config.redis.options
    );

    var meter = new Meter(client);

    if (config.meterType === "raspberry" || config.meterType === "rpi") {
        return meter;
    }

    setupSerialport(meter);
    return meter;
};

printUsage = function() {
    "use strict";
    console.log("power-meter-monitor v" + config.version);
    console.log("Usage:");
    console.log("  -h, --help          Print help and usage information");
    console.log("      --meter <type>  Type of meter to instantise");
    console.log("  -v, --version       Print version of application and exit");
};

printVersion = function() {
    "use strict";
    console.log("v" + config.version);
};

checkArguments = function() {
    "use strict";
    if (argv.h === true || argv.help === true) {
        printUsage();
        process.exit();
    }

    if (argv.v === true || argv.version === true) {
        printVersion();
        process.exit();
    }
};

domain.on("error", function (err) {
    "use strict";
    logger.log("error", "Got an error event stack trace:", err.message);
    console.log("Error:", err.message, "- will exit.");
    process.exit(1);
});

process.on('SIGINT', function () {
    "use strict";
    console.log("Got SIGINT. Told to exit. So bye.");
    logger.info("Got SIGINT. Told to exit. so bye.");
    process.exit(0);
});

domain.run(function () {
    "use strict";
    checkArguments();
    config.setup();
    setupLogger();

    console.log("Starting power-meter-monitor version: " + config.version);
    console.log("  Node version: " + process.version);

    logger.info("Starting power-meter-monitor version: " + config.version);
    logger.info("Node version: " + process.version);

    setupVitals();

    console.log("  Redis host: " + config.redis.host + ":" + config.redis.port);
    logger.info("Redis host: %s:%s", config.redis.host, config.redis.port);

    console.log("  Power Meter Type:", config.meterType);

    var m = createMeter();
    m.startMonitor();

    console.log("Power Meter Monitor started.");
    logger.info(
        "Power meter monitoring v%s started in master script",
        config.version
    );
});

/*
 * MIT LICENSE
 *
 * Copyright (C) 2013-2016 Thomas Malt <thomas@malt.no>
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
