/**
 *
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

const chai = require('chai');
const expect = chai.expect;
const redis = require('fakeredis');
const bluebird = require('bluebird');
const UpdateMeter = require('../lib/UpdateMeter');
const logger = require('winston');

chai.use(require('chai-as-promised'));
bluebird.promisifyAll(redis.RedisClient.prototype);

try {
  logger.remove(logger.transports.Console);
} catch (e) {
  // ignore
}

describe('UpdateMeter', () => {
  const update = new UpdateMeter(redis.createClient(), logger);
  it('should be an instance of UpdateMeter', () => {
    expect(update).to.be.instanceof(UpdateMeter);
  });

  describe('start', () => {
    it('should complete without error', () => {
      expect(update.start()).to.be.an.instanceof(UpdateMeter);
    });
  });

  describe('handleMinute', () => {
    it('should return as promises', () => {
      // update.db = redis.createClient('foo');
      return expect(update.handleMinute()).to.eventually.have.all.keys([
        'average',
        'watts',
        'count',
        'kwh',
        'max',
        'min',
        'time',
        'timestamp',
        'total'
      ]);
    });
  });

  describe('insertIntoList', () => {
    before( (done) => {
      update.db = redis.createClient('bar');
      update.db.rpush('minutes', JSON.stringify({count: 318, total: 318}));
      update.db.rpush('minutes', JSON.stringify({count: 300, total: 300}));
      done();
    });

    it('should calculate total as promised', () => {
      return expect(
        update.insertIntoList('fiveMinutes')
      ).to.eventually.have.property('total', 618);
    });

    it('should return data as promised', () => {
      return expect(
        update.insertIntoList('fiveMinutes')).to.eventually.have.all.keys([
          'perMinute', 'time', 'timestamp', 'total', 'kwh'
        ]);
    });
  });

  describe('getRangeFromDb', () => {
    before( (done) => {
      update.db = redis.createClient('baz');
      done();
    });

    it('should return data as promised', () => {
      return expect(
        update.getRangeFromDb('minutes', 5)
      ).to.eventually.have.all.keys([
        'kwh', 'perMinute', 'time', 'timestamp', 'total'
      ]);
    });
  });
});
