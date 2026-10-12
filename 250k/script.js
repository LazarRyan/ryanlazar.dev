(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const fmt = (v, decimals = 0, prefix = '') =>
    prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // ---------- Optional media ----------
  // Photo slots and the hero video only switch on if their files actually load,
  // so the page looks finished with or without them.
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

  const hero = $('[data-hero]');
  const video = $('[data-hero-video]');
  if (video) {
    const show = () => {
      hero.classList.add('has-video');
      if (reduceMotion) video.pause();
    };
    const drop = () => video.remove();
    if (video.readyState >= 2) show();
    else if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) drop();
    else {
      video.addEventListener('loadeddata', show, { once: true });
      $('source', video)?.addEventListener('error', drop, { once: true });
      video.addEventListener('error', drop, { once: true });
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

  // ---------- Giving picker ----------
  const picker = $('[data-picker]');
  if (picker && !reduceMotion) {
    let current = Number($('input:checked', picker).value);
    picker.addEventListener('change', (e) => {
      if (e.target.name !== 'pace') return;
      const to = Number(e.target.value);
      const amount = $(`[data-amount="${to}"]`, picker);
      amount.dataset.prefix = '$';
      countUp(amount, current, to, 650);
      current = to;
    });
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
