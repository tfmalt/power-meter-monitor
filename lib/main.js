/**
 * main.js for the power-meter-monitor meter reader objects
 *
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013-2015 (c) Thomas Malt
 */
var MinimalMeter = require('./minimalMeter');
var VerboseMeter = require('./verboseMeter');

module.exports = {
    "MinimalMeter": MinimalMeter,
    "VerboseMeter": VerboseMeter
};

