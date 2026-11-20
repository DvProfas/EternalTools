const APP_URL = chrome.runtime.getURL("app.html");

// ─────────────────────────────────────────────────────────────
// Verificação de Integridade (Tamper Protection)
// Gere os valores com:  ./gerar-hashes.sh
// e cole o objeto impresso abaixo, substituindo os "HASH_AQUI".
// ─────────────────────────────────────────────────────────────
const EXPECTED_SHA256 = {
  "app.html": "7641e7b780436f7e1879bce7819f5e0817e2084d92ce4dd6f1ba7752e95ed24d",
  "js/auth.js": "2d19a050c62872bc908f3a550ac42262844bc909078b9dd14525c5f560c19fc8",
  "js/boot.js": "c0aef4ec10280af056b9a71f71fb132898d2486dea1c95a42fc4e84ae94a025c",
  "js/cookies.js": "b24c23543062c0da2387766ce4be6c297747cfa0030843a2de454ade749089ea",
  "js/friends.js": "b41cafee247fab871deecd95e1cc54366f257ccef2b179498f80fe068997f080",
  "js/main.js": "fb0428fa83b0bb1a46032008cabf66652e01ca76bab81387e2d1ec74f73fb9b0",
  "js/particles.js": "4835f7667456cefb74933a78d9c72bb3712259892308fcfb08cb0792739f932b",
  "js/roblox.js": "791d4bb0e68b002bafe1f66df97b88e3d8de468cd125e0e9bd6033f246bc7f63",
  "js/settings.js": "5a666929ed6281a48a7b9105ac5e606c378c4e34fbb892b6d0f030070961b254",
  "js/utils.js": "67996a8de97d0a2549bab4d2b4e3ac8f493c3e1d9450d2b1578c80ca090d2412",
  "js/vault.js": "93bfc46ecc0873b4b693fd96761dd05ea9349accd41568aa98c052534043e0f5",
  "js/welcome.js": "b4b932e0375b6d838d2b5516d95e4c2d247521b9d866284dd0954030e45262fb"
};

const TAMPERED_ERROR = "Integridade comprometida.";

// Converte um ArrayBuffer em string hexadecimal minúscula (64 caracteres para SHA-256).
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Lê um arquivo da extensão e devolve o SHA-256 em hexadecimal minúscula.
async function hashExtensionFile(path) {
  const response = await fetch(chrome.runtime.getURL(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(digest);
}

// Confere todos os arquivos de EXPECTED_SHA256 e grava { tampered } no storage.
// Qualquer hash diferente (ou falha de leitura) marca a extensão como adulterada.
async function verifyIntegrity() {
  let tampered = false;

  for (const [path, expectedHash] of Object.entries(EXPECTED_SHA256)) {
    try {
      const actualHash = await hashExtensionFile(path);
      if (actualHash !== expectedHash) {
        tampered = true;
        console.warn(`[Eternal] Hash divergente: ${path}`);
      }
    } catch (e) {
      tampered = true;
      console.warn(`[Eternal] Falha ao verificar ${path}:`, e);
    }
  }

  try {
    await chrome.storage.local.set({ tampered });
  } catch (e) {
    console.error("[Eternal] Erro ao salvar estado de integridade:", e);
  }
  return tampered;
}

// Usado antes de qualquer ação sensível. NÃO confia no valor salvo no storage
// (qualquer um pode editá-lo pelo console): reverifica os arquivos na hora.
// Qualquer erro é tratado como adulterado (fail-closed).
async function isTampered() {
  try {
    return await verifyIntegrity();
  } catch (e) {
    console.error("[Eternal] Erro ao verificar integridade:", e);
    return true;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  verifyIntegrity();

  chrome.storage.local.get(["vault", "secrets"], (res) => {
    const patch = {};
    if (!Array.isArray(res.vault)) patch.vault = [];
    if (!Array.isArray(res.secrets)) patch.secrets = [];
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
  });
});

chrome.runtime.onStartup.addListener(() => {
  verifyIntegrity();
});

chrome.action.onClicked.addListener(async () => {
  try {
    const existing = await chrome.tabs.query({ url: APP_URL });
    if (existing.length > 0) {
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: APP_URL });
    }
  } catch (e) {
    console.error("[Eternal] Erro ao abrir:", e);
  }
});

function setRobloxCookie(value, sendResponse) {
  chrome.cookies.set({
    url: "https://www.roblox.com",
    domain: ".roblox.com",
    name: ".ROBLOSECURITY",
    value,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "no_restriction",
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  }, (cookie) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ ok: true, cookie });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SET_COOKIE") return false;

  (async () => {
    // Bloqueio de integridade ANTES de qualquer lógica de ação.
    if (await isTampered()) {
      sendResponse({ ok: false, error: TAMPERED_ERROR });
      return;
    }
    setRobloxCookie(msg.value, sendResponse);
  })();

  return true; // resposta assíncrona
});
