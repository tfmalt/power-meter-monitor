/**
 * A configuration file for running tests.
 *
 * @namespace process.env.POWER_ENV
 * @type {exports}
 */
var pj = require('./package.json');

exports.version = pj.version;

if (process.env.POWER_ENV === "development") {
    exports.logfile = "monitor.log";
} else {
    exports.logfile = "/var/log/power-meter/monitor.log";
}

exports.redis = {
    host: "localhost",
    port: 6379,
    options: {
        auth_pass: null
    }
};

exports.serial =  {
    dev: "/tmp/meteroutput"
};
