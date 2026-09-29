export const HURRY_GAME_STYLES = `
.hurry-trigger { position: relative; margin-top: 4px; padding: 6px 13px; border-radius: 999px; border: none; background: linear-gradient(100deg, #ff2e88, #ff7a18 55%, #ffd23f); color: #1a0633; font-family: "Bungee", "IBM Plex Mono", monospace; font-size: 11px; letter-spacing: 0.06em; cursor: pointer; box-shadow: 0 4px 16px -4px #ff2e88aa, inset 0 -2px 0 #0003; transition: transform 0.15s ease, box-shadow 0.15s ease; }
.hurry-trigger:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 8px 22px -6px #ff2e88, inset 0 -2px 0 #0003; }
.hurry-trigger:active { transform: scale(0.96); }
.hurry-cooling { margin-top: 4px; color: var(--muted); }
.badge-hurry { background: linear-gradient(100deg, #ff2e88, #ff7a18); color: #fff; animation: hurry-wobble 2.4s ease-in-out infinite; }
@keyframes hurry-wobble { 0%, 86%, 100% { transform: rotate(0); } 90% { transform: rotate(-6deg) scale(1.08); } 95% { transform: rotate(5deg) scale(1.08); } }
.row-hurried { --h: min(var(--hurry), 6); padding: calc(15px + var(--h) * 5px) calc(16px + var(--h) * 4px); border-left-width: calc(3px + var(--h) * 1.5px); background: color-mix(in oklch, var(--stop-bg) calc(var(--h) * 11%), var(--panel)); box-shadow: 0 0 0 calc(var(--h) * 1px) color-mix(in oklch, var(--stop) 28%, transparent), 0 calc(var(--h) * 3px) calc(var(--h) * 9px) color-mix(in oklch, var(--stop) 22%, transparent); }
.row-hurried .title { font-size: calc(16px + var(--h) * 2.6px); }
.row-hurried .age { font-size: calc(17px + var(--h) * 3.2px); }
.row-hurried .avatar-plain { width: calc(26px + var(--h) * 2px); height: calc(26px + var(--h) * 2px); }
.row-hurry-max { animation: hurry-breathe 2.8s ease-in-out infinite; }
@keyframes hurry-breathe { 50% { box-shadow: 0 0 0 7px color-mix(in oklch, var(--stop) 38%, transparent), 0 20px 60px color-mix(in oklch, var(--stop) 35%, transparent); } }
@media (prefers-reduced-motion: reduce) { .badge-hurry, .row-hurry-max { animation: none; } }

.hg { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; overflow: hidden; color: #fff; font-family: "IBM Plex Sans", system-ui, sans-serif; background: radial-gradient(120% 90% at 50% 45%, #2a0b4d 0%, #12032a 45%, #05010d 100%); opacity: 0; transition: opacity 0.25s ease; outline: none; --heat: hsl(190 100% 60%); --p: 0; }
.hg-on { opacity: 1; }
.hg::before { content: ""; position: absolute; left: 50%; top: 50%; width: 120vmax; height: 120vmax; margin: -60vmax 0 0 -60vmax; border-radius: 50%; background: radial-gradient(circle, transparent 0%, #12032a99 30%, #05010d 58%), conic-gradient(from 0deg, transparent 0%, #ff2e88 12%, transparent 28%, transparent 50%, #7df9ff 62%, transparent 78%); opacity: calc(0.05 + var(--p) * 0.2); will-change: transform; animation: hg-spin 9s linear infinite; }
.hg::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px); background-size: 44px 44px; mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 70%); pointer-events: none; }
@keyframes hg-spin { to { transform: rotate(360deg); } }
.hg-fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; }
.hg-flash { position: absolute; inset: 0; background: radial-gradient(circle, #fff 0%, #ffd23f 40%, transparent 75%); opacity: 0; pointer-events: none; z-index: 4; }
.hg-flash-go { animation: hg-flash 0.9s ease-out; }
@keyframes hg-flash { 0% { opacity: 0.95; } 100% { opacity: 0; } }
.hg-stage { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 16px; width: min(560px, 100vw); will-change: transform; }
.hg-top { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.hg-kicker { font-family: "Bungee", "IBM Plex Mono", monospace; font-size: clamp(26px, 6vw, 40px); letter-spacing: 0.04em; line-height: 1; background: linear-gradient(95deg, #7df9ff, #ff2e88 45%, #ffd23f); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 18px #ff2e8866); }
.hg-target { font-family: "IBM Plex Mono", monospace; font-size: 13px; color: #cdb8ff; letter-spacing: 0.04em; }
.hg-arena { position: relative; width: min(400px, 82vw, 58vh); aspect-ratio: 1; touch-action: manipulation; cursor: pointer; user-select: none; -webkit-user-select: none; }
.hg-svg { width: 100%; height: 100%; overflow: visible; }
.hg-tick { stroke: #ffffff22; stroke-width: 3; stroke-linecap: round; transition: stroke 0.12s; }
.hg-tick-lit { stroke: var(--heat); stroke-width: 4.5; }
.hg-border { fill: none; stroke: url(#hg-rim); stroke-width: 5; opacity: calc(0.45 + var(--p) * 0.55); }
.hg-border-hot { animation: hg-pulse 0.5s ease-in-out infinite alternate; }
@keyframes hg-pulse { to { stroke-width: 9; opacity: 1; } }
.hg-halo { fill: url(#hg-halo); opacity: calc(0.35 + var(--p) * 0.5); }
.hg-core { fill: url(#hg-core); }
.hg-pct { font-family: "Bungee", "IBM Plex Mono", monospace; fill: #fff; text-anchor: middle; dominant-baseline: central; paint-order: stroke; stroke: #1a063388; stroke-width: 6px; pointer-events: none; }
.hg-banner { position: absolute; left: 50%; top: 12%; transform: translate(-50%, 0) scale(0.4); font-family: "Bungee", "IBM Plex Mono", monospace; font-size: clamp(16px, 4vw, 22px); letter-spacing: 0.08em; color: #fff; text-shadow: 0 0 18px var(--heat), 0 2px 0 #0008; opacity: 0; white-space: nowrap; pointer-events: none; z-index: 5; }
.hg-banner-go { animation: hg-banner 1.1s cubic-bezier(.2, 1.6, .4, 1) forwards; }
@keyframes hg-banner { 0% { opacity: 0; transform: translate(-50%, 10px) scale(0.4) rotate(-8deg); } 25% { opacity: 1; transform: translate(-50%, 0) scale(1.15) rotate(3deg); } 70% { opacity: 1; transform: translate(-50%, -6px) scale(1) rotate(0); } 100% { opacity: 0; transform: translate(-50%, -30px) scale(0.9); } }
.hg-hud { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; width: 100%; }
.hg-stat { display: flex; flex-direction: column; gap: 1px; font-family: "IBM Plex Mono", monospace; }
.hg-stat-r { align-items: flex-end; text-align: right; }
.hg-stat-v { font-family: "Bungee", "IBM Plex Mono", monospace; font-size: 26px; line-height: 1; transition: color 0.2s; }
.hg-stat-l { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #a896d6; }
.hg-rate-good { color: #5dffb0; text-shadow: 0 0 14px #5dffb088; }
.hg-rate-bad { color: #ff8fa3; }
.hg-combo-pop { animation: hg-pop 0.16s ease-out; }
@keyframes hg-pop { 0% { transform: scale(1.35); } 100% { transform: scale(1); } }
.hg-keys { display: flex; align-items: center; gap: 8px; font-family: "IBM Plex Mono", monospace; font-size: 12px; color: #cdb8ff; }
.hg-key { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; padding: 7px 10px; border-radius: 8px; background: linear-gradient(#3b1670, #25094a); border: 1px solid #7c4dff66; box-shadow: 0 4px 0 #12032a, 0 0 18px #7c4dff33; color: #fff; font-weight: 600; font-size: 12px; letter-spacing: 0.06em; transition: transform 0.05s, box-shadow 0.05s; }
.hg-key-down { transform: translateY(3px); box-shadow: 0 1px 0 #12032a, 0 0 26px var(--heat); border-color: var(--heat); }
.hg-timer { position: relative; width: 100%; height: 8px; border-radius: 999px; background: #ffffff14; overflow: hidden; }
.hg-timer-fill { position: absolute; inset: 0; transform-origin: left center; background: linear-gradient(90deg, #ff2e88, #ffd23f, #5dffb0); }
.hg-sub { min-height: 20px; font-size: 14px; color: #d9ccff; text-align: center; text-wrap: balance; }
.hg-result { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 24px; pointer-events: none; }
.hg-result[hidden] { display: none; }
.hg-result-title { font-family: "Bungee", "IBM Plex Mono", monospace; font-size: clamp(44px, 12vw, 92px); line-height: 0.95; background: linear-gradient(95deg, #7df9ff, #ff2e88 40%, #ffd23f 80%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 8px 30px #ff2e8899); animation: hg-slam 0.7s cubic-bezier(.2, 1.8, .4, 1) both; }
.hg-lost .hg-result-title { background: linear-gradient(95deg, #9aa4c7, #ff8fa3); -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 8px 30px #0009); }
@keyframes hg-slam { 0% { transform: scale(3) rotate(-10deg); opacity: 0; } 60% { transform: scale(0.92) rotate(2deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
.hg-result-sub { max-width: 420px; font-size: 16px; color: #efe7ff; text-shadow: 0 2px 10px #000a; animation: hg-rise 0.5s 0.25s ease-out both; }
@keyframes hg-rise { from { opacity: 0; transform: translateY(12px); } }
.hg-actions { display: flex; gap: 10px; pointer-events: auto; animation: hg-rise 0.5s 0.4s ease-out both; }
.hg-btn { padding: 10px 18px; border-radius: 999px; border: 1px solid #ffffff33; background: #ffffff12; color: #fff; font-family: "IBM Plex Mono", monospace; font-size: 13px; font-weight: 600; cursor: pointer; backdrop-filter: blur(8px); }
.hg-btn:hover { background: #ffffff22; }
.hg-btn-main { border: none; background: linear-gradient(100deg, #ff2e88, #ff7a18 55%, #ffd23f); color: #1a0633; }
.hg-close { position: absolute; top: 16px; right: 16px; z-index: 7; padding: 7px 12px; border-radius: 8px; border: 1px solid #ffffff2a; background: #ffffff0d; color: #cdb8ff; font-family: "IBM Plex Mono", monospace; font-size: 12px; cursor: pointer; }
.hg-close:hover { color: #fff; background: #ffffff1a; }
.hg-done .hg-stage > :not(.hg-arena) { opacity: 0.12; transition: opacity 0.4s; }
.hg-done .hg-arena { opacity: 0.35; transition: opacity 0.6s; }
.hg-done .hg-pct { opacity: 0; }
.hg-tap { display: none; }
@media (pointer: coarse) { .hg-keys > :not(.hg-tap) { display: none; } .hg-tap { display: inline; } }
`;

