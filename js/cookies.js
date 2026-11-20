import { $, storageGet, storageSet, toast, showBanner, hideBanner, setLoading, sleep, fetchAvatar, setAvatar } from './utils.js';
import { postLogin } from './settings.js';

const ROBLOX = "https://www.roblox.com";

async function fetchAuthenticated() {
  const res = await fetch("https://users.roblox.com/v1/users/authenticated", { credentials: "include", cache: "no-store" });
  if (!res.ok) { const e = new Error("unauthorized"); e.code = "unauthorized"; throw e; }
  return res.json();
}

const normalizeCookie = (raw) => String(raw || "").trim().replace(/^\.ROBLOSECURITY=/, "").replace(/;\s*$/, "");

/** Atualiza card "Conta Ativa" + chip do header. */
export function applyAccountUI(account, avatar) {
  const chip = $("#account-chip");
  if (account) {
    $("#acc-name").textContent = account.name;
    $("#acc-id").textContent = "ID " + account.id;
    $("#acc-status").textContent = "Conectado"; $("#acc-status").dataset.live = "true";
    setAvatar($("#acc-avatar"), avatar, account.name);
    chip.dataset.empty = "false"; $("#chip-name").textContent = account.name;
    setAvatar($("#chip-avatar"), avatar, account.name);
  } else {
    $("#acc-avatar").removeAttribute("src"); $("#acc-name").textContent = "Nenhuma conta conectada";
    $("#acc-id").textContent = "—"; $("#acc-status").textContent = "Desconectado"; $("#acc-status").dataset.live = "false";
    chip.dataset.empty = "true"; $("#chip-name").textContent = "—"; $("#chip-avatar").removeAttribute("src");
  }
}

/**
 * Aplica o cookie no navegador, valida na Roblox e salva/atualiza a conta no cofre
 * (agora guardando o cookie, que é o que permite o botão "Relogar").
 * Lança erro com code "set" (falha ao gravar) ou "unauthorized" (cookie inválido/expirado).
 */
export async function loginWithCookie(rawValue, { reloadTabs = false } = {}) {
  const value = normalizeCookie(rawValue);
  if (!value) { const e = new Error("empty"); e.code = "unauthorized"; throw e; }

  const setRes = await new Promise((res) => chrome.runtime.sendMessage({ type: "SET_COOKIE", value }, res));
  if (!setRes?.ok) { const e = new Error("Falha ao salvar cookie"); e.code = "set"; throw e; }
  await sleep(250);

  const user = await fetchAuthenticated();

  // A Roblox pode rotacionar o valor do cookie; guarda o atual do navegador.
  let current = value;
  try {
    const c = await new Promise((res) => chrome.cookies.get({ url: ROBLOX, name: ".ROBLOSECURITY" }, res));
    if (c?.value) current = c.value;
  } catch {}

  const avatar = await fetchAvatar(user.id);          // null se falhar (nunca salva a letra)
  const account = { id: user.id, name: user.name };
  applyAccountUI(account, avatar);

  const { vault = [] } = await storageGet("vault");
  const now = Date.now();
  const entry = vault.find((v) => v.id === user.id);
  if (entry) {
    Object.assign(entry, { name: user.name, cookie: current, lastAccess: now, expired: false });
    if (avatar) { entry.avatar = avatar; entry.avatarAt = now; }
  } else {
    vault.push({ id: user.id, name: user.name, cookie: current, avatar: avatar || null, avatarAt: avatar ? now : 0, lastAccess: now, expired: false });
  }
  await storageSet({ vault, account });
  document.dispatchEvent(new CustomEvent("vaultUpdated"));

  await postLogin(user, { reload: reloadTabs });
  return { user, avatar };
}

async function connectCookie() {
  hideBanner("#cookie-banner");
  const raw = $("#cookie-input").value.trim();
  if (!raw) return showBanner("#cookie-banner", "Cole o cookie antes de conectar.");
  const btn = $("#btn-connect"); setLoading(btn, true, true);
  try {
    const { user } = await loginWithCookie(raw);
    toast("Conectado como " + user.name);
  } catch (err) {
    showBanner("#cookie-banner", err.code === "set" ? "Não foi possível gravar o cookie no navegador." : "Cookie inválido ou expirado.");
    $("#acc-status").textContent = "Desconectado"; $("#acc-status").dataset.live = "false";
  } finally { setLoading(btn, false, true); }
}

async function disconnectCookie() {
  await new Promise((res) => chrome.cookies.remove({ url: ROBLOX, name: ".ROBLOSECURITY" }, res));
  await storageSet({ account: null });
  $("#cookie-input").value = "";
  applyAccountUI(null);
  document.dispatchEvent(new CustomEvent("vaultUpdated"));
  toast("Desconectado.");
}

export function initCookiesTab() {
  $("#btn-connect").addEventListener("click", connectCookie);
  $("#btn-disconnect").addEventListener("click", disconnectCookie);
}

export async function restoreAccount() {
  const { account } = await storageGet("account");
  if (!account) return;
  // mostra o que já sabemos na hora (skeleton) e confirma na Roblox em seguida
  applyAccountUI(account, null);
  $("#acc-status").textContent = "Verificando…"; $("#acc-status").dataset.live = "false";
  try {
    const user = await fetchAuthenticated();
    const avatar = await fetchAvatar(user.id);
    applyAccountUI({ id: user.id, name: user.name }, avatar);
  } catch {
    applyAccountUI(null);
    $("#acc-status").textContent = "Sessão expirada";
  }
}
