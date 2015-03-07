/**
 * power-meter-monitor/lib/meter test file
 *
 * @type {exports.expect}
 */


var expect     = require('chai').expect,
    Meter      = require('../lib/main').Meter,
    serialport = require('serialport'),
    logger     = require('winston'),
    redis      = require('fakeredis'),
    config     = require('../config-test');

logger.remove(logger.transports.Console);

describe('Power Meter Monitor', function () {
    describe('meter', function () {
        var m = new Meter();

        it('should be an Object', function () {
            expect(m).to.be.instanceOf(Meter);
        });

        it('should have correct initial values', function () {
            expect(m.port).to.be.null;
            expect(m.db).to.be.null;
            expect(m.hasBegun).to.be.false;
        });


        describe('startMonitor', function () {
            var meter = new Meter();

            it('should throw error when passed undefined config object', function () {
                expect(meter.startMonitor).to.throw(Error);
            });

            it('should throw error when serialport not object', function () {
                expect(meter.startMonitor.bind(meter, {
                    "redis": redis,
                    "config": config
                })).to.throw(Error);
            });

            it('should throw error when redis not object', function () {
                expect(meter.startMonitor.bind(meter, {
                    "serialport": serialport,
                    "config": config
                })).to.throw(Error);
            });

            it('should throw error when config not object', function () {
                expect(meter.startMonitor.bind(meter, {
                    "serialport": serialport,
                    "redis": redis
                })).to.throw(Error);
            });

            it('should return undefined when everything is ok', function () {
                expect(meter.startMonitor({
                    "serialport": serialport,
                    "redis": redis,
                    "config": config
                })).to.be.undefined;
            });

        });

        describe('getSerialPort', function () {
            var meter = new Meter();
            it('should have a valid SerialPort', function () {
                expect(meter.getSerialPort({
                    "serialport": serialport,
                    "config": config
                })).to.be.instanceOf(serialport.SerialPort);
            });

            it('should throw error with invalid config', function () {
                expect(meter.getSerialPort.bind(meter, {})).to.throw(Error);
                expect(meter.getSerialPort.bind(meter, {
                    "serialport": serialport,
                    "config": {
                        "serial": {}
                    }
                })).to.throw(Error, /config.dev was not a string/);
            });

        });

        describe('handleData', function () {
            var meter = new Meter();
            it('should find asBegun is false', function () {
                expect(meter.hasBegun).to.be.false;
            });

            it('should return undefined when not beginning and reads noise', function () {
                expect(meter.handleData("Hello there line noise")).to.be.undefined;
            });

            it('should behave correctly when receiving BEGIN json', function () {
                expect(meter.handleData('{"BEGIN": 1}')).to.be.undefined;
                expect(meter.hasBegun).to.be.true;
            });

            it('should behave correctly when hasBegun is true', function () {
                expect(meter.handleData("hello there")).to.be.true;
                expect(meter.handleData('{"foo": 1, "bar": 2}')).to.be.true;
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
            var meter = new Meter();

            it('should return nothing', function () {
                expect(meter.handleTimer()).to.be.undefined;
            });
        });

        describe('handlePulseCount', function () {
            var meter = new Meter();

            it('should return undefined', function () {
                expect(meter.handlePulseCount("foo")).to.be.undefined;
            })
        });

        describe('average', function() {
            var meter = new Meter();

            it('should return correct average', function() {
                expect(meter.average([1,5,8])).to.equal(5);
            });

            it('should throw error when array is empty', function() {
                expect(meter.average.bind(meter, [])).to.throw(Error);
            });

            it('should throw error with invalid data', function() {
                expect(meter.average).to.throw(Error);
            })
        });

        describe('median', function() {
            var meter = new Meter();

            it('should return correctly from an array', function() {
                expect(meter.median([1,2,3,5,8])).to.equal(3);
                expect(meter.median([1,2,3,5])).to.equal(3);
            });
        });

        describe('splitPulsetimes', function() {
            var meter = new Meter();
            it('should throw error with no pulsetimes', function() {
                expect(meter.splitPulsetimes).to.throw(TypeError);
            });

            it('should return array when pulsetimes is empty', function() {
                expect(meter.splitPulsetimes([])).to.deep.equal({
                    "on": [],
                    "off": []
                });
            });

            it('should throw error when passed illegal data', function () {
                expect(meter.splitPulsetimes.bind(meter, ["foo", "bar"])).to.throw(TypeError);
                expect(meter.splitPulsetimes.bind(meter, {"foo": 1, "bar": 2})).to.throw(TypeError);
                expect(meter.splitPulsetimes.bind(meter, "foobar")).to.throw(TypeError, /must be an array/);
            });

            it('should return correct when passed correct data', function() {
                expect(meter.splitPulsetimes(["on:100", "off:200", "on:99"])).to.deep.equal({
                    "on": [100, 99],
                    "off": [200]
                });
                expect(meter.splitPulsetimes([0])).to.deep.equal({"on":[],"off":[]});
            })
        })
    });
});
