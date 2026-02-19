'use strict';

// Pixoo64 renderer — draws all 4 tabs.
// Demoscene retro-modern aesthetic: gradient bars, pixel art, scanlines, ambient glow.

const { RealPixoo } = require('../lib/pixoo-http');
const { interpolateColor } = require('../lib/gradient-renderer');
const config = require('./config');
const { state, isWifiHealthy, isZigbeeHealthy, overallHealth } = require('./state');
const logger = require('../lib/logger');

// ── Palette ──────────────────────────────────────────────────────────────────
const PAL = {
  black:      [0,   0,   0,   255],
  white:      [255, 255, 255, 255],
  dimWhite:   [160, 160, 160, 255],
  dimGrey:    [60,  60,  60,  255],

  // Status
  ok:         [0,   220, 100, 255],   // retro green
  warn:       [255, 180, 0,   255],   // amber
  bad:        [220, 40,  40,  255],   // red
  offline:    [80,  20,  20,  255],   // dark red

  // Demoscene accent colours
  cyan:       [0,   200, 220, 255],
  magenta:    [200, 0,   180, 255],
  amber:      [255, 160, 0,   255],
  blue:       [30,  80,  200, 255],

  // Bar gradients: [dark end, bright end]
  barOk:      [[0, 60, 20, 255],    [0, 220, 100, 255]],
  barWarn:    [[80, 50, 0, 255],    [255, 180, 0, 255]],
  barBad:     [[80, 10, 10, 255],   [220, 40, 40, 255]],
  barOff:     [[30, 10, 10, 255],   [80, 20, 20, 255]],
};

// Map health string → colour
function healthColor(h) {
  if (h === 'ok')      return PAL.ok;
  if (h === 'warn')    return PAL.warn;
  if (h === 'offline') return PAL.offline;
  return PAL.bad;
}

function healthBarGrad(h) {
  if (h === 'ok')      return PAL.barOk;
  if (h === 'warn')    return PAL.barWarn;
  if (h === 'offline') return PAL.barOff;
  return PAL.barBad;
}

// ── Low-level drawing helpers ─────────────────────────────────────────────────

// Horizontal gradient bar at (x, y), width w, height h
async function gradientBar(pixoo, x, y, w, h, darkColor, brightColor) {
  for (let i = 0; i < w; i++) {
    const factor = i / (w - 1);
    const [r, g, b] = interpolateColor(darkColor, brightColor, factor);
    for (let row = 0; row < h; row++) {
      pixoo._setPixel(x + i, y + row, r, g, b);
    }
  }
}

// Bar showing signal level (0.0–1.0) against empty background
async function signalBar(pixoo, x, y, totalW, h, level, health) {
  const filled = Math.round(level * totalW);
  const [dark, bright] = healthBarGrad(health);

  // Empty background (dark grey scanline feel)
  for (let i = 0; i < totalW; i++) {
    for (let row = 0; row < h; row++) {
      pixoo._setPixel(x + i, y + row, 18, 18, 18);
    }
  }
  // Filled portion
  if (filled > 0) {
    await gradientBar(pixoo, x, y, filled, h, dark, bright);
  }
}

// Scanline overlay (every other row, subtle darkening)
function applyScanlines(pixoo, startY, endY, alpha = 0.18) {
  for (let y = startY; y < endY; y += 2) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 3;
      pixoo.buf[i]     = Math.round(pixoo.buf[i]     * (1 - alpha));
      pixoo.buf[i + 1] = Math.round(pixoo.buf[i + 1] * (1 - alpha));
      pixoo.buf[i + 2] = Math.round(pixoo.buf[i + 2] * (1 - alpha));
    }
  }
}

// Ambient glow block (bottom rows, breathing colour)
let glowPhase = 0;
function ambientGlow(pixoo, startY, health) {
  glowPhase = (glowPhase + 0.04) % (Math.PI * 2);
  const intensity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(glowPhase));

  let base;
  if (health === 'green')  base = [0,   100, 40 ];
  else if (health === 'yellow') base = [100, 70,  0  ];
  else                     base = [100, 10,  10 ];

  for (let y = startY; y < 64; y++) {
    // Fade in from startY
    const fade = (y - startY) / (64 - startY);
    for (let x = 0; x < 64; x++) {
      const r = Math.round(base[0] * intensity * fade);
      const g = Math.round(base[1] * intensity * fade);
      const b = Math.round(base[2] * intensity * fade);
      pixoo._setPixel(x, y, r, g, b);
    }
  }
  // Scanlines on glow
  applyScanlines(pixoo, startY, 64, 0.25);
}

