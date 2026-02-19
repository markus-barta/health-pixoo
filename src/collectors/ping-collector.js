'use strict';

// Ping collector — checks Fritz.box and repeaters via ICMP ping.
// Uses Node.js child_process to run system ping (no root needed for count=1).

const { exec }  = require('child_process');
const config    = require('../config');
const { state } = require('../state');
const logger    = require('../../lib/logger');

function pingHost(ip) {
  return new Promise((resolve) => {
    // -c 1 = one packet, -W 2 = 2s timeout (Linux); -t 2 on macOS
    const isMac = process.platform === 'darwin';
    const cmd   = isMac
      ? `ping -c 1 -W 2000 ${ip}`
      : `ping -c 1 -W 2 ${ip}`;

    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ alive: false, ms: null });
        return;
      }
      // Parse time= from output
      const match = stdout.match(/time[<=]([\d.]+)/);
      resolve({ alive: true, ms: match ? parseFloat(match[1]) : null });
    });
  });
}

async function pollOnce() {
  const pingDevices = config.wifi.filter(d => d.type === 'ping');
  for (const dev of pingDevices) {
    try {
      const result = await pingHost(dev.ip);
      state.wifi[dev.label].online   = result.alive;
      state.wifi[dev.label].rssi     = null;   // ping-only, no RSSI
      state.wifi[dev.label].pingMs   = result.ms;
      state.wifi[dev.label].lastSeen = result.alive ? new Date() : state.wifi[dev.label].lastSeen;
      logger.debug('ping', { label: dev.label, alive: result.alive, ms: result.ms });
    } catch (err) {
      logger.warn('ping error', { label: dev.label, err: err.message });
    }
  }
}

function start() {
  pollOnce();
  setInterval(pollOnce, config.pingIntervalMs);
  logger.info('Ping collector started', { interval: config.pingIntervalMs });
}

module.exports = { start };
