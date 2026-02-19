# health-pixoo

Smart home health dashboard on Pixoo64. Demoscene retro-modern aesthetic.

Monitors critical devices in the JHW2211 home automation infrastructure and renders a live 64×64 pixel display.

## What it monitors

**Wi-Fi (RSSI + liveness)**
- `bz-sh` — Shelly 1PM (boiler temperature sensor)
- `wc-sh` — Shelly 1 (Tado bridge / WC floor heating chain)
- `vr-4pm` — Shelly Pro 4PM (floor heating controller, HTTP RPC)
- `vr-fb` — Fritz.box 7530 (main gateway)
- `dt-rep` — Fritz repeater Dachterrasse
- `tg-rep` — Fritz repeater Tiefgarage

**Zigbee (LQI + availability via Z2M)**
- `bz-boi` — Boiler switch (Potenzialfreier Kontakt)
- `bz-hzw` — Sprossenheizwand Badezimmer
- `wz-nw` — Netzwerkschrank plug (network SPOF)
- `vk-wlk` — Wasserleck sensor
- `sz-hzg` — Fensterbankheizung Schlafzimmer
- `ki-hzg` — Fensterbankheizung Kinderzimmer

**Services**
- MQTT broker (implicit)
- Node-RED (:1880)
- Home Assistant (:8123)

**Heating chains**
- Boiler: temperature + Node-RED state (`jhw2211/health/boiler`)
- WC floor heating: Tado→Shelly→4PM integrity (`jhw2211/health/heat-chain`)

## Display tabs

| Tab | Name | Content |
|---|---|---|
| 0 | HAUS | Overview dots + heating summary + ambient glow |
| 1 | WLAN | Per-device RSSI bars |
| 2 | ZIGBEE | Per-device LQI bars |
| 3 | HEIZUNG | Boiler temp + heating chain integrity |

Auto-cycles through tabs when alerts exist. Stays on overview when all green.

## Setup

```bash
cp .env.example .env
# Edit .env with MQTT password
npm install
npm start
```

## Docker

```bash
docker build -t health-pixoo .
docker run --env-file .env --network host health-pixoo
```

## Environment variables

See `.env.example`.

## Architecture

```
MQTT broker  ──→  mqtt-collector.js  ──→  state.js  ──→  renderer.js  ──→  Pixoo64
ping         ──→  ping-collector.js  ──┘                               HTTP POST
HTTP RPC     ──→  rpc-collector.js   ──┘
```

## Sources

- Drawing primitives adapted from [pidicon](https://github.com/markus-barta/pidicon)
- Pixoo64 HTTP protocol: `POST /post` with `Draw/SendHttpGif`
