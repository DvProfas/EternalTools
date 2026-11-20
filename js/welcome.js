import { $, storageGet, storageSet } from './utils.js';

/** Mostra o popup de boas-vindas só na primeira vez (até o usuário aceitar). */
export async function initWelcome(delayMs = 0) {
  const { welcomeAccepted } = await storageGet("welcomeAccepted");
  if (welcomeAccepted) return;

  const overlay = $("#welcome-overlay"), agree = $("#welcome-agree"), btn = $("#welcome-continue");
  agree.addEventListener("change", () => { btn.disabled = !agree.checked; });
  btn.addEventListener("click", async () => {
    if (!agree.checked) return;
    await storageSet({ welcomeAccepted: true, welcomeAcceptedAt: Date.now() });
    overlay.classList.add("closing");
    setTimeout(() => overlay.classList.add("hidden"), 280);
  });
  // não fecha por clique fora nem por ESC: precisa aceitar
  setTimeout(() => { overlay.classList.remove("hidden"); agree.focus(); }, delayMs);
}
