/**
 * power-meter-monitor/lib/meter test file
 *
 * @type {exports.expect}
 */

var chai         = require('chai'),
    sinon        = require('sinon'),
    chaipromise  = require('chai-as-promised'),
    expect       = chai.expect,
    MinimalMeter = require('../lib/minimalMeter').MinimalMeter,
    serialport   = require('serialport'),
    logger       = require('winston'),
    fakeredis    = require('fakeredis'),
    cron         = require('cron-emitter'),
    config       = require('../config-test');

chai.use(chaipromise);

try {
    logger.remove(logger.transports.Console);
}
catch (e) {
    // ignore
}

describe('Power Meter Monitor', function () {
    describe('MinimalMeter', function () {
        var meter;
        beforeEach(function (done) {
            meter = new MinimalMeter(fakeredis.createClient());
            done();
        });

        afterEach(function (done) {
            "use strict";
            meter = undefined;
            done();
        });

        it('should throw TypeError when not passed a valid redis client', function () {
            "use strict";
            var testFn = function () {
                new MinimalMeter();
            };

            expect(testFn).to.throw(TypeError);
        });

        it('should be an Object', function () {
            expect(meter).to.be.instanceOf(MinimalMeter);
        });

        it('should have correct initial values', function () {
            expect(meter.db).to.be.instanceOf(fakeredis.RedisClient);
            expect(meter.hasBegun).to.be.false;
        });


        describe('startMonitor', function () {
            it('should finish without error', function () {
                expect(meter.startMonitor()).to.be.undefined;
            });

        });

        describe('handleData', function () {
            it('should find asBegun is false', function () {
                expect(meter.hasBegun).to.be.false;
            });

            it('should return undefined when not beginning and reads noise', function () {
                expect(meter.handleData("Hello there line noise", meter)).to.be.false;
            });

            it('should behave correctly when receiving BEGIN json', function () {
                expect(meter.handleData('{"BEGIN": 1}', meter)).to.be.true;
                expect(meter.hasBegun).to.be.true;
                expect(meter.handleData("hello there", meter)).to.be.true;
                expect(meter.handleData('{"foo": 1, "bar": 2}', meter)).to.be.true;
            });

        });


        describe('isValidData', function () {
            it('should return false on non json', function () {
                expect(meter.isValidData("hello not json")).to.be.false;
            });

            it('should return true when it gets json', function () {
                expect(meter.isValidData('{"foo": 1, "bar": "to"}')).to.be.true;
            });
        });


        describe('isBeginning', function () {
            it('should return false when string is not BEGIN', function () {
                expect(meter.isBeginning('{"foo": 1, "bar": "to"}')).to.be.false;
            });

            it('should return true when string is BEGINNING', function () {
                expect(meter.isBeginning('{"BEGIN": 1}')).to.be.true;
            });
        });


        describe('handlePulseCount', function () {
            it('should throw error on invalid data', function () {
                expect(meter.handlePulseCount.bind(meter, "foo")).to.throw(TypeError, /argument must/);
            });

            it('should return undefined on valid data', function() {
                expect(meter.handlePulseCount.bind(meter, {
                    "outsidePulse": [1, 2, 3, 4],
                    "insidePulse": [1, 2, 3, 4],
                    "pulseCount": 4,
                    "kwhCount": 5239,
                    "timestamp": 436783000
                })).to.throw(TypeError, /must be a number/);

            });

            it('should return undefined on valid data', function () {
                "use strict";
                expect(meter.handlePulseCount(10)).to.deep.equal({
                    pulseCount: 10
                });
            });
        });

        describe('storeSecondInHour', function() {
            it('should have a valid redis client', function() {
                expect(meter.db).to.respondTo('rpush');
            });

            it('should work as promised', function() {
                return expect(meter.storeSecondInHour({
                    "pulseCount": 3, "timestamp": "2000"
                })).to.eventually.have.all.keys([
                    'pulseCount',
                    'timestamp', 'listType'
                ]);
            });
        });


        describe('addTotalDelta', function () {
            beforeEach(function () {
                meter.db.set("meterTotal", "{\"timestmamp\": \"21:47\", \"value\": 10000}");
            });

            it('should work as promised', function() {
                return expect(meter.addTotalDelta({"pulseCount": 10})).to.eventually.equal(10000.001);
            });
        });


        describe('storeMinuteInDay', function() {
            beforeEach(function () {
                "use strict";
                meter.db.rpush("hour", "{}");
            });

            it('should have correct listType', function() {
                return expect(meter.storeMinuteInDay()).to.eventually.have.property("listType", "day");
            });

            it('should work as promised', function() {
                return expect(meter.storeMinuteInDay()).to.eventually.have.all.keys([
                    'listType',
                    'timestamp',
                    'date',
                    'sum',
                    'total',
                    'values',
                    'max',
                    'min',
                    'average'
                ]);
            });
        });

        describe('storeFiveMinutesInWeek', function() {
            beforeEach(function (done) {
                "use strict";
                meter.db.lpush("day", "{}");
                done();
            });

            it('should work as promised', function() {
                return expect(meter.storeFiveMinutesInWeek()).to.eventually.have.all.keys([
                    "listType", "perMinute", "total", "date", "timestamp"
                ]);
            });

        });

        describe('storeThirtyMinutesInMonth', function() {
            beforeEach(function (done) {
                "use strict";
                meter.db.rpush("day", "{}");
                done();
            });

            it('should work as promised', function() {
                return expect(meter.storeThirtyMinutesInMonth()).to.eventually.have.all.keys([
                    "listType", "perMinute", "total", "date", "timestamp"
                ]);
            });
        });

        describe('storeSixHoursInYear', function() {
            beforeEach(function (done) {
                "use strict";
                meter.db.rpush("week", "{}");
                done();
            });
            it('should work as promised', function() {
                return expect(meter.storeSixHoursInYear()).to.eventually.have.all.keys([
                    "listType", "perFiveMinutes", "total", "date", "timestamp"
                ]);
            });
        });

        describe('storeHour', function() {
            beforeEach(function () {
                "use strict";
                meter.db.rpush("day", "{}");
            });

            it('should return data as promised', function() {
                return expect(meter.storeHour()).to.eventually.have.all.keys([
                    "date", "kwh", "timestamp", "total"
                ]);
            });
        });

        describe('storeDay', function() {
            beforeEach(function () {
                "use strict";
                meter.db.rpush("day", "{}");
            });
            it('should return data as promised', function() {
                return expect(meter.storeDay()).to.eventually.have.all.keys([
                    "timestamp", "date", "kwh", "total"
                ]);
            });
        });

        describe('storeWeek', function() {
            beforeEach(function () {
                "use strict";
                meter.db.rpush("week", "{}");
            });
            it('should work as promised', function() {
                return expect(meter.storeWeek()).to.eventually.have.all.keys([
                    "timestamp", "date", "kwh", "total"
                ]);
            });
        });

        describe('verifyLimit', function() {
            beforeEach(function (done) {
                for (var i = 0; i < 2000; i++) {
                    meter.db.rpush("day", JSON.stringify({"sum": i}));
                }
                done();
            });

            it('should return false', function() {
                return expect(meter.verifyLimit({"listType": "hour"})).to.eventually.be.false;
            });

            it('should return true', function() {
                return expect(meter.verifyLimit({"listType": "day"})).to.eventually.be.false;
            });
        });

        describe('getCronEmitter', function() {
            "use strict";
            it('should return a valid cron emitter object', function() {
                expect(meter.getCronEmitter()).to.instanceOf(cron.CronEmitter);
            });
        });
    });

});
