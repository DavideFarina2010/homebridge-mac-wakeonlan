'use strict';

const dgram = require('dgram');
const net = require('net');
const os = require('os');
const { execFile, exec } = require('child_process');

const PLUGIN_NAME = 'homebridge-mac-wakeonlan';
const PLATFORM_NAME = 'MacWake';

/* ---------- utilità ---------- */

function normalizeMac(mac) {
  const hex = String(mac || '').replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) throw new Error(`MAC address non valido: "${mac}"`);
  return hex.toLowerCase();
}

function buildMagicPacket(mac) {
  const macBuf = Buffer.from(normalizeMac(mac), 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBuf)]);
}

function sendMagicPacket(mac, { targets, port = 9, count = 3, interval = 250 } = {}) {
  const packet = buildMagicPacket(mac);
  const list = targets && targets.length ? targets : ['255.255.255.255'];
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.on('error', (err) => { try { socket.close(); } catch (_) {} reject(err); });
    socket.bind(() => {
      socket.setBroadcast(true);
      let sent = 0;
      const sendRound = () => {
        let pending = list.length;
        let failed = null;
        for (const addr of list) {
          socket.send(packet, 0, packet.length, port, addr, (err) => {
            if (err) failed = err;
            if (--pending === 0) {
              if (failed) { socket.close(); return reject(failed); }
              if (++sent >= count) { socket.close(); return resolve(); }
              setTimeout(sendRound, interval);
            }
          });
        }
      };
      sendRound();
    });
  });
}

/** Indirizzi di broadcast di tutte le interfacce IPv4 locali (utile in reti con più subnet/VLAN). */
function localBroadcasts() {
  const out = new Set();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family !== 'IPv4' || i.internal || !i.netmask) continue;
      const ip = i.address.split('.').map(Number);
      const mask = i.netmask.split('.').map(Number);
      out.add(ip.map((o, k) => (o | (~mask[k] & 255))).join('.'));
    }
  }
  return [...out];
}

function ping(host, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const isMac = process.platform === 'darwin';
    // macOS: -W in millisecondi; Linux: -W in secondi
    const args = isMac
      ? ['-c', '1', '-W', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];
    execFile('ping', args, { timeout: timeoutMs + 2000 }, (err) => resolve(!err));
  });
}

function tcpCheck(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', (e) => done(e.code === 'ECONNREFUSED')); // rifiutata = host acceso
  });
}

/* ---------- piattaforma ---------- */

class MacWakePlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.accessories = new Map(); // uuid -> PlatformAccessory
    this.handlers = new Map();    // uuid -> MacSwitch

    this.api.on('didFinishLaunching', () => this.setup());
    this.api.on('shutdown', () => this.handlers.forEach((h) => h.stop()));
  }

  configureAccessory(accessory) {
    this.accessories.set(accessory.UUID, accessory);
  }

  setup() {
    const { uuid } = this.api.hap;
    const devices = Array.isArray(this.config.devices) ? this.config.devices : [];
    const active = new Set();

    for (const dev of devices) {
      try {
        if (!dev.name) throw new Error('manca "name"');
        const mac = normalizeMac(dev.mac);
        const id = uuid.generate(`${PLUGIN_NAME}:${mac}`);
        active.add(id);

        let accessory = this.accessories.get(id);
        if (!accessory) {
          accessory = new this.api.platformAccessory(dev.name, id);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.set(id, accessory);
          this.log.info(`Aggiunto: ${dev.name} (${mac})`);
        } else {
          accessory.displayName = dev.name;
        }
        accessory.context.mac = mac;
        this.handlers.set(id, new MacSwitch(this, accessory, dev, mac));
      } catch (e) {
        this.log.error(`Dispositivo "${dev && dev.name}" ignorato: ${e.message}`);
      }
    }

    const stale = [...this.accessories.values()].filter((a) => !active.has(a.UUID));
    if (stale.length) {
      stale.forEach((a) => { this.log.info(`Rimosso: ${a.displayName}`); this.accessories.delete(a.UUID); });
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
  }
}

/* ---------- accessorio: interruttore per un Mac ---------- */

