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
    dev: "/tmp/meteroutput"
};

// meterType can be one of:
//   rpi|raspberry - raspberry pi meter
//   arduino       - arduino minimalMeter
//   minimal       - arduino minimalMeter
//   verbose       - arduino verboseMeter
exports.meterType = "rpi";
