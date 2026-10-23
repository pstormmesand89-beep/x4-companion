// Side-by-side comparison of ships / loadouts: radar chart (max 3) + full table.

import { stats, STAT_DEFS } from "./ships.js";
import { statText } from "./ships-ui.js";
import { store, esc } from "./util.js";

// Categorical slots 1-3, validated all-pairs (CVD + normal vision) on the dark surface.
const SERIES = ["#3987e5", "#d95926", "#199e70"];
const DASH = ["", "6 4", "2 4"]; // secondary encoding next to colour
const MAX_RADAR = 3;
const RADAR_DEFS = STAT_DEFS.filter((d) => d.radar);

function radarSvg(cols) {
  const W = 340, H = 300, cx = W / 2, cy = 150, R = 105;
  const n = RADAR_DEFS.length;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f];
  };
  const max = RADAR_DEFS.map((d) => Math.max(...cols.map((c) => c.st[d.key] || 0)) || 1);
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon points="${RADAR_DEFS.map((_, i) => pt(i, f).join(",")).join(" ")}" class="r-grid"/>`).join("");
  const spokes = RADAR_DEFS.map((d, i) => {
    const [x, y] = pt(i, 1);
    const [lx, ly] = pt(i, 1.2);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="r-grid"/>
      <text x="${lx}" y="${ly + 4}" text-anchor="${anchor}" class="r-label">${d.label}</text>`;
  }).join("");
  const shapes = cols.map((c, s) => {
    const pts = RADAR_DEFS.map((d, i) => pt(i, (c.st[d.key] || 0) / max[i]));
    return `<g class="r-series" data-series="${s}">
      <polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${SERIES[s]}" fill-opacity=".12"
        stroke="${SERIES[s]}" stroke-width="2" stroke-dasharray="${DASH[s]}" stroke-linejoin="round"/>
      ${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="${SERIES[s]}" stroke="var(--panel)" stroke-width="2">
        <title>${esc(c.c.name)} · ${RADAR_DEFS[i].label}: ${statText(RADAR_DEFS[i], c.st[RADAR_DEFS[i].key] || 0)}</title></circle>`).join("")}
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="radar" role="img" aria-label="Radar-vergelijking">${rings}${spokes}${shapes}</svg>`;
}

export function mountCompare(root, shipsData, eq, { onEdit, onChange }) {
  const byId = Object.fromEntries(shipsData.ships.map((s) => [s.id, s]));
  let radarPick = store.get("radarPick", null);

  function render() {
    const entries = store.get("compare", []).filter((c) => byId[c.shipId]);
    if (!entries.length) {
      root.innerHTML = `<div class="empty">Nog niets om te vergelijken.<br><br>
        Open een schip onder <b>Schepen</b>, stel de uitrusting in (of kies een rol) en tik op <b>+ Vergelijken</b>.
        Je kunt hetzelfde schip meerdere keren toevoegen met een andere setup.</div>`;
      return;
    }
    const cols = entries.map((c) => ({ c, ship: byId[c.shipId], st: stats(eq, byId[c.shipId], c.loadout) }));

    // which entries are on the radar (ids); default the first three
    const ids = entries.map((e) => e.id);
    let pick = (radarPick || ids.slice(0, MAX_RADAR)).filter((id) => ids.includes(id));
    if (!pick.length) pick = ids.slice(0, MAX_RADAR);
    const radarCols = pick.map((id) => cols.find((c) => c.c.id === id));

    const rows = STAT_DEFS.map((d) => {
      const vals = cols.map((x) => x.st[d.key] || 0);
      const max = Math.max(...vals);
      const pos = vals.filter((v) => v > 0);
      const best = d.lowerIsBetter ? Math.min(...pos) : max;
      return `<tr><td>${d.label}</td>${vals.map((v) => `
        <td class="${cols.length > 1 && v === best && v > 0 ? "best" : ""}">${statText(d, v)}
          <div class="bar"><i style="width:${max ? Math.round((v / max) * 100) : 0}%"></i></div></td>`).join("")}</tr>`;
    }).join("");

    root.innerHTML = `
      <h2>Radar</h2>
      <div class="card">
        ${radarSvg(radarCols)}
        <div class="legend">
          ${entries.map((e) => {
            const s = pick.indexOf(e.id);
            return `<button class="chip ${s >= 0 ? "on-series" : ""}" data-pick="${e.id}" ${s >= 0 ? `style="--c:${SERIES[s]}"` : ""}>
              ${s >= 0 ? `<svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke="${SERIES[s]}" stroke-width="3" stroke-dasharray="${DASH[s]}"/></svg>` : ""}
              ${esc(e.name)}</button>`;
          }).join("")}
        </div>
        <div class="muted small">Tik om op de radar te zetten (max. ${MAX_RADAR}). Elke as is geschaald naar de hoogste waarde van de getoonde setups; exacte waarden staan hieronder.</div>
      </div>

      <h2>Alle waarden (${cols.length})</h2>
      <div class="cmp-wrap">
        <table class="cmp">
          <thead><tr><th></th>${cols.map((x, i) => `
            <th>${esc(x.c.name)}<div class="muted small">${esc(x.ship.name)} · ${x.ship.class.toUpperCase()}</div>
              <div class="row" style="justify-content:flex-end;margin-top:4px">
                <button class="btn small" data-edit="${i}">Bewerk</button>
                <button class="btn ghost small" data-rm="${i}" aria-label="Verwijder">✕</button>
              </div></th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn ghost small" id="clear">Alles wissen</button></div>
      <p class="muted small">Groen = beste waarde. Balkjes tonen de waarde ten opzichte van de hoogste.</p>`;
    radarPick = pick;
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pick) {
      const id = b.dataset.pick;
      radarPick = radarPick.includes(id) ? radarPick.filter((x) => x !== id) : [...radarPick, id].slice(-MAX_RADAR);
      store.set("radarPick", radarPick);
      return render();
    }
    const list = store.get("compare", []);
    if (b.dataset.rm !== undefined) list.splice(+b.dataset.rm, 1);
    else if (b.id === "clear") list.length = 0;
    else if (b.dataset.edit !== undefined) {
      const c = list[+b.dataset.edit];
      return onEdit(byId[c.shipId], c.loadout, c.name);
    } else return;
    store.set("compare", list);
    onChange();
    render();
  });

  return { render };
}
