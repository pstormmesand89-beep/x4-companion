import { mountStation } from "./station-ui.js";
import { mountShips } from "./ships-ui.js";
import { mountCompare } from "./compare-ui.js";
import { store } from "./util.js";

// Keep in step with VERSION in sw.js; shown in the header so you can see which version runs.
const APP_VERSION = "7";

const load = (f) => fetch(`data/${f}`).then((r) => r.json());

async function main() {
  const [economy, ships, equipment] = await Promise.all([
    load("economy.json"), load("ships.json"), load("equipment.json"),
  ]);
  document.getElementById("dataver").textContent = `app ${APP_VERSION} · data v${economy.meta.gameVersion}`;

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
    // a new version took over: reload once so the new code runs right away
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloaded) {
        reloaded = true;
        location.reload();
      }
    });
    navigator.serviceWorker.register("sw.js").then((reg) => reg.update()).catch(() => {});
  }
}

main().catch((err) => {
  document.querySelector("main").innerHTML =
    `<div class="empty">Kon de data niet laden.<br><small>${String(err)}</small></div>`;
});
