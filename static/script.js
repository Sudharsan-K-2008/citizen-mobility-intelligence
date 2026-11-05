/* =====================================================================
   script.js — visual & motion layer
   Depends on app.js (your logic). Never changes data/API behaviour.
   Sections: 0 helpers · 1 count-up · 2 preloader · 3 navbar/progress
             4 spotlight · 5 tilt · 6 reveals · 7 hero intro/parallax
             8 Three.js hero scene · 9 boot
   Every part degrades gracefully if a library fails to load.
   ===================================================================== */
(() => {
  "use strict";

  /* ---------- 0. helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = typeof gsap !== "undefined";
  const hasST = hasGSAP && typeof ScrollTrigger !== "undefined";
  if (hasST) gsap.registerPlugin(ScrollTrigger);
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const safe = fn => { try { fn(); } catch (e) { console.warn("[fx]", e); } };

  /* ---------- 1. animated count-up (used by app.js renderKPIs) ---------- */
  function countTo(el, to) {
    if (!el) return;
    to = Number(to) || 0;
    const from = Number(el.dataset.v ?? el.textContent) || 0;
    el.dataset.v = to;
    if (el._tw) el._tw.kill();
    if (from === to || !hasGSAP || reduced) { el.textContent = to; return; }
    const o = { v: from };
    el._tw = gsap.to(o, { v: to, duration: 0.9, ease: "power2.out", onUpdate: () => (el.textContent = Math.round(o.v)) });
  }
  window.FX = { countTo };

  /* ---------- 2. preloader ---------- */
  function hidePreloader() {
    const p = $("#preloader");
    if (!p || p.classList.contains("done")) return;
    p.classList.add("done");
    setTimeout(() => p.remove(), 800);
  }

  /* ---------- 3. navbar state + scroll progress ---------- */
  function initScrollUI() {
    const bar = $("#scrollProgress"), top = $("#topbar");
    let ticking = false;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
      top.classList.toggle("scrolled", h.scrollTop > 10);
      ticking = false;
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- 4. cursor spotlight on glass cards ---------- */
  function initSpotlight() {
    if (!canHover) return;
    document.addEventListener("pointermove", e => {
      const t = e.target.closest && e.target.closest(".card, .kpi, .item, .inc-card, .hstat");
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", e.clientX - r.left + "px");
      t.style.setProperty("--my", e.clientY - r.top + "px");
    }, { passive: true });
  }

  /* ---------- 5. 3D tilt on cards ---------- */
  function initTilt() {
    if (typeof VanillaTilt === "undefined" || !canHover || reduced) return;
    VanillaTilt.init($$("[data-tilt]"), { max: 6, speed: 600, perspective: 1000, scale: 1.015 });
  }

  /* ---------- 6. scroll reveals + list animation ---------- */
  let revealTriggers = [];
  function revealPanel(panel) {
    if (!hasST || reduced || !panel) return;
    revealTriggers.forEach(t => t.kill());
    const els = $$(".reveal", panel);
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: 28 });
    revealTriggers = ScrollTrigger.batch(els, {
      start: "top 92%",
      once: true,
      onEnter: batch => gsap.to(batch, {
        opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: "power3.out",
        clearProps: "transform",            // hand transform back to the tilt effect
        overwrite: true,
      }),
    });
    ScrollTrigger.refresh();
  }

  function animateItems(scope) {
    if (!hasGSAP || reduced) return;
    const els = $$("#priorityList .item, #recentList .item, #incidentList .inc-card", scope).slice(0, 24);
    if (!els.length) return;
    gsap.fromTo(els, { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.035, ease: "power2.out", clearProps: "transform,opacity", overwrite: "auto" });
  }

  function initTabHooks() {
    // app.js dispatches "tabchange" and "dataloaded"
    document.addEventListener("tabchange", e => {
      const name = e.detail, panel = $("#tab-" + name);
      $$(".tab").forEach(b => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
      revealPanel(panel);
      animateItems(panel);
    });
    document.addEventListener("dataloaded", () => animateItems(document), { once: true });

    // hero buttons: data-goto="tab", data-scroll="#selector"
    document.addEventListener("click", e => {
      const g = e.target.closest("[data-goto]");
      if (g && window.showTab) window.showTab(g.dataset.goto);
      const s = e.target.closest("[data-scroll]");
      if (s) { const t = $(s.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "center" }); }
    });
  }

  /* ---------- 7. hero intro, parallax, magnetic buttons ---------- */
  function prepHeroIntro() {
    if (hasGSAP && !reduced) gsap.set([...$$("[data-hero]"), "#hero3d"], { opacity: 0 });
  }
  function playHeroIntro() {
    if (!hasGSAP || reduced) return;
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .fromTo("[data-hero]", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, clearProps: "transform" })
      .fromTo("#hero3d", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 1.2 }, 0.1);
  }
  function initParallax() {
    if (!hasST || reduced) return;
    gsap.to("#hero3d", { y: -50, ease: "none", scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero-copy", { y: 30, ease: "none", scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true } });
    const body = { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.6 };
    gsap.to(".orb-1", { y: 260, ease: "none", scrollTrigger: body });
    gsap.to(".orb-2", { y: -260, ease: "none", scrollTrigger: body });
  }
  function initMagnetic() {
    if (!hasGSAP || !canHover || reduced) return;
    $$(".hero-cta .btn").forEach(b => {
      const xTo = gsap.quickTo(b, "x", { duration: 0.4, ease: "power3" });
      const yTo = gsap.quickTo(b, "y", { duration: 0.4, ease: "power3" });
      b.addEventListener("pointermove", e => {
        const r = b.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.18);
        yTo((e.clientY - r.top - r.height / 2) * 0.25);
      });
      b.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    });
  }

  /* ---------- 8. Three.js hero: "city intelligence globe" ---------- */
  function makeSprite() {                      // soft round particle texture
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  function spherePoints(n, r, jitter = 0) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const rr = r + Math.random() * jitter;
      a[i * 3] = rr * s * Math.cos(t); a[i * 3 + 1] = rr * u; a[i * 3 + 2] = rr * s * Math.sin(t);
    }
    return a;
  }

  let heroReady = false;
  function initHero3D() {
    const host = $("#hero3d");
    if (heroReady || !host || typeof THREE === "undefined") return;
    if (!matchMedia("(min-width: 761px)").matches) return;      // phones: skip heavy 3D
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch (e) { return; }                                        // no WebGL: CSS glow remains
    heroReady = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const accent = new THREE.Color(cssVar("--accent")), accent2 = new THREE.Color(cssVar("--accent-2")), warm = new THREE.Color("#fb923c");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(0, 0, 7);
    const root = new THREE.Group(); scene.add(root);          // follows the mouse
    const spin = new THREE.Group(); root.add(spin);           // slow auto-rotation
    const sprite = makeSprite(), R = 1.75;

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const l1 = new THREE.PointLight(accent, 1.4, 30); l1.position.set(4, 3, 5); scene.add(l1);
    const l2 = new THREE.PointLight(accent2, 1.2, 30); l2.position.set(-4, -2, 3); scene.add(l2);

    // wireframe globe + glowing core
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20),
      new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.22 })));
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1),
      new THREE.MeshStandardMaterial({ color: 0x10183a, emissive: accent2, emissiveIntensity: 0.28, metalness: 0.7, roughness: 0.3, flatShading: true }));
    spin.add(core);

    // incident "pings" on the surface
    const pts = (n, color, size) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(spherePoints(n, R * 1.01), 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ size, map: sprite, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    };
    const mA = pts(46, accent, 0.26), mB = pts(16, warm, 0.32);
    spin.add(mA, mB);

    // route arcs between pings
    const pos = mA.geometry.attributes.position;
    const arcMat = new THREE.LineBasicMaterial({ color: accent2, transparent: true, opacity: 0.45 });
    for (let i = 0; i < 9; i++) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, Math.floor(Math.random() * pos.count));
      const b = new THREE.Vector3().fromBufferAttribute(pos, Math.floor(Math.random() * pos.count));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      if (mid.lengthSq() < 0.05) continue;
      mid.normalize().multiplyScalar(R * 1.55);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      spin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), arcMat));
    }

    // orbit rings with moving "vehicles"
    const mkRing = (radius, rot, color, speed) => {
      const g = new THREE.Group(); g.rotation.set(rot[0], rot[1], rot[2]); root.add(g);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 180),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })));
      const pivot = new THREE.Group(); g.add(pivot);
      const car = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), new THREE.MeshBasicMaterial({ color: accent }));
      car.position.x = radius; pivot.add(car);
      return { pivot, speed };
    };
    const rings = [mkRing(2.55, [1.15, 0, 0.4], accent2, 0.6), mkRing(3.05, [0.5, 0.6, -0.3], accent, -0.45)];

    // star field
    const sp = spherePoints(900, 4.5, 5);
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.05, map: sprite, color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(stars);

    // pointer parallax
    const mouse = { x: 0, y: 0 }, hero = $("#hero");
    hero.addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    }, { passive: true });
    hero.addEventListener("pointerleave", () => { mouse.x = mouse.y = 0; });

    // render loop (paused when hero is hidden / off-screen / tab inactive)
    const clock = new THREE.Clock();
    let raf = 0, visible = true;
    const update = () => {
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      spin.rotation.y += dt * 0.18; core.rotation.x -= dt * 0.25; core.rotation.y += dt * 0.3;
      rings.forEach(r => (r.pivot.rotation.z += dt * r.speed));
      root.rotation.x += (mouse.y * 0.35 - root.rotation.x) * 0.05;
      root.rotation.y += (mouse.x * 0.55 - root.rotation.y) * 0.05;
      root.position.y = Math.sin(t * 0.8) * 0.1;
      mA.material.size = 0.26 + Math.sin(t * 2) * 0.05;
      mB.material.size = 0.32 + Math.sin(t * 3 + 1) * 0.07;
      stars.rotation.y += dt * 0.01;
      camera.position.x += (mouse.x * 0.4 - camera.position.x) * 0.04;
      camera.position.y += (-mouse.y * 0.3 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
    };
    const frame = () => {
      raf = 0;
      if (!visible || document.hidden) return;
      update(); renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };

    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }).observe(host);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
    new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.render(scene, camera);                        // also gives reduced-motion users a static frame
    }).observe(host);
    start();
  }

  /* ---------- 9. boot ---------- */
  function boot() {
    safe(initScrollUI);
    safe(initSpotlight);
    safe(initTabHooks);
    safe(initTilt);
    safe(prepHeroIntro);
    safe(() => revealPanel($("#tab-dashboard")));
    safe(initParallax);
    safe(initMagnetic);
    safe(initHero3D);
    // build the 3D scene later too if the window is enlarged from phone size
    matchMedia("(min-width: 761px)").addEventListener("change", e => { if (e.matches) safe(initHero3D); });
    setTimeout(() => { hidePreloader(); safe(playHeroIntro); }, reduced ? 0 : 1000);
  }
  boot();
})();