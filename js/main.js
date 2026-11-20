import { initTabs, initModal, initVisibilityHandler } from './utils.js';
import { initCookiesTab, restoreAccount } from './cookies.js';
import { initAuthTab, restoreSecrets } from './auth.js';
import { initFriendsTab } from './friends.js';
import { initVaultTab, restoreVault } from './vault.js';
import { initParticles } from './particles.js';
import { loadSettings, initSettings, settings } from './settings.js';
import { initWelcome } from './welcome.js';

// Verificação de Integridade: se o background marcou a extensão como adulterada,
// mostra um aviso, desabilita os botões principais e bloqueia a tela inteira.
async function checkTamperStatus() {
  try {
    const { tampered } = await chrome.storage.local.get("tampered");
    if (tampered !== true) return;
    if (document.getElementById("tamper-banner")) return;

    const banner = document.createElement("div");
    banner.id = "tamper-banner";
    banner.style.cssText = "position: fixed; top: 0; left: 0; right: 0; z-index: 99999; background: #ff3b30; color: white; text-align: center; padding: 12px; font-weight: bold; font-family: sans-serif;";
    banner.textContent = "⚠️ Extensão modificada. Reinstale a versão original.";
    document.body.prepend(banner);

    const overlay = document.createElement("div");
    overlay.id = "tamper-overlay";
    overlay.style.cssText = "position: fixed; inset: 0; z-index: 99998; background: rgba(0,0,0,0.5);";
    document.body.appendChild(overlay);

    for (const id of ["#btn-connect", "#btn-remove-friends", "#btn-add-secret"]) {
      const btn = document.querySelector(id);
      if (!btn) continue;
      btn.disabled = true;
      // Outros módulos (ex.: setLoading) reabilitam botões; mantém desabilitado.
      new MutationObserver(() => { if (!btn.disabled) btn.disabled = true; })
        .observe(btn, { attributes: true, attributeFilter: ["disabled"] });
    }
  } catch (error) {
    console.error("Erro ao verificar integridade:", error);
  }
}

async function init() {
  await checkTamperStatus();
  try {
    await loadSettings();
    initParticles();
    initSettings();
    initTabs();
    initModal();
    initVisibilityHandler();

    initCookiesTab();
    initAuthTab();
    initFriendsTab();
    initVaultTab();

    initWelcome(settings.skipSplash ? 200 : 2500);
    await Promise.all([restoreVault(), restoreSecrets(), restoreAccount()]);
  } catch (error) {
    console.error("Erro na inicialização:", error);
  }
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("load", () => setTimeout(() => { document.getElementById("app")?.classList.add("ready"); document.getElementById("app")?.removeAttribute("aria-hidden"); }, document.documentElement.dataset.skipSplash ? 0 : 2300));
