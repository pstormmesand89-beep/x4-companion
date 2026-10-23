// Small shared helpers: formatting, local storage, DOM.

const nf0 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

export const fmt = (x) => nf0.format(Math.round(x));
export const fmt1 = (x) => nf1.format(x);
export const signed = (x) => (x > 0.5 ? "+" : "") + fmt(x);
export const credits = (x) =>
  x >= 1e9 ? nf1.format(x / 1e9) + " mld" : x >= 1e6 ? nf1.format(x / 1e6) + " mln" : fmt(x);

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("x4c." + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("x4c." + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2200);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const RACE_NL = {
  argon: "Argon", paranid: "Paranid", teladi: "Teladi", split: "Split", terran: "Terran",
  boron: "Boron", xenon: "Xenon", khaak: "Kha'ak", gen: "Generiek", ven: "Venture", pirate: "Piraat",
};
export const ROLE_NL = {
  fight: "Gevecht", trade: "Handel", mine: "Mijnbouw", build: "Bouw", auxiliary: "Ondersteuning",
  racing: "Race", salvage: "Berging", dismantling: "Sloop",
};
