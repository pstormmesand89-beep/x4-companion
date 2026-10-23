// Ship loadout rules, stat formulas (v9.0, as used by Roguey's ship builder),
// expected combat/travel results and role-based "best setup" recommendations.

const RESTRICTED_RACES = ["xenon", "khaak"];

// Weapons/turrets: Xenon & Kha'ak only use their own; Boron L/XL ships only fit Boron weapons
// (and Boron weapons only fit Boron ships at L/XL).
function weaponRaceOk(ship, item) {
  for (const r of RESTRICTED_RACES) {
    if ((ship.race === r) !== (item.race === r)) return false;
  }
  if (ship.class === "l" || ship.class === "xl") {
    if ((ship.race === "boron") !== (item.race === "boron")) return false;
  }
  return true;
}

// Shields/engines: Boron, Xenon and Kha'ak use only their own and nobody else uses theirs.
function systemRaceOk(ship, item) {
  for (const r of ["boron", ...RESTRICTED_RACES]) {
    if ((ship.race === r) !== (item.race === r)) return false;
  }
  return true;
}

const byMkThenName = (a, b) => (b[1].mk || 0) - (a[1].mk || 0) || a[1].name.localeCompare(b[1].name);

const isMissile = (w) => w.type === "missilelauncher" || w.type === "missileturret";

// Equipment named after one ship (Envoy engines, Behemoth Main Battery, …) only fits that ship.
const SHIP_SPECIFIC = /\b(Envoy|Astrid|Erlking|Behemoth|Hyperion|Odysseus|Phoenix|Rattlesnake|Sapporo|Obliterator|Ravager|Ray Ion)\b/;
function fitsShip(ship, item) {
  const m = item.name.match(SHIP_SPECIFIC);
  if (m && !ship.name.includes(m[1].split(" ")[0])) return false;
  if (/\(Racer\)/.test(item.name) && ship.role !== "racing") return false;
  return true;
}

export function options(eq, ship, kind, slot = {}) {
  return rawOptions(eq, ship, kind, slot).filter(([, o]) => fitsShip(ship, o));
}

function rawOptions(eq, ship, kind, slot) {
  let list = [];
  switch (kind) {
    case "engine":
      list = Object.entries(eq.engines).filter(([, e]) => e.class === ship.class && systemRaceOk(ship, e));
      break;
    case "shield":
      list = Object.entries(eq.shields).filter(([, e]) => e.class === (slot.size || ship.class) && systemRaceOk(ship, e));
      break;
    case "thruster":
      list = Object.entries(eq.thrusters).filter(([, e]) => e.class === ship.class);
      break;
    case "weapon":
      list = Object.entries(eq.weapons).filter(([id, w]) =>
        w.size === slot.size && weaponRaceOk(ship, w) &&
        (slot.launcher ? w.type === "missilelauncher" : w.type !== "missilelauncher") &&
        (slot.compat !== "ship_par_l_expeditionary_01" || id === "weapon_par_l_expeditionary_01_mk1_macro"));
      break;
    case "turret":
      list = Object.entries(eq.turrets).filter(([, t]) =>
        t.size === slot.size && weaponRaceOk(ship, t) &&
        (slot.launcher ? t.type === "missileturret" : t.type === "turret"));
      break;
  }
  return list.sort(byMkThenName);
}

// Missile type fired by a launcher, derived from its name.
export function missileKind(item) {
  if (!item || !isMissile(item)) return null;
  if (/torpedo/i.test(item.name)) return "torpedo";
  if (/tracking|guided/i.test(item.name)) return "tracking";
  return "dumbfire";
}
export const MISSILE_KIND_NL = {
  dumbfire: "Dumbfire (ongeleid)",
  tracking: "Tracking (geleid: Smart, Swarm, Heatseeker, Interceptor, Disruptor…)",
  torpedo: "Torpedo (zwaar, tegen L/XL)",
};

