/**
 *
 * Created by tm on 16/04/15.
 *
 * @author tm
 * @copyright 2015 (c) tm
 */


var meterUtils = {};
meterUtils.getSeriesName = function(name) {
    "use strict";
    return "per" + name.charAt(0).toUpperCase() + name.slice(1, -1);
};

module.exports = meterUtils;
