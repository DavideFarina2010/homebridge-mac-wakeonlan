# homebridge-mac-wakeonlan

Plugin Homebridge che sveglia i Mac in rete (WiFi o Ethernet) con **Wake-on-LAN** e li espone in Apple Home come interruttori.

## Installazione
Copia la cartella in una directory raggiungibile da Homebridge e installa:

    sudo npm install -g /percorso/homebridge-mac-wakeonlan

(oppure pubblicala su npm e cercala dalla UI di Homebridge). Poi configura da Homebridge UI → Plugin → Mac Wake → Impostazioni.

## Preparare il Mac
1. **Impostazioni di Sistema → Batteria / Energia → "Riattiva per accesso alla rete"** (Wake for network access) = attivo.
2. Il Mac deve essere **in stop**, non spento: il WoL via WiFi funziona solo da stop (anche con coperchio chiuso e alimentatore collegato è più affidabile).
3. Dai al Mac un IP fisso (prenotazione DHCP sul router) e prendi il MAC WiFi: Impostazioni → Rete → Wi-Fi → Dettagli → Hardware.
4. Homebridge deve stare nella stessa rete/VLAN del Mac (o il router deve inoltrare i broadcast).

## Configurazione (config.json)
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
          "sleepCommand": "ssh davide@192.168.1.50 pmset sleepnow"
        }
      ]
    }
  ]
}
```

| Campo | Descrizione |
|---|---|
| `name`, `mac` | obbligatori |
| `ip` | abilita lo stato reale (ping) e l'invio unicast; senza IP lo switch è "a impulso" (torna su Off dopo 1,5 s) |
| `statusPort` | controlla una porta TCP (22, 5900…) invece del ping, se il firewall del Mac blocca il ping |
| `broadcastAddress` | default: 255.255.255.255 + broadcast di tutte le interfacce |
| `wolPort` | default 9 |
| `pollInterval` / `wakeTimeout` | secondi, default 15 / 90 |
| `sleepCommand` | eseguito quando metti lo switch su Off (il WoL non può spegnere). Richiede ssh con chiave configurata |

## Note
- On → invia 3 magic packet; con `ip` lo switch diventa On quando il Mac risponde.
- Off senza `sleepCommand` non fa nulla: lo stato viene ripristinato a quello reale.
- Test: `npm test`.
