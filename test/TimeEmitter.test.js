/**
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var chai   = require('chai');
var expect = chai.expect;
var timer  = require('../lib/timeEmitter');

describe('timeEmitter', function() {
    "use strict";

    describe('doEveryMinute', function() {
        it('should complete without error', function() {
            expect(timer.doEveryMinute()).to.be.undefined;
        });

        it('should trigger every five minutes event', function(done) {
            timer.clock.setMinutes(5);
            var test = function() {
                expect(timer.isFiveMinutes()).to.be.true;
                expect(timer.isHalfHour()).to.be.false;
                done();
            };
            timer.on('every_five_minutes', test);
            timer.doEveryMinute();
            timer.removeListener('every_five_minutes', test);
        });

        it('should trigger half hour event', function(done) {
            timer.clock.setMinutes(30);
            var test = function() {
                expect(timer.isFiveMinutes()).to.be.true;
                expect(timer.isHalfHour()).to.be.true;
                expect(timer.isHour()).to.be.false;
                done();
            };
            timer.on('every_half_hour', test);
            timer.doEveryMinute();
            timer.removeListener('every_half_hour', test);
        });

        it('should trigger hour event', function(done) {
            timer.clock.setMinutes(0);
            var test = function() {
                expect(timer.isHalfHour()).to.be.true;
                expect(timer.isHour()).to.be.true;
                done();
            };
            timer.on('every_hour', test);
            timer.doEveryMinute();
            timer.removeListener('every_hour', test);
        });

        it('should trigger six hour event', function(done) {
            timer.clock.setHours(6);
            timer.clock.setMinutes(0);
            var test = function() {
                expect(timer.isSixHours()).to.be.true;
                done();
            };
            timer.on("every_six_hours", test);
            timer.doEveryMinute();
            timer.removeListener('every_six_hours', test);
        });
    });

    describe('isYear', function() {
        it('should return false', function() {
            timer.clock.setDate(12);
            expect(timer.isYear()).to.be.false;
        });
        it('should return true', function() {
            timer.clock.setHours(0);
            timer.clock.setMinutes(0);
            timer.clock.setDate(1);
            timer.clock.setMonth(0);

            expect(timer.isYear()).to.be.true;
        });
    });

    describe('isWeek', function() {
        it('should return false', function() {
            if(timer.clock.getDay === 0) {
                timer.clock.setDate(timer.clock.getDate()+1);
            }
            expect(timer.isWeek()).to.be.false;
        });

        it('should return true', function() {
            timer.clock.setMinutes(0);
            timer.clock.setHours(0);
            timer.clock.setDate(timer.clock.getDate() - timer.clock.getDay());
            expect(timer.isWeek()).to.be.true;
        });
    });

});