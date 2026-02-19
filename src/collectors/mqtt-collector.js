'use strict';

// MQTT collector — subscribes to Shelly + Z2M topics, updates state.
// Also handles Node-RED health payloads from jhw2211/health/#.

const mqtt   = require('mqtt');
const config = require('../config');
const { state } = require('../state');
const logger = require('../../lib/logger');

let client = null;

function getNestedValue(obj, path) {
  return path.split('.').reduce((cur, key) => (cur && cur[key] !== undefined ? cur[key] : null), obj);
}

function connect(onReady) {
  const url = `mqtt://${config.mqtt.host}:${config.mqtt.port}`;
  logger.info('MQTT connecting', { url });

  client = mqtt.connect(url, {
    username: config.mqtt.user,
    password: config.mqtt.password,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on('connect', () => {
    logger.ok('MQTT connected');
    state.services.MQTT.alive = true;
    state.services.MQTT.lastChecked = new Date();

    // Shelly Gen1 info topics (RSSI)
    const shellyInfoTopics = config.wifi
      .filter(d => d.type === 'shelly-gen1')
      .map(d => d.mqttTopic);

    // Shelly online topics
    const shellyOnlineTopics = config.wifi
      .filter(d => d.type === 'shelly-gen1')
      .map(d => d.mqttTopic.replace('/info', '/online'));

    // Tado bridge input (for heat chain)
    const tadoInput = ['shellies/wc/shelly1-tado-bridge/input/0'];

    // Z2M availability + state topics
    const z2mAvail  = config.zigbee.map(d => `${d.z2mTopic}/availability`);
    const z2mState  = config.zigbee.map(d => d.z2mTopic);

    // Node-RED health
    const healthTopics = ['jhw2211/health/#'];

    const topics = [
      ...shellyInfoTopics,
      ...shellyOnlineTopics,
      ...tadoInput,
      ...z2mAvail,
      ...z2mState,
      ...healthTopics,
    ];

    client.subscribe(topics, (err) => {
      if (err) logger.error('MQTT subscribe error', { err: err.message });
      else logger.ok('MQTT subscribed', { count: topics.length });
      if (onReady) onReady();
    });
  });

  client.on('offline', () => {
    logger.warn('MQTT offline');
    state.services.MQTT.alive = false;
  });

  client.on('error', (err) => {
    logger.error('MQTT error', { err: err.message });
    state.services.MQTT.alive = false;
  });

  client.on('message', (topic, buf) => {
    const raw = buf.toString();
    handleMessage(topic, raw);
  });
}

function handleMessage(topic, raw) {
  try {
    // --- Shelly Gen1 /online (retained bool string)
    const wifiOnline = config.wifi.find(
      d => d.type === 'shelly-gen1' && topic === d.mqttTopic.replace('/info', '/online')
    );
    if (wifiOnline) {
      state.wifi[wifiOnline.label].online = raw === 'true';
      state.wifi[wifiOnline.label].lastSeen = new Date();
      return;
    }

    // --- Shelly Gen1 /info (full status JSON with RSSI)
    const wifiInfo = config.wifi.find(
      d => d.type === 'shelly-gen1' && topic === d.mqttTopic
    );
    if (wifiInfo) {
      const data = JSON.parse(raw);
      const rssi = getNestedValue(data, wifiInfo.rssiField);
      if (rssi !== null) {
        state.wifi[wifiInfo.label].rssi = rssi;
        state.wifi[wifiInfo.label].online = true;
        state.wifi[wifiInfo.label].lastSeen = new Date();
      }
      return;
    }

    // --- Tado bridge input/0 (heat chain: 0=off, 1=on)
    if (topic === 'shellies/wc/shelly1-tado-bridge/input/0') {
      state.heatChain.input0 = raw === '1';
      return;
    }

    // --- Z2M availability
    const zbAvail = config.zigbee.find(d => topic === `${d.z2mTopic}/availability`);
    if (zbAvail) {
      const data = JSON.parse(raw);
      state.zigbee[zbAvail.label].available = data.state === 'online';
      state.zigbee[zbAvail.label].lastSeen = new Date();
      return;
    }

    // --- Z2M state (LQI)
    const zbState = config.zigbee.find(d => topic === d.z2mTopic);
    if (zbState) {
      const data = JSON.parse(raw);
      if (data.linkquality !== undefined) {
        state.zigbee[zbState.label].lqi = data.linkquality;
        state.zigbee[zbState.label].lastSeen = new Date();
      }
      return;
    }

    // --- Node-RED health: boiler
    if (topic === 'jhw2211/health/boiler') {
      const data = JSON.parse(raw);
      state.boiler.state      = data.state || 'unknown';
      state.boiler.tempC      = data.temp_c ?? null;
      state.boiler.nrRunning  = data.nr_running ?? null;
      state.boiler.lastChecked = new Date();
      return;
    }

    // --- Node-RED health: heat-chain
    if (topic === 'jhw2211/health/heat-chain') {
      const data = JSON.parse(raw);
      state.heatChain.state     = data.state || 'unknown';
      state.heatChain.checkedAt = data.checked_at ? new Date(data.checked_at) : new Date();
      return;
    }

  } catch (err) {
    logger.debug('MQTT parse error', { topic, err: err.message });
  }
}

module.exports = { connect };