export const HURRY_GAME_SCRIPT = `
(function () {
  var GAIN = 0.04, GAIN_FALLOFF = 0.35, DECAY_BASE = 0.035, DECAY_CURVE = 0.13;
  var TIME_LIMIT = 15, TARGET_RATE = 7, MAX_TICKS = 72;
  var MIN_R = 20, MAX_R = 158, CX = 200, CY = 200;
  var CONFETTI = ["#ff2e88", "#ffd23f", "#7df9ff", "#5dffb0", "#b388ff", "#ff7a18", "#ffffff"];
  var MILESTONES = [[0.25, "WARMING UP"], [0.5, "HALFWAY!"], [0.75, "FEEL THE HEAT"], [0.9, "DON'T STOP!"]];
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function heatHue(p) { return (190 + p * 220) % 360; }
  function heat(p, light) { return "hsl(" + heatHue(p).toFixed(0) + " 100% " + (light || 60) + "%)"; }
  function rand(min, max) { return min + Math.random() * (max - min); }

  function openGame(trigger) {
    var prId = trigger.getAttribute("data-pr-id");
    var prNumber = trigger.getAttribute("data-pr-number");
    var target = trigger.getAttribute("data-target");
    var fullNames = trigger.getAttribute("data-full-names");
    var names = trigger.getAttribute("data-names");
    var several = names.indexOf(",") !== -1;
    var targetLine = target === "author"
      ? fullNames + " is sitting on requested changes"
      : "waiting on a review from " + fullNames;
    var lostLine = target === "author"
      ? names + " lives to procrastinate another day."
      : names + (several ? " keep" : " keeps") + " ignoring the review queue another day.";

    var root = el("div", "hg");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Hurry up " + fullNames);
    root.tabIndex = -1;

    var canvas = el("canvas", "hg-fx");
    var flash = el("div", "hg-flash");
    var closeBtn = el("button", "hg-close", "Esc");
    closeBtn.type = "button";
    var stage = el("div", "hg-stage");

    var top = el("div", "hg-top");
    top.appendChild(el("div", "hg-kicker", "HURRY UP"));
    top.appendChild(el("div", "hg-target", "#" + prNumber + " · " + targetLine));

    var arena = el("div", "hg-arena");
    var svg = svgEl("svg", { viewBox: "0 0 400 400", class: "hg-svg", "aria-hidden": "true" });
    var defs = svgEl("defs", {});
    var coreGrad = svgEl("radialGradient", { id: "hg-core", cx: "42%", cy: "38%", r: "70%" });
    var stopA = svgEl("stop", { offset: "0%", "stop-color": "#ffffff" });
    var stopB = svgEl("stop", { offset: "38%", "stop-color": heat(0, 72) });
    var stopC = svgEl("stop", { offset: "100%", "stop-color": heat(0, 32) });
    coreGrad.appendChild(stopA); coreGrad.appendChild(stopB); coreGrad.appendChild(stopC);
    var rimGrad = svgEl("linearGradient", { id: "hg-rim", x1: "0", y1: "0", x2: "1", y2: "1" });
    rimGrad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#7df9ff" }));
    rimGrad.appendChild(svgEl("stop", { offset: "50%", "stop-color": "#ff2e88" }));
    rimGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#ffd23f" }));
    var haloGrad = svgEl("radialGradient", { id: "hg-halo" });
    var haloStop = svgEl("stop", { offset: "45%", "stop-color": heat(0, 60), "stop-opacity": "0.9" });
    haloGrad.appendChild(haloStop);
    haloGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": heat(0, 60), "stop-opacity": "0" }));
    defs.appendChild(coreGrad); defs.appendChild(rimGrad); defs.appendChild(haloGrad);
    svg.appendChild(defs);

    var ticks = [];
    for (var i = 0; i < MAX_TICKS; i++) {
      var angle = (i / MAX_TICKS) * Math.PI * 2 - Math.PI / 2;
      var long = i % 6 === 0;
      var tick = svgEl("line", {
        x1: CX + Math.cos(angle) * (long ? 172 : 176), y1: CY + Math.sin(angle) * (long ? 172 : 176),
        x2: CX + Math.cos(angle) * 186, y2: CY + Math.sin(angle) * 186, class: "hg-tick",
      });
      ticks.push(tick);
      svg.appendChild(tick);
    }
    var border = svgEl("circle", { cx: CX, cy: CY, r: MAX_R + 4, class: "hg-border" });
    var halo = svgEl("circle", { cx: CX, cy: CY, r: MIN_R + 16, class: "hg-halo" });
    var core = svgEl("circle", { cx: CX, cy: CY, r: MIN_R, class: "hg-core" });
    var pct = svgEl("text", { x: CX, y: CY, class: "hg-pct", "font-size": "22" });
    pct.textContent = "0%";
    svg.appendChild(border); svg.appendChild(halo); svg.appendChild(core); svg.appendChild(pct);
    arena.appendChild(svg);
    var banner = el("div", "hg-banner");
    arena.appendChild(banner);

    var hud = el("div", "hg-hud");
    var comboStat = el("div", "hg-stat");
    var comboV = el("div", "hg-stat-v", "×0");
    comboStat.appendChild(comboV); comboStat.appendChild(el("div", "hg-stat-l", "combo"));
    var keys = el("div", "hg-keys");
    var keySpace = el("span", "hg-key", "SPACE");
    var keyEnter = el("span", "hg-key", "ENTER");
    keys.appendChild(keySpace); keys.appendChild(el("span", "", "or")); keys.appendChild(keyEnter);
    keys.appendChild(el("span", "hg-key hg-tap", "TAP THE CIRCLE"));
    var rateStat = el("div", "hg-stat hg-stat-r");
    var rateV = el("div", "hg-stat-v", "0.0");
    rateStat.appendChild(rateV); rateStat.appendChild(el("div", "hg-stat-l", "presses / s · need " + TARGET_RATE));
    hud.appendChild(comboStat); hud.appendChild(keys); hud.appendChild(rateStat);

    var timer = el("div", "hg-timer");
    var timerFill = el("div", "hg-timer-fill");
    timer.appendChild(timerFill);
    var sub = el("div", "hg-sub", "Mash to fill the circle to its border. The first press starts the clock.");

    stage.appendChild(top); stage.appendChild(arena); stage.appendChild(hud); stage.appendChild(timer); stage.appendChild(sub);

    var result = el("div", "hg-result");
    result.hidden = true;

    root.appendChild(canvas); root.appendChild(stage); root.appendChild(flash); root.appendChild(result); root.appendChild(closeBtn);
    document.body.appendChild(root);
    var previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { root.classList.add("hg-on"); });
    root.focus();

    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0, height = 0;
    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    var phase = "ready";
    var progress = 0, shown = 0, velocity = 0, punch = 0, shake = 0;
    var startedAt = 0, elapsed = 0, combo = 0, lastPressAt = 0, presses = [];
    var milestoneIndex = 0;
    var particles = [], rings = [], confetti = [];
    var lastFrame = performance.now();
    var running = true;
    var reloadTimer = null;
    var drawn = { r: "", hue: "", pct: "", lit: -1, timer: "", rate: "" };

    function coreScreen() {
      var box = svg.getBoundingClientRect();
      var scale = box.width / 400;
      return { x: box.left + CX * scale, y: box.top + CY * scale, r: (MIN_R + (MAX_R - MIN_R) * shown) * scale, scale: scale };
    }

    function burst(p) {
      var c = coreScreen();
      var count = reducedMotion ? 6 : Math.round(10 + p * 18);
      for (var i = 0; i < count; i++) {
        var a = Math.random() * Math.PI * 2;
        var speed = rand(220, 520) * (0.8 + p * 0.8);
        particles.push({
          x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: 0, max: rand(0.35, 0.8), size: rand(1.5, 3.8),
          hue: heatHue(p) + rand(-35, 35), spark: Math.random() < 0.6,
        });
      }
      rings.push({ x: c.x, y: c.y, r: c.r, vr: 380 + p * 420, life: 0, max: 0.45, hue: heatHue(p), width: 3 + p * 5 });
    }

    function confettiBurst(x, y, count, spread, baseAngle, power) {
      for (var i = 0; i < count; i++) {
        var a = baseAngle + rand(-spread, spread);
        var speed = rand(power * 0.45, power);
        confetti.push({
          x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          rot: Math.random() * Math.PI * 2, vr: rand(-12, 12), wobble: Math.random() * Math.PI * 2,
          w: rand(6, 12), h: rand(9, 16), color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
          circle: Math.random() < 0.2, life: 0, max: rand(2.6, 4.2),
        });
      }
    }

    function showBanner(text) {
      banner.textContent = text;
      banner.classList.remove("hg-banner-go");
      void banner.offsetWidth;
      banner.classList.add("hg-banner-go");
    }

    function flashKey(key) {
      key.classList.add("hg-key-down");
      setTimeout(function () { key.classList.remove("hg-key-down"); }, 70);
    }

    function press(key) {
      if (phase === "won" || phase === "lost" || phase === "sending") return;
      var now = performance.now();
      if (phase === "ready") {
        phase = "playing";
        startedAt = now;
        sub.textContent = "Keep it above " + TARGET_RATE + " presses a second or it shrinks back.";
      }
      combo = now - lastPressAt < 450 ? combo + 1 : 1;
      lastPressAt = now;
      presses.push(now);
      progress = Math.min(1, progress + GAIN * (1 - GAIN_FALLOFF * progress));
      punch = 1;
      shake = Math.min(1, shake + 0.35);
      if (key) flashKey(key);
      comboV.textContent = "×" + combo;
      comboV.classList.remove("hg-combo-pop");
      void comboV.offsetWidth;
      comboV.classList.add("hg-combo-pop");
      burst(progress);
      while (milestoneIndex < MILESTONES.length && progress >= MILESTONES[milestoneIndex][0]) {
        showBanner(MILESTONES[milestoneIndex][1]);
        milestoneIndex += 1;
      }
      if (progress >= 1) win();
    }

    function showResult(title, message, actions, lost) {
      result.innerHTML = "";
      result.hidden = false;
      root.classList.add("hg-done");
      root.classList.toggle("hg-lost", !!lost);
      result.appendChild(el("div", "hg-result-title", title));
      var msg = el("div", "hg-result-sub", message);
      result.appendChild(msg);
      var row = el("div", "hg-actions");
      actions.forEach(function (action) {
        var button = el("button", "hg-btn" + (action.main ? " hg-btn-main" : ""), action.label);
        button.type = "button";
        button.addEventListener("click", action.run);
        row.appendChild(button);
      });
      result.appendChild(row);
      return msg;
    }

    function celebrate() {
      var c = coreScreen();
      flash.classList.remove("hg-flash-go");
      void flash.offsetWidth;
      flash.classList.add("hg-flash-go");
      for (var i = 0; i < 4; i++) {
        rings.push({ x: c.x, y: c.y, r: c.r, vr: 700 + i * 260, life: -i * 0.07, max: 0.9, hue: [50, 330, 190, 150][i], width: 10 - i * 2 });
      }
      for (var j = 0; j < 90; j++) {
        var a = Math.random() * Math.PI * 2;
        var speed = rand(400, 1100);
        particles.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: rand(0.6, 1.2), size: rand(2, 5), hue: rand(0, 360), spark: true });
      }
      var amount = reducedMotion ? 0.35 : 1;
      confettiBurst(c.x, c.y, Math.round(220 * amount), Math.PI, -Math.PI / 2, 1150);
      setTimeout(function () {
        confettiBurst(0, height, Math.round(110 * amount), 0.35, -Math.PI / 3, 1500);
        confettiBurst(width, height, Math.round(110 * amount), 0.35, -Math.PI * 2 / 3, 1500);
      }, 180);
      setTimeout(function () { confettiBurst(width / 2, -20, Math.round(120 * amount), 0.9, Math.PI / 2, 500); }, 520);
    }

    function win() {
      phase = "sending";
      progress = 1;
      shake = 1;
      celebrate();
      var message = showResult("HURRIED!", "Pinging " + names + " on Slack…", [{ label: "Back to the board", main: true, run: finish }]);
      fetch("/dashboard/pr/" + prId + "/hurry", { method: "POST" })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            if (!response.ok) throw new Error(body.error || "Could not hurry");
            return body;
          });
        })
        .then(function (body) {
          phase = "won";
          message.textContent = names + (several ? " just got Slack pings" : " just got a Slack ping") + ". Hurry #" + body.count + " — the card on the board grows with every one.";
          reloadTimer = setTimeout(finish, 4200);
        })
        .catch(function (error) {
          phase = "won";
          message.textContent = "You won, but the ping did not go out: " + error.message;
        });
    }

    function lose() {
      phase = "lost";
      showResult("TOO SLOW", lostLine + " You needed " + TARGET_RATE + "+ presses a second.", [
        { label: "Try again", main: true, run: restart },
        { label: "Give up", run: close },
      ], true);
    }

    function restart() {
      result.hidden = true;
      root.classList.remove("hg-done", "hg-lost");
      phase = "ready";
      progress = 0; elapsed = 0; combo = 0; presses = []; milestoneIndex = 0;
      comboV.textContent = "×0";
      sub.textContent = "Mash to fill the circle to its border. The first press starts the clock.";
      root.focus();
    }

    function finish() {
      close();
      window.location.reload();
    }

    function close() {
      if (!running) return;
      running = false;
      if (reloadTimer) clearTimeout(reloadTimer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", resize);
      document.body.style.overflow = previousOverflow;
      root.classList.remove("hg-on");
      setTimeout(function () { root.remove(); }, 250);
      trigger.focus();
    }

    function onKey(event) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      var isSpace = event.key === " " || event.code === "Space";
      var isEnter = event.key === "Enter";
      if (!isSpace && !isEnter) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (phase === "lost" && isEnter) { restart(); return; }
      if (phase === "won" && isEnter) { finish(); return; }
      press(isSpace ? keySpace : keyEnter);
    }

    document.addEventListener("keydown", onKey, true);
    arena.addEventListener("pointerdown", function (event) { event.preventDefault(); press(null); });
    closeBtn.addEventListener("click", close);

    function step(dt) {
      if (phase === "playing") {
        elapsed = (performance.now() - startedAt) / 1000;
        progress = Math.max(0, progress - (DECAY_BASE + DECAY_CURVE * progress * progress) * dt);
        if (elapsed >= TIME_LIMIT) lose();
      }
      if (phase === "sending" || phase === "won") progress = 1;
      if (performance.now() - lastPressAt > 450 && phase === "playing" && combo > 0) {
        combo = 0;
        comboV.textContent = "×0";
      }

      var target = progress + punch * 0.035;
      velocity += ((target - shown) * 240 - velocity * 20) * dt;
      shown = Math.max(0, Math.min(1.06, shown + velocity * dt));
      punch = Math.max(0, punch - dt * 7);
      shake = Math.max(0, shake - dt * 3.2);

      var now = performance.now();
      while (presses.length && now - presses[0] > 1000) presses.shift();
      var rate = presses.length;
      var rateClass = "hg-stat-v " + (phase !== "playing" ? "" : rate >= TARGET_RATE ? "hg-rate-good" : "hg-rate-bad");
      if (rate + rateClass !== drawn.rate) {
        drawn.rate = rate + rateClass;
        rateV.textContent = rate.toFixed(1);
        rateV.className = rateClass;
      }

      var p = Math.min(1, shown);
      var r = MIN_R + (MAX_R - MIN_R) * shown;
      var rKey = r.toFixed(1);
      if (rKey !== drawn.r) {
        drawn.r = rKey;
        core.setAttribute("r", rKey);
        halo.setAttribute("r", (r * (1.5 + p * 0.35) + 14).toFixed(1));
        pct.setAttribute("font-size", (20 + p * 46).toFixed(1));
      }
      var hueKey = heatHue(p).toFixed(0);
      if (hueKey !== drawn.hue) {
        drawn.hue = hueKey;
        haloStop.setAttribute("stop-color", heat(p, 60));
        haloGrad.lastChild.setAttribute("stop-color", heat(p, 60));
        stopB.setAttribute("stop-color", heat(p, 70));
        stopC.setAttribute("stop-color", heat(p, 34));
        root.style.setProperty("--heat", heat(p, 62));
        root.style.setProperty("--p", p.toFixed(2));
      }
      var pctText = Math.round(Math.min(progress, 1) * 100) + "%";
      if (pctText !== drawn.pct) {
        drawn.pct = pctText;
        pct.textContent = pctText;
      }
      var lit = Math.round(Math.min(progress, 1) * MAX_TICKS);
      if (lit !== drawn.lit) {
        drawn.lit = lit;
        for (var i = 0; i < MAX_TICKS; i++) ticks[i].classList.toggle("hg-tick-lit", i < lit);
      }
      border.classList.toggle("hg-border-hot", progress > 0.8 && phase === "playing");
      var timerKey = Math.max(0, 1 - elapsed / TIME_LIMIT).toFixed(3);
      if (timerKey !== drawn.timer) {
        drawn.timer = timerKey;
        timerFill.style.transform = "scaleX(" + timerKey + ")";
      }

      if (!reducedMotion && shake > 0.01) {
        var amp = shake * (2 + p * 9);
        stage.style.transform = "translate(" + rand(-amp, amp).toFixed(1) + "px," + rand(-amp, amp).toFixed(1) + "px) rotate(" + (rand(-amp, amp) * 0.08).toFixed(2) + "deg)";
      } else if (stage.style.transform) {
        stage.style.transform = "";
      }
    }

    function draw(dt) {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      rings = rings.filter(function (ring) {
        ring.life += dt;
        if (ring.life < 0) return true;
        ring.r += ring.vr * dt;
        var t = ring.life / ring.max;
        if (t >= 1) return false;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = "hsla(" + ring.hue + ", 100%, 65%, " + (1 - t) * 0.8 + ")";
        ctx.lineWidth = ring.width * (1 - t);
        ctx.stroke();
        return true;
      });
      particles = particles.filter(function (part) {
        part.life += dt;
        var t = part.life / part.max;
        if (t >= 1) return false;
        var drag = Math.exp(-3.2 * dt);
        part.vx *= drag; part.vy = part.vy * drag + 260 * dt;
        part.x += part.vx * dt; part.y += part.vy * dt;
        var alpha = 1 - t;
        if (part.spark) {
          ctx.beginPath();
          ctx.moveTo(part.x, part.y);
          ctx.lineTo(part.x - part.vx * 0.035, part.y - part.vy * 0.035);
          ctx.strokeStyle = "hsla(" + part.hue + ", 100%, 70%, " + alpha + ")";
          ctx.lineWidth = part.size;
          ctx.lineCap = "round";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(part.x, part.y, part.size * (1 + t), 0, Math.PI * 2);
          ctx.fillStyle = "hsla(" + part.hue + ", 100%, 65%, " + alpha + ")";
          ctx.fill();
        }
        return true;
      });
      ctx.globalCompositeOperation = "source-over";
      confetti = confetti.filter(function (piece) {
        piece.life += dt;
        if (piece.life >= piece.max || piece.y > height + 40) return false;
        var drag = Math.exp(-1.6 * dt);
        piece.vx *= drag; piece.vy = piece.vy * drag + 900 * dt;
        piece.x += piece.vx * dt + Math.sin(piece.wobble) * 0.6; piece.y += piece.vy * dt;
        piece.rot += piece.vr * dt; piece.wobble += dt * 9;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rot);
        ctx.scale(1, Math.cos(piece.wobble));
        ctx.globalAlpha = Math.min(1, (piece.max - piece.life) * 2);
        ctx.fillStyle = piece.color;
        if (piece.circle) {
          ctx.beginPath(); ctx.arc(0, 0, piece.w / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        }
        ctx.restore();
        return true;
      });
    }

    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      step(dt);
      draw(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-hurry]");
    if (!trigger) return;
    openGame(trigger);
  });
})();
`;