// Custom 4×5px checkmark (thick, readable at small size)
function drawCheckmark(pixoo, x, y, color) {
  const [r, g, b] = color;
  // Tick shape: left side goes down, right side goes up
  // Row offsets: (col, row) pairs that are ON
  const pixels = [
    [0,3],[0,4],
    [1,2],[1,3],
    [2,1],[2,2],
    [3,0],[3,1],
  ];
  for (const [dx, dy] of pixels) {
    pixoo._setPixel(x + dx, y + dy, r, g, b);
    pixoo._setPixel(x + dx, y + dy - 1, r, g, b); // 2px thick
  }
}

// Custom 4×5px X mark
function drawCross(pixoo, x, y, color) {
  const [r, g, b] = color;
  for (let i = 0; i < 5; i++) {
    pixoo._setPixel(x + i,     y + i,     r, g, b);
    pixoo._setPixel(x + i + 1, y + i,     r, g, b);
    pixoo._setPixel(x + 4 - i, y + i,     r, g, b);
    pixoo._setPixel(x + 3 - i, y + i,     r, g, b);
  }
}

// Thin separator line
function separator(pixoo, y) {
  for (let x = 0; x < 64; x++) {
    pixoo._setPixel(x, y, 40, 40, 40);
  }
}

// Small status dot (3×3)
function dot(pixoo, x, y, color) {
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      pixoo._blendPixel(x + dx, y + dy, ...color);
    }
  }
}

// ── Tab header ────────────────────────────────────────────────────────────────
async function drawHeader(pixoo, title, tabNum, totalTabs) {
  // Diamond accent
  pixoo._setPixel(1, 1, ...PAL.cyan);
  pixoo._setPixel(2, 0, ...PAL.cyan);
  pixoo._setPixel(2, 2, ...PAL.cyan);
  pixoo._setPixel(3, 1, ...PAL.cyan);

  // Title
  await pixoo.drawTextRgbaAligned(title, [5, 0], PAL.white, 'left');

  // Tab indicator (right-aligned)
  if (totalTabs > 1) {
    const ind = `${tabNum}/${totalTabs}`;
    await pixoo.drawTextRgbaAligned(ind, [63, 0], PAL.dimGrey, 'right');
  }

  separator(pixoo, 6);
}

// ── Clock (HH:MM) ─────────────────────────────────────────────────────────────
async function drawClock(pixoo, x, y) {
  const now  = new Date();
  const hh   = String(now.getHours()).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');
  await pixoo.drawTextRgbaAligned(`${hh}:${mm}`, [x, y], PAL.dimWhite, 'right');
}

// ── TAB 0: ÜBERSICHT ──────────────────────────────────────────────────────────
async function renderOverview(pixoo) {
  const health = overallHealth();

  // Header
  await drawHeader(pixoo, 'HAUS', 0, 0);
  await drawClock(pixoo, 63, 0);

  // WLAN row — 6 dots
  await pixoo.drawTextRgbaAligned('WLAN', [0, 8], PAL.dimWhite, 'left');
  const wifiDevs = config.wifi;
  for (let i = 0; i < wifiDevs.length; i++) {
    const h = isWifiHealthy(wifiDevs[i].label);
    dot(pixoo, 22 + i * 7, 8, healthColor(h));
  }

  // ZB row — 6 dots
  await pixoo.drawTextRgbaAligned('ZB  ', [0, 15], PAL.dimWhite, 'left');
  const zbDevs = config.zigbee;
  for (let i = 0; i < zbDevs.length; i++) {
    const h = isZigbeeHealthy(zbDevs[i].label);
    dot(pixoo, 22 + i * 7, 15, healthColor(h));
  }

  // Services row — dot + 2-char label, spaced at 14px each
  // Layout: SVC[0,22] | dot+MQ[22] | dot+NR[36] | dot+HA[50]
  await pixoo.drawTextRgbaAligned('SVC', [0, 22], PAL.dimWhite, 'left');
  const svcKeys   = Object.keys(state.services);
  const svcShort  = ['MQ', 'NR', 'HA'];
  for (let i = 0; i < svcKeys.length; i++) {
    const svc   = state.services[svcKeys[i]];
    const color = svc.alive ? PAL.ok : PAL.bad;
    dot(pixoo, 22 + i * 14, 22, color);
    await pixoo.drawTextRgbaAligned(svcShort[i] || svcKeys[i].slice(0,2), [27 + i * 14, 22], PAL.dimGrey, 'left');
  }

  separator(pixoo, 28);

  // Heating summary row 1: Boiler
  const boilerOk   = state.boiler.state === 'ok';
  const boilerCol  = boilerOk ? PAL.ok : PAL.bad;
  const tempStr    = state.boiler.tempC !== null ? `${Math.round(state.boiler.tempC)}C` : '---';
  await pixoo.drawTextRgbaAligned('BOI', [0, 30], PAL.dimWhite, 'left');
  await pixoo.drawTextRgbaAligned(tempStr, [16, 30], PAL.amber, 'left');
  if (boilerOk) drawCheckmark(pixoo, 36, 29, PAL.ok);
  else await pixoo.drawTextRgbaAligned('!', [37, 30], PAL.bad, 'left');

  // Heating summary row 2: floor heating chain
  const chainOk  = state.heatChain.state !== 'mismatch';
  const chainCol = chainOk ? PAL.ok : PAL.bad;
  await pixoo.drawTextRgbaAligned('BODEN', [0, 37], PAL.dimWhite, 'left');
  const chainDisp = state.heatChain.state === 'unknown' ? '?' : (chainOk ? 'OK' : 'FEHLER');
  await pixoo.drawTextRgbaAligned(chainDisp, [24, 37], chainOk ? PAL.ok : PAL.bad, 'left');
  if (chainOk && state.heatChain.state !== 'unknown') drawCheckmark(pixoo, 36, 36, PAL.ok);

  separator(pixoo, 43);

  // Ambient glow
  ambientGlow(pixoo, 44, health);
}

