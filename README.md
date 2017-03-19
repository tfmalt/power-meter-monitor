[![npm version](https://badge.fury.io/js/power-meter-monitor.svg)](http://badge.fury.io/js/power-meter-monitor)
[![Build Status](https://travis-ci.org/tfmalt/power-meter-monitor.svg?branch=master)](https://travis-ci.org/tfmalt/power-meter-monitor)
[![Test Coverage](https://codeclimate.com/github/tfmalt/power-meter-monitor/badges/coverage.svg)](https://codeclimate.com/github/tfmalt/power-meter-monitor)
[![Dependency Status](https://david-dm.org/tfmalt/power-meter-monitor.svg)](https://david-dm.org/tfmalt/power-meter-monitor)

## Power Meter Monitor

This is a hobby project using an Arduino Uno or RaspberryPi, reading
the flashing led on my power meter with a photo resistor to monitor my
electricity usage. Code for both arduino and raspberry pi is
available in the repository.

A daemon running on the raspberry pi stores the data in a Redis database.
The Redis database is then used as the data backend to the REST API
feeding the dashboard apps with data. 

* See: [power-meter-ionic](https://github.com/tfmalt/power-meter-ionic) for information about the ionic mobile app dashboard.
* See: [power-meter-api](https://github.com/tfmalt/power-meter-api) For the
restful web service API that provides access to the datasets for this app and
others.
