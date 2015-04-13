/**
 * A configuration file for running tests.
 *
 * @namespace process.env.NODE_ENV
 * @type {exports}
 */
var pj = require('./package.json');

exports.version = pj.version;

exports.logfile = "/var/log/power-meter/monitor.log";

exports.redis = {
    host: "localhost",
    port: 6379,
    options: {
        auth_pass: null
    }
};

exports.serial =  {
    dev: "/dev/tty.usbmodem1d11431"
};
