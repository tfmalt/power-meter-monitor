const VitalSigns = require('vitalsigns');
const logger     = require('winston');

const monitorController = {
  /**
   * Setup function for vitalsigns. Vital signs output statistics on server
   * performance to the logger at a given interval.
   *
   * @returns {undefined}
   */
  setupVitals() {
    logger.info('Setting up health check with VitalSigns.');

    const vitals = new VitalSigns({autoCheck: 30000});

    vitals.monitor('cpu', {});
    vitals.monitor('mem', {units: 'MB'});
    vitals.monitor('tick', {});

    vitals.on('healthChange', (healthy, report, failed) => {
      logger.warn('Health Change: server is: %s\nReport: %s\nFailed: %s', (healthy
        ? 'healthy'
        : 'unhealthy'), report, failed);
    });

    vitals.on('healthCheck', (healthy, report, failed) => {
      let type = healthy
        ? 'info'
        : 'warn';

      logger.log(type, 'Health Check');
      logger.log(type, '  healthy:', healthy);
      logger.log(type, '  report:', JSON.stringify(report));

      if (failed.length > 0) {
        logger.log(type, '  failed:', failed);
      }
    });
  },

  /**
   * Configure the logger properly. Different behaviour is added depending
   * if the logger is run in production or development.
   *
   * @param {object} config The configuration object
   * @returns {object} winston logger object.
   */
  setupLogger(config) {
    logger.remove(logger.transports.Console);

    switch (process.env.NODE_ENV) {
      case 'development':
      case 'integration':
      case 'test':
        console.log('Logging to: Console.');
        logger.add(logger.transports.Console, {
          colorize: true,
          timestamp: true
        });
        break;
      default:
        console.log('Logging to: ', config.logfile);
        logger.add(logger.transports.File, {
          colorize: true,
          timestamp: true,
          filename: config.logfile,
          json: false
        });
        break;
    }

    return logger;
  },

  printUsage(config) {

    'use strict';
    console.log('power-meter-monitor v' + config.version);
    console.log('Usage:');
    console.log('  -h, --help          Print help and usage information');
    console.log('      --meter <type>  Type of meter to instantise');
    console.log('  -v, --version       Print version of application and exit');
  },

  printVersion(config) {
    console.log('v' + config.version);
  },

  checkArguments(config) {
    if (argv.h === true || argv.help === true) {
      printUsage(config);
      process.exit();
    }

    if (argv.v === true || argv.version === true) {
      printVersion(config);
      process.exit();
    }
  }
};

module.exports = monitorController;
