/**
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var chai   = require('chai');
var expect = chai.expect;
var utils  = require('../lib/meterUtils.js');

describe('meterUtils', function() {
    "use strict";
    describe('String.capitalize', function() {
        it('should return correct name', function() {
            expect(utils.getSeriesName("dette")).to.equal("perDett");
        });
    });

    describe('getMonthDays', function() {
        var date = new Date();

        it('it should return correct days for january', function () {
            date.setMonth(0);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for February', function () {
            date.setMonth(1);
            date.setFullYear(2015);
            expect(utils.getMonthDays(date)).to.equal(28);
        });

        it('it should return correct days for March', function () {
            date.setMonth(2);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for April', function () {
            date.setMonth(3);
            expect(utils.getMonthDays(date)).to.equal(30);
        });

        it('it should return correct days for May', function () {
            date.setMonth(4);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for June', function () {
            date.setMonth(5);
            expect(utils.getMonthDays(date)).to.equal(30);
        });

        it('it should return correct days for July', function () {
            date.setMonth(6);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for August', function () {
            date.setMonth(7);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for September', function () {
            date.setMonth(8);
            expect(utils.getMonthDays(date)).to.equal(30);
        });

        it('it should return correct days for October', function () {
            date.setMonth(9);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for November', function () {
            date.setMonth(10);
            expect(utils.getMonthDays(date)).to.equal(30);
        });

        it('it should return correct days for December', function () {
            date.setMonth(11);
            expect(utils.getMonthDays(date)).to.equal(31);
        });

        it('it should return correct days for Feb in leap years', function () {
            date.setMonth(1);
            date.setFullYear(2016);
            expect(utils.getMonthDays(date)).to.equal(29);
        });
    });
});

