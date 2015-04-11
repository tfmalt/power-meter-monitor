/**
 * Created by tm on 11/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var onoff  = require('onoff'),
    Gpio   = onoff.Gpio,
    logger = require('winston');

function RaspberryMeter(redis) {
    this.counter = 0;
    this.pulses  = [];
    this.db = redis;
}

RaspberryMeter.clock  = new Date();
RaspberryMeter.start  = new Date();
RaspberryMeter.sensor = new Gpio(18, 'in', 'both');
RaspberryMeter.led    = new Gpio(17, 'out');
RaspberryMeter.self   = null;
RaspberryMeter.limits = {
    "seconds": 4200,
    "minutes": 1560,
    "fiveMinutes": 2304,   // 5 minutes for 7 + 1 day.
    "thirtyMinutes": 1536, // 30 minutes for 31+ 1 days
    "sixHours": 2200       // 6 hours for 365 + 5 days.
};

RaspberryMeter.prototype.startMonitor = function() {
    RaspberryMeter.self = this;
    RaspberryMeter.sensor.watch(this._handleSensorInterrupt);
    this.doEverySecond(this);
};

RaspberryMeter.prototype.doEverySecond = function(that) {
    logger.info("Doing every second: ", that.counter);
    logger.info(that.pulses);

    var data = {
        "timestamp": Date.now(),
        "time": (new Date()).toJSON(),
        "pulseCount": this.counter,
        "kWhs": parseFloat(this.counter/10000).toFixed(4),
        "watt": parseFloat((this.counter/10000)*3600*1000).toFixed(4)
    };

    logger.info(data);

    that._storeSecondInDb(data);
    that.counter = 0;
    that.pulses = [];

    setTimeout(function () {
        that.doEverySecond(that);
    }, that._getTimeoutLength());
};

RaspberryMeter.prototype._storeSecondInDb = function(data) {
    this.db.rpush("seconds", JSON.stringify(data));

};

RaspberryMeter.prototype._handleSensorInterrupt = function(err, value) {
    if (err) { throw err; }

    var that        = RaspberryMeter.self;
    var pulseLength = that._getPulseLength();

    if (that._isSensorStateChanged(value) === false) {
        that._updateLastPulse(value, pulseLength);
        return;
    }

    if (value === 1) {
        that.counter++;
    }

    that._updateLed(value);
    that._addPulse(value, pulseLength);
    that._resetPulseStart();
};

RaspberryMeter.prototype._isSensorStateChanged = function(value) {
    var last = this._getLastPulse();
    if (last !== undefined && last.value !== undefined && value === last.value) {
        return false;
    }

    return true;
};

RaspberryMeter.prototype._getTimeoutLength = function() {
    this._updateInternalClock();
    return (1000 + (RaspberryMeter.clock.getTime() - Date.now()));
};

RaspberryMeter.prototype._updateLed = function(value) {
    RaspberryMeter.led.writeSync(value);
};

/**
 * Increments the internal time keeping object with 1 second (1000 ms)
 *
 * @returns {number} timestamp
 * @private
 */
RaspberryMeter.prototype._updateInternalClock = function() {
    RaspberryMeter.clock.setTime(RaspberryMeter.clock.getTime() + 1000);
    return RaspberryMeter.clock.getTime();
};

/**
 * Calculates the interval since the last pulse event and returns the value
 * in milli seconds.
 *
 * @returns {number}
 * @private
 */
RaspberryMeter.prototype._getPulseLength = function() {
    return Date.now() - RaspberryMeter.start.getTime();
};

RaspberryMeter.prototype._resetPulseStart = function() {
    RaspberryMeter.start = new Date();
};

RaspberryMeter.prototype._getLastPulse = function() {
    return this.pulses[this.pulses.length - 1];
};

RaspberryMeter.prototype._updateLastPulse = function(value, length) {
    var last = this._getLastPulse();

    if (last.value !== value) {
        throw new Error("Value in input does not match value in array");
    }

    this.pulses[this.pulses.length -1].length = last.length + length;
};

RaspberryMeter.prototype._addPulse = function(value, length) {
    this.pulses.push({"value": value, "length": length});
};

process.on('SIGINT', function() {
    console.log("RaspberryMeter: Dealing with SIGINT.");
    console.log("  Unexporting sensor.");
    RaspberryMeter.sensor.unexport();

    console.log("  Unexporting led.");
    RaspberryMeter.led.writeSync(0);
    RaspberryMeter.led.unexport();
});

exports.RaspberryMeter = RaspberryMeter;