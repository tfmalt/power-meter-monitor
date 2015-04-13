/**
 *
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var chai   = require('chai');
var expect = chai.expect;
var redis  = require('fakeredis');
var update = require('../lib/updateMeter');
var logger = require('winston');

try {
    logger.remove(logger.transports.Console);
}
catch (e) {
    // ignore
}

describe('updateMeter', function() {
    "use strict";

    describe('setDbClient', function() {
        it('should complete without error', function() {
            expect(update.setDbClient(redis.createClient())).to.be.undefined;
        });

        it('should throw error', function() {
            expect(update.setDbClient.bind(update, null)).to.throw(Error);
        });
    });

    describe('start', function() {
        it('should complete without error', function() {
            expect(update.start()).to.be.undefined;
        });
    });

    describe('doEveryMinute', function() {
        it('should complete without error', function() {
            expect(update.doEveryMinute(update)).to.be.undefined;
        });

        it('should throw error when called without argument', function() {
            expect(update.doEveryMinute.bind(update, null)).to.throw(TypeError);
        });

        it('should trigger every five minutes event', function(done) {
            update.clock.setMinutes(5);
            var test = function() {
                expect(update.isFiveMinutes()).to.be.true;
                expect(update.isHalfHour()).to.be.false;
                done();
            };
            update.on('every_five_minutes', test);
            update.doEveryMinute(update);
            update.removeListener('every_five_minutes', test);
        });

        it('should trigger half hour event', function(done) {
            update.clock.setMinutes(30);
            var test = function() {
                expect(update.isFiveMinutes()).to.be.true;
                expect(update.isHalfHour()).to.be.true;
                expect(update.isHour()).to.be.false;
                done();
            };
            update.on('every_half_hour', test);
            update.doEveryMinute(update);
            update.removeListener('every_half_hour', test);
        });

        it('should trigger hour event', function(done) {
            update.clock.setMinutes(0);
            var test = function() {
                expect(update.isHalfHour()).to.be.true;
                expect(update.isHour()).to.be.true;
                done();
            };
            update.on('every_hour', test);
            update.doEveryMinute(update);
            update.removeListener('every_hour', test);
        });

        it('should trigger six hour event', function(done) {
            update.clock.setHours(6);
            update.clock.setMinutes(0);
            var test = function() {
                expect(update.isSixHours()).to.be.true;
                done();
            };
            update.on("every_six_hours", test);
            update.doEveryMinute(update);
            update.removeListener('every_six_hours', test);
        });
    });

    describe('isYear', function() {
        it('should return false', function() {
            update.clock.setDate(12);
            expect(update.isYear()).to.be.false;
        });
        it('should return true', function() {
            update.clock.setHours(0);
            update.clock.setMinutes(0);
            update.clock.setDate(1);
            update.clock.setMonth(0);

            expect(update.isYear()).to.be.true;
        });
    });

    describe('isWeek', function() {
        it('should return false', function() {
            if(update.clock.getDay === 0) {
                update.clock.setDate(update.clock.getDate()+1);
            }
            expect(update.isWeek()).to.be.false;
        });

        it('should return true', function() {
            update.clock.setDate(update.clock.getDate() - update.clock.getDay());
            expect(update.isWeek()).to.be.true;
        });
    });
});