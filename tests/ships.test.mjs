import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { options, defaultLoadout, stats, bestLoadout, expected, missileKind, ROLES } from "../app/js/ships.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../app/data/${f}`, import.meta.url)));
const { ships } = read("ships.json");
const eq = read("equipment.json");
const ship = (id) => ships.find((s) => s.id === id);

test("Behemoth Vanguard slot layout and stats", () => {
  const s = ship("ship_arg_l_destroyer_01_a_macro");
  assert.equal(s.engineCount, 3);
  assert.equal(s.weapons.length, 2);
  assert.equal(s.turretGroups.length, 6);
  const lo = { ...defaultLoadout(eq, s), engine: "engine_arg_l_travel_01_mk1_macro" };
  const e = eq.engines[lo.engine];
  const st = stats(eq, s, lo);
  assert.equal(st.speed, Math.round(((e.thrust.forward * 3) / s.drag.forward) * 10) / 10);
  assert.equal(st.hull, 93000);
  // 3 main L shields + 2+2+1+1+1+1 M shields in the turret groups
  const l = eq.shields[lo.shield], m = eq.shields[lo.groups[0].shield];
  assert.equal(st.shield, l.capacity * 3 + m.capacity * 8);
});

test("every buyable ship gets a usable default loadout", () => {
  for (const s of ships.filter((x) => x.price > 0)) {
    const lo = defaultLoadout(eq, s);
    if (s.engineCount) assert.ok(lo.engine, `${s.id}: no engine`);
    if (s.shieldCount) assert.ok(lo.shield, `${s.id}: no shield`);
    assert.ok(lo.thruster, `${s.id}: no thruster`);
    const st = stats(eq, s, lo);
    for (const [k, v] of Object.entries(st)) if (!Array.isArray(v)) assert.ok(Number.isFinite(v), `${s.id}: ${k}=${v}`);
    if (s.engineCount) assert.ok(st.speed > 0, `${s.id}: speed 0`);
  }
});

test("compatibility rules", () => {
  const xenon = ships.find((s) => s.race === "xenon" && s.weapons.length);
  for (const [, w] of options(eq, xenon, "weapon", xenon.weapons[0])) assert.equal(w.race, "xenon");
  const boronL = ships.find((s) => s.race === "boron" && s.class === "l");
  for (const [, e] of options(eq, boronL, "engine")) assert.equal(e.race, "boron");
  const argonM = ships.find((s) => s.race === "argon" && s.class === "m" && s.weapons.length);
  const opts = options(eq, argonM, "weapon", argonM.weapons.find((w) => !w.launcher));
  assert.ok(opts.length > 5);
  assert.ok(opts.every(([, w]) => w.type !== "missilelauncher"));
});

test("best setup per role is valid for every buyable ship", () => {
  for (const s of ships.filter((x) => x.price > 0 && x.race !== "xenon" && x.race !== "khaak")) {
    for (const r of ROLES) {
      const lo = bestLoadout(eq, s, r.key);
      const st = stats(eq, s, lo);
      for (const [k, v] of Object.entries(st)) if (!Array.isArray(v)) assert.ok(Number.isFinite(v), `${s.id}/${r.key}: ${k}=${v}`);
      if (s.engineCount) assert.ok(lo.engine, `${s.id}/${r.key}: no engine`);
      // every chosen item must be a legal option for its slot
      s.weapons.forEach((slot, i) => lo.weapons[i] && assert.ok(options(eq, s, "weapon", slot).some(([id]) => id === lo.weapons[i])));
    }
  }
});

test("roles pick what players expect", () => {
  const elite = ships.find((s) => s.id === "ship_arg_s_fighter_02_a_macro");
  const mercury = ships.find((s) => s.id === "ship_arg_m_trans_container_01_a_macro");
  assert.match(eq.thrusters[bestLoadout(eq, elite, "dogfight").thruster].name, /Combat/);
  assert.match(eq.engines[bestLoadout(eq, mercury, "trade").engine].name, /Travel/);
  const pir = bestLoadout(eq, elite, "piracy");
  assert.ok(pir.weapons.some((id) => id && /Ion/.test(eq.weapons[id].name)), "piracy should use ion weapons");
  const behemoth = ships.find((s) => s.id === "ship_arg_l_destroyer_01_a_macro");
  const ac = bestLoadout(eq, behemoth, "anticap");
  const kinds = ac.groups.map((g, i) => behemoth.turretGroups[i].launcher && g.turret && missileKind(eq.turrets[g.turret])).filter(Boolean);
  kinds.forEach((k) => assert.equal(k, "torpedo"));
});

test("expected results are sane", () => {
  const behemoth = ships.find((s) => s.id === "ship_arg_l_destroyer_01_a_macro");
  const elite = ships.find((s) => s.id === "ship_arg_s_fighter_02_a_macro");
  const ex = expected(eq, behemoth, defaultLoadout(eq, behemoth), ships);
  assert.equal(ex.duels.length, 4);
  assert.ok(ex.travel100km > 0 && ex.travel100km < 600);
  assert.ok(ex.cargoPerHour > 0);
  // a destroyer beats a single fighter in a straight damage race
  assert.equal(ex.duels[0].verdict, "win");
  const exE = expected(eq, elite, defaultLoadout(eq, elite), ships);
  assert.equal(exE.duels[2].verdict, "lose");
});
