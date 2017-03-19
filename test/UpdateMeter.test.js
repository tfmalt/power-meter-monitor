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

    describe('handleMinute', function() {
        before(function(done) {
            update.setDbClient(redis.createClient("foo"));
            // update.db.rpush('seconds', JSON.stringify({
            //     pulseCount: 13,
            //    kWhs: 0.0013
            // }));
            // update.db.rpush('seconds', JSON.stringify({
            //    pulseCount: 10,
            //    kWhs: 0.0010
            //}));
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

});