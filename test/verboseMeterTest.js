/**
 * power-meter-monitor/lib/meter test file
 *
 * @type {exports.expect}
 */


var chai = require('chai'),
    chaipromise = require('chai-as-promised'),
    expect = chai.expect,
    powermeter = require('../lib/verboseMeter'),
    serialport = require('serialport'),
    fakeredis = require('fakeredis'),
    config = require('../config-test');

chai.use(chaipromise);

describe('Power Meter Monitor', function () {
    describe('VerboseMeter', function () {
        var meter;
        beforeEach(function (done) {
            meter = new powermeter.VerboseMeter(fakeredis.createClient());
            done();
        });

        afterEach(function (done) {
            "use strict";
            meter = undefined;
            done();
        });


        it('should be an Object', function () {
            expect(meter).to.be.instanceOf(powermeter.VerboseMeter);
        });

        it('should have correct initial values', function () {
            expect(meter.db).to.be.instanceOf(fakeredis.RedisClient);
            expect(meter.hasBegun).to.be.false;
        });

        describe('average', function () {
            "use strict";
            it('should calculate the correct average', function () {
                expect(meter.average([3, 4, 5])).to.equal(4);
            });

            it('should throw error when passed no array', function () {
                expect(meter.average).to.throw(Error);
            });

            it('should calculate correctly with empty array', function () {
                expect(meter.average([])).to.be.undefined;
            });
        });

        describe('median', function () {
            "use strict";
            it('should calculate median correctly', function () {
                expect(meter.median([1, 2, 3, 4])).to.equal(3);
                expect(meter.median([1, 3, 4])).to.equal(3);
            });
        });

        describe('splitPulsetimes', function () {
            "use strict";
            it('should split times correctly', function () {
                expect(meter.splitPulsetimes(["on: 1", "off: 2", 0])).to.deep.equal({
                    on: [1], off: [2]
                });
            });

            it('should throw error when passed incorrect argument', function () {
                expect(meter.splitPulsetimes.bind(meter, "hello")).to.throw(TypeError);
            });
        });

        describe('calcPulseStats', function () {
            "use strict";
            it('should throw error when called without args', function () {
                expect(meter.calcPulseStats).to.throw(Error);
            });

            it('should calculate stats correctly', function () {
                expect(meter.calcPulseStats([1, 2, 3, 4])).to.deep.equal({
                    max: 4,
                    min: 1,
                    average: 3,
                    median: 3,
                    max_deviation: (1 / 3),
                    min_deviation: (2 / 3)
                });
            });
        });

        describe('getMedianPulse', function () {
            "use strict";
            it('should return the median pulse length', function () {
                expect(meter.getMedianPulse({
                    on: [1, 2, 3], off: [1, 3, 4]
                })).to.equal(200000);
            });
        });


        describe('getAveragePulse', function () {
            "use strict";
            it('should return correct average pulse length', function () {
                expect(meter.getAveragePulse({
                    on: [1, 2, 3, 4], off: [1, 2, 3, 4]
                })).to.equal(200000);
            });
        });

        describe('calcAdjustedCount', function () {
            "use strict";
            it('should return adjusted count correctly', function () {
                expect(meter.calcAdjustedCount({
                    on: {
                        max: 4, min: 1, average: 3, max_deviation: 3,
                        min_deviation: 3
                    },
                    off: {
                        max: 4, min: 1, average: 3, max_deviation: 3,
                        min_deviation: 3
                    }
                })).to.equal(1);
            });

            it('should return adjusted count correctly', function () {
                expect(meter.calcAdjustedCount({
                    on: {
                        max: 4, min: 1, average: 3, max_deviation: 0.5,
                        min_deviation: 3
                    },
                    off: {
                        max: 4, min: 1, average: 3, max_deviation: 3,
                        min_deviation: 3
                    }
                })).to.equal(1);
            });
        });

        describe('printPulseCountersLog', function () {
            "use strict";
            it('should return nothing', function () {
                expect(meter.printPulseCountersLog({})).to.be.undefined;
            });
        });

        describe('storeSecondInHour', function () {
            it('should have a valid redis client', function () {
                expect(meter.db).to.respondTo('rpush');
            });

            it('should work as promised', function () {
                return expect(meter.storeSecondInHour({
                    "pulseCount": 3, "timestamp": "2000",
                    "pulsetimes": ["on: 1", "off: 2", 0]
                })).to.eventually.have.all.keys(
                    ['pulseCount', 'pulsetimes', 'timestamp', 'listType']
                );
            });
        });
    });
});