// ── TAB 1: WLAN DETAIL ────────────────────────────────────────────────────────
async function renderWlan(pixoo) {
  await drawHeader(pixoo, 'WLAN', 1, 4);

  const devs = config.wifi;
  for (let i = 0; i < devs.length; i++) {
    const dev   = devs[i];
    const s     = state.wifi[dev.label];
    const h     = isWifiHealthy(dev.label);
    const y     = 8 + i * 9;

    // Label (5 chars max)
    await pixoo.drawTextRgbaAligned(dev.label, [0, y], PAL.dimWhite, 'left');

    // Signal bar — start at x=25 (4px gap after label), width 24
    const barX = 25;
    const barW = 24;
    let level  = 0;
    if (s.online) {
      if (s.rssi !== null) {
        // RSSI: map -100…-50 dBm → 0…1
        level = Math.min(1, Math.max(0, (s.rssi + 100) / 50));
      } else {
        level = 1.0;  // ping-only and alive = full bar
      }
    }
    await signalBar(pixoo, barX, y, barW, 3, level, h);

    // Value label
    let valStr;
    if (!s.online) {
      valStr = 'OFF';
    } else if (s.rssi !== null) {
      valStr = `${s.rssi}`;
    } else {
      valStr = 'OK';
    }
    const valColor = healthColor(h);
    await pixoo.drawTextRgbaAligned(valStr, [63, y], valColor, 'right');
  }
}

// ── TAB 2: ZIGBEE ─────────────────────────────────────────────────────────────
async function renderZigbee(pixoo) {
  await drawHeader(pixoo, 'ZIGBEE', 2, 4);

  const devs = config.zigbee;
  for (let i = 0; i < devs.length; i++) {
    const dev = devs[i];
    const s   = state.zigbee[dev.label];
    const h   = isZigbeeHealthy(dev.label);
    const y   = 8 + i * 9;

    await pixoo.drawTextRgbaAligned(dev.label, [0, y], PAL.dimWhite, 'left');

    const barX = 25;
    const barW = 24;
    const level = s.available && s.lqi !== null
      ? Math.min(1, s.lqi / 255)
      : 0;
    await signalBar(pixoo, barX, y, barW, 3, level, h);

    let valStr;
    if (!s.available) {
      valStr = 'OFF';
    } else if (s.lqi !== null) {
      valStr = `${s.lqi}`;
    } else {
      valStr = 'OK';
    }
    await pixoo.drawTextRgbaAligned(valStr, [63, y], healthColor(h), 'right');
  }
}

