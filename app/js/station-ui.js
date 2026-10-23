// Station planner view.

import { compute, methodsFor, priceAt } from "./production.js";
import { fmt, fmt1, signed, credits, store, esc, toast, uid } from "./util.js";

export function mountStation(root, economy) {
  const wareName = (w) => economy.wares[w]?.name || w;
  const producible = [...new Set(economy.recipes.map((r) => r.ware))].sort((a, b) =>
    wareName(a).localeCompare(wareName(b)));

  const state = store.get("station", null) || {
    targets: [{ ware: "microchips", modules: 4 }],
    methods: {}, buy: [], sunlight: 100, workforce: false,
  };
  const save = () => store.set("station", state);

  function methodSelect(ware, cls = "") {
    const ms = methodsFor(economy, ware);
    if (ms.length < 2) return "";
    const cur = state.methods[ware] || "default";
    return `<select class="${cls}" data-method="${ware}">${ms.map((m) =>
      `<option value="${m.method}" ${m.method === cur ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>`;
  }

  function render() {
    const res = compute(economy, state.targets, {
      methods: state.methods, buy: state.buy,
      sunlight: state.sunlight / 100, workforceBonus: state.workforce ? state.workforceBonus ?? 0.25 : 0,
      pricePos: (state.pricePos ?? 50) / 100, ownPrices: state.prices || {},
    });
    const pm = res.totals.profitPerModule, pt = res.totals.profit;
    const plans = store.get("plans", []);

    root.innerHTML = `
      <h2>Wat wil je bouwen?</h2>
      <div class="card">
        ${state.targets.map((t, i) => `
          <div class="row" style="margin-bottom:8px">
            <select class="grow" data-target-ware="${i}">
              ${producible.map((w) => `<option value="${w}" ${w === t.ware ? "selected" : ""}>${esc(wareName(w))}</option>`).join("")}
            </select>
            <div class="stepper">
              <button data-step="${i}" data-d="-1">−</button>
              <input type="number" inputmode="numeric" min="0" value="${t.modules}" data-target-mods="${i}">
              <button data-step="${i}" data-d="1">+</button>
            </div>
            ${state.targets.length > 1 ? `<button class="btn ghost small" data-del="${i}" aria-label="Verwijder">✕</button>` : ""}
          </div>
          ${methodSelect(t.ware) ? `<div style="margin:-2px 0 10px">${methodSelect(t.ware)}</div>` : ""}`).join("")}
        <button class="btn small" id="add-target">+ Product toevoegen</button>
      </div>

      <details class="card">
        <summary>Instellingen</summary>
        <div class="slot">
          <label>Zonlicht in sector: <b id="sun-v">${state.sunlight}%</b> <span class="muted small">(bepaalt energiecellen)</span></label>
          <input type="range" min="10" max="400" step="5" value="${state.sunlight}" id="sun" style="width:100%">
        </div>
        <div class="slot row">
          <label class="grow" style="margin:0">Workforce-bonus meerekenen</label>
          <input type="checkbox" id="wf" ${state.workforce ? "checked" : ""} style="width:22px;height:22px">
        </div>
        ${state.workforce ? `<div class="slot"><label>Bonus: <b>${Math.round((state.workforceBonus ?? 0.25) * 100)}%</b></label>
          <input type="range" min="0" max="50" step="1" value="${Math.round((state.workforceBonus ?? 0.25) * 100)}" id="wfb" style="width:100%"></div>` : ""}
        <div class="slot">
          <label>Standaard verkoopprijs: <b id="pp-v">${state.pricePos ?? 50}%</b> <span class="muted small">(0% = laagste, 100% = hoogste prijs; per product aan te passen)</span></label>
          <input type="range" min="0" max="100" step="5" value="${state.pricePos ?? 50}" id="pp" style="width:100%">
        </div>
      </details>

      <div class="kpis">
        <div class="kpi"><div class="v">${fmt(res.totals.modules)}</div><div class="l">productiemodules</div></div>
        <div class="kpi"><div class="v">${credits(res.totals.buildCost)}</div><div class="l">bouwkosten (gem.)</div></div>
        <div class="kpi"><div class="v">${res.totals.paybackHours ? fmt1(res.totals.paybackHours) + " u" : "—"}</div><div class="l">terugverdientijd (jouw prijs)</div></div>
      </div>

      <div class="card">
        <table class="profit">
          <thead><tr><th>Winst per uur</th><th>Laag</th><th>Jouw prijs</th><th>Hoog</th></tr></thead>
          <tbody>
            <tr><td>Hele station</td>${["low", "own", "high"].map((k) => `<td class="${pt[k] < 0 ? "bad" : ""}">${credits(pt[k])}</td>`).join("")}</tr>
            <tr><td>Per module (gem.)</td>${["low", "own", "high"].map((k) => `<td class="${pm[k] < 0 ? "bad" : ""}">${credits(pm[k])}</td>`).join("")}</tr>
          </tbody>
        </table>
        <div class="muted small" style="margin-top:6px">Station: verkoop van alle overschotten, min. ingekochte goederen; gemijnde grondstoffen gratis.</div>
      </div>

      <h2>Productieketen</h2>
      <div class="card">
        ${res.rows.map((r) => `
          <div class="prod">
            <div class="row">
              <div class="mods">${r.modules}<small>${r.modules === 1 ? "module" : "modules"}</small></div>
              <div class="grow">
                <div class="name">${esc(wareName(r.ware))}${r.target ? '<span class="tag target">doel</span>' : ""}${r.method !== "default" ? `<span class="tag">${esc(economy.recipes.find((x) => x.ware === r.ware && x.method === r.method)?.label)}</span>` : ""}</div>
                <div class="flow">
                  <span class="muted">productie<b>${fmt(r.production)}/u</b></span>
                  <span class="muted">verbruik<b>${fmt(r.consumption)}/u</b></span>
                  <span class="muted">over<b class="${r.net > 0.5 ? "good" : ""}">${signed(r.net)}/u</b></span>
                </div>
                <div class="flow">
                  ${["low", "own", "high"].map((k, j) => `<span class="muted">${["winst/mod laag", "jouw prijs", "hoog"][j]}<b class="${r.profitPerModule[k] < 0 ? "bad" : ""}">${credits(r.profitPerModule[k])}</b></span>`).join("")}
                </div>
              </div>
            </div>
            <div class="actions">
              <label class="muted small" style="align-self:center">Verkoopprijs</label>
              <input type="number" inputmode="numeric" class="price" data-price="${r.ware}" value="${state.prices?.[r.ware] ?? ""}"
                placeholder="${fmt(priceAt(economy, r.ware, (state.pricePos ?? 50) / 100))}">
              <span class="muted small" style="align-self:center">${fmt(economy.wares[r.ware].price.min)}–${fmt(economy.wares[r.ware].price.max)}</span>
            </div>
            ${r.target ? "" : `<div class="actions">
              <button class="btn small" data-buy="${r.ware}">Inkopen i.p.v. maken</button>
              ${methodSelect(r.ware)}
            </div>`}
          </div>`).join("")}
      </div>

      <h2>Grondstoffen &amp; inkoop</h2>
      <div class="card">
        ${res.raw.length ? res.raw.map((r) => `
          <div class="prod row">
            <div class="grow"><div class="name">${esc(wareName(r.ware))}
              ${r.bought ? '<span class="tag">inkoop</span>' : '<span class="tag">minen</span>'}</div></div>
            <div class="right"><b>${fmt(r.consumption)}</b><span class="muted small"> /u</span></div>
            ${r.bought ? `<button class="btn small" data-unbuy="${r.ware}">Zelf maken</button>` : ""}
          </div>`).join("") : '<div class="muted">Geen</div>'}
      </div>

      <h2>Opgeslagen plannen</h2>
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <input type="text" id="plan-name" class="grow" placeholder="Naam van dit plan">
          <button class="btn primary" id="plan-save">Opslaan</button>
        </div>
        ${plans.length ? plans.map((p) => `
          <div class="row prod">
            <div class="grow"><b>${esc(p.name)}</b><div class="muted small">${p.state.targets.map((t) => `${t.modules}× ${esc(wareName(t.ware))}`).join(", ")}</div></div>
            <button class="btn small" data-load="${p.id}">Laden</button>
            <button class="btn ghost small" data-delplan="${p.id}" aria-label="Verwijder">✕</button>
          </div>`).join("") : '<div class="muted small">Nog geen plannen opgeslagen.</div>'}
      </div>`;
  }

  const update = () => { save(); render(); };

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.targetWare) state.targets[+t.dataset.targetWare].ware = t.value;
    else if (t.dataset.targetMods) state.targets[+t.dataset.targetMods].modules = Math.max(0, parseInt(t.value) || 0);
    else if (t.dataset.method) state.methods[t.dataset.method] = t.value;
    else if (t.id === "wf") state.workforce = t.checked;
    else if (t.id === "sun") state.sunlight = +t.value;
    else if (t.id === "wfb") state.workforceBonus = +t.value / 100;
    else if (t.id === "pp") state.pricePos = +t.value;
    else if (t.dataset.price) {
      state.prices ||= {};
      if (t.value === "") delete state.prices[t.dataset.price];
      else state.prices[t.dataset.price] = Math.max(0, +t.value);
    }
    else return;
    update();
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "sun") root.querySelector("#sun-v").textContent = e.target.value + "%";
    if (e.target.id === "pp") root.querySelector("#pp-v").textContent = e.target.value + "%";
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.step !== undefined) {
      const t = state.targets[+d.step];
      t.modules = Math.max(0, t.modules + +d.d);
    } else if (d.del !== undefined) state.targets.splice(+d.del, 1);
    else if (b.id === "add-target") state.targets.push({ ware: "hullparts", modules: 1 });
    else if (d.buy) state.buy = [...new Set([...state.buy, d.buy])];
    else if (d.unbuy) state.buy = state.buy.filter((w) => w !== d.unbuy);
    else if (b.id === "plan-save") {
      const name = root.querySelector("#plan-name").value.trim() ||
        state.targets.map((t) => `${t.modules}× ${wareName(t.ware)}`).join(", ");
      store.set("plans", [{ id: uid(), name, state: structuredClone(state) }, ...store.get("plans", [])]);
      toast("Plan opgeslagen");
    } else if (d.load) {
      const p = store.get("plans", []).find((x) => x.id === d.load);
      if (p) Object.assign(state, structuredClone(p.state));
      toast("Plan geladen");
    } else if (d.delplan) store.set("plans", store.get("plans", []).filter((x) => x.id !== d.delplan));
    else return;
    update();
  });

  render();
}
