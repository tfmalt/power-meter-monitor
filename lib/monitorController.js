/**
 * Object literal with functions useful to the main script.
 */

const VitalSigns = require('vitalsigns');
const logger = require('winston');

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
      case 'docker':
      case 'integration':
      case 'test':
        console.log(`Environment is ${process.env.NODE_ENV}, logging to: Console.`);
        logger.add(logger.transports.Console, {
          colorize: true,
          timestamp: true,
          json: false
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

  printStartupMessage(config) {
    console.log('Starting power-meter-monitor version: ' + config.version);
    console.log('  Node version: ' + process.version);
    console.log('  Redis host: ' + config.redis.host + ':' + config.redis.port);
    console.log('  Power Meter Type:', config.meterType);
    logger.info('Starting power-meter-monitor version: ' + config.version);
    logger.info('Node version: ' + process.version);
    logger.info('Redis host: %s:%s', config.redis.host, config.redis.port);
  }
};

module.exports = monitorController;
