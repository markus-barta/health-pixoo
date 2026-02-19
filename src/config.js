'use strict';

// health-pixoo configuration
// All device definitions and thresholds in one place.
// Sensitive values (MQTT password) come from env vars only.

module.exports = {
  pixoo: {
    ip: process.env.PIXOO_IP || '192.168.1.159',
    brightness: parseInt(process.env.PIXOO_BRIGHTNESS || '70', 10),
  },

  mqtt: {
    host: process.env.MQTT_HOST || 'localhost',
    port: parseInt(process.env.MQTT_PORT || '1883', 10),
    user: process.env.MQTT_USER || 'smarthome',
    password: process.env.MQTT_PASSWORD || '',
  },

  // Tab auto-cycle interval when alerts exist (ms)
  tabCycleMs: 10000,

  // How often to poll Fritz devices via ping (ms)
  pingIntervalMs: 60000,

  // How often to poll Shelly Pro 4PM via HTTP RPC (ms)
  rpcIntervalMs: 60000,

  // Wi-Fi RSSI thresholds (dBm)
  rssi: {
    good: -70,    // green
    warn: -80,    // yellow
    // below warn = red
  },

  // Zigbee LQI thresholds (0-255)
  lqi: {
    good: 100,    // green
    warn: 60,     // yellow
    // below warn = red
  },

  // Wi-Fi devices
  wifi: [
    {
      label: 'bz-sh',
      name: 'Boiler Shelly',
      ip: '192.168.1.161',
      type: 'shelly-gen1',
      mqttTopic: 'shellies/bz/boiler/info',
      rssiField: 'wifi_sta.rssi',
    },
    {
      label: 'wc-sh',
      name: 'Tado Bridge',
      ip: '192.168.1.168',
      type: 'shelly-gen1',
      mqttTopic: 'shellies/wc/shelly1-tado-bridge/info',
      rssiField: 'wifi_sta.rssi',
    },
    {
      label: 'vr-4pm',
      name: '4PM Heizung',
      ip: '192.168.1.169',
      type: 'shelly-gen2-rpc',
      rpcUrl: 'http://192.168.1.169/rpc/Shelly.GetStatus',
      rssiField: 'wifi.rssi',
    },
    {
      label: 'vr-fb',
      name: 'Fritz.box',
      ip: '192.168.1.5',
      type: 'ping',
    },
    {
      label: 'dt-rep',
      name: 'Rep. Dachterr.',
      ip: '192.168.1.8',
      type: 'ping',
    },
    {
      label: 'tg-rep',
      name: 'Rep. Tiefgar.',
      ip: '192.168.1.9',
      type: 'ping',
    },
  ],

  // Zigbee devices (Z2M)
  zigbee: [
    {
      label: 'bz-boi',
      name: 'Boiler',
      z2mTopic: 'z2m/bz/powercontrol/boiler',
    },
    {
      label: 'bz-hzw',
      name: 'Heizwand bz',
      z2mTopic: 'z2m/bz/plug/zisp09',
    },
    {
      label: 'wz-nw',
      name: 'Netzwerk',
      z2mTopic: 'z2m/wz/plug/zisp10',
    },
    {
      label: 'vk-wlk',
      name: 'Wasserleck',
      z2mTopic: 'z2m/vk/waterleak/washingmachine',
    },
    {
      label: 'sz-hzg',
      name: 'Heizung sz',
      z2mTopic: 'z2m/sz/plug/zisp26',
    },
    {
      label: 'ki-hzg',
      name: 'Heizung ki',
      z2mTopic: 'z2m/ki/plug/zisp37',
    },
  ],

  // Services to check liveness
  services: [
    { label: 'MQTT', type: 'implicit' },
    { label: 'NR',   type: 'http', url: 'http://localhost:1880' },
    { label: 'HA',   type: 'http', url: 'http://localhost:8123' },
  ],

  // Node-RED health MQTT topics
  healthTopics: {
    boiler:    'jhw2211/health/boiler',
    heatChain: 'jhw2211/health/heat-chain',
  },
};
