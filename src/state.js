'use strict';

// Central state store — all collectors write here, renderer reads here.
// Simple object, no locking needed (single-threaded Node.js).

const config = require('./config');

const state = {
  // wifi[label] = { rssi: number|null, online: bool, lastSeen: Date|null }
  wifi: {},

  // zigbee[label] = { lqi: number|null, available: bool, lastSeen: Date|null }
  zigbee: {},

  // services[label] = { alive: bool, lastChecked: Date|null }
  services: {
    MQTT: { alive: true, lastChecked: null },  // implicit — if we're running, MQTT is alive
    NR:   { alive: false, lastChecked: null },
    HA:   { alive: false, lastChecked: null },
  },

  // Heating chain health from Node-RED MQTT
  boiler: {
    state: 'unknown',   // 'ok' | 'error' | 'unknown'
    tempC: null,
    nrRunning: null,
    lastChecked: null,
  },

  heatChain: {
    state: 'unknown',   // 'ok' | 'mismatch' | 'unknown'
    checkedAt: null,
    output1: null,      // Pro 4PM switch:0 output (from RPC poll)
    input0: null,       // Tado bridge input:0 (from Shelly MQTT)
  },
};

// Initialise per-device slots
for (const d of config.wifi) {
  state.wifi[d.label] = { rssi: null, online: false, lastSeen: null };
}
for (const d of config.zigbee) {
  state.zigbee[d.label] = { lqi: null, available: false, lastSeen: null };
}

// Helpers
function isWifiHealthy(label) {
  const s = state.wifi[label];
  if (!s || !s.online) return 'offline';
  if (s.rssi === null) return 'ok';   // ping-only devices — alive = ok
  if (s.rssi >= config.rssi.good) return 'ok';
  if (s.rssi >= config.rssi.warn) return 'warn';
  return 'bad';
}

function isZigbeeHealthy(label) {
  const s = state.zigbee[label];
  if (!s || !s.available) return 'offline';
  if (s.lqi === null) return 'ok';
  if (s.lqi >= config.lqi.good) return 'ok';
  if (s.lqi >= config.lqi.warn) return 'warn';
  return 'bad';
}

function overallHealth() {
  const wifiStates  = config.wifi.map(d => isWifiHealthy(d.label));
  const zbStates    = config.zigbee.map(d => isZigbeeHealthy(d.label));
  const svcStates   = Object.values(state.services).map(s => s.alive ? 'ok' : 'offline');
  const heatState   = state.boiler.state === 'ok' && state.heatChain.state !== 'mismatch' ? 'ok' : 'warn';

  const all = [...wifiStates, ...zbStates, ...svcStates, heatState];
  if (all.some(s => s === 'offline' || s === 'bad')) return 'red';
  if (all.some(s => s === 'warn'))                   return 'yellow';
  return 'green';
}

function hasAlerts() {
  return overallHealth() !== 'green';
}

module.exports = { state, isWifiHealthy, isZigbeeHealthy, overallHealth, hasAlerts };
