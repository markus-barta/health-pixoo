'use strict';

// health-pixoo — Smart home health dashboard on Pixoo64
// Entry point: wires up all collectors and the render loop.

const { RealPixoo }     = require('../lib/pixoo-http');
const mqttCollector     = require('./collectors/mqtt-collector');
const pingCollector     = require('./collectors/ping-collector');
const rpcCollector      = require('./collectors/rpc-collector');
const renderer          = require('./renderer');
const { hasAlerts }     = require('./state');
const config            = require('./config');
const logger            = require('../lib/logger');

// Render interval — ~2fps is enough for a health dashboard
const RENDER_INTERVAL_MS = 500;

async function main() {
  logger.ok('health-pixoo starting', {
    pixoo: config.pixoo.ip,
    mqtt:  `${config.mqtt.host}:${config.mqtt.port}`,
  });

  // Init Pixoo
  const pixoo = new RealPixoo(config.pixoo.ip);
  await renderer.init(pixoo);

  // Start data collectors
  pingCollector.start();
  rpcCollector.start();

  // Connect MQTT — start render loop once subscribed
  mqttCollector.connect(async () => {
    logger.ok('All collectors running — starting render loop');

    // Render loop
    setInterval(async () => {
      renderer.updateTabCycle(hasAlerts());
      await renderer.renderFrame();
    }, RENDER_INTERVAL_MS);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
