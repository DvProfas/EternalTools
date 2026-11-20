import { $, $$, storageGet, storageSet, toast } from './utils.js';

export const DEFAULTS = {
  theme: "default",
  autoOpen: false,
  reuseTab: true,
  openDest: "account",
  particles: true,
  skipSplash: false,
  streamer: false,
  dim: 62
};

export const THEMES = [
  { id: "default", name: "Padrão", color: "#ffffff" },
  { id: "purple",  name: "Purple", color: "#b455ff" },
  { id: "gold",    name: "Gold",   color: "#ffcc1a" },
  { id: "rose",    name: "Rose",   color: "#ff4d8d" },
  { id: "blue",    name: "Azul",   color: "#3d85ff" },
  { id: "cyan",    name: "Ciano",  color: "#12e3ff" },
  { id: "green",   name: "Verde",  color: "#00f07a" },
  { id: "red",     name: "Vermelho", color: "#ff3355" },
  { id: "orange",  name: "Laranja", color: "#ff8f1f" }
];

export let settings = { ...DEFAULTS };

const DESTS = {
  account:   () => "https://www.roblox.com/my/account",
  home:      () => "https://www.roblox.com/home",
  inventory: (u) => (u?.id ? `https://www.roblox.com/users/${u.id}/inventory` : "https://www.roblox.com/home"),
  avatar:    () => "https://www.roblox.com/my/avatar"
};

function applySettings() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  settings.skipSplash ? (r.dataset.skipSplash = "1") : delete r.dataset.skipSplash;
  settings.streamer ? (r.dataset.streamer = "1") : delete r.dataset.streamer;
  r.style.setProperty("--dim", String(settings.dim / 100));
  try {
    localStorage.setItem("eternal_boot", JSON.stringify({
      theme: settings.theme, skipSplash: settings.skipSplash, streamer: settings.streamer, dim: settings.dim
    }));
  } catch {}
  document.dispatchEvent(new CustomEvent("eternal:theme", { detail: getComputedStyle(r).getPropertyValue("--accent-rgb").trim() || "255,255,255" }));
  document.dispatchEvent(new CustomEvent("eternal:particles", { detail: !!settings.particles }));
}

async function save(patch) {
  settings = { ...settings, ...patch };
  applySettings();
  syncUI();
  await storageSet({ settings });
}

export async function loadSettings() {
  const { settings: saved } = await storageGet("settings");
  settings = { ...DEFAULTS, ...(saved || {}) };
  if (!DESTS[settings.openDest]) settings.openDest = DEFAULTS.openDest; // migra valores antigos
  applySettings();
}

/** Depois de conectar/relogar: recarrega abas do Roblox e/ou abre o Roblox (se ativado). */
export async function postLogin(user, { reload = false } = {}) {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.roblox.com/*" });
    let target = null;
    if (settings.autoOpen && settings.reuseTab && tabs.length) target = tabs[0];
    if (reload) tabs.filter((t) => !target || t.id !== target.id).forEach((t) => chrome.tabs.reload(t.id));
    if (!settings.autoOpen) return;
    const url = (DESTS[settings.openDest] || DESTS.account)(user);
    if (target) {
      await chrome.tabs.update(target.id, { url, active: true });
      await chrome.windows.update(target.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
  } catch (e) { console.error("[Eternal] postLogin:", e); }
}

/* ---------------- Painel ---------------- */
let lastFocus = null;

function syncUI() {
  $$("#theme-grid .theme-swatch").forEach((b) => b.classList.toggle("on", b.dataset.theme === settings.theme));
  const set = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  set("#set-autoOpen", settings.autoOpen); set("#set-reuseTab", settings.reuseTab);
  set("#set-particles", settings.particles); set("#set-skipSplash", settings.skipSplash); set("#set-streamer", settings.streamer);
  $("#set-openDest").value = settings.openDest;
  $("#set-dim").value = settings.dim; $("#set-dim-out").textContent = settings.dim + "%";
  $("#set-autoOpen-sub").classList.toggle("disabled", !settings.autoOpen);
}

export function openSettings() {
  lastFocus = document.activeElement;
  $("#settings-panel").classList.add("open"); $("#settings-overlay").classList.add("open");
  $("#settings-panel").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#settings-close").focus(), 50);
}
export function closeSettings() {
  $("#settings-panel").classList.remove("open"); $("#settings-overlay").classList.remove("open");
  $("#settings-panel").setAttribute("aria-hidden", "true");
  lastFocus?.focus?.();
}

export function initSettings() {
  const grid = $("#theme-grid");
  grid.innerHTML = THEMES.map((t) =>
    `<button type="button" class="theme-swatch" data-theme="${t.id}" title="${t.name}"><span class="theme-dot" style="--c:${t.color}"></span><span>${t.name}</span></button>`
  ).join("");
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".theme-swatch"); if (b) save({ theme: b.dataset.theme });
  });

  // só o ícone da extensão no menu abre as configurações
  $("#btn-settings").addEventListener("click", () => ($("#settings-panel").classList.contains("open") ? closeSettings() : openSettings()));
  $("#settings-close").addEventListener("click", closeSettings);
  $("#settings-overlay").addEventListener("click", closeSettings);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#settings-panel").classList.contains("open")) closeSettings(); });

  const bind = (id, key) => $(id).addEventListener("change", (e) => save({ [key]: e.target.checked }));
  bind("#set-autoOpen", "autoOpen"); bind("#set-reuseTab", "reuseTab");
  bind("#set-particles", "particles"); bind("#set-skipSplash", "skipSplash"); bind("#set-streamer", "streamer");
  $("#set-openDest").addEventListener("change", (e) => save({ openDest: e.target.value }));
  $("#set-dim").addEventListener("input", (e) => { const v = Number(e.target.value); settings.dim = v; $("#set-dim-out").textContent = v + "%"; document.documentElement.style.setProperty("--dim", String(v / 100)); });
  $("#set-dim").addEventListener("change", (e) => save({ dim: Number(e.target.value) }));
  $("#set-reset").addEventListener("click", async () => { await save({ ...DEFAULTS }); toast("Configurações restauradas."); });

  syncUI();
}