// A sensible starting loadout: the highest Mk of the ship's own race where possible.
export function defaultLoadout(eq, ship) {
  const pick = (list) => {
    const own = list.find(([, e]) => e.race === ship.race);
    return (own || list[0] || [null])[0];
  };
  const launcher = (list) => (list.find(([, w]) => missileKind(w) === "tracking") || list[0] || [null])[0];
  return {
    engine: pick(options(eq, ship, "engine")),
    shield: pick(options(eq, ship, "shield")),
    thruster: pick(options(eq, ship, "thruster")),
    weapons: ship.weapons.map((s) => (s.launcher ? launcher : pick)(options(eq, ship, "weapon", s))),
    turrets: ship.turrets.map((s) => (s.launcher ? launcher : pick)(options(eq, ship, "turret", s))),
    groups: ship.turretGroups.map((g) => ({
      turret: g.turretCount
        ? (g.launcher ? launcher : pick)(options(eq, ship, "turret", { size: g.turretSize, launcher: g.launcher }))
        : null,
      shield: g.shieldCount ? pick(options(eq, ship, "shield", { size: g.shieldSize })) : null,
    })),
  };
}

const round1 = (x) => Math.round(x * 10) / 10;

export function stats(eq, ship, lo) {
  const s = {
    hull: ship.hull, cargo: ship.cargo, crew: ship.crew, mass: ship.mass,
    docks: ship.docks, hangar: ship.hangar,
    speed: 0, reverse: 0, boost: 0, boostTime: 0, boostDistance: 0, travel: 0, accel: 0, travelCharge: 0,
    shield: 0, shieldRecharge: 0, shieldDelay: 0, shieldFullTime: 0,
    burstDps: 0, sustainedDps: 0, antiSmallDps: 0, missileDps: 0, maxRange: 0, minRange: 0, projectileSpeed: 0,
    yaw: 0, pitch: 0, roll: 0, price: ship.price,
    weaponSlots: 0, turretSlots: 0, missileSlots: 0, missileKinds: [],
  };
  const e = eq.engines[lo.engine];
  if (e) {
    const thrust = e.thrust.forward * ship.engineCount;
    s.speed = round1(thrust / ship.drag.forward);
    s.reverse = round1((e.thrust.reverse * ship.engineCount) / ship.drag.reverse);
    s.boost = round1((thrust * e.boost.thrust) / ship.drag.forward);
    s.boostTime = e.boost.duration;
    s.boostDistance = Math.round(s.boost * e.boost.duration);
    s.travel = round1((thrust * e.travel.thrust) / ship.drag.forward);
    s.accel = round1((thrust / ship.mass) * (ship.accfactors?.forward ?? 1));
    s.travelCharge = e.travel.time;
    s.price += e.price * ship.engineCount;
  }
  const t = eq.thrusters[lo.thruster];
  if (t) {
    s.yaw = round1(t.yaw / ship.drag.yaw);
    s.pitch = round1(t.pitch / ship.drag.pitch);
    s.roll = round1(t.roll / ship.drag.roll);
    s.price += t.price;
  }
  const delays = [];
  const addShield = (id, count) => {
    const sh = eq.shields[id];
    if (!sh || !count) return;
    s.shield += sh.capacity * count;
    s.shieldRecharge += sh.recharge * count;
    s.price += sh.price * count;
    delays.push(sh.delay / 10);
  };
  addShield(lo.shield, ship.shieldCount);
  const guns = [];
  const kinds = new Set();
  const addGun = (w, count = 1) => {
    if (!w || !count) return;
    s.price += w.price * count;
    if (isMissile(w)) {
      s.missileDps += w.burstDps * count;
      kinds.add(missileKind(w));
      return;
    }
    s.burstDps += w.burstDps * count;
    s.sustainedDps += (w.sustainedDps || w.burstDps) * count;
    // capital main batteries cannot track S/M ships
    if (w.group !== "capital") s.antiSmallDps += (w.sustainedDps || w.burstDps) * count;
    guns.push(w);
  };
  ship.weapons.forEach((slot, i) => {
    if (slot.launcher) s.missileSlots++;
    else s.weaponSlots++;
    addGun(eq.weapons[lo.weapons?.[i]]);
  });
  ship.turrets.forEach((slot, i) => {
    if (slot.launcher) s.missileSlots++;
    else s.turretSlots++;
    addGun(eq.turrets[lo.turrets?.[i]]);
  });
  ship.turretGroups.forEach((g, i) => {
    const sel = lo.groups?.[i] || {};
    if (g.launcher) s.missileSlots += g.turretCount;
    else s.turretSlots += g.turretCount;
    addGun(eq.turrets[sel.turret], g.turretCount);
    addShield(sel.shield, g.shieldCount);
  });
  s.shieldDelay = delays.length ? Math.max(...delays) : 0;
  s.shieldFullTime = s.shieldRecharge ? round1(s.shieldDelay + s.shield / s.shieldRecharge) : 0;
  if (guns.length) {
    s.maxRange = Math.max(...guns.map((g) => g.range));
    s.minRange = Math.min(...guns.map((g) => g.range));
    const finite = guns.filter((g) => g.speed < 1e6);
    s.projectileSpeed = finite.length ? Math.round(finite.reduce((a, g) => a + g.speed, 0) / finite.length) : 0;
  }
  s.missileKinds = [...kinds];
  s.burstDps = round1(s.burstDps);
  s.sustainedDps = round1(s.sustainedDps);
  s.antiSmallDps = round1(s.antiSmallDps);
  s.missileDps = round1(s.missileDps);
  s.ehp = s.hull + s.shield;
  return s;
}

