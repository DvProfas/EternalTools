import { $, storageGet, storageSet, toast, openModal, escapeHtml, setAvatar, fetchAvatars, isFallbackAvatar, sleep } from './utils.js';
import { loginWithCookie } from './cookies.js';
import { inspectAccount } from './roblox.js';

let vault = [];
let activeId = null;
let refreshing = false;
let verifying = false;
let checkingId = null;
let prefs = { sort: "recent", tag: null, fav: false };
const AVATAR_TTL = 6 * 3600 * 1000;

const ICON_RELOG = `<svg class="ico-relog" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>`;
const ICON_STAR = (on) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`;
const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;

function timeAgo(ts) {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

async function reloadState() {
  const r = await storageGet(["vault", "account", "vaultPrefs"]);
  vault = r.vault || []; activeId = r.account?.id ?? null;
  if (r.vaultPrefs) prefs = { ...prefs, ...r.vaultPrefs };
}
const savePrefs = () => storageSet({ vaultPrefs: prefs });

async function patchVault(id, patch) {            // lê o cofre fresco para não sobrescrever outras mudanças
  const { vault: fresh = [] } = await storageGet("vault");
  const e = fresh.find((v) => v.id === id);
  if (e) Object.assign(e, patch);
  await storageSet({ vault: fresh });
  vault = fresh;
}

/* ---------------- Relogar ---------------- */
async function relog(v, btn) {
  if (!v.cookie) {
    toast("Sem cookie salvo. Conecte esta conta uma vez para habilitar o relogar.");
    document.querySelector('.nav-item[data-tab="cookies"]')?.click();
    return;
  }
  btn.disabled = true; btn.classList.add("loading");
  try {
    await loginWithCookie(v.cookie, { reloadTabs: true });
    toast("Relogado como " + v.name);
    requestAnimationFrame(() => document.querySelector(`[data-vault-id="${v.id}"]`)?.classList.add("flash"));
  } catch (err) {
    if (err.code === "set") toast("Falha ao aplicar o cookie no navegador.");
    else { await patchVault(v.id, { expired: true }); toast("Cookie expirado — reconecte " + v.name + "."); renderVault(); }
  } finally { btn.disabled = false; btn.classList.remove("loading"); }
}

/* ---------------- Verificar todas ---------------- */
async function verifyAll() {
  if (verifying) return;
  const list = vault.filter((v) => v.cookie);
  const noCookie = vault.length - list.length;
  if (!list.length) return toast("Nenhuma conta com cookie salvo para verificar.");

  verifying = true;
  const btn = $("#vault-verify"), label = btn.querySelector("span");
  btn.disabled = true; btn.classList.add("loading");
  $("#vault-grid").classList.add("static");
  let ok = 0, exp = 0, err = 0;

  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    label.textContent = `Verificando ${i + 1}/${list.length}`;
    checkingId = v.id; renderVault();
    const res = await inspectAccount(v.cookie);
    if (res.status === "valid") {
      ok++; await patchVault(v.id, { expired: false, name: res.user.name, info: res.info });
    } else if (res.status === "expired") {
      exp++; await patchVault(v.id, { expired: true });
    } else err++;
    await sleep(350);
  }

  checkingId = null; verifying = false;
  btn.disabled = false; btn.classList.remove("loading"); label.textContent = "Verificar todas";
  renderVault(); $("#vault-grid").classList.remove("static");
  toast([`${ok} ativa(s)`, exp && `${exp} expirada(s)`, err && `${err} com erro`, noCookie && `${noCookie} sem cookie`].filter(Boolean).join(" · "));
}

/* ---------------- Organização ---------------- */
function parseTags(str) {
  const seen = new Set(), out = [];
  for (const t of String(str || "").split(/[,;\n]/)) {
    const tag = t.trim().slice(0, 16);
    if (tag && !seen.has(tag.toLowerCase())) { seen.add(tag.toLowerCase()); out.push(tag); }
    if (out.length >= 6) break;
  }
  return out;
}

let editing = null;
function openEdit(v) {
  editing = v;
  $("#edit-name").textContent = v.name;
  $("#edit-tags").value = (v.tags || []).join(", ");
  $("#edit-note").value = v.note || "";
  $("#edit-overlay").classList.remove("hidden");
  setTimeout(() => $("#edit-tags").focus(), 50);
}
function closeEdit() { $("#edit-overlay").classList.add("hidden"); editing = null; }
async function saveEdit() {
  if (!editing) return;
  await patchVault(editing.id, { tags: parseTags($("#edit-tags").value), note: $("#edit-note").value.trim().slice(0, 120) });
  closeEdit(); renderVault(); toast("Salvo.");
}

function renderFilters() {
  const box = $("#vault-filters");
  const tags = [...new Set(vault.flatMap((v) => v.tags || []))].sort((a, b) => a.localeCompare(b));
  if (prefs.tag && !tags.includes(prefs.tag)) prefs.tag = null;
  const hasFav = vault.some((v) => v.fav);
  box.innerHTML = "";
  const add = (text, on, fn) => {
    const b = document.createElement("button");
    b.className = "chip" + (on ? " on" : ""); b.textContent = text; b.addEventListener("click", fn); box.appendChild(b);
  };
  if (hasFav) add("★ Favoritas", prefs.fav, () => { prefs.fav = !prefs.fav; savePrefs(); renderVault(); });
  tags.forEach((t) => add("#" + t, prefs.tag === t, () => { prefs.tag = prefs.tag === t ? null : t; savePrefs(); renderVault(); }));
  box.classList.toggle("hidden", !box.children.length);
}

function infoRow(v) {
  const i = v.info;
  if (!i) return `<div class="info-row"><span class="info-none">Não verificada</span></div>`;
  const parts = [];
  if (i.robux != null) parts.push(`<span class="info-chip"><b>R$</b> ${i.robux.toLocaleString("pt-BR")}</span>`);
  if (i.premium != null) parts.push(`<span class="info-chip${i.premium ? " on" : ""}">${i.premium ? "Premium" : "Sem Premium"}</span>`);
  if (i.friends != null) parts.push(`<span class="info-chip"><b>${i.friends.toLocaleString("pt-BR")}</b> amigos</span>`);
  return `<div class="info-row" title="Verificado ${timeAgo(i.checkedAt)}">${parts.join("")}</div>`;
}

function sortList(list) {
  const by = {
    recent: (a, b) => (b.lastAccess || 0) - (a.lastAccess || 0),
    name: (a, b) => a.name.localeCompare(b.name),
    robux: (a, b) => (b.info?.robux ?? -1) - (a.info?.robux ?? -1)
  }[prefs.sort] || (() => 0);
  return list.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || by(a, b));   // favoritas sempre no topo
}

/* ---------------- Render ---------------- */
function renderVault() {
  const grid = $("#vault-grid");
  renderFilters();
  $("#vault-sort").value = prefs.sort;
  const q = ($("#vault-search")?.value || "").toLowerCase().trim();
  grid.innerHTML = "";

  const list = sortList(vault.filter((v) =>
    (!q || v.name.toLowerCase().includes(q) || (v.note || "").toLowerCase().includes(q) || (v.tags || []).some((t) => t.toLowerCase().includes(q))) &&
    (!prefs.fav || v.fav) && (!prefs.tag || (v.tags || []).includes(prefs.tag))
  ));

  if (list.length === 0) {
    grid.innerHTML = `<div class="vault-empty">${vault.length ? "Nenhuma conta encontrada." : "Nenhuma conta salva no cofre."}</div>`; return;
  }

  list.forEach((v, i) => {
    const card = document.createElement("div");
    card.className = "vault-card" + (v.id === activeId ? " is-active" : "") + (v.expired ? " is-expired" : "") + (v.id === checkingId ? " checking" : "");
    card.dataset.vaultId = v.id;
    card.style.setProperty("--i", Math.min(i, 14));

    const tag = v.id === activeId ? `<span class="tag tag-on">Ativa</span>` : v.expired ? `<span class="tag tag-off">Expirada</span>` : !v.cookie ? `<span class="tag tag-off">Sem cookie</span>` : "";
    const utags = (v.tags || []).map((t) => `<span class="user-tag">#${escapeHtml(t)}</span>`).join("");
    card.innerHTML = `
      <div class="vault-avatar-wrap"><img class="vault-avatar" alt="" /><span class="vault-status"></span></div>
      <div class="vault-info">
        <div class="vault-name"><span>${escapeHtml(v.name)}</span>${tag}</div>
        <div class="vault-date">${timeAgo(v.lastAccess)}</div>
        ${infoRow(v)}
        ${utags ? `<div class="user-tags">${utags}</div>` : ""}
        ${v.note ? `<div class="vault-note">${escapeHtml(v.note)}</div>` : ""}
      </div>
      <div class="vault-actions">
        <button class="vault-relog" title="Relogar nesta conta">${ICON_RELOG}<span>Relogar</span></button>
        <button class="vault-icon vault-fav${v.fav ? " on" : ""}" title="Favoritar">${ICON_STAR(!!v.fav)}</button>
        <button class="vault-icon vault-edit" title="Tags e nota">${ICON_EDIT}</button>
        <button class="vault-del" title="Excluir">×</button>
      </div>`;

    const img = card.querySelector(".vault-avatar");
    setAvatar(img, isFallbackAvatar(v.avatar) ? null : v.avatar, v.name);
    img.classList.toggle("is-loading", isFallbackAvatar(v.avatar));

    card.querySelector(".vault-relog").addEventListener("click", (e) => relog(v, e.currentTarget));
    card.querySelector(".vault-fav").addEventListener("click", async () => { await patchVault(v.id, { fav: !v.fav }); renderVault(); });
    card.querySelector(".vault-edit").addEventListener("click", () => openEdit(v));
    card.querySelector(".vault-del").addEventListener("click", async () => {
      if (await openModal({ title: "Excluir Conta", body: `Remover "${v.name}" do cofre?`, confirmText: "Excluir" })) {
        vault = vault.filter((x) => x.id !== v.id);
        await storageSet({ vault });
        renderVault(); toast("Conta removida do cofre.");
      }
    });
    grid.appendChild(card);
  });
}

