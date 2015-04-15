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

chai.use(require('chai-as-promised'));

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
            expect(update.doEveryMinute()).to.be.undefined;
        });

        it('should trigger every five minutes event', function(done) {
            update.clock.setMinutes(5);
            var test = function() {
                expect(update.isFiveMinutes()).to.be.true;
                expect(update.isHalfHour()).to.be.false;
                done();
            };
            update.on('every_five_minutes', test);
            update.doEveryMinute();
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
            update.doEveryMinute();
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
            update.doEveryMinute();
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
            update.doEveryMinute();
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
            update.clock.setMinutes(0);
            update.clock.setHours(0);
            update.clock.setDate(update.clock.getDate() - update.clock.getDay());
            expect(update.isWeek()).to.be.true;
        });
    });

    describe('handleMinute', function() {
        before(function(done) {
            update.setDbClient(redis.createClient("foo"));
            update.db.rpush('seconds', JSON.stringify({
                pulseCount: 13,
                kWhs: 0.0013
            }));
            update.db.rpush('seconds', JSON.stringify({
                pulseCount: 10,
                kWhs: 0.0010
            }));
            done();
        });

        it('should return as promises', function() {
            return expect(update.handleMinute()).to.eventually.have.all.keys([
                "average", "watts", "count", "kwh", "max", "min", "time", "timestamp", "total"
            ]);
        });
    });

    describe('handleFiveMinutes', function() {
        before(function(done) {
            update.setDbClient(redis.createClient("bar"));
            update.db.rpush('minutes', JSON.stringify({
                count: 318,
                total: 318
            }));
            update.db.rpush('minutes', JSON.stringify({
                count: 300,
                total: 300
            }));
            done();
        });

        it('should calculate total as promised', function() {
            return expect(update.handleFiveMinutes()).to.eventually.have.property("total", 618);
        });

        it('should return data as promised', function() {
            return expect(update.handleFiveMinutes()).to.eventually.have.all.keys([
                "perMinute", "time", "timestamp", "total", "kwh"
            ]);
        });
    });

    describe('_getRangeFromDb', function() {
        before(function(done) {
            update.setDbClient(redis.createClient("baz"));
            done();
        });

        it('should return data as promised', function() {
           return expect(update._getRangeFromDb('minutes', 5)).to.eventually.have.all.keys([
               "kwh", "perMinute", "time", "timestamp", "total"
           ]);
        });
    });

    describe('_getMonthDays', function() {
        it('it should return correct days for january', function () {
            update.clock.setMonth(0);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for February', function () {
            update.clock.setMonth(1);
            update.clock.setFullYear(2015);
            expect(update._getMonthDays()).to.equal(28);
        });

        it('it should return correct days for March', function () {
            update.clock.setMonth(2);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for April', function () {
            update.clock.setMonth(3);
            expect(update._getMonthDays()).to.equal(30);
        });

        it('it should return correct days for May', function () {
            update.clock.setMonth(4);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for June', function () {
            update.clock.setMonth(5);
            expect(update._getMonthDays()).to.equal(30);
        });

        it('it should return correct days for July', function () {
            update.clock.setMonth(6);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for August', function () {
            update.clock.setMonth(7);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for September', function () {
            update.clock.setMonth(8);
            expect(update._getMonthDays()).to.equal(30);
        });

        it('it should return correct days for October', function () {
            update.clock.setMonth(9);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for November', function () {
            update.clock.setMonth(10);
            expect(update._getMonthDays()).to.equal(30);
        });

        it('it should return correct days for December', function () {
            update.clock.setMonth(11);
            expect(update._getMonthDays()).to.equal(31);
        });

        it('it should return correct days for Feb in leap years', function () {
            update.clock.setMonth(1);
            update.clock.setFullYear(2016);
            expect(update._getMonthDays()).to.equal(29);
        });
    });
});