// ---------------------------------------------------------------- expected results

export const REFERENCE_TARGETS = [
  { id: "ship_arg_s_fighter_02_a_macro", label: "S-jager (Elite)" },
  { id: "ship_par_m_corvette_01_a_macro", label: "M-korvet (Nemesis)" },
  { id: "ship_arg_l_destroyer_01_a_macro", label: "L-destroyer (Behemoth)" },
  { id: "ship_arg_xl_carrier_01_a_macro", label: "XL-carrier (Colossus)" },
];

/**
 * Theoretical outcomes: 100% hits, no damage modifiers, no AI behaviour.
 * Duel times use sustained gun + turret DPS (missiles excluded: limited ammo);
 * capital main batteries are left out against S/M targets.
 */
export function expected(eq, ship, lo, ships) {
  const me = stats(eq, ship, lo);
  const duels = REFERENCE_TARGETS.map((ref) => {
    const target = ships.find((s) => s.id === ref.id);
    if (!target) return null;
    const them = stats(eq, target, defaultLoadout(eq, target));
    const dpsVs = (st, cls) => (cls === "s" || cls === "m" ? st.antiSmallDps : st.sustainedDps);
    const myDps = dpsVs(me, target.class), theirDps = dpsVs(them, ship.class);
    const youKill = myDps ? them.ehp / myDps : Infinity;
    const theyKill = theirDps ? me.ehp / theirDps : Infinity;
    const ratio = theyKill / youKill;
    return {
      label: ref.label, youKill, theyKill,
      verdict: ratio > 1.25 ? "win" : ratio < 0.8 ? "lose" : "even",
    };
  }).filter(Boolean);
  const leg = (km) => (me.travel ? me.travelCharge + (km * 1000) / me.travel : Infinity);
  const DOCK = 90; // seconds docking + trading per stop (estimate)
  const roundTrip = 2 * leg(100) + 2 * DOCK;
  return {
    duels,
    travel100km: leg(100),
    cargoPerHour: me.cargo && Number.isFinite(roundTrip) ? (me.cargo * 3600) / roundTrip : 0,
    shieldFullTime: me.shieldFullTime,
    boostDistance: me.boostDistance,
  };
}

// ---------------------------------------------------------------- roles

const engineKind = (e) => (/travel/i.test(e.name) ? "travel" : /combat/i.test(e.name) ? "combat" : "allround");
const accuracy = (w) => Math.min(1, w.speed / 2500) ** 0.5; // fast projectiles hit agile targets
const isTool = (w) => w.group === "mining" || /tractor/i.test(w.name);

