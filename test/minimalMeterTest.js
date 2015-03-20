/**
 * power-meter-monitor/lib/meter test file
 *
 * @type {exports.expect}
 */

console.log("directory: ", process.cwd());

var chai        = require('chai'),
    sinon       = require('sinon'),
    chaipromise = require('chai-as-promised'),
    expect      = chai.expect,
    Meter       = require('../lib/main').MinimalMeter,
    serialport  = require('serialport'),
    logger      = require('winston'),
    fakeredis   = require('fakeredis'),
    config      = require('../config-test');

chai.use(chaipromise);

logger.remove(logger.transports.Console);

describe('Power Meter Minimal Monitor', function () {
    describe('meter', function () {
        var m = new Meter();

        it('should be an Object', function () {
            expect(m).to.be.instanceOf(Meter);
        });

        it('should have correct initial values', function () {
            expect(m.db).to.be.null;
            expect(m.hasBegun).to.be.false;
        });


        describe('startMonitor', function () {
            var meter = new Meter();

            it('should throw error when passed undefined config object', function () {
                expect(meter.startMonitor).to.throw(Error);
            });

            it('should throw error when redis not object', function () {
                expect(meter.startMonitor.bind(meter, {
                    "config": config
                })).to.throw(Error);
            });

            it('should throw error when config not object', function () {
                expect(meter.startMonitor.bind(meter, {
                    "redis": fakeredis
                })).to.throw(Error);
            });

            it('should return undefined when everything is ok', function () {
                expect(meter.startMonitor({
                    "redis": fakeredis,
                    "config": config
                })).to.be.undefined;
            });

        });

        describe('handleData', function () {
            var meter = new Meter();
            it('should find asBegun is false', function () {
                expect(meter.hasBegun).to.be.false;
            });

            it('should return undefined when not beginning and reads noise', function () {
                expect(meter.handleData("Hello there line noise", meter)).to.be.undefined;
            });

            it('should behave correctly when receiving BEGIN json', function () {
                expect(meter.handleData('{"BEGIN": 1}', meter)).to.be.undefined;
            });

            it('should have begun - hasBegun should be true', function() {
                expect(meter.hasBegun).to.be.true;
            });

            it('should behave correctly when hasBegun is true', function () {
                expect(meter.handleData("hello there", meter)).to.be.true;
                expect(meter.handleData('{"foo": 1, "bar": 2}', meter)).to.be.true;
            });

        });


        describe('isValidData', function () {
            var meter = new Meter();

            it('should return false on non json', function () {
                expect(meter.isValidData("hello not json")).to.be.false;
            });

            it('should return true when it gets json', function () {
                expect(meter.isValidData('{"foo": 1, "bar": "to"}')).to.be.true;
            });
        });


        describe('isBeginning', function () {
            var meter = new Meter();
            it('should return false when string is not BEGIN', function () {
                expect(meter.isBeginning('{"foo": 1, "bar": "to"}')).to.be.false;
            });

            it('should return true when string is BEGINNING', function () {
                expect(meter.isBeginning('{"BEGIN": 1}')).to.be.true;
            });
        });


        describe('handleTimer', function () {
            var clock;
            var meter = new Meter();

            before(function() {
                clock = sinon.useFakeTimers();
            });

            it('should return up to an hour', function () {
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 1,
                    halfHour: 1,
                    hour: 1,
                    sixHour: 0,
                    twelveHour: 0,
                    midnight: 0,
                    week: 0,
                    month: 0,
                    year: 0
                });
            });

            it('should return up to midnight', function() {
                clock.tick(23*60*60*1000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 1,
                    halfHour: 1,
                    hour: 1,
                    sixHour: 1,
                    twelveHour: 1,
                    midnight: 1,
                    week: 0,
                    month: 0,
                    year: 0
                });
            });

            it('should return up to week', function() {
                clock.tick(2*24*60*60*1000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 1,
                    halfHour: 1,
                    hour: 1,
                    sixHour: 1,
                    twelveHour: 1,
                    midnight: 1,
                    week: 1,
                    month: 0,
                    year: 0
                });
            });

            it('should return up to a month', function() {
                clock.tick(28*24*60*60*1000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 1,
                    halfHour: 1,
                    hour: 1,
                    sixHour: 1,
                    twelveHour: 1,
                    midnight: 1,
                    week: 1,
                    month: 1,
                    year: 0
                });
            });

            it('should return up to a year', function() {
                clock.tick(334*24*60*60*1000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 1,
                    halfHour: 1,
                    hour: 1,
                    sixHour: 1,
                    twelveHour: 1,
                    midnight: 1,
                    week: 0,
                    month: 1,
                    year: 1
                });
            });

            it('should return empty for all', function() {
                clock.tick(1000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 0,
                    minute: 0,
                    fiveMinute: 0,
                    halfHour: 0,
                    hour: 0,
                    sixHour: 0,
                    twelveHour: 0,
                    midnight: 0,
                    week: 0,
                    month: 0,
                    year: 0
                });
            });

            it('should return only second and minute', function() {
                clock.tick(59000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 0,
                    halfHour: 0,
                    hour: 0,
                    sixHour: 0,
                    twelveHour: 0,
                    midnight: 0,
                    week: 0,
                    month: 0,
                    year: 0
                });
            });

            it('should return only up to fiveminute', function() {
                clock.tick(4*60000);
                expect(meter.handleTimer()).to.deep.equal({
                    second: 1,
                    minute: 1,
                    fiveMinute: 1,
                    halfHour: 0,
                    hour: 0,
                    sixHour: 0,
                    twelveHour: 0,
                    midnight: 0,
                    week: 0,
                    month: 0,
                    year: 0
                });
            });

            after(function () {
                clock.restore();
            });

        });

        describe('handlePulseCount', function () {
            var meter = new Meter();

            it('should return undefined on invalid data', function () {
                expect(meter.handlePulseCount("foo")).to.be.undefined;
            });

            it('should return undefined on valid data', function() {
                expect(meter.handlePulseCount({
                    "pulseCount": 4,
                    "kwhCount": 5239,
                    "timestamp": 436783000
                })).to.be.undefined;
            });
        });


        describe('storeSecondInHour', function() {
            var meter = new Meter();

            meter.db = meter.getRedisClient(fakeredis, config.redis);

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
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);
            meter.db.set("meterTotal", "{\"timestmamp\": \"21:47\", \"value\": 10000}");
            it('should work as promised', function() {
                return expect(meter.addTotalDelta({"pulseCount": 10})).to.eventually.equal(10000.0009);
            });
        });


        describe('storeMinuteInDay', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should have correct listType', function() {
                return expect(meter.storeMinuteInDay()).to.eventually.have.property("listType", "day");
            });

            it('should work as promised', function() {
                return expect(meter.storeMinuteInDay()).to.eventually.have.all.keys([
                    'listType',
                    'timestamp',
                    'timestr',
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
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should work as promised', function() {
                return expect(meter.storeFiveMinutesInWeek()).to.eventually.have.all.keys([
                    "listType", "perMinute", "total", "timestr", "timestamp"
                ]);
            });

        });

        describe('storeThirtyMinutesInMonth', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should work as promised', function() {
                return expect(meter.storeThirtyMinutesInMonth()).to.eventually.have.all.keys([
                    "listType", "perMinute", "total", "timestr", "timestamp"
                ]);
            });
        });

        describe('storeSixHoursInYear', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should work as promised', function() {
                return expect(meter.storeSixHoursInYear()).to.eventually.have.all.keys([
                    "listType", "perFiveMinutes", "total", "timestr", "timestamp"
                ]);
            });
        });

        describe('storeHour', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should return data as promised', function() {
                return expect(meter.storeHour()).to.eventually.have.all.keys([
                    "datestr", "kwh", "timestamp", "total"
                ]);
            });
        });

        describe('storeDay', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should return data as promised', function() {
                return expect(meter.storeDay()).to.eventually.have.all.keys([
                    "timestamp", "timestr", "kwh", "total"
                ]);
            });
        });

        describe('storeWeek', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            it('should work as promised', function() {
                return expect(meter.storeWeek()).to.eventually.have.all.keys([
                    "timestamp", "timestr", "kwh", "total"
                ]);
            });
        });

        describe('verifyLimit', function() {
            var meter = new Meter();
            meter.db = meter.getRedisClient(fakeredis, config.redis);

            for (var i = 0; i < 1560; i++) {
                meter.db.rpush("day", JSON.stringify({"sum": i}));
            }

            it('should return false', function() {
                return expect(meter.verifyLimit({"listType": "hour"})).to.eventually.be.false;
            });

            it('should return true', function() {
                return expect(meter.verifyLimit({"listType": "day"})).to.eventually.be.true;
            });
        });
    });
});
