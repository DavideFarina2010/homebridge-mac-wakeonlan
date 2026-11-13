const dgram = require('dgram');
const assert = require('assert');
const { buildMagicPacket, sendMagicPacket, normalizeMac } = require('./index.js');

const p = buildMagicPacket('AA:bb-cc:DD:ee:ff');
assert.strictEqual(p.length, 102);
assert(p.subarray(0, 6).every((b) => b === 0xff));
assert.strictEqual(p.subarray(6, 12).toString('hex'), 'aabbccddeeff');
assert.strictEqual(p.subarray(96, 102).toString('hex'), 'aabbccddeeff');
assert.throws(() => normalizeMac('zz:11'));

const srv = dgram.createSocket('udp4');
let got = 0;
srv.on('message', (m) => { assert(m.equals(p)); got++; });
srv.bind(0, '127.0.0.1', async () => {
  await sendMagicPacket('aabbccddeeff', { targets: ['127.0.0.1'], port: srv.address().port, count: 3, interval: 20 });
  setTimeout(() => { assert.strictEqual(got, 3); console.log('OK: 3 pacchetti ricevuti, formato corretto'); srv.close(); }, 100);
});