export const ROLES = [
  {
    key: "dogfight", label: "Dogfight", shipRoles: ["fight"],
    why: [
      "Combat-motoren: de hoogste stuwkracht en boost, zodat je bijblijft in een bochtengevecht.",
      "Combat-thrusters (S/M) voor maximale draaisnelheid: wie het snelst draait, schiet het eerst.",
      "Wapens met hoge DPS én snelle projectielen (of beams): die raken wendbare jagers ook.",
      "Schild met snel herstel: tussen aanvallen door laadt het bij.",
      "Raketwerpers met tracking-raketten (Smart/Swarm) tegen jagers.",
    ],
    engine: (e) => e.thrust.forward * (1 + 0.6 * e.boost.thrust) * (engineKind(e) === "combat" ? 1.15 : 1),
    shield: (s) => s.capacity + 25 * s.recharge,
    thruster: (t) => t.yaw + t.pitch + (/combat/i.test(t.name) ? 1e6 : 0),
    weapon: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w)),
    turret: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w) * (/flak/i.test(w.name) ? 1.3 : 1)),
    missile: "tracking",
  },
  {
    key: "piracy", label: "Piraterij", shipRoles: ["fight"],
    why: [
      "Ion-wapens halen schilden snel neer maar doen weinig rompschade: het doel blijft heel, zodat de bemanning uitstapt of je kunt enteren.",
      "Travel- en boostsnelheid zijn belangrijk om handelsschepen in te halen en af te snijden.",
      "Tracking-werpers: laad Interceptor-raketten (haalt doelen uit travel mode) of Disruptors (legt motoren stil).",
      "Sterk schild: politie en escortes komen af op je aanval.",
    ],
    engine: (e) => e.thrust.forward * (0.5 * e.travel.thrust + 0.5 * e.boost.thrust) / (1 + e.travel.time / 20),
    shield: (s) => s.capacity + 15 * s.recharge,
    thruster: (t) => t.yaw + t.pitch + (/combat/i.test(t.name) ? 1e6 : 0),
    weapon: (w) => (isTool(w) ? -1 : (/ion/i.test(w.name) ? 1e6 : 0) + w.burstDps * accuracy(w)),
    turret: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w) * (/ion/i.test(w.name) ? 2 : 1)),
    missile: "tracking",
  },
  {
    key: "anticap", label: "Anti-capital", shipRoles: ["fight"],
    why: [
      "Tegen L/XL-schepen telt pure schade op afstand: zware wapens en turrets (plasma, main batteries) met groot bereik.",
      "Torpedo-werpers voor maximale schade per salvo tegen grote, trage doelen.",
      "All-round motoren: genoeg snelheid om te positioneren zonder in te leveren op stuwkracht.",
      "Schilden met de hoogste capaciteit: grote schepen doen veel schade per treffer.",
    ],
    engine: (e) => e.thrust.forward * (1 + 0.2 * e.travel.thrust) * (engineKind(e) === "allround" ? 1.1 : 1),
    shield: (s) => s.capacity + 10 * s.recharge,
    thruster: (t) => t.yaw + t.pitch,
    weapon: (w) => (isTool(w) ? -1 : (w.sustainedDps || w.burstDps) * (1 + w.range / 10)),
    turret: (w) => (isTool(w) ? -1 : (w.sustainedDps || w.burstDps) * (1 + w.range / 10)),
    missile: "torpedo",
  },
  {
    key: "trade", label: "Handel", shipRoles: ["trade"],
    why: [
      "Travel-motoren: de hoogste travel-snelheid betekent meer ritten per uur, en dus meer winst.",
      "Schild met de grootste capaciteit om een aanval te overleven tot je kunt wegspringen.",
      "Turrets tegen jagers (flak of snelle turrets): piraten zijn bijna altijd S/M-schepen.",
      "Wendbaarheid doet er weinig toe; neem de zuinigste thrusters.",
    ],
    engine: (e) => e.thrust.forward * e.travel.thrust / (1 + e.travel.time / 30),
    shield: (s) => s.capacity + 5 * s.recharge,
    thruster: (t) => -t.price,
    weapon: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w)),
    turret: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w) * (/flak/i.test(w.name) ? 1.5 : 1)),
    missile: "tracking",
  },
  {
    key: "mining", label: "Mijnbouw", shipRoles: ["mine"],
    why: [
      "Travel-motoren: de meeste tijd gaat op aan heen en weer vliegen tussen veld en station.",
      "Mijnbouw-turrets/drills waar het schip ze kan dragen; de overige plekken tegen jagers.",
      "Groot schild: Xenon en piraten jagen op mijnschepen.",
    ],
    engine: (e) => e.thrust.forward * e.travel.thrust / (1 + e.travel.time / 30),
    shield: (s) => s.capacity + 5 * s.recharge,
    thruster: (t) => -t.price,
    weapon: (w) => (w.group === "mining" ? 1e9 + w.burstDps : /tractor/i.test(w.name) ? -1 : w.burstDps * accuracy(w)),
    turret: (w) => (w.group === "mining" ? 1e9 + w.burstDps : /tractor/i.test(w.name) ? -1 : w.burstDps * accuracy(w)),
    missile: "tracking",
  },
  {
    key: "explore", label: "Verkennen", shipRoles: ["fight", "trade", "auxiliary", "racing"],
    why: [
      "Maximale travel-snelheid en korte oplaadtijd om snel sectoren in kaart te brengen.",
      "Hoge boost om uit gevaarlijke situaties te ontsnappen.",
      "Wapens zijn bijzaak; snelle, lichte wapens voor zelfverdediging.",
    ],
    engine: (e) => e.thrust.forward * (e.travel.thrust + 0.3 * e.boost.thrust) / (1 + e.travel.time / 15),
    shield: (s) => s.capacity + 15 * s.recharge,
    thruster: (t) => t.yaw + t.pitch,
    weapon: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w)),
    turret: (w) => (isTool(w) ? -1 : w.burstDps * accuracy(w)),
    missile: "tracking",
  },
];

