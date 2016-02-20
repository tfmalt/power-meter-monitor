/**
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

var chai   = require('chai');
var expect = chai.expect;

describe('configParser', function() {
    "use strict";
    var cfg = require('../lib/configParser');
    describe('setup', function() {
        it('should complete without error', function() {
            expect(cfg.setup()).to.be.undefined;
        });

        it('should have correct redis.host', function() {
            cfg.redis.host = "localhost";
            expect(cfg.redis.host).to.equal("localhost");
        });

        it('should let envinronment variables override', function() {
            process.env.REDIS_HOST = "test.server";
            cfg.setup();
            expect(cfg.redis.host).to.equal("test.server");
        });

        it('should let envinronment variables override', function() {
            process.env.REDIS_PORT = "8765";
            cfg.setup();
            expect(cfg.redis.port).to.equal("8765");
        });

        it('should let envinronment variables override', function() {
            process.env.REDIS_AUTH = "audajens";
            cfg.setup();
            expect(cfg.redis.options.auth_pass).to.equal("audajens");
        });

        it('should let environment variables override', function() {
            process.env.POWER_METER_TYPE = "knorr";
            cfg.setup();
            expect(cfg.meterType).to.equal("knorr");
        });

        it('should let environment variables override', function() {
            process.env.POWER_METER_LOGFILE = "knorr.log";
            cfg.setup();
            expect(cfg.logfile).to.equal("knorr.log");
        });
    });
});
