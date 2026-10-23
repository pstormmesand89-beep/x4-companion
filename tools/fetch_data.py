"""Fetch X4: Foundations community data and build the app's JSON data files.

Sources
  - Roguey's X4 site (https://roguey.co.uk/x4/): wares, default production
    recipes, ships with slot layouts, engines, shields, thrusters, weapons, turrets.
  - LostDaemon's X4 Tech Explorer (MIT, https://github.com/LostDaemon/x4_foundation_tech):
    alternative production methods (Teladi, Paranid, Boron, Terran, recycling).

Usage
  python -I tools/fetch_data.py --cache <download dir> --out app/data

Downloaded pages are cached in --cache, so re-running only fetches what is missing.
Delete the cache dir to refresh after a game update.
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jslit import parse_var  # noqa: E402

ROGUEY = "https://roguey.co.uk/x4"
LOSTDAEMON = "https://raw.githubusercontent.com/LostDaemon/x4_foundation_tech/HEAD/maps/common.json"
UA = "X4-Companion-personal-data-fetch/1.0"
DELAY = 0.6

ECONOMY_GROUPS = {"agricultural", "energy", "food", "gases", "hightech", "ice", "minerals",
                  "pharmaceutical", "refined", "shiptech", "water"}
RAW_RESOURCES = {"ore", "silicon", "ice", "nividium", "hydrogen", "helium", "methane",
                 "rawscrap", "rawkhaakscrap"}

# LostDaemon product id -> (roguey ware id, method). Only alternative methods
# are taken from LostDaemon; default recipes come from Roguey.
ALT_METHODS = {
    "hull_parts_teladi": ("hullparts", "teladi"),
    "engine_parts_teladi": ("engineparts", "teladi"),
    "advanced_composites_teladi": ("advancedcomposites", "teladi"),
    "scanning_arrays_teladi": ("scanningarrays", "teladi"),
    "medical_supplies_teladi": ("medicalsupplies", "teladi"),
    "medical_supplies_paranid": ("medicalsupplies", "paranid"),
    "medical_supplies_boron": ("medicalsupplies", "boron"),
    "medical_supplies_terrain": ("medicalsupplies", "terran"),
    "hull_parts_scrap": ("hullparts", "recycling"),
    "claytronics_scrap": ("claytronics", "recycling"),
    "computronic_substrate_scrap": ("computronicsubstrate", "recycling"),
    "silicon_carbide_scrap": ("siliconcarbide", "recycling"),
}
LD_IDS = {  # LostDaemon ware ids that differ from Roguey's after removing underscores
    "nostorop_oil": "nostropoil", "unprocessed_scrap_metal": "rawscrap",
    "unprocessed_allographene_scrap": "rawkhaakscrap", "allographene_fragments": "khaakscrapmetal",
    "allographene": "khaakalloy", "food_rations_argon": "foodrations",
    "food_rations_terrain": "terranmre", "medical_supplies_argon": "medicalsupplies",
}
METHOD_LABELS = {"default": "Standaard", "teladi": "Teladi", "paranid": "Paranid",
                 "boron": "Boron", "terran": "Terran", "recycling": "Recycling (schroot)"}
RACES = {"arg": "argon", "par": "paranid", "tel": "teladi", "spl": "split", "ter": "terran",
         "bor": "boron", "gen": "generic", "xen": "xenon", "pir": "pirate"}


def fetch(url, path):
    if os.path.exists(path):
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read().decode("utf-8", errors="replace")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(data)
    time.sleep(DELAY)
    return data


def page_text(raw):
    body = raw[raw.find("<body"):]
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    txt = re.sub(r"<[^>]+>", "|", body)
    txt = html.unescape(txt)
    return re.sub(r"\s*\|[\s|]*", "|", txt)


def parse_duration(s):
    secs = 0
    for n, unit in re.findall(r"(\d+)\s*(hour|min|sec)", s):
        secs += int(n) * {"hour": 3600, "min": 60, "sec": 1}[unit]
    return secs


def parse_ware_recipe(raw, name_to_id, ware_id):
    txt = page_text(raw)
    if "|Production cycle|" not in txt:
        return None
    res = txt.split("|Primary resources|", 1)[1].split("|Production cycle|", 1)[0] if "|Primary resources|" in txt else ""
    inputs = {}
    for qty, name in re.findall(r"\|(\d[\d,]*) x\|?\s*([^|]+)", "|" + res):
        wid = name_to_id.get(name.strip().lower())
        if not wid:
            raise ValueError(f"{ware_id}: unknown input ware {name!r}")
        inputs[wid] = int(qty.replace(",", ""))
    if res.strip("|") and not inputs:
        raise ValueError(f"{ware_id}: resources listed but none parsed")
    cyc = txt.split("|Production cycle|", 1)[1]
    m_time = re.search(r"\|Cycle time\|([^|]+)", cyc)
    m_amt = re.search(r"\|Batch size\|(\d[\d,]*) units", cyc)
    if not (m_time and m_amt):
        raise ValueError(f"{ware_id}: cannot parse production cycle")
    return {"time": parse_duration(m_time.group(1)), "amount": int(m_amt.group(1).replace(",", "")),
            "inputs": inputs}


def unescape_all(v):
    """Decode HTML entities (e.g. '&#40;Gas&#41;') in every string of a parsed cache."""
    if isinstance(v, dict):
        return {k: unescape_all(x) for k, x in v.items()}
    if isinstance(v, list):
        return [unescape_all(x) for x in v]
    return html.unescape(v) if isinstance(v, str) else v


def ld_id(pid):
    return LD_IDS.get(pid, pid.replace("_", ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    C = a.cache

    def cache(name, var, url):
        return unescape_all(parse_var(fetch(url, os.path.join(C, name)), var))

    ware_data = cache("x4_wares.js", "ware_data", f"{ROGUEY}/wares/cache/x4_wares.js")
    ship_data = cache("x4_ships.js", "ship_data", f"{ROGUEY}/ships/cache/x4_ships.js")
    engines = cache("x4_engines.js", "engine_data", f"{ROGUEY}/engines/cache/x4_engines.js")
    shields = cache("x4_shields.js", "shield_data", f"{ROGUEY}/shields/cache/x4_shields.js")
    thrusters = cache("x4_thrusters.js", "thruster_data", f"{ROGUEY}/thrusters/cache/x4_thrusters.js")
    weapons = cache("x4_weapons.js", "weapon_data", f"{ROGUEY}/weapons/cache/x4_weapons.js")
    turrets = cache("x4_turrets.js", "turret_data", f"{ROGUEY}/weapons/cache/x4_turrets.js")
    lostdaemon = json.loads(fetch(LOSTDAEMON, os.path.join(C, "lostdaemon_common.json")).lstrip("﻿"))

    def price(wid):
        w = ware_data.get(wid.replace("_macro", ""))
        return w["price_avg"] if w else 0

    # ---------------- wares + recipes ----------------
    eco = {k: v for k, v in ware_data.items() if v["wgroup"] in ECONOMY_GROUPS}
    name_to_id = {v["wname"].lower(): k for k, v in eco.items()}
    wares, recipes = {}, []
    for wid, w in eco.items():
        wares[wid] = {"name": w["wname"], "group": w["wgroup"], "transport": w["wtype"],
                      "volume": w["volume"], "dlc": w["dlc"], "raw": wid in RAW_RESOURCES,
                      "price": {"min": w["price_min"], "avg": w["price_avg"], "max": w["price_max"]}}
        if wid in RAW_RESOURCES:
            continue
        print("ware", wid, file=sys.stderr)
        r = parse_ware_recipe(fetch(f"{ROGUEY}/wares/{wid}/", os.path.join(C, "wares", wid + ".html")),
                              name_to_id, wid)
        if r:
            recipes.append({"ware": wid, "method": "default", **r})

    for p in lostdaemon["products"]:
        if p["id"] not in ALT_METHODS:
            continue
        wid, method = ALT_METHODS[p["id"]]
        inputs = {}
        for x in p["precursors"]:
            iid = ld_id(x["id"])
            if iid not in wares:
                raise ValueError(f"LostDaemon {p['id']}: unknown input {x['id']}")
            inputs[iid] = x["cycleConsumption"]
        recipes.append({"ware": wid, "method": method, "time": p["cycleDuration"],
                        "amount": p["cycleProduction"], "inputs": inputs, "source": "lostdaemon"})

    # cross-check Roguey default recipes against LostDaemon where both exist, and
    # fill wares Roguey shows no recipe for (e.g. energy cells, which have no inputs)
    by_default = {r["ware"]: r for r in recipes if r["method"] == "default"}
    for p in lostdaemon["products"]:
        wid = ld_id(p["id"])
        r = by_default.get(wid)
        if not r and wid in wares and not wares[wid]["raw"] and p.get("cycleDuration") and p["id"] not in ALT_METHODS:
            recipes.append({"ware": wid, "method": "default", "time": p["cycleDuration"],
                            "amount": p["cycleProduction"], "source": "lostdaemon",
                            "inputs": {ld_id(x["id"]): x["cycleConsumption"] for x in p["precursors"]}})
            print(f"INFO {wid}: recipe taken from LostDaemon", file=sys.stderr)
        elif r and p.get("cycleDuration") and p["id"] not in ALT_METHODS:
            if (r["time"], r["amount"]) != (p["cycleDuration"], p["cycleProduction"]):
                print(f"WARN {wid}: roguey {r['time']}s/{r['amount']} vs lostdaemon "
                      f"{p['cycleDuration']}s/{p['cycleProduction']}", file=sys.stderr)

    # production modules per ware (for names and build cost)
    modules = {}
    for mid, m in ware_data.items():
        mm = re.match(r"module_([a-z]+)_prod_([a-z]+)_01$", mid)
        if mm and mm.group(2) in wares:
            modules.setdefault(mm.group(2), []).append(
                {"id": mid, "name": m["wname"], "race": RACES.get(mm.group(1), mm.group(1)),
                 "price": m["price_avg"]})
    for r in recipes:
        r["label"] = METHOD_LABELS[r["method"]]

    # ---------------- ships ----------------
    ships = []
    for sid, s in ship_data.items():
        print("ship", sid, file=sys.stderr)
        raw = fetch(f"{ROGUEY}/ships/{sid}/", os.path.join(C, "ships", sid + ".html"))
        d = parse_var(raw[raw.find("important stats for ship stats"):], "ship_data")
        ships.append({
            "id": sid, "name": s["sname"], "class": s["sclass"], "race": s["maker_race"],
            "role": s["role"], "dlc": s["dlc"], "price": s["sprice"], "hull": s["hull"],
            "mass": s["mass"], "cargo": s["cargobay_max"], "crew": s["crew"],
            "docks": s["dock_count"], "hangar": s["hangar_count"],
            "drag": s["hull_drag"], "accfactors": s["accfactors"], "inertia": d.get("inertia"),
            "engineCount": d["engine_count"], "shieldCount": d["shield_count"],
            "weapons": [{"size": w["size"], "launcher": bool(w["mlauncher"]), "compat": w["compatibility"]}
                        for w in d["weapons"].values()],
            "turrets": [{"size": t["size"], "launcher": bool(t["mlauncher"])} for t in d["turrets"].values()],
            "turretGroups": [{"name": g["name"], "launcher": bool(g["mlauncher"]),
                              "turretSize": g["turret_size"], "turretCount": int(g["turret_count"] or 0),
                              "shieldSize": g["shield_size"], "shieldCount": int(g["shield_count"] or 0)}
                             for g in d["turretgroups"].values()],
        })

    equipment = {
        "engines": {k: {"name": e["ename"], "class": e["eclass"], "race": e["maker_race"], "mk": e["mk"],
                        "dlc": e["dlc"], "thrust": e["thrust"], "travel": e["travel"], "boost": e["boost"],
                        "price": price(k)} for k, e in engines.items()},
        "shields": {k: {"name": e["sname"], "class": e["sclass"], "race": e["maker_race"], "mk": e["mk"],
                        "dlc": e["dlc"], "capacity": e["shield_strength"], "recharge": e["recharge_rate"],
                        "delay": e["recharge_delay"], "price": price(k)} for k, e in shields.items()},
        "thrusters": {k: {"name": e["tname"], "class": e["tclass"], "dlc": e["dlc"], "pitch": e["pitch"],
                          "yaw": e["yaw"], "roll": e["roll"], "price": price(k)} for k, e in thrusters.items()},
        "weapons": {k: {"name": e["name"], "size": e["size"], "type": e["type"], "race": e["maker_race"],
                        "dlc": e["dlc"], "group": e["group"], "range": e["range"], "speed": e["speed"],
                        "burstDps": e["burst_dps"], "sustainedDps": e["sustained_dps"], "price": price(k)}
                    for k, e in weapons.items()},
        "turrets": {k: {"name": e["name"], "size": e["size"], "type": e["type"], "race": e["maker_race"],
                        "dlc": e["dlc"], "group": e["group"], "range": e["range"], "speed": e["speed"],
                        "burstDps": e["burst_dps"], "sustainedDps": e["sustained_dps"], "price": price(k)}
                    for k, e in turrets.items()},
    }

    os.makedirs(a.out, exist_ok=True)
    meta = {"gameVersion": "9.0", "generated": time.strftime("%Y-%m-%d"),
            "sources": ["roguey.co.uk/x4", "github.com/LostDaemon/x4_foundation_tech (MIT)"]}
    for name, obj in [("economy.json", {"meta": meta, "wares": wares, "recipes": recipes, "modules": modules}),
                      ("ships.json", {"meta": meta, "ships": ships}),
                      ("equipment.json", {"meta": meta, **equipment})]:
        with open(os.path.join(a.out, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"done: {len(wares)} wares, {len(recipes)} recipes, {len(ships)} ships", file=sys.stderr)


if __name__ == "__main__":
    main()
