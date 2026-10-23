import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute, recipeFor, ratePerModule } from "../app/js/production.js";

const economy = JSON.parse(readFileSync(new URL("../app/data/economy.json", import.meta.url)));
const row = (res, w) => res.rows.find((r) => r.ware === w) || res.raw.find((r) => r.ware === w);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("known v9.0 recipes", () => {
  close(ratePerModule(recipeFor(economy, "microchips")), 432);
  close(ratePerModule(recipeFor(economy, "energycells")), 10500);
  close(ratePerModule(recipeFor(economy, "hullparts")), 1176);
});

test("1 microchip module chain", () => {
  const res = compute(economy, [{ ware: "microchips", modules: 1 }]);
  assert.equal(row(res, "microchips").modules, 1);
  close(row(res, "microchips").net, 432);
  // 1200 wafers/h needed, one wafer module makes 2140/h
  assert.equal(row(res, "siliconwafers").modules, 1);
  close(row(res, "siliconwafers").net, 2140 - 1200);
  // energy: 300 (chips) + 1800 (wafers)
  close(row(res, "energycells").consumption, 2100);
  assert.equal(row(res, "energycells").modules, 1);
  close(row(res, "silicon").consumption, 4800);
});

test("modules are rounded up and the surplus shows up", () => {
  const res = compute(economy, [{ ware: "microchips", modules: 10 }]);
  // 12000 wafers/h -> 12000/2140 = 5.6 -> 6 modules
  assert.equal(row(res, "siliconwafers").modules, 6);
  for (const r of res.rows) assert.ok(r.net >= -1e-6, `${r.ware} short`);
});

test("bought wares are not produced", () => {
  const res = compute(economy, [{ ware: "microchips", modules: 2 }], { buy: ["siliconwafers"] });
  assert.equal(res.rows.find((r) => r.ware === "siliconwafers"), undefined);
  assert.ok(res.raw.find((r) => r.ware === "siliconwafers").bought);
  assert.equal(res.raw.find((r) => r.ware === "silicon"), undefined);
});

test("teladi method uses teladianium", () => {
  const res = compute(economy, [{ ware: "hullparts", modules: 1 }], { methods: { hullparts: "teladi" } });
  assert.ok(row(res, "teladianium").modules > 0);
  assert.equal(row(res, "refinedmetals"), undefined);
});

test("every recipe input is a known ware and all chains resolve", () => {
  for (const r of economy.recipes) {
    for (const i of Object.keys(r.inputs)) assert.ok(economy.wares[i], `${r.ware}: ${i}`);
    const res = compute(economy, [{ ware: r.ware, modules: 3 }], { methods: { [r.ware]: r.method } });
    for (const x of res.rows) assert.ok(x.net >= -1e-6, `${r.ware}/${r.method}: ${x.ware} short`);
  }
});

test("sunlight and workforce", () => {
  const ec = recipeFor(economy, "energycells");
  close(ratePerModule(ec, { sunlight: 0.5 }), 5250);
  close(ratePerModule(recipeFor(economy, "microchips"), { workforceBonus: 0.25 }), 540);
});

test("profit per module: sales price varies, inputs at own price level", () => {
  const w = economy.wares;
  const lowAll = compute(economy, [{ ware: "microchips", modules: 1 }], { pricePos: 0 });
  // Roguey lists 128,760 Cr/h for a microchip module at minimum prices
  close(row(lowAll, "microchips").profitPerModule.low, 128760);
  const res = compute(economy, [{ ware: "microchips", modules: 1 }], { ownPrices: { microchips: 1000 } });
  const mc = row(res, "microchips");
  const mid = (x) => (w[x].price.min + w[x].price.max) / 2;
  const inputs = 300 * mid("energycells") + 1200 * mid("siliconwafers");
  close(mc.profitPerModule.low, 432 * w.microchips.price.min - inputs);
  close(mc.profitPerModule.own, 432 * 1000 - inputs);
  close(mc.profitPerModule.high, 432 * w.microchips.price.max - inputs);
  assert.ok(res.totals.profit.high > res.totals.profit.own && res.totals.profit.own > res.totals.profit.low);
});