/** Corrige/atualiza avatares ausentes ou velhos. */
async function refreshAvatars() {
  if (refreshing) return; refreshing = true;
  try {
    const stale = vault.filter((v) => isFallbackAvatar(v.avatar) || Date.now() - (v.avatarAt || 0) > AVATAR_TTL);
    if (!stale.length) return;
    const map = await fetchAvatars(stale.map((v) => v.id));
    if (!map.size) { renderVault(); return; }
    const { vault: fresh = [] } = await storageGet("vault");
    const now = Date.now();
    for (const v of fresh) {
      const src = map.get(Number(v.id));
      if (!src) continue;
      v.avatar = src; v.avatarAt = now;
      setAvatar(document.querySelector(`[data-vault-id="${v.id}"] .vault-avatar`), src, v.name);
    }
    await storageSet({ vault: fresh }); vault = fresh;
    renderVault();
  } finally { refreshing = false; }
}

export function initVaultTab() {
  $("#vault-search").addEventListener("input", renderVault);
  $("#vault-sort").addEventListener("change", (e) => { prefs.sort = e.target.value; savePrefs(); renderVault(); });
  $("#vault-verify").addEventListener("click", verifyAll);
  $("#edit-cancel").addEventListener("click", closeEdit);
  $("#edit-save").addEventListener("click", saveEdit);
  $("#edit-overlay").addEventListener("click", (e) => { if (e.target.id === "edit-overlay") closeEdit(); });
  document.addEventListener("keydown", (e) => {
    if ($("#edit-overlay").classList.contains("hidden")) return;
    if (e.key === "Escape") closeEdit();
    if (e.key === "Enter" && e.target.id === "edit-tags") saveEdit();
  });
  document.addEventListener("vaultUpdated", async () => { if (verifying) return; await reloadState(); renderVault(); refreshAvatars(); });
}

export async function restoreVault() {
  await reloadState(); renderVault(); refreshAvatars();
}
