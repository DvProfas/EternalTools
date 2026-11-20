// Bolinhas de fundo — versão leve: sprites pré-renderizados, 30fps, sem shadowBlur/gradientes por frame.
export function initParticles() {
  const canvas = document.getElementById("bg-particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FRAME = 1000 / 30;
  let w = 0, h = 0, dpr = 1, last = 0, t = 0, running = false;
  const bubbles = [], pops = [];
  const mouse = { x: -9999, y: -9999 };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // sprites (na cor do tema)
  const mk = (size, draw) => { const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size); return c; };
  let dot, ring;
  function build(rgb) {
    dot = mk(32, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(.35, `rgba(${rgb},.55)`); r.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    ring = mk(64, (g, s) => {
      const c = s / 2, r = c - 2;
      const f = g.createRadialGradient(c - r * .35, c - r * .35, r * .1, c, c, r);
      f.addColorStop(0, `rgba(${rgb},.4)`); f.addColorStop(1, `rgba(${rgb},.05)`);
      g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.fillStyle = f; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = `rgba(${rgb},.95)`; g.stroke();
      g.beginPath(); g.arc(c - r * .38, c - r * .38, r * .15, 0, 6.2832); g.fillStyle = "#fff"; g.fill();
    });
  }
  build(getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim() || "255,255,255");
  document.addEventListener("eternal:theme", (e) => build(e.detail || "255,255,255"));

  function make(init) {
    const r = 1.5 + Math.pow(Math.random(), 3) * 18;
    return { x: rnd(0, w), y: init ? rnd(0, h) : h + r + rnd(0, 60), r, vy: rnd(10, 28) * (.5 + r / 14),
      amp: rnd(6, 26), freq: rnd(.3, 1), ph: rnd(0, 6.28), a: rnd(.2, .6), ox: 0, oy: 0, vx: 0, vo: 0 };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = canvas.clientWidth || window.innerWidth, nh = canvas.clientHeight || window.innerHeight;
    if (nw === w && nh === h && bubbles.length) return;   // barra do navegador mexendo no scroll: não refaz
    w = nw; h = nh;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(55, Math.max(18, (w * h) / 32000)));
    while (bubbles.length < n) bubbles.push(make(true));
    bubbles.length = n;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < FRAME) return;
    const dt = Math.min(.06, (now - last) / 1000); last = now; t += dt;
    ctx.clearRect(0, 0, w, h);

    for (const b of bubbles) {
      b.y -= b.vy * dt;
      const x = b.x + Math.sin(t * b.freq + b.ph) * b.amp + b.ox, y = b.y + b.oy;
      const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 22500 && d2 > 1) { const d = Math.sqrt(d2), f = (1 - d / 150) * 420; b.vx += dx / d * f * dt; b.vo += dy / d * f * dt; }
      b.vx *= .9; b.vo *= .9; b.ox = (b.ox + b.vx * dt * 6) * .985; b.oy = (b.oy + b.vo * dt * 6) * .985;
      if (b.y < -b.r - 40) { Object.assign(b, make(false)); continue; }
      ctx.globalAlpha = b.a;
      if (b.r < 4.5) { const s = b.r * 4; ctx.drawImage(dot, x - s / 2, y - s / 2, s, s); }
      else { const s = b.r * 2 + 3; ctx.drawImage(ring, x - s / 2, y - s / 2, s, s); }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt;
      if (p.life <= 0) { pops.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .95; p.vy *= .95;
      ctx.globalAlpha = Math.max(0, p.life / p.max) * .8;
      ctx.drawImage(dot, p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
    }
    ctx.globalAlpha = 1;
  }

  let start = function () { if (running || reduce) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
  function stop() { running = false; }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  window.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
  window.addEventListener("pointerdown", (e) => {
    if (reduce) return;
    for (let i = 0; i < 8; i++) { const a = rnd(0, 6.28), s = rnd(60, 200), l = rnd(.5, 1); pops.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1.5, 3), life: l, max: l }); }
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  window.addEventListener("blur", stop); window.addEventListener("focus", () => start());

  let enabled = true;
  document.addEventListener("eternal:particles", (e) => {
    enabled = !!e.detail; canvas.style.display = enabled ? "" : "none";
    if (enabled) start(); else stop();
  });
  const _start = start; start = function () { if (enabled) _start(); };

  resize(); start();
}