// ── TAB 3: HEIZUNG ────────────────────────────────────────────────────────────
async function renderHeizung(pixoo) {
  await drawHeader(pixoo, 'HEIZUNG', 3, 4);

  // Boiler section
  const tempStr   = state.boiler.tempC !== null ? `${Math.round(state.boiler.tempC)}` : '---';
  const nrStr     = state.boiler.nrRunning === true ? 'OK' : (state.boiler.nrRunning === false ? 'ERR' : '?');
  const boilerCol = state.boiler.state === 'ok' ? PAL.ok : (state.boiler.state === 'unknown' ? PAL.warn : PAL.bad);

  await pixoo.drawTextRgbaAligned('BOILER', [0, 8], PAL.dimWhite, 'left');
  await pixoo.drawTextRgbaAligned(`${tempStr}C`, [28, 8], PAL.amber, 'left');
  await pixoo.drawTextRgbaAligned(`NR:${nrStr}`, [44, 8], boilerCol, 'left');

  // Boiler status bar (temperature visualisation, 0–80°C)
  if (state.boiler.tempC !== null) {
    const level = Math.min(1, Math.max(0, state.boiler.tempC / 80));
    await signalBar(pixoo, 0, 15, 64, 2, level, state.boiler.state === 'ok' ? 'ok' : 'warn');
  }

  separator(pixoo, 19);

  // Floor heating chain section
  const chainState = state.heatChain.state;
  const chainColor = chainState === 'ok' ? PAL.ok : (chainState === 'unknown' ? PAL.warn : PAL.bad);
  const chainStr   = chainState === 'ok' ? 'OK' : (chainState === 'mismatch' ? 'FEHLER' : '?');

  await pixoo.drawTextRgbaAligned('BODEN', [0, 21], PAL.dimWhite, 'left');
  await pixoo.drawTextRgbaAligned(chainStr, [28, 21], chainColor, 'left');

  // Input/output state
  const inputStr  = state.heatChain.input0  === null ? '?' : (state.heatChain.input0 ? 'AN' : 'AUS');
  const outputStr = state.heatChain.output1 === null ? '?' : (state.heatChain.output1 ? 'AN' : 'AUS');
  await pixoo.drawTextRgbaAligned('SH:', [0, 28], PAL.dimGrey, 'left');
  await pixoo.drawTextRgbaAligned(inputStr, [12, 28], state.heatChain.input0 ? PAL.warn : PAL.ok, 'left');
  await pixoo.drawTextRgbaAligned('4PM:', [32, 28], PAL.dimGrey, 'left');
  await pixoo.drawTextRgbaAligned(outputStr, [52, 28], state.heatChain.output1 ? PAL.warn : PAL.ok, 'left');

  // Alert or last-check time
  if (chainState === 'mismatch') {
    await pixoo.drawTextRgbaAligned('HEIZUNG LAEUFT!', [0, 36], PAL.bad, 'left');
  } else if (state.heatChain.checkedAt) {
    const t = state.heatChain.checkedAt;
    const timeStr = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    await pixoo.drawTextRgbaAligned(`geprueft: ${timeStr}`, [0, 36], PAL.dimGrey, 'left');
  }

  separator(pixoo, 43);
  ambientGlow(pixoo, 44, chainState === 'ok' ? 'green' : 'red');
}

// ── Main renderer ─────────────────────────────────────────────────────────────

let pixoo = null;
let currentTab = 0;
let tabCycleTimer = null;


// Draw current tab and push to device
async function renderFrame() {
  if (!pixoo) return;

  pixoo.buf.fill(0);  // clear

  try {
    switch (currentTab) {
      case 0: await renderOverview(pixoo); break;
      case 1: await renderWlan(pixoo);     break;
      case 2: await renderZigbee(pixoo);   break;
      case 3: await renderHeizung(pixoo);  break;
    }
    // Apply global scanline overlay on overview
    if (currentTab === 0) {
      applyScanlines(pixoo, 7, 44, 0.12);
    }

    await pixoo.push();
  } catch (err) {
    logger.warn('Render error', { tab: currentTab, err: err.message });
  }
}

// Start cycling tabs when alerts exist
function updateTabCycle(hasAlerts) {
  if (hasAlerts) {
    if (!tabCycleTimer) {
      tabCycleTimer = setInterval(() => {
        currentTab = (currentTab + 1) % 4;
      }, config.tabCycleMs);
    }
  } else {
    // Return to overview and stop cycling
    if (tabCycleTimer) {
      clearInterval(tabCycleTimer);
      tabCycleTimer = null;
    }
    currentTab = 0;
  }
}

function advanceTab() {
  currentTab = (currentTab + 1) % 4;
}

async function init(pixooInstance) {
  pixoo = pixooInstance;
  logger.info('Renderer initialised');
}

module.exports = { init, renderFrame, updateTabCycle, advanceTab };
