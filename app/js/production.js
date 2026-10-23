// Station production calculator.
//
// Given a number of production modules for one or more target wares, works out
// how many modules of every intermediate ware are needed to be fully
// self-sufficient, and the resulting surplus per ware.

const HOUR = 3600;

export function recipeFor(economy, ware, method = "default") {
  const all = economy.recipes.filter((r) => r.ware === ware);
  return all.find((r) => r.method === method) || all.find((r) => r.method === "default") || all[0] || null;
}

export function methodsFor(economy, ware) {
  return economy.recipes.filter((r) => r.ware === ware);
}

// Output per module per hour, including workforce bonus and (for energy cells) sunlight.
export function ratePerModule(recipe, opts = {}) {
  let rate = (recipe.amount * HOUR) / recipe.time;
  rate *= 1 + (opts.workforceBonus || 0);
  if (recipe.ware === "energycells" && Object.keys(recipe.inputs).length === 0) {
    rate *= opts.sunlight ?? 1;
  }
  return rate;
}

/**
 * @param economy  parsed economy.json
 * @param targets  [{ware, modules}] modules the player wants to build
 * @param opts     {methods: {ware: method}, buy: [ware], workforceBonus: 0.25, sunlight: 1,
 *                  pricePos: 0..1 default own price level between min (0) and max (1) price,
 *                  ownPrices: {ware: credits} own sales price per ware}
 * @returns {rows: [...], raw: [...], totals: {...}}
 */
export function compute(economy, targets, opts = {}) {
  const methods = opts.methods || {};
  const buy = new Set(opts.buy || []);
  const level = opts.pricePos ?? 0.5;
  const own = (w) => opts.ownPrices?.[w] ?? priceAt(economy, w, level);
  const low = (w) => priceAt(economy, w, 0);
  const high = (w) => priceAt(economy, w, 1);
  const points = (f) => ({ low: f(low), own: f(own), high: f(high) });
  const fixed = {};
  for (const t of targets) {
    if (t.modules > 0) fixed[t.ware] = (fixed[t.ware] || 0) + t.modules;
  }

  const isProduced = (w) => !economy.wares[w]?.raw && !buy.has(w) && recipeFor(economy, w, methods[w]);

  // Order wares so every consumer comes before the wares it consumes.
  const order = [];
  const seen = new Set();
  const visit = (w, stack) => {
    if (seen.has(w)) return;
    if (stack.has(w)) throw new Error(`production cycle at ${w}`);
    stack.add(w);
    if (isProduced(w)) {
      for (const input of Object.keys(recipeFor(economy, w, methods[w]).inputs)) visit(input, stack);
    }
    stack.delete(w);
    seen.add(w);
    order.push(w);
  };
  for (const w of Object.keys(fixed)) visit(w, new Set());
  order.reverse();

  const demand = {};
  const rows = [];
  for (const w of order) {
    const need = demand[w] || 0;
    if (!isProduced(w)) {
      rows.push({ ware: w, modules: 0, production: 0, consumption: need, net: -need,
                  raw: !!economy.wares[w]?.raw, bought: buy.has(w), method: null });
      continue;
    }
    const recipe = recipeFor(economy, w, methods[w]);
    const rate = ratePerModule(recipe, opts);
    const modules = Math.max(fixed[w] || 0, Math.ceil(need / rate - 1e-9));
    const production = modules * rate;
    const cycles = (modules * HOUR) / recipe.time;
    for (const [input, qty] of Object.entries(recipe.inputs)) {
      demand[input] = (demand[input] || 0) + cycles * qty;
    }
    const profitAt = (price) => (modules ? moduleProfit(recipe, rate, price, own) : 0);
    rows.push({ ware: w, modules, production, consumption: need, net: production - need,
                raw: false, bought: false, method: recipe.method, ratePerModule: rate,
                target: !!fixed[w], profitPerModule: points(profitAt) });
  }

  let modulesTotal = 0;
  let buildCost = 0;
  for (const r of rows) {
    modulesTotal += r.modules;
    const mods = economy.modules?.[r.ware] || [];
    const mod = mods.find((m) => m.race === r.method) || mods[0];
    if (mod) buildCost += r.modules * mod.price;
  }
  // Low/own/high vary the sales price; inputs and bought-in wares always cost the own price.
  // Whole station: sell every surplus, pay for bought-in wares; mined resources are free.
  const stationProfit = (price) => rows.reduce((sum, r) => {
    if (r.bought) return sum - r.consumption * own(r.ware);
    if (!r.raw && r.net > 0) return sum + r.net * price(r.ware);
    return sum;
  }, 0);
  const profit = points(stationProfit);
  return {
    rows: rows.filter((r) => !r.raw && !r.bought),
    raw: rows.filter((r) => r.raw || r.bought),
    totals: {
      modules: modulesTotal, buildCost, profit,
      profitPerModule: points((price) => (modulesTotal ? stationProfit(price) / modulesTotal : 0)),
      paybackHours: profit.own > 0 ? buildCost / profit.own : null,
    },
  };
}

// Price of a ware at position p between its fixed minimum (0) and maximum (1) price.
export function priceAt(economy, ware, p) {
  const pr = economy.wares[ware]?.price;
  return pr ? pr.min + (pr.max - pr.min) * p : 0;
}

// Profit per hour of one module selling its output at sell(ware) and buying its inputs at buy(ware).
export function moduleProfit(recipe, rate, sell, buy = sell) {
  const cycles = HOUR / recipe.time;
  let cost = 0;
  for (const [input, qty] of Object.entries(recipe.inputs)) cost += cycles * qty * buy(input);
  return rate * sell(recipe.ware) - cost;
}
