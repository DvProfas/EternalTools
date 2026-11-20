import { $, storageGet, storageSet, toast, showBanner, hideBanner, openModal, escapeHtml, generateUUID } from './utils.js';

const TOTP_PERIOD = 30;
const TOTP_CIRC = 2 * Math.PI * 14;
let secrets = [];
let totpTimer = null;
let totpCache = new Map();

function base32Decode(input) {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(input).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  if (!clean) throw new Error("Secret vazio");
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Caractere inválido");
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function hmacSha1(keyBytes, msgBytes) {
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, msgBytes));
}

async function generateTotp(secret) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const msg = new Uint8Array(8); let tmp = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = tmp & 0xff; tmp = Math.floor(tmp / 256); }
  const hmac = await hmacSha1(key, msg);
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return { code: (code % 1_000_000).toString().padStart(6, "0"), expiresAt: (counter + 1) * TOTP_PERIOD * 1000 };
}

async function tickTotp() {
  const now = Date.now(); const counter = Math.floor(now / TOTP_PERIOD);
  for (const s of secrets) {
    let entry = totpCache.get(s.id);
    if (!entry || entry.counter !== counter) {
      try { const { code, expiresAt } = await generateTotp(s.secret); entry = { code, expiresAt, counter }; }
      catch { entry = { code: "------", expiresAt: (counter + 1) * TOTP_PERIOD * 1000, counter, error: true }; }
      totpCache.set(s.id, entry);
    }
    const el = document.querySelector(`[data-totp-id="${s.id}"]`); if (!el) continue;
    const codeEl = el.querySelector(".totp-code"); const ringFg = el.querySelector(".totp-ring .fg");
    if (codeEl) codeEl.textContent = entry.error ? "— — —" : entry.code.replace(/(\d{3})(\d{3})/, "$1 $2");
    if (ringFg) {
      const remaining = Math.max(0, entry.expiresAt - now);
      ringFg.style.strokeDashoffset = (TOTP_CIRC * (1 - remaining / (TOTP_PERIOD * 1000))).toFixed(2);
    }
  }
}

window.startTotpTimer = () => { window.stopTotpTimer(); totpTimer = setInterval(tickTotp, 1000); tickTotp(); };
window.stopTotpTimer = () => { if (totpTimer) { clearInterval(totpTimer); totpTimer = null; } };

function renderTotpList() {
  const list = $("#totp-list"); list.innerHTML = ""; $("#totp-count").textContent = String(secrets.length);
  if (secrets.length === 0) { list.innerHTML = `<div class="totp-empty">Nenhum secret cadastrado.</div>`; return; }
  totpCache.clear();
  secrets.forEach((s) => {
    const item = document.createElement("div"); item.className = "totp-item"; item.dataset.totpId = s.id;
    item.innerHTML = `
      <div class="totp-ring"><svg width="44" height="44" viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="14"></circle><circle class="fg" cx="22" cy="22" r="14" stroke-dasharray="${TOTP_CIRC.toFixed(2)}"></circle></svg></div>
      <div class="totp-info"><div class="friend-handle">${escapeHtml(s.label)}</div><div class="totp-code">— — —</div></div>
      <div class="totp-actions"><button class="icon-btn" data-copy>Copiar</button><button class="icon-btn" data-del>X</button></div>`;
    item.querySelector("[data-copy]").addEventListener("click", async (e) => {
      const entry = totpCache.get(s.id);
      if (entry && !entry.error) {
        await navigator.clipboard.writeText(entry.code);
        const btn = e.currentTarget; const orig = btn.textContent;
        btn.textContent = "Copiado!"; btn.classList.add("success");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("success"); }, 1200);
      }
    });
    item.querySelector("[data-del]").addEventListener("click", async () => {
      if (await openModal({ title: "Remover", body: `Remover "${s.label}"?`, confirmText: "Remover" })) {
        secrets = secrets.filter((x) => x.id !== s.id); await storageSet({ secrets }); renderTotpList(); toast("Secret removido.");
      }
    });
    list.appendChild(item);
  });
  tickTotp();
}

async function addSecret() {
  hideBanner("#auth-banner");
  const label = $("#secret-label").value.trim() || "Sem rótulo"; const secret = $("#secret-input").value.trim();
  if (!secret) return showBanner("#auth-banner", "Informe um secret Base32.");
  try { base32Decode(secret); } catch (e) { return showBanner("#auth-banner", "Secret inválido."); }
  const { secrets: saved = [] } = await storageGet("secrets");
  saved.push({ id: generateUUID(), label, secret });
  await storageSet({ secrets: saved }); secrets = saved;
  $("#secret-label").value = ""; $("#secret-input").value = ""; renderTotpList(); toast("Secret adicionado.");
}

export function initAuthTab() {
  $("#btn-add-secret").addEventListener("click", addSecret);
  $("#secret-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addSecret(); });
}

export async function restoreSecrets() {
  const { secrets: saved = [] } = await storageGet("secrets"); secrets = saved; renderTotpList();
}