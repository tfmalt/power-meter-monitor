/**
 *
 * Created by tm on 13/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

const chai = require('chai');
const promise = require('chai-as-promised');
const bluebird = require('bluebird');
const expect = chai.expect;
const mockery = require('mockery');
const redis = require('fakeredis');
const logger = require('winston');

chai.use(promise);
bluebird.promisifyAll(redis);

try {
  logger.remove(logger.transports.Console);
} catch (e) {
  // ignore
}

const mock_onoff = {
  Gpio: function (number, direction, ok) {
    // return 'mocked gpio';
    this.ok = ok;
    this.watch     = () => true;
    this.writeSync = () => true;
  }
};

describe('Power Meter Monitor', () => {
  describe('RaspberryMeter', () => {
    let RaspberryMeter = null;
    let m = null;

    before(() => {
      mockery.registerAllowable('../lib/RaspberryMeter');
      mockery.registerMock('onoff', mock_onoff);
      mockery.enable({useCleanCache: true, warnOnUnregistered: false});

      RaspberryMeter = require('../lib/RaspberryMeter');
    });

    beforeEach((done) => {
      m = new RaspberryMeter(redis.createClient(), logger);
      done();
    });

    it('Should create new object', () => {
      const rpi = new RaspberryMeter(redis.createClient());
      expect(rpi).to.be.instanceOf(RaspberryMeter);
    });

    describe('startMonitor', () => {
      it('should finish without error', () => {
        expect(m.startMonitor()).to.be.undefined;
      });
    });

    describe('doEverySecond', () => {
      it('should run timeout as expected', (done) =>  {
        m.doEverySecond(m);
        done();
      });
    });

    describe('verifyLimit', () => {
      it('should return false', () => {
        return expect(m.verifyLimit()).to.eventually.equal(false);
      });
    });

    describe('handleSensorInterrupt', () => {
      it('should throw error when error', () => {
        expect(m.handleSensorInterrupt.bind(m, new Error())).to.throw(Error);
      });

      it('should complete without error', () => {
        expect(m.handleSensorInterrupt(null, 1)).to.be.false;
      });

      it('should complete without error', () => {
        expect(m.handleSensorInterrupt(null, 1)).to.be.false;
      });

      it('should complete without error', () => {
        expect(m.handleSensorInterrupt(null, 1)).to.be.false;
      });
    });

    describe('getPulseLength', () => {
      it('should return an integer', (done) => {
        setTimeout( () => {
          expect(m.getPulseLength()).to.be.above(9);
          done();
        }, 10);
      });
    });

    describe('updateMeterTotal', () => {
      it('should throw error when called without argument', () => {
        expect(m.updateMeterTotal).to.throw(TypeError);
      });

      it('should throw error when called with incorrect data', () => {
        expect(m.updateMeterTotal.bind(m, {"foo": 1})).to.throw(TypeError);
      });
    });

    after( () => {
      mockery.disable();
      mockery.deregisterAll();
    });
  });
});
