export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);
export const storageGet = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
export const storageSet = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function toast(msg) {
  const c = $("#toast-container"); if (!c) return;
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2700);
  setTimeout(() => el.remove(), 3050);
}

export function showBanner(id, text) {
  const el = $(id); if (el) { el.textContent = text; el.classList.remove("hidden"); }
}

export function hideBanner(id) { const el = $(id); if (el) el.classList.add("hidden"); }

export function setLoading(btn, loading, hasLabel) {
  if (!btn) return;
  const label = btn.querySelector(".btn-label"); const spinner = btn.querySelector(".spinner");
  if (loading) {
    btn.disabled = true;
    if (spinner) spinner.classList.remove("hidden");
    if (label && hasLabel) label.textContent = "Aguarde…";
  } else {
    btn.disabled = false;
    if (spinner) spinner.classList.add("hidden");
    if (label && hasLabel) label.textContent = btn.dataset.label;
  }
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------
   AVATARES
   Causa do bug antigo: as imagens vêm de *.rbxcdn.com, que não
   estava em host_permissions → o XHR falhava por CORS → sempre
   caía no avatar de letra (e esse fallback ficava salvo no cofre).
   Agora: busca em lote, retry quando "Pending", cache em memória,
   e se o download em base64 falhar usa a própria URL na <img>.
   ------------------------------------------------------------ */
export function getFallbackAvatar(name) {
  const initial = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#0a0a0a"/></linearGradient></defs><rect width="150" height="150" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="70" font-weight="800" fill="#fff">${escapeHtml(initial)}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export const isFallbackAvatar = (src) => !src || String(src).startsWith("data:image/svg+xml");

const avatarCache = new Map();
export const getCachedAvatar = (id) => avatarCache.get(Number(id)) || null;

async function urlToDataUrl(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onloadend = () => res(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** Busca avatares em lote. Retorna Map<id, src> só com os que deram certo. */
export async function fetchAvatars(ids, size = "150x150") {
  const out = new Map();
  let pending = [...new Set(ids.map(Number))].filter((id) => {
    if (avatarCache.has(id)) { out.set(id, avatarCache.get(id)); return false; }
    return true;
  });

  for (let attempt = 0; attempt < 4 && pending.length; attempt++) {
    const retry = [];
    for (let i = 0; i < pending.length; i += 100) {
      const chunk = pending.slice(i, i + 100);
      try {
        const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(",")}&size=${size}&format=Png&isCircular=false`, { cache: "no-store" });
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        const byId = new Map((j.data || []).map((d) => [Number(d.targetId), d]));
        await Promise.all(chunk.map(async (id) => {
          const d = byId.get(id);
          if (d && d.state === "Completed" && d.imageUrl) {
            const src = (await urlToDataUrl(d.imageUrl)) || d.imageUrl;
            avatarCache.set(id, src); out.set(id, src);
          } else if (!d || d.state === "Pending" || d.state === "InReview") {
            retry.push(id);
          } // Blocked / Error: desiste
        }));
      } catch { retry.push(...chunk); }
    }
    pending = retry;
    if (pending.length) await sleep(600 * (attempt + 1));
  }
  return out;
}

export async function fetchAvatar(id) {
  const m = await fetchAvatars([id]);
  return m.get(Number(id)) || null;
}

/** Aplica src numa <img> com skeleton de loading e fallback de letra se quebrar. */
export function setAvatar(img, src, name) {
  if (!img) return;
  const fallback = getFallbackAvatar(name);
  img.classList.add("is-loading");
  img.onload = () => img.classList.remove("is-loading");
  img.onerror = () => { img.onerror = null; img.src = fallback; img.classList.remove("is-loading"); };
  img.src = src || fallback;
  if (!src) img.classList.remove("is-loading");
}

export async function getCsrfToken() {
  try {
    const res = await fetch("https://auth.roblox.com/v2/logout", { method: "POST", credentials: "include" });
    if (res.headers.has("x-csrf-token")) return res.headers.get("x-csrf-token");
  } catch (e) { console.error("CSRF Error", e); }
  return null;
}

/* ------------------------------------------------------------ */
function moveNavIndicator() {
  const nav = $(".nav"), ind = $(".nav-indicator"), active = $(".nav-item.active");
  if (!nav || !ind || !active) return;
  ind.style.width = active.offsetWidth + "px";
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
  ind.style.opacity = "1";
}

export function initTabs() {
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.tab;
      $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
      moveNavIndicator();
      if (name === "auth" && window.startTotpTimer) window.startTotpTimer();
      else if (window.stopTotpTimer) window.stopTotpTimer();
    });
  });
  $(".brand-text").addEventListener("click", (e) => { e.preventDefault(); $('.nav-item[data-tab="cookies"]').click(); });
  window.addEventListener("resize", moveNavIndicator);
  requestAnimationFrame(moveNavIndicator);
  setTimeout(moveNavIndicator, 2600); // após o app aparecer (fontes/layout)
}

let modalResolve = null;
export function openModal({ title, body, confirmText = "Confirmar" }) {
  $("#modal-title").textContent = title; $("#modal-body").textContent = body; $("#modal-confirm").textContent = confirmText;
  $("#modal-overlay").classList.remove("hidden");
  return new Promise((res) => { modalResolve = res; });
}

export function closeModal(result) {
  $("#modal-overlay").classList.add("hidden");
  if (modalResolve) { const r = modalResolve; modalResolve = null; r(result); }
}

export function initModal() {
  $("#modal-cancel").addEventListener("click", () => closeModal(false));
  $("#modal-confirm").addEventListener("click", () => closeModal(true));
  $("#modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") closeModal(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(false); });
}

export function initVisibilityHandler() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && window.stopTotpTimer) window.stopTotpTimer();
    else if (!document.hidden && $("#tab-auth").classList.contains("active") && window.startTotpTimer) window.startTotpTimer();
  });
}
