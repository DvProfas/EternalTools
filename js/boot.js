// Roda antes de pintar a página: aplica tema/preferências salvas (evita "piscar" de cor).
try {
  const s = JSON.parse(localStorage.getItem("eternal_boot") || "{}");
  const r = document.documentElement;
  if (s.theme) r.dataset.theme = s.theme;
  if (s.skipSplash) r.dataset.skipSplash = "1";
  if (s.streamer) r.dataset.streamer = "1";
  if (typeof s.dim === "number") r.style.setProperty("--dim", String(s.dim / 100));
} catch {}