class MacSwitch {
  constructor(platform, accessory, dev, mac) {
    const { Service, Characteristic } = platform.api.hap;
    this.platform = platform;
    this.log = platform.log;
    this.accessory = accessory;
    this.name = dev.name;
    this.mac = mac;

    this.ip = dev.ip || null;
    this.statusPort = dev.statusPort || null;
    this.broadcast = dev.broadcastAddress || null;
    this.wolPort = dev.wolPort || 9;
    this.sendUnicast = dev.sendUnicast !== false && !!this.ip;
    this.pollInterval = Math.max(5, dev.pollInterval || 15) * 1000;
    this.wakeTimeout = Math.max(10, dev.wakeTimeout || 90) * 1000;
    this.sleepCommand = dev.sleepCommand || null;

    this.state = false;
    this.wakingUntil = 0;
    this.timers = new Set();
    this.Characteristic = Characteristic;

    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'Apple (Wake-on-LAN)')
      .setCharacteristic(Characteristic.Model, 'Mac')
      .setCharacteristic(Characteristic.SerialNumber, mac);

    this.service = accessory.getService(Service.Switch) || accessory.addService(Service.Switch, this.name);
    this.service.setCharacteristic(Characteristic.Name, this.name);
    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => this.state)
      .onSet((v) => this.setOn(v));

    if (this.hasStatus()) {
      this.poll();
      this.interval = setInterval(() => this.poll(), this.pollInterval);
    }
  }

  hasStatus() { return !!this.ip; }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.timers.forEach(clearTimeout);
  }

  later(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  }

  push(value) {
    this.state = value;
    this.service.updateCharacteristic(this.Characteristic.On, value);
  }

  async isOnline() {
    if (this.statusPort) return tcpCheck(this.ip, this.statusPort);
    return ping(this.ip);
  }

  async poll() {
    const online = await this.isOnline();
    if (online) { this.wakingUntil = 0; }
    else if (Date.now() < this.wakingUntil) { return; } // sta ancora avviandosi
    if (online !== this.state) {
      this.log.debug(`${this.name}: ${online ? 'acceso' : 'spento/in stop'}`);
      this.push(online);
    }
  }

  async setOn(value) {
    if (value) return this.wake();
    return this.sleep();
  }

  async wake() {
    const targets = new Set();
    if (this.broadcast) targets.add(this.broadcast);
    else { targets.add('255.255.255.255'); localBroadcasts().forEach((b) => targets.add(b)); }
    if (this.sendUnicast) targets.add(this.ip);

    try {
      await sendMagicPacket(this.mac, { targets: [...targets], port: this.wolPort });
      this.log.info(`${this.name}: magic packet inviato (${[...targets].join(', ')})`);
    } catch (e) {
      this.log.error(`${this.name}: invio fallito: ${e.message}`);
      this.later(() => this.push(false), 500);
      throw new this.platform.api.hap.HapStatusError(-70402 /* SERVICE_COMMUNICATION_FAILURE */);
    }

    if (this.hasStatus()) {
      this.wakingUntil = Date.now() + this.wakeTimeout;
      // controlli ravvicinati finché non risponde
      const fast = setInterval(async () => {
        if (Date.now() > this.wakingUntil) {
          clearInterval(fast);
          if (!(await this.isOnline())) { this.log.warn(`${this.name}: non ha risposto entro il timeout`); this.push(false); }
          return;
        }
        if (await this.isOnline()) { clearInterval(fast); this.wakingUntil = 0; this.push(true); }
      }, 3000);
      this.timers.add(fast);
    } else {
      // senza IP non conosciamo lo stato: interruttore "a impulso"
      this.later(() => this.push(false), 1500);
    }
  }

  async sleep() {
    if (this.sleepCommand) {
      this.log.info(`${this.name}: eseguo sleepCommand`);
      exec(this.sleepCommand, { timeout: 15000 }, (err) => {
        if (err) { this.log.error(`${this.name}: sleepCommand fallito: ${err.message}`); this.later(() => this.hasStatus() && this.poll(), 500); }
        else this.later(() => this.poll(), 8000);
      });
      return;
    }
    if (!this.hasStatus()) return; // impulso: tornerà già da solo su Off
    this.log.warn(`${this.name}: Wake-on-LAN non può spegnere il Mac (imposta "sleepCommand" per metterlo in stop).`);
    this.later(() => this.poll(), 500); // ripristina lo stato reale
  }
}

module.exports = (api) => {
  api.registerPlatform(PLATFORM_NAME, MacWakePlatform);
};
module.exports.buildMagicPacket = buildMagicPacket;
module.exports.sendMagicPacket = sendMagicPacket;
module.exports.normalizeMac = normalizeMac;
