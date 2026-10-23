# X4 Companion

Offline telefoon-app (PWA) voor **X4: Foundations v9.0 + alle DLC's**:

- **Station** – kies hoeveel productiemodules je van een product bouwt; de app rekent uit hoeveel
  modules je van elk onderliggend product nodig hebt om 100% zelfvoorzienend te zijn, wat je
  overhoudt per uur, welke grondstoffen je moet minen, bouwkosten en waarde van het overschot.
  Opties: productiemethode per ras (Teladi/Paranid/Boron/Terran/recycling), inkopen i.p.v. maken,
  zonlicht in de sector, workforce-bonus. Winst per module en per station bij laagste, eigen en
  hoogste verkoopprijs (eigen prijs per product in te stellen), plus terugverdientijd. Plannen opslaan.
- **Schepen** – alle schepen met hun echte slot-indeling; motoren, schilden, thrusters, wapens,
  turrets en turret-groepen mixen & matchen met live stats (24 stats, raket-type per werper).
  "Beste setup" per rol (dogfight, piraterij, anti-capital, handel, mijnbouw, verkennen) met uitleg,
  en verwachte resultaten (duels tegen S/M/L/XL-referentieschepen, reistijd, vracht per uur). Loadouts opslaan.
- **Vergelijk** – radar (max. 3 setups) plus alle waarden naast elkaar, beste waarde groen gemarkeerd.

## Mappen

| Map | Inhoud |
|---|---|
| `app/` | De app zelf (statische bestanden, dit wordt gepubliceerd) |
| `app/data/` | Gegenereerde speldata (`economy.json`, `ships.json`, `equipment.json`) |
| `tools/fetch_data.py` | Haalt community-data op en bouwt de JSON |
| `tests/` | Tests voor de rekenkern (`node --test tests/`) |

## Data verversen (na een game-update)

```bash
python -I tools/fetch_data.py --cache .cache/roguey --out app/data
node --test tests/*.test.mjs
```

Verhoog daarna `VERSION` in `app/sw.js` zodat telefoons de nieuwe data ophalen.

## Lokaal draaien

```bash
python -m http.server 8780 --directory app
```

## Bronnen

- [Roguey's X4 site](https://roguey.co.uk/x4/) – wares, standaardrecepten, schepen en uitrusting (v9.0)
- [LostDaemon X4 Tech Explorer](https://github.com/LostDaemon/x4_foundation_tech) (MIT) – alternatieve productiemethodes

Rekenformules voor schepen volgen de v9.0-formules van Roguey's ship builder
(snelheid = thrust × motoren / drag, enz.).
