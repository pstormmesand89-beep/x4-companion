// Ship browser + loadout builder view.

import { options, defaultLoadout, stats, expected, bestLoadout, missileKind, ROLES, STAT_DEFS, MISSILE_KIND_NL } from "./ships.js";
import { fmt, fmt1, credits, store, esc, toast, uid, RACE_NL, ROLE_NL } from "./util.js";

const CLASSES = ["s", "m", "l", "xl"];
const isBuyable = (s) => s.price > 0 && s.race !== "xenon" && s.race !== "khaak";

export function statText(d, v) {
  if (d.key === "price") return credits(v) + " Cr";
  const n = d.decimals ? fmt1(v) : fmt(v);
  return d.unit && d.unit !== "Cr" ? `${n} ${d.unit}` : n;
}

export function dur(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${fmt1(sec / 3600)} u`;
}

export function mountShips(root, shipsData, eq, onCompareChange) {
  const ships = shipsData.ships;
  const byId = Object.fromEntries(ships.map((s) => [s.id, s]));
  const races = [...new Set(ships.map((s) => s.race))].sort();

  const filter = store.get("shipFilter", { cls: "m", race: "", role: "", q: "", showNpc: false });
  let current = null; // {ship, loadout, name, id}

  function listView() {
    const q = filter.q.toLowerCase();
    const list = ships
      .filter((s) => (!filter.cls || s.class === filter.cls) && (!filter.race || s.race === filter.race) &&
        (!filter.role || s.role === filter.role) && (filter.showNpc || isBuyable(s)) &&
        (!q || s.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const loadouts = store.get("loadouts", []);

    root.innerHTML = `
      ${loadouts.length ? `<h2>Mijn loadouts</h2><div class="card shiplist">
        ${loadouts.map((l) => `
          <div class="ship" data-open-loadout="${l.id}">
            <div><b>${esc(l.name)}</b><div class="muted small">${esc(byId[l.shipId]?.name)}</div></div>
            <button class="btn ghost small" data-del-loadout="${l.id}" aria-label="Verwijder">✕</button>
          </div>`).join("")}
      </div>` : ""}

      <h2>Schepen</h2>
      <div class="card">
        <input type="search" id="q" placeholder="Zoek schip…" value="${esc(filter.q)}" style="margin-bottom:8px">
        <div class="chips" style="margin-bottom:8px">
          ${CLASSES.map((c) => `<span class="chip ${filter.cls === c ? "on" : ""}" data-cls="${c}">${c.toUpperCase()}</span>`).join("")}
          <span class="chip ${!filter.cls ? "on" : ""}" data-cls="">Alle</span>
        </div>
        <div class="row">
          <select id="race" class="grow"><option value="">Alle rassen</option>
            ${races.map((r) => `<option value="${r}" ${filter.race === r ? "selected" : ""}>${RACE_NL[r] || r}</option>`).join("")}</select>
          <select id="role" class="grow"><option value="">Alle rollen</option>
            ${Object.entries(ROLE_NL).map(([k, v]) => `<option value="${k}" ${filter.role === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        </div>
        <label class="small muted row" style="margin-top:8px"><input type="checkbox" id="npc" ${filter.showNpc ? "checked" : ""}> Ook niet-koopbare schepen (Xenon, Kha'ak, …)</label>
      </div>
      <div class="card shiplist">
        ${list.length ? list.map((s) => `
          <div class="ship" data-ship="${s.id}">
            <div><b>${esc(s.name)}</b>
              <div class="muted small">${RACE_NL[s.race] || s.race} · ${ROLE_NL[s.role] || s.role}</div></div>
            <div class="right"><span class="badge">${s.class}</span>
              <div class="muted small">${s.price ? credits(s.price) + " Cr" : "—"}</div></div>
          </div>`).join("") : '<div class="empty">Geen schepen gevonden</div>'}
      </div>`;
  }

  function slotSelect(kind, slot, value, key, allowEmpty = true) {
    const opts = options(eq, current.ship, kind, slot);
    return `<select data-slot="${key}">
      ${allowEmpty ? `<option value="">— leeg —</option>` : ""}
      ${opts.map(([id, o]) => `<option value="${id}" ${id === value ? "selected" : ""}>${esc(o.name)}</option>`).join("")}
    </select>`;
  }

  function builderView() {
    const { ship, loadout: lo } = current;
    const st = stats(eq, ship, lo);
    const ex = expected(eq, ship, lo, ships);
    const role = ROLES.find((r) => r.key === current.role);
    const w = ship.weapons, t = ship.turrets, g = ship.turretGroups;

    root.innerHTML = `
      <button class="back" id="back">‹ Terug naar lijst</button>
      <div class="card">
        <div class="row"><div class="grow"><b style="font-size:17px">${esc(ship.name)}</b>
          <div class="muted small">${RACE_NL[ship.race] || ship.race} · ${ROLE_NL[ship.role] || ship.role} · ${ship.class.toUpperCase()}</div></div>
          <span class="badge">${ship.class}</span></div>
      </div>

      <h2>Beste setup voor…</h2>
      <div class="card">
        <div class="chips">
          ${ROLES.map((r) => `<span class="chip ${current.role === r.key ? "on" : ""}" data-role="${r.key}">${r.label}</span>`).join("")}
        </div>
        ${role ? `<div style="margin-top:10px">
          ${role.shipRoles.includes(ship.role) ? "" : `<div class="warn small" style="margin-bottom:6px">⚠ Dit is een ${esc((ROLE_NL[ship.role] || ship.role).toLowerCase())}schip; voor ${esc(role.label.toLowerCase())} is een ander schip meestal beter.</div>`}
          <ul class="why">${role.why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <div class="muted small">Uitrusting is automatisch gekozen; pas gerust per slot aan.</div>
        </div>` : '<div class="muted small" style="margin-top:8px">Kies een rol: de app kiest per slot de beste uitrusting en legt uit waarom.</div>'}
      </div>

      <div class="minibar">
        <span>DPS <b>${fmt(st.burstDps)}</b></span>
        <span>Schild <b>${fmt(st.shield)}</b></span>
        <span>Snelh. <b>${fmt(st.speed)}</b></span>
        <span>Travel <b>${fmt(st.travel)}</b></span>
      </div>

      <h2>Stats</h2>
      <div class="card">
        <div class="statgrid">
          ${STAT_DEFS.map((d) => `<div><span>${d.label}</span><span>${statText(d, st[d.key])}</span></div>`).join("")}
        </div>
        <div class="slot" style="margin-top:8px"><label>Raketten</label>
          ${st.missileSlots ? `${st.missileSlots}× werper · ${st.missileKinds.length ? st.missileKinds.map((k) => esc(MISSILE_KIND_NL[k])).join(", ") : "geen werper gekozen"}` : '<span class="muted">Geen raketwerpers</span>'}
        </div>
      </div>

      <h2>Verwachte resultaten</h2>
      <div class="card">
        <table class="profit">
          <thead><tr><th>Tegen (standaard uitrusting)</th><th>Jij wint in</th><th>Zij winnen in</th></tr></thead>
          <tbody>${ex.duels.map((d) => `<tr><td>${esc(d.label)}</td><td>${dur(d.youKill)}</td><td>${dur(d.theyKill)}</td></tr>
            <tr><td colspan="3" class="${d.verdict === "win" ? "good" : d.verdict === "lose" ? "bad" : "warn"}" style="text-align:left;border-bottom-width:2px">
              ${d.verdict === "win" ? "✔ Jij wint dit gevecht" : d.verdict === "lose" ? "✖ Jij verliest dit gevecht" : "≈ Gelijkwaardig"}</td></tr>`).join("")}</tbody>
        </table>
        <div class="statgrid" style="margin-top:10px">
          <div><span>100 km reizen</span><span>${dur(ex.travel100km)}</span></div>
          <div><span>Schild 0→vol</span><span>${dur(ex.shieldFullTime)}</span></div>
          <div><span>Vracht/uur (100 km)</span><span>${ex.cargoPerHour ? fmt(ex.cargoPerHour) + " m³" : "—"}</span></div>
          <div><span>Boost-afstand</span><span>${fmt(ex.boostDistance)} m</span></div>
        </div>
        <div class="muted small" style="margin-top:6px">Theoretisch: alle schoten raak, geen schild/romp-modifiers, sustained DPS zonder raketten; main batteries tellen niet mee tegen S/M. Vracht/uur: heen en terug over 100 km incl. ~90 s aanmeren per stop.</div>
      </div>

      <h2>Systemen</h2>
      <div class="card">
        <div class="slot"><label>Motoren (${ship.engineCount}×)</label>${slotSelect("engine", {}, lo.engine, "engine")}</div>
        <div class="slot"><label>Schilden (${ship.shieldCount}×)</label>${slotSelect("shield", {}, lo.shield, "shield")}</div>
        <div class="slot"><label>Thrusters</label>${slotSelect("thruster", {}, lo.thruster, "thruster")}</div>
      </div>

      ${w.length ? `<h2>Wapens</h2><div class="card">
        ${w.map((s, i) => `<div class="slot"><label>Slot ${i + 1} · ${s.size.toUpperCase()}${s.launcher ? " · raketwerper" + kindNote(eq.weapons[lo.weapons[i]]) : ""}</label>
          ${slotSelect("weapon", s, lo.weapons[i], "w" + i)}</div>`).join("")}</div>` : ""}

      ${t.length ? `<h2>Turrets</h2><div class="card">
        ${t.map((s, i) => `<div class="slot"><label>Turret ${i + 1} · ${s.size.toUpperCase()}${s.launcher ? " · raket" + kindNote(eq.turrets[lo.turrets[i]]) : ""}</label>
          ${slotSelect("turret", s, lo.turrets[i], "t" + i)}</div>`).join("")}</div>` : ""}

      ${g.length ? `<h2>Turret-groepen</h2><div class="card">
        ${g.map((s, i) => `<div class="slot"><label>Groep ${esc(s.name)} · ${s.turretCount}× ${s.turretSize.toUpperCase()} ${s.launcher ? "raketturret" + kindNote(eq.turrets[lo.groups[i]?.turret]) : "turret"}${s.shieldCount ? ` · ${s.shieldCount}× ${s.shieldSize.toUpperCase()} schild` : ""}</label>
          ${s.turretCount ? slotSelect("turret", { size: s.turretSize, launcher: s.launcher }, lo.groups[i]?.turret, "gt" + i) : ""}
          ${s.shieldCount ? `<div style="margin-top:6px">${slotSelect("shield", { size: s.shieldSize }, lo.groups[i]?.shield, "gs" + i)}</div>` : ""}
        </div>`).join("")}
        <div class="row" style="margin-top:6px">
          <span class="muted small grow">Alle groepen tegelijk</span>
          <button class="btn small" id="copy-group">Kopieer groep 1 naar alle</button>
        </div></div>` : ""}

      <h2>Opslaan &amp; vergelijken</h2>
      <div class="card">
        <input type="text" id="lo-name" value="${esc(current.name || ship.name + " – mijn setup")}" style="margin-bottom:8px">
        <div class="row">
          <button class="btn primary grow" id="lo-save">${current.id ? "Bijwerken" : "Opslaan"}</button>
          <button class="btn grow" id="lo-compare">+ Vergelijken</button>
        </div>
      </div>`;
  }

  const render = () => (current ? builderView() : listView());
  const kindNote = (item) => (missileKind(item) ? ` (${missileKind(item)})` : "");

  function open(ship, loadout, name, id) {
    current = { ship, loadout: loadout ? structuredClone(loadout) : defaultLoadout(eq, ship), name, id };
    render();
    window.scrollTo(0, 0);
  }

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-ship],[data-cls],[data-role],[data-open-loadout],[data-del-loadout],button");
    if (!el) return;
    const d = el.dataset;
    if (d.delLoadout) {
      e.stopPropagation();
      store.set("loadouts", store.get("loadouts", []).filter((l) => l.id !== d.delLoadout));
      return render();
    }
    if (d.ship) return open(byId[d.ship]);
    if (d.openLoadout) {
      const l = store.get("loadouts", []).find((x) => x.id === d.openLoadout);
      if (l && byId[l.shipId]) open(byId[l.shipId], l.loadout, l.name, l.id);
      return;
    }
    if (d.role && current) {
      current.role = d.role;
      current.loadout = bestLoadout(eq, current.ship, d.role);
      if (!current.id) current.name = `${current.ship.name} – ${ROLES.find((r) => r.key === d.role).label}`;
      return render();
    }
    if (d.cls !== undefined) { filter.cls = d.cls; store.set("shipFilter", filter); return render(); }
    if (el.id === "back") { current = null; return render(); }
    if (el.id === "copy-group") {
      const first = current.loadout.groups[0] || {};
      current.ship.turretGroups.forEach((g, i) => {
        const ok = (kind, slot, id) => id && options(eq, current.ship, kind, slot).some(([x]) => x === id);
        const lo = current.loadout.groups[i] || (current.loadout.groups[i] = {});
        if (ok("turret", { size: g.turretSize, launcher: g.launcher }, first.turret)) lo.turret = first.turret;
        if (ok("shield", { size: g.shieldSize }, first.shield)) lo.shield = first.shield;
      });
      return render();
    }
    if (el.id === "lo-save" || el.id === "lo-compare") {
      const name = root.querySelector("#lo-name").value.trim() || current.ship.name;
      const entry = { id: current.id || uid(), name, shipId: current.ship.id, loadout: structuredClone(current.loadout) };
      if (el.id === "lo-save") {
        const list = store.get("loadouts", []).filter((l) => l.id !== entry.id);
        store.set("loadouts", [entry, ...list]);
        current.id = entry.id;
        current.name = name;
        toast("Loadout opgeslagen");
      } else {
        const cmp = store.get("compare", []);
        store.set("compare", [...cmp, { ...entry, id: uid() }].slice(-6));
        toast("Toegevoegd aan vergelijking");
        onCompareChange();
      }
      return render();
    }
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.slot && current) {
      const k = t.dataset.slot, v = t.value || null, lo = current.loadout;
      if (["engine", "shield", "thruster"].includes(k)) lo[k] = v;
      else if (k[0] === "w") lo.weapons[+k.slice(1)] = v;
      else if (k.startsWith("gt")) (lo.groups[+k.slice(2)] ||= {}).turret = v;
      else if (k.startsWith("gs")) (lo.groups[+k.slice(2)] ||= {}).shield = v;
      else if (k[0] === "t") lo.turrets[+k.slice(1)] = v;
      return render();
    }
    if (t.id === "race") filter.race = t.value;
    else if (t.id === "role") filter.role = t.value;
    else if (t.id === "npc") filter.showNpc = t.checked;
    else return;
    store.set("shipFilter", filter);
    render();
  });

  root.addEventListener("input", (e) => {
    if (e.target.id !== "q") return;
    filter.q = e.target.value;
    store.set("shipFilter", filter);
    const pos = e.target.selectionStart;
    render();
    const q = root.querySelector("#q");
    q.focus();
    q.setSelectionRange(pos, pos);
  });

  render();
  return { open };
}
