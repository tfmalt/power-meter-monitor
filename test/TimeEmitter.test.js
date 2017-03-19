/**
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */

const chai = require('chai');
const expect = chai.expect;
const TimeEmitter = require('../lib/TimeEmitter');

describe('TimeEmitter', () => {
  const timer = new TimeEmitter();
  describe('doEveryMinute', () => {
    it('should complete without error', () => {
      expect(timer.doEveryMinute()).to.be.undefined;
    });

    it('should trigger every five minutes event', (done) => {
      timer.clock.setMinutes(5);
      const test = () => {
        expect(timer.isFiveMinutes()).to.be.true;
        expect(timer.isHalfHour()).to.be.false;
        done();
      };
      timer.on('every_five_minutes', test);
      timer.doEveryMinute();
      timer.removeListener('every_five_minutes', test);
    });

    it('should trigger half hour event', (done) => {
      timer.clock.setMinutes(30);
      const test = () => {
        expect(timer.isFiveMinutes()).to.be.true;
        expect(timer.isHalfHour()).to.be.true;
        expect(timer.isHour()).to.be.false;
        done();
      };
      timer.on('every_half_hour', test);
      timer.doEveryMinute();
      timer.removeListener('every_half_hour', test);
    });

    it('should trigger hour event', (done) => {
      timer.clock.setMinutes(0);
      const test = () => {
        expect(timer.isHalfHour()).to.be.true;
        expect(timer.isHour()).to.be.true;
        done();
      };
      timer.on('every_hour', test);
      timer.doEveryMinute();
      timer.removeListener('every_hour', test);
    });

    it('should trigger six hour event', (done) => {
      timer.clock.setHours(6);
      timer.clock.setMinutes(0);
      const test = () => {
        expect(timer.isSixHours()).to.be.true;
        done();
      };
      timer.on('every_six_hours', test);
      timer.doEveryMinute();
      timer.removeListener('every_six_hours', test);
    });
  });

  describe('isYear', () => {
    it('should return false', () => {
      timer.clock.setDate(12);
      expect(timer.isYear()).to.be.false;
    });
    it('should return true', () => {
      timer.clock.setHours(0);
      timer.clock.setMinutes(0);
      timer.clock.setDate(1);
      timer.clock.setMonth(0);

      expect(timer.isYear()).to.be.true;
    });
  });

  describe('isWeek', () => {
    const t = new TimeEmitter();
    it('should return false', () => {
      if (t.clock.getDay === 0) {
        t.clock.setDate(t.clock.getDate() + 1);
      }
      expect(t.isWeek()).to.be.false;
    });

    it('should return true', () => {
      t.clock.setMinutes(0);
      t.clock.setHours(0);
      t.clock.setDate(t.clock.getDate() - t.clock.getDay());
      expect(t.isWeek()).to.be.true;
    });
  });
});
