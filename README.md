# homebridge-mac-wakeonlan

[![npm](https://img.shields.io/npm/v/homebridge-mac-wakeonlan)](https://www.npmjs.com/package/homebridge-mac-wakeonlan)
[![license](https://img.shields.io/npm/l/homebridge-mac-wakeonlan)](LICENSE)

Italiano: [README.it.md](README.it.md)

A Homebridge plugin that wakes your Macs over the network (Wi-Fi or Ethernet) with **Wake-on-LAN** and exposes each one in Apple Home as a switch.

## What it does (and what it doesn't)

- Adds one switch per Mac in the Home app. Turning it **On** sends Wake-on-LAN magic packets.
- With an `ip` configured, the switch reflects the real state of the Mac (ping, or a TCP port check) and turns On as soon as the Mac answers.
- Without an `ip`, the switch is a pulse: it goes back to Off after 1.5 s, because the real state is unknown.
- **Wake-on-LAN cannot turn a Mac off.** Turning the switch Off does nothing unless you set a `sleepCommand` (for example over SSH) to put the Mac to sleep.
- The Mac must be **asleep**, not powered off: Wake-on-LAN over Wi-Fi only works from sleep.

## Installation

Requires Homebridge 1.6+ or 2.x (Node 18+).

```bash
npm install -g homebridge-mac-wakeonlan
```

Or search for "Mac Wake" in the Homebridge UI. Then configure it from Homebridge UI → Plugins → Mac Wake → Settings (the plugin ships a schema), or edit `config.json` directly.

## Preparing the Mac

1. **System Settings → Battery / Energy → "Wake for network access"** = on.
2. Leave the Mac **asleep**, not shut down. It is more reliable with the lid closed and the power adapter connected.
3. Give the Mac a fixed IP (DHCP reservation on your router) and note its Wi-Fi MAC address: System Settings → Network → Wi-Fi → Details → Hardware.
4. Homebridge must be on the same network/VLAN as the Mac, or your router must forward broadcasts.

## Configuration

```json
{
  "platforms": [
    {
      "platform": "MacWake",
      "name": "Mac Wake",
      "devices": [
        {
          "name": "MacBook Pro",
          "mac": "aa:bb:cc:dd:ee:ff",
          "ip": "192.168.1.50",
          "sleepCommand": "ssh user@192.168.1.50 pmset sleepnow"
        }
      ]
    }
  ]
}
```

| Option | Meaning |
| --- | --- |
| `name`, `mac` | Required. Accessory name in the Home app and the Mac's MAC address |
| `ip` | Enables real status (ping) and unicast sending. Without it the switch is a pulse |
| `statusPort` | Checks a TCP port (22, 5900…) instead of ping, if the Mac's firewall blocks ping |
| `broadcastAddress` | Default: `255.255.255.255` plus the broadcast address of every local interface |
| `wolPort` | UDP port for the magic packet, default `9` |
| `pollInterval` | Seconds between status checks, default `15` (minimum `5`) |
| `wakeTimeout` | Seconds to wait for the Mac to answer after waking it, default `90` (minimum `10`) |
| `sleepCommand` | Shell command run when the switch is turned Off. Requires SSH with a key configured |

## How it works

- **On** sends 3 magic packets (broadcast, plus unicast when `ip` is set). With an `ip`, the switch becomes On when the Mac starts answering, or goes back to Off after `wakeTimeout`.
- **Off** without `sleepCommand` does nothing: the switch returns to the real state.
- **Off** with `sleepCommand` runs the command, then re-checks the Mac's state.

## Troubleshooting

- The Mac doesn't wake: check that "Wake for network access" is on and that the Mac is asleep, not off.
- Homebridge and the Mac are on different subnets: set `broadcastAddress` to the Mac's subnet broadcast (e.g. `192.168.1.255`) and configure `ip`.
- The switch stays Off even when the Mac is awake: the Mac may not answer ping. Set `statusPort` to an open port such as `22`.
- Run Homebridge with `-D` to see the status checks in the log.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Tests

```bash
npm install
npm test
```

## Credits

Not affiliated with or endorsed by Apple. "Mac", "Apple Home" and "HomeKit" are trademarks of Apple Inc.

## License

[MIT](LICENSE)
