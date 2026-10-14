// Modus Lab: theme toggle, masthead state and the page's live figures.
// The page is complete without this file; everything here is enhancement.
(function () {
  var root = document.documentElement;
  var motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme toggle ---------- */
  var toggle = document.querySelector('[data-theme-toggle]');
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function current() { return root.dataset.theme || (media.matches ? 'dark' : 'light'); }
  function syncToggle() {
    var dark = current() === 'dark';
    if (!toggle) return;
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    toggle.setAttribute('aria-pressed', String(dark));
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('ml-theme', next); } catch (e) {}
      syncToggle();
    });
  }
  media.addEventListener('change', syncToggle);
  syncToggle();

  /* ---------- Masthead hairline ---------- */
  var head = document.querySelector('.masthead');
  if (head) {
    var onScroll = function () { head.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Example assembly (shared by the hero drawing and Fig. B1) ----------
     Gap = housing − (A + B + C + D). Tolerances are ±3σ. */
  var PARTS = [0.10, 0.20, 0.15, 0.08];          // A, B, C, D tolerances (mm)
  var GAP_MEAN = 0.42, LSL = 0.15, USL = 0.75;
  var GAP_SD = Math.sqrt(PARTS.reduce(function (s, t) { return s + Math.pow(t / 3, 2); }, 0));
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function sampleGap() { return GAP_MEAN + GAP_SD * gauss(); }

  /* ---------- Hero: CAD crosshair ---------- */
  var hero = document.querySelector('[data-crosshair]');
  if (hero && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var readout = hero.querySelector('[data-readout]');
    var pending = null;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      pending = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!hero.classList.contains('is-tracking')) hero.classList.add('is-tracking');
      requestAnimationFrame(function () {
        if (!pending) return;
        hero.style.setProperty('--cx', pending.x + 'px');
        hero.style.setProperty('--cy', pending.y + 'px');
        if (readout) readout.textContent = 'X ' + (pending.x * 0.2646).toFixed(1) + ' · Y ' + (pending.y * 0.2646).toFixed(1) + ' mm';
        pending = null;
      });
    });
    hero.addEventListener('pointerleave', function () { hero.classList.remove('is-tracking'); });
  }

  /* ---------- Hero: live gap reading on the assembly ---------- */
  var gapText = document.querySelector('[data-gap]');
  if (gapText && motionOK) {
    var gapGroup = gapText.parentNode;
    setTimeout(function tick() {
      var g = sampleGap();
      gapText.textContent = 'GAP ' + g.toFixed(2);
      gapGroup.classList.toggle('is-out', g < LSL || g > USL);
      setTimeout(tick, 1100);
    }, 2400);
  }

  /* ---------- Fig. A1 drafts itself when it scrolls into view ---------- */
  var figA = document.querySelector('#apps .drawing');
  if (figA && motionOK && 'IntersectionObserver' in window) {
    var rect = figA.getBoundingClientRect();
    if (rect.top > window.innerHeight) {
      figA.classList.add('armed');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { figA.classList.add('in'); io.disconnect(); }
        });
      }, { threshold: 0.3 });
      io.observe(figA);
    }
  }

  /* ---------- Fig. B1: Monte Carlo stack-up ---------- */
  var canvas = document.querySelector('[data-sim]');
  if (canvas && canvas.getContext) runSim(canvas);

  function runSim(cv) {
    var ctx = cv.getContext('2d');
    var X0 = 0, X1 = 0.9, BINS = 54;
    var counts = new Array(BINS).fill(0);
    var falling = [];
    var n = 0, inSpec = 0, mean = 0, m2 = 0;
    var W = 640, H = 300, dpr = 1;
    var pad = { l: 14, r: 14, t: 30, b: 34 };
    var C = {
      ink: '#eef0f4', ink2: 'rgba(196,202,214,0.85)', grid: 'rgba(238,240,244,0.08)',
      bar: 'rgba(238,240,244,0.30)', barTop: 'rgba(238,240,244,0.75)',
      amber: '#f4b23f', out: '#e9784a'
    };
    var statEls = {};
    ['n', 'mean', 'sd', 'yield', 'cpk'].forEach(function (k) { statEls[k] = document.querySelector('[data-stat="' + k + '"]'); });

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth || 640; H = Math.round(W * 300 / 640);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function xOf(v) { return pad.l + (v - X0) / (X1 - X0) * (W - pad.l - pad.r); }
    function binOf(v) { return Math.max(0, Math.min(BINS - 1, Math.floor((v - X0) / (X1 - X0) * BINS))); }
    function record(v) {
      counts[binOf(v)]++;
      n++;
      var d = v - mean; mean += d / n; m2 += d * (v - mean);
      if (v >= LSL && v <= USL) inSpec++;
    }
    function scaleY() {
      var max = Math.max.apply(null, counts) || 1;
      return (H - pad.t - pad.b) * 0.92 / max;
    }
    function updateStats() {
      if (!statEls.n) return;
      var sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
      var cpk = sd > 0 ? Math.min(USL - mean, mean - LSL) / (3 * sd) : 0;
      statEls.n.textContent = n.toLocaleString('en-IN');
      statEls.mean.textContent = mean.toFixed(3) + ' mm';
      statEls.sd.textContent = sd.toFixed(3) + ' mm';
      statEls.yield.textContent = (n ? (inSpec / n * 100) : 0).toFixed(2) + '%';
      statEls.cpk.textContent = cpk.toFixed(2);
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var base = H - pad.b, k = scaleY(), bw = (W - pad.l - pad.r) / BINS;
      // ticks
      ctx.font = '600 11px Archivo, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = C.ink2;
      [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].forEach(function (v) {
        var x = xOf(v);
        ctx.fillStyle = C.grid; ctx.fillRect(Math.round(x), pad.t, 1, base - pad.t);
        ctx.fillStyle = C.ink2; ctx.fillText(v.toFixed(2), x, H - 12);
      });
      // bars
      for (var i = 0; i < BINS; i++) {
        if (!counts[i]) continue;
        var v = X0 + (i + 0.5) * (X1 - X0) / BINS;
        var out = v < LSL || v > USL;
        var h = counts[i] * k, x = pad.l + i * bw;
        ctx.fillStyle = out ? C.out : C.bar;
        ctx.fillRect(x + 1, base - h, bw - 2, h);
        ctx.fillStyle = out ? C.out : C.barTop;
        ctx.fillRect(x + 1, base - h, bw - 2, 1.5);
      }
      // baseline
      ctx.fillStyle = C.ink2; ctx.fillRect(pad.l, base, W - pad.l - pad.r, 1);
      // spec limits
      ctx.setLineDash([5, 4]); ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5;
      [[LSL, 'LSL 0.15'], [USL, 'USL 0.75']].forEach(function (s) {
        var x = Math.round(xOf(s[0])) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, pad.t - 6); ctx.lineTo(x, base); ctx.stroke();
        ctx.fillStyle = C.amber; ctx.font = '700 11px Archivo, system-ui, sans-serif';
        ctx.fillText(s[1], x, pad.t - 12);
      });
      ctx.setLineDash([]);
      // falling samples
      for (var j = 0; j < falling.length; j++) {
        var f = falling[j];
        ctx.fillStyle = (f.v < LSL || f.v > USL) ? C.out : C.amber;
        ctx.beginPath(); ctx.arc(xOf(f.v), f.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    size();
    for (var s = 0; s < (motionOK ? 600 : 6000); s++) record(sampleGap());
    updateStats(); draw();
    window.addEventListener('resize', function () { size(); draw(); });
    if (!motionOK) return;

    // One loop for the life of the page. It does no work while the chart is off screen or the tab is hidden.
    var last = 0, acc = 0, statT = 0, checkT = 1, onscreen = false;
    function step(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016;
      last = now;
      checkT += dt;
      if (checkT > 0.25) {
        checkT = 0;
        var r = cv.getBoundingClientRect();
        onscreen = r.bottom > 0 && r.top < window.innerHeight && !document.hidden;
      }
      if (onscreen) {
        var base = H - pad.b, k = scaleY();
        // about 240 simulated assemblies per second, whatever the frame rate
        acc += dt * 240;
        while (acc >= 1) { acc -= 1; falling.push({ v: sampleGap(), y: pad.t - 6 - Math.random() * 40, vy: 120 + Math.random() * 160 }); }
        for (var i = falling.length - 1; i >= 0; i--) {
          var f = falling[i];
          f.vy += 2600 * dt; f.y += f.vy * dt;
          var top = base - counts[binOf(f.v)] * k;
          if (f.y >= top - 2) { record(f.v); falling.splice(i, 1); }
        }
        if (falling.length > 400) falling.splice(0, falling.length - 400);
        if (n > 15000) { counts.fill(0); n = inSpec = 0; mean = m2 = 0; }
        statT += dt;
        if (statT > 0.12) { statT = 0; updateStats(); }
        draw();
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
})();
