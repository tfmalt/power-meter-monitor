/**
 *
 * Created by tm on 03/03/15.
 */

var serialport = require('serialport');

var sp = new serialport.SerialPort("/dev/ttyp5", {
    baudrate: 115200,
    parser: serialport.parsers.raw
}, false);

sp.open(function (err) {
    console.log("got open:" + err);
    sp.on("data", function (data) {
        console.log("Got data: " + data);
    });

    sp.on("error", function (err) {
       console.log("Got error: " + err);
    });

    sp.on("close", function () {
        console.log("closed");
    });

    setInterval(function () {
        sp.flush(function (err) {
            console.log("flush: " + err);
        });
    }, 1000);
});

console.log("Got here...");
