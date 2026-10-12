(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const fmt = (v, decimals = 0, prefix = '') =>
    prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // ---------- Photos ----------
  // A photo that fails to load is removed, so the layout falls back cleanly.
  $$('[data-photo-slot]').forEach((slot) => {
    const img = $('img', slot);
    if (!img) return;
    const show = () => slot.classList.add('has-photo');
    const drop = () => (slot.matches('[data-photo]') ? slot : $('[data-photo]', slot)).remove();
    if (img.complete) img.naturalWidth ? show() : drop();
    else {
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', drop, { once: true });
    }
  });

  // ---------- Training reel ----------
  // Loads only when scrolled near, plays while on screen, and pauses off screen.
  // Reduced motion: it starts paused on its poster frame.
  const reel = $('[data-reel]');
  if (reel) {
    const toggle = $('[data-reel-toggle]');
    let pausedByViewer = reduceMotion;
    const setState = (playing) => {
      toggle.dataset.state = playing ? 'playing' : 'paused';
      toggle.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    };
    const play = () => reel.play().then(() => setState(true), () => setState(false));
    toggle.addEventListener('click', () => {
      pausedByViewer = !reel.paused;
      if (pausedByViewer) { reel.pause(); setState(false); } else play();
    });
    if (hasIO) {
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { if (!pausedByViewer) play(); }
        else if (!reel.paused) { reel.pause(); setState(false); }
      }, { threshold: 0.35 }).observe(reel);
    }
  }

  // ---------- Stars (seeded so they land in the same place every visit) ----------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  $$('[data-stars]').forEach((el, i) => {
    let seed = 9301 + i * 4973;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('focusable', 'false');
    const count = Number(el.dataset.stars) || 60;
    for (let n = 0; n < count; n++) {
      const star = document.createElementNS(SVG_NS, 'circle');
      star.setAttribute('cx', `${(rand() * 100).toFixed(2)}%`);
      star.setAttribute('cy', `${(Math.pow(rand(), 1.4) * 100).toFixed(2)}%`);
      star.setAttribute('r', (rand() * 1.1 + 0.45).toFixed(2));
      star.style.setProperty('--o', (rand() * 0.55 + 0.3).toFixed(2));
      if (rand() < 0.3) {
        star.classList.add('twinkle');
        star.style.animationDelay = `${(rand() * 5).toFixed(2)}s`;
      }
      svg.appendChild(star);
    }
    el.appendChild(svg);
  });

  // ---------- Reveal on scroll ----------
  const revealEls = $$('[data-reveal]');
  if (reduceMotion || !hasIO) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  } else {
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    revealEls.forEach((el) => revealer.observe(el));
  }

  // ---------- Count-up numbers ----------
  const countUp = (el, from, to, duration = 1400) => {
    const decimals = Number(el.dataset.decimals) || 0;
    const prefix = el.dataset.prefix || '';
    const start = performance.now();
    const tick = (now) => {
      const t = clamp((now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * eased, decimals, prefix);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const counters = $$('[data-count]');
  if (!reduceMotion && hasIO) {
    const counter = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counter.unobserve(entry.target);
        countUp(entry.target, 0, Number(entry.target.dataset.count));
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => {
      el.textContent = fmt(0, Number(el.dataset.decimals) || 0);
      counter.observe(el);
    });
  }

  // ---------- Word-by-word reading reveal ----------
  const wordBlocks = reduceMotion ? [] : $$('[data-words]').map((block) => {
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) return walk(child);
        if (child.nodeType !== Node.TEXT_NODE) return;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(part);
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = part;
          words.push(span);
          frag.append(span);
        });
        child.replaceWith(frag);
      });
    };
    walk(block);
    return { block, words, last: -1 };
  });
  const updateWords = (vh) => {
    wordBlocks.forEach((wb) => {
      const r = wb.block.getBoundingClientRect();
      if (r.bottom < -vh * 0.5 || r.top > vh) return;
      const start = vh * 0.86;
      const end = vh * 0.45;
      const p = clamp((start - r.top) / (r.height + start - end));
      const lit = p * (wb.words.length + 5);
      const key = Math.round(lit * 4);
      if (key === wb.last) return;
      wb.last = key;
      wb.words.forEach((w, i) => { w.style.opacity = (0.14 + 0.86 * clamp((lit - i) / 5)).toFixed(3); });
    });
  };

  // ---------- The race: a scroll-pinned journey from km 0 to km 250 ----------
  const race = $('[data-race]');
  let updateRace = () => {};
  if (race && !reduceMotion) {
    race.classList.add('is-pinned');
    const route = $('[data-route]', race);
    const routeLen = route.getTotalLength();
    const dot = $('[data-route-dot]', race);
    const kmEl = $('[data-race-km]', race);
    const facts = $$('.race__fact', race);
    const bars = $$('.race__bars i', race);
    const steps = facts.length;
    let lastPhase = -1;
    let lastKm = -1;
    updateRace = (vh) => {
      const r = race.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 1.5) return;
      const p = clamp(-r.top / (r.height - vh));
      const phase = Math.min(steps - 1, Math.floor(p * steps));
      if (phase !== lastPhase) {
        lastPhase = phase;
        race.dataset.phase = phase;
        facts.forEach((f, i) => f.classList.toggle('is-active', i === phase));
      }
      bars.forEach((b, i) => { b.style.transform = `scaleX(${clamp(p * steps - i).toFixed(3)})`; });
      route.style.strokeDashoffset = (1 - p).toFixed(4);
      const pt = route.getPointAtLength(routeLen * p);
      dot.style.left = `${pt.x / 10}%`;
      dot.style.top = `${pt.y / 2}%`;
      const km = Math.round(p * 250);
      if (km !== lastKm) { lastKm = km; kmEl.textContent = km; }
    };
  }

  // ---------- One scroll loop for nav, hero parallax, words and race ----------
  const hero = $('[data-hero]');
  const nav = $('[data-nav]');
  const ring = $('[data-km-ring]');
  const navKm = $('[data-km]');
  let queued = false;
  const onFrame = () => {
    queued = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = root.scrollHeight - vh;
    const p = max > 0 ? clamp(y / max) : 0;
    nav.classList.toggle('is-scrolled', y > 24);
    ring.style.strokeDashoffset = (100 - p * 100).toFixed(2);
    navKm.textContent = Math.round(p * 250);
    if (!reduceMotion && y < vh * 1.3) hero.style.setProperty('--hp', clamp(y / vh).toFixed(4));
    updateWords(vh);
    updateRace(vh);
  };
  const requestFrame = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(onFrame);
  };
  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame);
  onFrame();

  // ---------- Active section in the nav ----------
  if (hasIO) {
    const links = new Map($$('.nav__links a').map((a) => [a.hash.slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.removeAttribute('aria-current'));
        links.get(entry.target.id)?.setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  // ---------- Mobile dock: shown whenever no other give button is on screen ----------
  const dock = $('[data-give-bar]');
  const heroCta = $('[data-hero-cta]');
  if (dock && heroCta && hasIO) {
    const onScreen = new Set();
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      });
      dock.classList.toggle('is-active', onScreen.size === 0);
    });
    [heroCta, ...$$('[data-hide-give-bar]')].forEach((el) => watcher.observe(el));
  }

  // ---------- Countdowns ----------
  const now = new Date();
  $$('[data-countdown]').forEach((el) => {
    const [y, m, d] = el.dataset.countdown.split('-').map(Number);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((new Date(y, m - 1, d) - today) / 864e5);
    if (days < 0) return;
    el.textContent = days === 0 ? 'Race day' : days === 1 ? 'Tomorrow' : `${days} days to go`;
    el.hidden = false;
  });
  $$('[data-months]').forEach((el) => {
    const [y, m] = el.dataset.months.split('-').map(Number);
    const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
    if (months < 0) return;
    el.textContent = months === 0 ? 'This month' : months === 1 ? 'Next month' : `${months} months to go`;
    el.hidden = false;
  });

  // ---------- Race clocks ----------
  // Anything with data-countdown-to counts down to that instant. Clock cards tick d/h/m/s;
  // data-countdown-format="days" renders "N days to go". The Sahara start is estimated from
  // last year's 7:00 AM Stage 1 until LiveTrail publishes the official 2027 start (below).
  const clockEls = $$('[data-countdown-to]');
  const pad2 = (n) => String(n).padStart(2, '0');
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const showLocalTimes = () => clockEls.forEach((el) => {
    const local = $('[data-clock-local]', el);
    if (local && el.dataset.zone !== viewerZone) local.textContent = `Your time: ${localTime.format(new Date(el.dataset.countdownTo))}`;
  });
  const renderClocks = () => {
    const now = Date.now();
    clockEls.forEach((el) => {
      const diff = Date.parse(el.dataset.countdownTo) - now;
      if (el.dataset.countdownFormat === 'days') {
        el.dataset.fallback ??= el.textContent;
        const days = Math.floor(diff / 864e5);
        const hours = Math.max(1, Math.floor(diff / 36e5));
        el.textContent = diff > 864e5 ? `${days} ${days === 1 ? 'day' : 'days'} to go`
          : diff > 0 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} to go`
          : diff > -7 * 864e5 ? 'race underway' : el.dataset.fallback;
        return;
      }
      const hideAfter = Number(el.dataset.hideAfter || 0) * 1000;
      if (hideAfter && diff < -hideAfter) { el.hidden = true; return; }
      const liveFor = Number(el.dataset.liveFor || 0) * 1000;
      el.classList.toggle('is-live', diff <= 0);
      if (diff <= -liveFor) $('.clock__live', el).textContent = 'This race has finished.';
      const t = Math.max(0, diff);
      $('[data-unit="d"]', el).textContent = Math.floor(t / 864e5);
      $('[data-unit="h"]', el).textContent = pad2(Math.floor(t / 36e5) % 24);
      $('[data-unit="m"]', el).textContent = pad2(Math.floor(t / 6e4) % 60);
      $('[data-unit="s"]', el).textContent = pad2(Math.floor(t / 1e3) % 60);
    });
  };
  showLocalTimes();
  renderClocks();
  setInterval(renderClocks, 1000);

  // ---------- Live tracking (LiveTrail, the official race tracker) ----------
  // Before the race, or until data-bib is set, the panel stays in its "race week" state.
  // ?tracker-preview=2026-791 previews the live panel with a runner from last year's race.
  const API = 'https://api.v3.livetrail.net/api/events';
  const lt = (path, tenant) => fetch(`${API}/${path}`, { headers: { 'X-Tenant': tenant } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`LiveTrail ${r.status}`))));
  const tracker = $('[data-tracker]');
  if (tracker) {
    // Official start time, once LiveTrail publishes this year's race (checked in the final 60 days).
    const estimatedStart = Date.parse($('[data-countdown-race]')?.dataset.countdownTo);
    const nearStart = estimatedStart - Date.now() < 60 * 864e5;
    (nearStart ? lt('races/summaries', tracker.dataset.tenant) : Promise.reject()).then((races) => {
      const race = races.find((r) => r.raceId === tracker.dataset.race);
      if (!race?.startDate) return;
      const start = new Date(race.startDate);
      const sahara = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Casablanca', ...opts }).format(start);
      $$(`[data-countdown-race="${race.raceId}"]`).forEach((el) => { el.dataset.countdownTo = race.startDate; });
      $$('[data-clock-note]').forEach((el) => {
        el.textContent = `${sahara({ hour: 'numeric', minute: '2-digit' })} Sahara time`;
        el.closest('.clock__when').querySelector('strong').textContent = `Stage 1 · ${sahara({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`;
      });
      showLocalTimes();
      renderClocks();
    }).catch(() => {});

    let { tenant, race, year, bib } = tracker.dataset;
    const preview = new URLSearchParams(location.search).get('tracker-preview');
    if (preview && /^\d{4}-\d+$/.test(preview)) {
      [year, bib] = preview.split('-');
      tenant = `marathondessables_${year}`;
    }
    if (bib) {
      const statusEl = $('[data-tracker-status]', tracker);
      const setStatus = (state, text) => { statusEl.dataset.state = state; statusEl.textContent = text; };
      const runnerUrl = `https://marathondessables.v3.livetrail.net/en/${year}/runners/${bib}`;
      $('[data-tracker-bib]', tracker).textContent = preview ? `Preview: runner #${bib} from the ${year} race` : `Jonyull’s bib: #${bib}`;
      $('[data-t-runner]', tracker).href = runnerUrl;

      const pointLabel = (pt) => {
        const m = /^S(\d+) (START|FINISH|CP\d+)$/.exec(pt.shortName || '');
        if (!m) return pt.name;
        return m[2] === 'START' ? `Stage ${m[1]} start` : m[2] === 'FINISH' ? `Stage ${m[1]} finish` : `Stage ${m[1]} · ${m[2]}`;
      };
      const ago = (iso) => {
        const mins = Math.round((Date.now() - Date.parse(iso)) / 6e4);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} min ago`;
        if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${pad2(mins % 60)}m ago`;
        return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
      };
      const clockTime = (secs) => `${Math.floor(secs / 3600)}:${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)}`;

      let raceInfo, points, stages, timer, resumeOnVisible = false;
      const schedule = (ms) => {
        clearTimeout(timer);
        timer = setTimeout(() => (document.hidden ? (resumeOnVisible = true) : load()), ms);
      };
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && resumeOnVisible) { resumeOnVisible = false; load(); }
      });

      const buildStages = () => {
        const bounds = {};
        points.forEach((pt) => {
          const m = /^S(\d+) (START|FINISH)$/.exec(pt.shortName || '');
          if (m) (bounds[m[1]] ??= {})[m[2] === 'START' ? 'start' : 'end'] = pt.distance / 1000;
        });
        const wrap = $('[data-t-stages]', tracker);
        stages = Object.keys(bounds).sort((a, b) => a - b).filter((n) => bounds[n].end > bounds[n].start).map((n) => {
          const seg = document.createElement('div');
          seg.className = 'tracker__stage';
          seg.style.setProperty('--len', (bounds[n].end - bounds[n].start).toFixed(1));
          const bar = document.createElement('span');
          const label = document.createElement('em');
          label.textContent = `S${n}`;
          seg.append(bar, label);
          wrap.append(seg);
          return { ...bounds[n], bar };
        });
      };

      const render = (runner) => {
        const byId = new Map(points.map((pt) => [pt.pointId, pt]));
        const total = Math.max(raceInfo.distance || 0, ...points.map((pt) => pt.distance)) / 1000;
        const last = runner.lastPassage ? byId.get(runner.lastPassage.pointId) : null;
        const km = last ? last.distance / 1000 : 0;
        $('[data-t-km]', tracker).textContent = km ? km.toFixed(1) : '0';
        $('[data-t-total]', tracker).textContent = Math.round(total);
        stages.forEach((s) => s.bar.style.setProperty('--fill', clamp((km - s.start) / (s.end - s.start)).toFixed(3)));
        $('[data-t-point]', tracker).textContent = last ? pointLabel(last) : 'Not started yet';
        $('[data-t-ago]', tracker).textContent = last && runner.lastPassage.dateTime ? ago(runner.lastPassage.dateTime) : '';
        $('[data-t-time]', tracker).textContent = runner.raceTime ? clockTime(runner.raceTime) : '–';
        const rank = runner.ranking;
        $('[data-t-rank]', tracker).textContent = rank?.scratch ? `#${rank.scratch.toLocaleString('en-US')} of ${rank.scratchTotal.toLocaleString('en-US')}` : '–';
        const gps = raceInfo.gpsIframe?.url;
        const gpsLink = $('[data-t-gps]', tracker);
        if (gps) { gpsLink.href = gps; gpsLink.hidden = false; }

        const status = runner.status;
        if (status === 'FINISHER') setStatus('finished', 'Finisher');
        else if (['WITHDRAWN', 'DISQUALIFIED', 'STOPPED'].includes(status)) setStatus('out', 'Withdrawn');
        else if (['DID_NOT_START', 'DNS'].includes(status)) setStatus('out', 'Did not start');
        else if (!runner.lastPassage) setStatus('idle', 'Not started yet');
        else if (/FINISH$/.test(last?.shortName || '')) setStatus('camp', 'At the bivouac');
        else setStatus('live', 'Live · on course');

        $('[data-t-updated]', tracker).textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())} from LiveTrail, the official race tracker.`;
        $('[data-tracker-pre]', tracker).hidden = true;
        $('[data-tracker-live]', tracker).hidden = false;
      };

      const load = async () => {
        try {
          if (!points) {
            [raceInfo, points] = await Promise.all([lt(`races/${race}`, tenant), lt(`points?raceId=${race}`, tenant)]);
            buildStages();
          }
          const runner = await lt(`runners/${bib}`, tenant);
          render(runner);
          const over = raceInfo.status === 'FINISHED' || ['FINISHER', 'WITHDRAWN', 'DISQUALIFIED', 'STOPPED', 'DID_NOT_START', 'DNS'].includes(runner.status);
          if (!over) schedule(60_000);
        } catch {
          // Not published yet (pre-race) keeps the race-week panel; a blip mid-race retries.
          if (points) schedule(120_000);
        }
      };
      load();
    }
  }

  // ---------- Share ----------
  const toastEl = $('[data-toast]');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2800);
  };
  const shareUrl = $('link[rel="canonical"]')?.href || location.href;
  const shareData = {
    title: '250K with Mrs. K',
    text: 'Jonyull is running 250 km across the Sahara in memory of his mom, Sharon. Follow along or give:',
    url: shareUrl,
  };
  $$('[data-share]').forEach((btn) => btn.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied. Paste it anywhere.');
    } catch {
      toast(shareUrl);
    }
  }));

  // ---------- Spotlight on bento tiles ----------
  if (window.matchMedia('(hover: hover)').matches) {
    $$('[data-spotlight]').forEach((grid) => grid.addEventListener('pointermove', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile) return;
      const r = tile.getBoundingClientRect();
      tile.style.setProperty('--mx', `${e.clientX - r.left}px`);
      tile.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }
})();
