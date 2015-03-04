

var expect = require('chai').expect,
    assert = require('chai').assert,
    meter  = require('../lib/main').meter;

describe('Power Meter Monitor', function () {
    describe('bootstrap', function () {
        var list = [1, 2, 3];
        it('should be an object', function () {
            expect(list).to.be.instanceOf(Array);
        })

        it('should return -1 when index out of bounds', function () {
            expect(list.indexOf(4)).to.equal(-1);
        })
    })

    describe('meter', function () {
        it('should be an Object', function () {
            expect(meter).to.be.instanceOf(Object);
        })

    })
});