// Best loadout for a role: per slot the option with the highest role score.
export function bestLoadout(eq, ship, roleKey) {
  const role = ROLES.find((r) => r.key === roleKey);
  const best = (list, score) => {
    let top = null, topScore = -Infinity;
    for (const [id, o] of list) {
      const v = score(o);
      if (v > topScore) { top = id; topScore = v; }
    }
    return topScore < 0 && score !== role.thruster ? null : top;
  };
  const launcher = (list) =>
    (list.filter(([, w]) => missileKind(w) === role.missile).sort((a, b) => b[1].burstDps - a[1].burstDps)[0] ||
      list.sort((a, b) => b[1].burstDps - a[1].burstDps)[0] || [null])[0];
  const fill = (kind, slot, score) => {
    const list = options(eq, ship, kind, slot);
    return slot.launcher ? launcher(list) : best(list, score);
  };
  return {
    engine: best(options(eq, ship, "engine"), role.engine),
    shield: best(options(eq, ship, "shield"), role.shield),
    thruster: best(options(eq, ship, "thruster"), role.thruster),
    weapons: ship.weapons.map((s) => fill("weapon", s, role.weapon)),
    turrets: ship.turrets.map((s) => fill("turret", s, role.turret)),
    groups: ship.turretGroups.map((g) => ({
      turret: g.turretCount ? fill("turret", { size: g.turretSize, launcher: g.launcher }, role.turret) : null,
      shield: g.shieldCount ? best(options(eq, ship, "shield", { size: g.shieldSize }), role.shield) : null,
    })),
  };
}

// ---------------------------------------------------------------- stat list

export const STAT_DEFS = [
  { key: "hull", label: "Romp", unit: "MJ", radar: true },
  { key: "shield", label: "Schild", unit: "MJ", radar: true },
  { key: "shieldRecharge", label: "Schild herstel", unit: "/s" },
  { key: "shieldFullTime", label: "Schild 0→vol", unit: "s", lowerIsBetter: true },
  { key: "burstDps", label: "DPS (burst)", unit: "", radar: true },
  { key: "sustainedDps", label: "DPS (sustained)", unit: "" },
  { key: "missileDps", label: "Raket-DPS", unit: "" },
  { key: "maxRange", label: "Max. wapenbereik", unit: "km", decimals: 1 },
  { key: "speed", label: "Topsnelheid", unit: "m/s", radar: true },
  { key: "reverse", label: "Achteruit", unit: "m/s" },
  { key: "boost", label: "Boost", unit: "m/s" },
  { key: "boostDistance", label: "Boost-afstand", unit: "m" },
  { key: "travel", label: "Travel", unit: "m/s", radar: true },
  { key: "travelCharge", label: "Travel oplaadtijd", unit: "s", lowerIsBetter: true, decimals: 1 },
  { key: "accel", label: "Acceleratie", unit: "m/s²", decimals: 1 },
  { key: "yaw", label: "Draaien (yaw)", unit: "°/s", radar: true, decimals: 1 },
  { key: "pitch", label: "Pitch", unit: "°/s", decimals: 1 },
  { key: "roll", label: "Roll", unit: "°/s", decimals: 1 },
  { key: "cargo", label: "Laadruimte", unit: "m³", radar: true },
  { key: "crew", label: "Crew", unit: "" },
  { key: "docks", label: "Docks", unit: "" },
  { key: "hangar", label: "Hangar", unit: "" },
  { key: "mass", label: "Massa", unit: "t", lowerIsBetter: true, decimals: 1 },
  { key: "price", label: "Prijs (incl. uitrusting)", unit: "Cr", lowerIsBetter: true },
];
