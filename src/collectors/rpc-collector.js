'use strict';

// RPC collector — polls Shelly Gen2 devices via HTTP RPC.
// Also checks HTTP service liveness (Node-RED, HA).

const config    = require('../config');
const { state } = require('../state');
const logger    = require('../../lib/logger');

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function pollRpc() {
  const rpcDevices = config.wifi.filter(d => d.type === 'shelly-gen2-rpc');
  for (const dev of rpcDevices) {
    try {
      const res  = await fetchWithTimeout(dev.rpcUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Navigate nested rssiField: 'wifi.rssi'
      const rssi = dev.rssiField.split('.').reduce(
        (cur, key) => (cur && cur[key] !== undefined ? cur[key] : null), data
      );

      // Also grab switch:0 output for heat chain state
      const sw0 = data['switch:0'];
      if (sw0 !== undefined) {
        state.heatChain.output1 = sw0.output ?? null;
      }

      state.wifi[dev.label].rssi     = rssi;
      state.wifi[dev.label].online   = true;
      state.wifi[dev.label].lastSeen = new Date();
      logger.debug('RPC poll', { label: dev.label, rssi, output1: state.heatChain.output1 });
    } catch (err) {
      state.wifi[dev.label].online = false;
      logger.warn('RPC poll failed', { label: dev.label, err: err.message });
    }
  }
}

async function pollServices() {
  for (const svc of config.services) {
    if (svc.type !== 'http') continue;
    try {
      const res = await fetchWithTimeout(svc.url);
      state.services[svc.label].alive        = res.ok || res.status < 500;
      state.services[svc.label].lastChecked  = new Date();
      logger.debug('service check', { label: svc.label, alive: state.services[svc.label].alive });
    } catch (err) {
      state.services[svc.label].alive        = false;
      state.services[svc.label].lastChecked  = new Date();
      logger.debug('service offline', { label: svc.label, err: err.message });
    }
  }
}

function checkStaleDevices() {
  const STALE_MS = 5 * 60 * 1000; // 5 min
  const now = Date.now();
  for (const [label, s] of Object.entries(state.wifi)) {
    if (s.lastSeen && s.online && (now - s.lastSeen.getTime()) > STALE_MS) {
      logger.warn('Shelly went stale', { label, lastSeen: s.lastSeen });
      state.wifi[label].online = false;
    }
  }
}

function start() {
  pollRpc();
  pollServices();
  setInterval(pollRpc,           config.rpcIntervalMs);
  setInterval(pollServices,      config.rpcIntervalMs);
  setInterval(checkStaleDevices, 60000);
  logger.info('RPC/service collector started', { interval: config.rpcIntervalMs });
}

module.exports = { start };
