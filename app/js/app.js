import { mountStation } from "./station-ui.js";
import { mountShips } from "./ships-ui.js";
import { mountCompare } from "./compare-ui.js";
import { store } from "./util.js";

const load = (f) => fetch(`data/${f}`).then((r) => r.json());

async function main() {
  const [economy, ships, equipment] = await Promise.all([
    load("economy.json"), load("ships.json"), load("equipment.json"),
  ]);
  document.getElementById("dataver").textContent = `data v${economy.meta.gameVersion}`;

  const views = {
    station: document.getElementById("view-station"),
    ships: document.getElementById("view-ships"),
    compare: document.getElementById("view-compare"),
  };
  const tabs = document.querySelectorAll(".tabbar button");

  const updateCount = () => {
    const n = store.get("compare", []).length;
    document.getElementById("cmpcount").textContent = n ? `(${n})` : "";
  };

  function show(name) {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    if (name === "compare") compare.render();
    store.set("tab", name);
    window.scrollTo(0, 0);
  }

  mountStation(views.station, economy);
  const shipsView = mountShips(views.ships, ships, equipment, updateCount);
  const compare = mountCompare(views.compare, ships, equipment, {
    onEdit: (ship, loadout, name) => { show("ships"); shipsView.open(ship, loadout, name); },
    onChange: updateCount,
  });

  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));
  updateCount();
  show(store.get("tab", "station"));

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

main().catch((err) => {
  document.querySelector("main").innerHTML =
    `<div class="empty">Kon de data niet laden.<br><small>${String(err)}</small></div>`;
});
