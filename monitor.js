/**
 * Script that fetches info from my power meter using ardunio and 
 * storing it in a redis database for later consumption. 
 * 
 */
var config = require('./config-private'),
    meter  = require('./lib/main').meter,
    logger = require('winston'),
    domain = require('domain').create();

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
    logger.remove(logger.transports.Console);
    logger.add(logger.transports.File, {
        colorize:  true,
        timestamp: true,
        filename: "/var/log/power-meter/monitor.log",
        maxsize: 100000000,
        maxFiles: 2,
        json: false
    });

    console.log("power-meter-monitor version 0.4.6");
    meter.startMonitor(config.redis);

    logger.info("Power meter monitoring started in master script");
});

