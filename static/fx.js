/* fx.js – rain, thunder and flame cursor. Each effect is isolated
   in try/catch, so an error here can never break your buttons. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const $ = s => document.querySelector(s);
  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn("fx:", name, e); } };
  let thunder = () => {};

  /* ---------- Rain + lightning bolt + flash ---------- */
  safe("rain", () => {
    const c = $("#rain"); if (!c || reduce) return;
    const g = c.getContext("2d"), flash = $("#flash");
    let W, H, drops = [], bolt = null;
    const mk = () => ({ x: Math.random() * W * 1.2 - W * .1, y: Math.random() * H, l: 10 + Math.random() * 18, v: 9 + Math.random() * 9, a: .12 + Math.random() * .28 });
    const size = () => {
      W = c.width = innerWidth; H = c.height = innerHeight;
      drops = Array.from({ length: Math.min(W < 700 ? 90 : 220, Math.floor(W / 6)) }, mk);
    };
    size(); addEventListener("resize", size);

    function path(x, y, limit, spread) {
      const pts = [[x, y]];
      while (y < limit) { x += (Math.random() - .5) * spread; y += 18 + Math.random() * 30; pts.push([x, y]); }
      return pts;
    }
    function makeBolt() {
      const main = path(W * (.15 + Math.random() * .7), 0, H * (.4 + Math.random() * .35), 70);
      const k = Math.floor(main.length * (.35 + Math.random() * .3));
      const branch = path(main[k][0], main[k][1], main[k][1] + H * .2, 60);   // small side branch
      bolt = { lines: [main, branch], t: 0 };
    }
    function drawBolt() {
      if (!bolt) return;
      const t = bolt.t++;
      if (t > 16) { bolt = null; return; }
      const a = t < 4 ? 1 : t < 7 ? .15 : t < 10 ? .9 : Math.max(0, (16 - t) / 6);
      g.save(); g.shadowBlur = 24; g.shadowColor = "#9ec5ff"; g.lineJoin = "round";
      bolt.lines.forEach((pts, i) => {
        g.strokeStyle = `rgba(235,242,255,${i ? a * .6 : a})`; g.lineWidth = i ? 1.4 : 2.4;
        g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      });
      g.restore();
    }
    (function frame() {
      g.clearRect(0, 0, W, H); g.lineWidth = 1;
      for (const d of drops) {
        g.strokeStyle = `rgba(150,190,255,${d.a})`;
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - d.l * .25, d.y + d.l); g.stroke();
        d.y += d.v; d.x -= d.v * .25;
        if (d.y > H) { d.y = -20; d.x = Math.random() * W * 1.2; }
      }
      drawBolt();
      requestAnimationFrame(frame);
    })();

    thunder = () => {
      if (document.hidden) return;
      makeBolt();
      if (flash) { flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go"); }
    };
    // Rare: first strike ~6 s after load, then every 15–38 s.
    (function schedule(first) { setTimeout(() => { thunder(); schedule(false); }, first ? 6000 : 15000 + Math.random() * 23000); })(true);
  });

  /* ---------- Flame trail + glow following the mouse ---------- */
  safe("flame", () => {
    const c = $("#flame"), glow = $("#glow");
    if (!c || reduce || !fine) return;
    const g = c.getContext("2d"); let parts = [];
    const size = () => { c.width = innerWidth; c.height = innerHeight; };
    size(); addEventListener("resize", size);

    addEventListener("pointermove", e => {
      if (e.pointerType === "touch") return;
      if (glow) { glow.classList.add("on"); glow.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }
      for (let i = 0; i < 3; i++) parts.push({
        x: e.clientX + (Math.random() - .5) * 8, y: e.clientY + (Math.random() - .5) * 8,
        vx: (Math.random() - .5) * .9, vy: -(.8 + Math.random() * 1.8),
        r: 6 + Math.random() * 9, life: 1, d: .018 + Math.random() * .02 });
      if (parts.length > 180) parts.splice(0, parts.length - 180);
    }, { passive: true });
    document.addEventListener("mouseleave", () => glow && glow.classList.remove("on"));

    (function loop() {
      g.clearRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "lighter";
      parts = parts.filter(p => p.life > 0);
      for (const p of parts) {
        p.x += p.vx + Math.sin(p.y * .05) * .3; p.y += p.vy; p.life -= p.d; p.r *= .985;
        const hue = 8 + 42 * p.life;                         // new = yellow, old = red
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, `hsla(${hue},100%,${55 + 20 * p.life}%,${p.life * .6})`);
        gr.addColorStop(1, `hsla(${hue},100%,50%,0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
      }
      g.globalCompositeOperation = "source-over";
      requestAnimationFrame(loop);
    })();
  });

  // Lets you test thunder instantly: type FX.thunder() in the browser console (F12).
  window.FX = Object.assign(window.FX || {}, { thunder: () => thunder() });
})();