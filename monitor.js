/**
 * Script that fetches info from my power meter using ardunio and 
 * storing it in a redis database for later consumption. 
 * 
 */
var config     = require('./config'),
    meter      = require('./lib/main').meter,
    logger     = require('winston'),
    VitalSigns = require('vitalsigns'),
    domain     = require('domain').create();

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

    logger.remove(logger.transports.Console);
    if (process.env.POWER_ENV === "development") {
        console.log("Logging to: Console.\n");
        logger.add(logger.transports.Console, {
            colorize: true,
            timestmap: true
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

    logger.info("Setting up health check with VitalSigns.");

    var vitals = new VitalSigns({autoCheck: 10000});

    vitals.monitor('cpu');
    vitals.monitor('mem', {units: 'MB'});
    vitals.monitor('tick');

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
        logger.log(type, '  failed:', failed);
    });

    meter.startMonitor(config);

    logger.info(
        "Power meter monitoring v%s started in master script",
        config.version
    );
});

