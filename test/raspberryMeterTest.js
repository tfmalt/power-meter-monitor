/**
 *
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var chai    = require('chai');
var promise = require('chai-as-promised');
var expect  = chai.expect;
var mockery = require('mockery');
var redis   = require('fakeredis');
var logger  = require('winston');

chai.use(promise);

try {
    logger.remove(logger.transports.Console);
}
catch (e) {
    // ignore
}

var mock_onoff = {
    Gpio: function(number, direction, edge) {
        "use strict";
        // return 'mocked gpio';
        this.watch = function(callback) {
            return true;
        };

        this.writeSync = function(value) {
            return true;
        };

    }
}

describe('Power Meter Monitor', function() {
    "use strict";
    describe('RaspberryMeter', function() {
        var RaspberryMeter = null;
        var m = null;
        before(function() {
            mockery.registerAllowable('../lib/raspberryMeter');
            mockery.registerMock('onoff', mock_onoff);
            mockery.enable({
                useCleanCache: true,
                warnOnUnregistered: false
            });

            var rpm = require('../lib/raspberryMeter');
            RaspberryMeter = rpm.RaspberryMeter;
        });

        beforeEach(function(done) {
            m = new RaspberryMeter(redis.createClient());
            done();
        });

        it('Should create new object', function() {
            var rpi = new RaspberryMeter(redis.createClient());
            expect(rpi).to.be.instanceOf(RaspberryMeter);
        });

        describe('startMonitor', function() {
            it('should finish without error', function() {
                expect(m.startMonitor()).to.be.undefined;
            });
        });

        describe('doEverySecond', function() {
            it('should run timeout as expected', function(done) {
                m.doEverySecond(m);
                done();
            });
        });

        describe('_verifyLimit', function() {
            it('should return false', function() {
                return expect(m._verifyLimit()).to.eventually.equal(false);
            });

            it('should return true', function() {
                for (var i = 0; i < 5000; i++) {
                    m.db.rpush("seconds", "foo: " + i);
                }

                return expect(m._verifyLimit()).to.eventually.equal(true);
            });
        });

        describe('_handleSensorInterrupt', function() {
            it('should throw error when error', function() {
                expect(m._handleSensorInterrupt.bind(m, new Error())).to.throw(Error);
            });

            it('should complete without error', function() {
                RaspberryMeter.self = m;
                expect(m._handleSensorInterrupt(null, 1)).to.be.undefined;
            });

            it('should complete without error', function() {
                expect(m._handleSensorInterrupt(null, 1)).to.be.undefined;
            });

            it('should complete without error', function() {
                m = new RaspberryMeter();
                RaspberryMeter.self = m;
                expect(m._handleSensorInterrupt(null, 1)).to.be.undefined;
            });
        });

        describe('_getPulseLength', function() {
            it('should return an integer', function(done) {
                setTimeout(function() {
                    expect(m._getPulseLength()).to.be.above(9);
                    done();
                }, 10);
            });
        });

        after(function() {
            mockery.disable();
            mockery.deregisterAll();
        })

    });
});