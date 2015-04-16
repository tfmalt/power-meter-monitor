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
});

