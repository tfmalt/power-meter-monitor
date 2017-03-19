/**
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

const chai = require('chai');
const expect = chai.expect;

describe('configParser', () => {
  const ConfigParser = require('../lib/ConfigParser');
  describe('setup', () => {
    const cp = new ConfigParser();
    it('should complete without error', () => {
      expect(cp).to.be.an.instanceof(ConfigParser);
    });

    it('should have correct redis.host', () => {
      cp.redis.host = 'localhost';
      expect(cp.redis.host).to.equal('localhost');
    });

    it('should let envinronment variables override', () => {
      process.env.REDIS_HOST = 'test.server';
      cp.overrideWithEnv();
      expect(cp.redis.host).to.equal('test.server');
    });

    it('should let envinronment variables override', () => {
      process.env.REDIS_PORT = '8765';
      cp.overrideWithEnv();
      expect(cp.redis.port).to.equal('8765');
    });

    it('should let envinronment variables override', () => {
      process.env.REDIS_AUTH = 'audajens';
      cp.overrideWithEnv();
      expect(cp.redis.password).to.equal('audajens');
    });

    it('should let environment variables override', () => {
      process.env.POWER_METER_TYPE = 'knorr';
      cp.overrideWithEnv();
      expect(cp.meterType).to.equal('knorr');
    });

    it('should let environment variables override', () => {
      process.env.POWER_METER_LOGFILE = 'knorr.log';
      cp.overrideWithEnv();
      expect(cp.logfile).to.equal('knorr.log');
    });
  });
});
