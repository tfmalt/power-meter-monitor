[![npm version](https://badge.fury.io/js/power-meter-monitor.svg)](http://badge.fury.io/js/power-meter-monitor)
[![Build Status](https://travis-ci.org/tfmalt/power-meter-monitor.svg?branch=master)](https://travis-ci.org/tfmalt/power-meter-monitor)
[![Test Coverage](https://codeclimate.com/github/tfmalt/power-meter-monitor/badges/coverage.svg)](https://codeclimate.com/github/tfmalt/power-meter-monitor)
[![Dependency Status](https://david-dm.org/tfmalt/power-meter-monitor.svg)](https://david-dm.org/tfmalt/power-meter-monitor)

## Power Meter Monitor

This is a hobby project consisting of an Arduino Uno reading the flashing led from my power meter to monitor my power meter consumption.

A daemon written in node.js reads data from the arduino over the serial connection and stores the data in a Redis database. Currently the redis instance connected to the daemon is configured as master and syncronises with a redis slave in AWS EC2 as data backend to the REST API backend feeding the dashboard apps with data. 

* See: [power-meter-ionic](https://github.com/tfmalt/power-meter-ionic) for information about the ionic mobile app dashboard.
* See: [power-meter-api](https://github.com/tfmalt/power-meter-api) For the
restful web service API that provides access to the datasets for this app and
others.

