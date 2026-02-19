'use strict';

// health-pixoo — Smart home health dashboard on Pixoo64
// Entry point: wires up all collectors and the render loop.

const { RealPixoo, httpPost } = require('../lib/pixoo-http');
const mqttCollector           = require('./collectors/mqtt-collector');
const pingCollector           = require('./collectors/ping-collector');
const rpcCollector            = require('./collectors/rpc-collector');
const renderer                = require('./renderer');
const { hasAlerts }           = require('./state');
const config                  = require('./config');
const logger                  = require('../lib/logger');

// Render interval — ~2fps is enough for a health dashboard
const RENDER_INTERVAL_MS = 500;
const CONTROL_TOPIC      = 'jhw2211/health/control';

let running = true;
let pixoo   = null;

async function stopDisplay() {
  running = false;
  logger.ok('health-pixoo stopped — restoring clock face');
  try {
    // Channel 0 = clock faces (default Pixoo UI)
    await httpPost(config.pixoo.ip, { Command: 'Channel/SetIndex', SelectIndex: 0 });
  } catch (err) {
    logger.warn('Could not restore clock face', { err: err.message });
  }
}

async function startDisplay() {
  running = true;
  logger.ok('health-pixoo started');
  // Re-init custom channel
  if (pixoo) {
    pixoo.initialized = false;
  }
}

async function main() {
  logger.ok('health-pixoo starting', {
    pixoo:   config.pixoo.ip,
    mqtt:    `${config.mqtt.host}:${config.mqtt.port}`,
    control: CONTROL_TOPIC,
  });

  // Init Pixoo
  pixoo = new RealPixoo(config.pixoo.ip);
  await renderer.init(pixoo);

  // Start data collectors
  pingCollector.start();
  rpcCollector.start();

  // Connect MQTT — start render loop once subscribed
  mqttCollector.connect(async (client) => {
    logger.ok('All collectors running — starting render loop');

    // Subscribe to control topic
    client.subscribe(CONTROL_TOPIC, (err) => {
      if (!err) logger.ok('Subscribed to control topic', { topic: CONTROL_TOPIC });
    });

    client.on('message', async (topic, buf) => {
      if (topic !== CONTROL_TOPIC) return;
      const cmd = buf.toString().trim().toLowerCase();
      if (cmd === 'stop')  await stopDisplay();
      if (cmd === 'start') await startDisplay();
    });

    // Render loop
    setInterval(async () => {
      if (!running) return;
      renderer.updateTabCycle(hasAlerts());
      await renderer.renderFrame();
    }, RENDER_INTERVAL_MS);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM — restoring clock face');
    await stopDisplay();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    logger.info('SIGINT — restoring clock face');
    await stopDisplay();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
