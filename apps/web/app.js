(() => {
  const d = document, root = d.documentElement;
  root.classList.remove('no-js');
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const G = window.gsap, ST = window.ScrollTrigger;
  const hasG = !!(G && ST);
  const anim = hasG && !reduce;
  if (hasG) G.registerPlugin(ST); else root.classList.add('no-gsap');

  // langue de la page (site multilingue) : textes du script et montants au format du pays
  const I18N = window.EVOLY_I18N || { locale: 'fr-FR', t: {} };
  const T = (k, v = {}, fr = '') => (I18N.t[k] || fr).replace(/\{(\w+)\}/g, (_, x) => v[x]);
  const nf0 = new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat(I18N.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cur0 = new Intl.NumberFormat(I18N.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const cur2 = new Intl.NumberFormat(I18N.locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = (v) => cur0.format(Math.round(v));
  const eur = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? cur0.format(Math.round(v)) : cur2.format(v));

  /* ---------- défilement doux (souris uniquement) ---------- */
  let lenis = null;
  if (anim && window.Lenis && fine) {
    try {
      lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
      lenis.on('scroll', ST.update);
      G.ticker.add((t) => lenis.raf(t * 1000));
      G.ticker.lagSmoothing(0);
    } catch (e) { lenis = null; }
  }
  const scrollToEl = (el) => {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -88, duration: 1.25 });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  /* ---------- toast ---------- */
  const toastEl = $('.toast'), toastMsg = $('.toast__msg');
  let toastT;
  const toast = (msg) => {
    toastMsg.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('is-on'), 3800);
  };

  /* ---------- navigation ---------- */
  const nav = $('.nav');
  let lastY = scrollY, menuOpen = false;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (menuOpen) { nav.classList.remove('is-hidden'); lastY = y; return; }
    if (y > lastY + 4 && y > 160) nav.classList.add('is-hidden');
    else if (y < lastY - 4 || y < 160) nav.classList.remove('is-hidden');
    lastY = y;
  }, { passive: true });

  /* ---------- menu mobile ---------- */
  const menu = $('#menu'), menuBtn = $('.nav__menu');
  const lock = (on) => { if (lenis) on ? lenis.stop() : lenis.start(); root.classList.toggle('is-locked', on); };
  function openMenu(kb) {
    menuOpen = true;
    menu.classList.add('is-open'); menu.removeAttribute('inert');
    $('.nav').classList.add('is-menu');
    menuBtn.setAttribute('aria-expanded', 'true');
    $('.vh', menuBtn).textContent = T('menuClose', {}, 'Fermer le menu');
    lock(true);
    if (anim) G.fromTo($$('.menu__links li', menu), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .06, ease: 'expo.out', delay: .12 });
    if (kb) setTimeout(() => $('a', menu)?.focus({ preventScroll: true }), 160);
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open'); menu.setAttribute('inert', '');
    $('.nav').classList.remove('is-menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    $('.vh', menuBtn).textContent = T('menuOpen', {}, 'Ouvrir le menu');
    lock(false);
  }
  menuBtn.addEventListener('click', (e) => (menuOpen ? closeMenu() : openMenu(e.detail === 0)));

  /* ---------- ancres internes ---------- */
  d.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const el = id && d.getElementById(id);
    if (!el) return;
    e.preventDefault();
    closeMenu();
    scrollToEl(el);
  });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  $$('.menu a[target]').forEach((a) => a.addEventListener('click', closeMenu));

  /* ---------- hero : entrée orchestrée ---------- */
  const hero = $('.hero');
  if (anim) {
    const tl = G.timeline({ defaults: { ease: 'expo.out' }, delay: .05 });
    tl.from('.hero .line > span', { yPercent: 115, duration: 1.2, stagger: .12 })
      .fromTo('.hl svg', { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: .9, ease: 'power2.inOut' }, 1.05)
      .from('.bigo--a svg', { rotation: -80, scale: .82, opacity: 0, duration: 1.9, ease: 'power3.out', transformOrigin: '50% 50%' }, 0)
      .from('.bigo--b svg', { rotation: 60, scale: .7, opacity: 0, duration: 1.7, ease: 'power3.out', transformOrigin: '50% 50%' }, .15)
      .from('.buy__card', { y: -150, rotation: 14, opacity: 0, duration: 1.6, ease: 'elastic.out(1,.75)' }, .3)
      .from('.hero__lede, .hero__ctas, .trust', { y: 22, opacity: 0, duration: 1, stagger: .08, ease: 'power3.out' }, .55)
      .from('.hero [data-depth] > *', { scale: 0, rotation: (i) => [-70, 50, -35][i % 3], duration: .95, stagger: .09, ease: 'back.out(2.1)' }, 1.05)
      .from('.hero__hint', { opacity: 0, y: 10, duration: .7, ease: 'power2.out' }, 1.55);

    const heroST = { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 };
    G.to('.bigo--a', { rotation: 65, ease: 'none', scrollTrigger: heroST });
    G.to('.bigo--b', { rotation: -50, ease: 'none', scrollTrigger: { ...heroST } });
    G.to('.buy', { yPercent: -8, ease: 'none', scrollTrigger: { ...heroST } });
    G.to('.hero__title', { y: -46, ease: 'none', scrollTrigger: { ...heroST } });
  }

  /* autocollants : léger parallaxe au pointeur (ils ne captent jamais la souris) */
  if (anim && fine) {
    const deps = $$('.hero [data-depth]').map((el) => ({
      k: parseFloat(el.dataset.depth),
      x: G.quickTo(el, 'x', { duration: 1.1, ease: 'power3' }),
      y: G.quickTo(el, 'y', { duration: 1.1, ease: 'power3' })
    }));
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      deps.forEach((s) => { s.x(px * s.k * 40); s.y(py * s.k * 30); });
    });
    hero.addEventListener('pointerleave', () => deps.forEach((s) => { s.x(0); s.y(0); }));
  }

  /* ---------- perforation d'un billet (revente) ---------- */
  function ticketFx(svg, bumpEl) {
    const hole = $('.t-hole', svg);
    const at = hole.getAttribute('data-at');
    const stamp = $('.t-stamp', svg), target = $('.t-target', svg), chads = $$('.t-chads path', svg);
    const setHole = (s) => hole.setAttribute('transform', `${at} scale(${s})`);
    return {
      punch() {
        if (!anim) { setHole(1); if (target) target.style.opacity = 0; if (stamp) stamp.style.opacity = 1; return; }
        const o = { s: 0 };
        const tl = G.timeline();
        if (bumpEl) tl.to(bumpEl, { scale: .95, duration: .09, ease: 'power2.in' }).to(bumpEl, { scale: 1, duration: 1, ease: 'elastic.out(1.1,.35)' });
        if (target) tl.to(target, { opacity: 0, duration: .14 }, .02);
        tl.to(o, { s: 1, duration: .6, ease: 'back.out(2.8)', onUpdate: () => setHole(o.s) }, .05);
        if (stamp) tl.fromTo(stamp, { opacity: 0, scale: 1.9, rotation: 10, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, rotation: 0, duration: .5, ease: 'back.out(2.2)' }, .32);
        chads.forEach((c, i) => {
          const ang = [-38, 52, 142, 232][i % 4] * Math.PI / 180;
          const dist = 150 + Math.random() * 90;
          G.set(c, { opacity: 1, x: 0, y: 0, rotation: 0, transformOrigin: '50% 50%' });
          G.to(c, { x: Math.cos(ang) * dist, rotation: (Math.random() > .5 ? 1 : -1) * (160 + Math.random() * 260), duration: 1.3, ease: 'power2.out', delay: .06 });
          G.to(c, { keyframes: [{ y: Math.sin(ang) * dist * .55 - 70, duration: .38, ease: 'power2.out' }, { y: 420 + Math.random() * 140, duration: .95, ease: 'power2.in' }], delay: .06 });
          G.to(c, { opacity: 0, duration: .3, delay: 1.05 });
        });
      },
      reset() {
        if (!anim) { setHole(0); if (target) target.style.opacity = 1; if (stamp) stamp.style.opacity = 0; return; }
        const o = { s: 1 };
        G.to(o, { s: 0, duration: .45, ease: 'power3.in', onUpdate: () => setHole(o.s) });
        if (stamp) G.to(stamp, { opacity: 0, duration: .25 });
        if (target) G.to(target, { opacity: 1, duration: .4, delay: .3 });
        G.set(chads, { opacity: 0 });
      }
    };
  }

  /* ---------- hero : acheter en un tap (démo) ---------- */
  const buy = $('.buy');
  if (buy) {
    const card = $('.buy__card', buy), tk = $('.buy__tk', buy), badge = $('.buy__x', buy), pay = $('.buy__pay', buy);
    const qBtns = $$('.qty__btn', buy), qOut = $('.qty__n', buy);
    const tot = $('.buy__total', buy);
    const hintText = $('#buy-hint span'), replay = $('.hero__replay');
    const hintIdle = hintText.textContent;
    const UNIT = 24;
    const money = (v) => cur2.format(v);
    let qty = 1, state = 'idle';
    if (!anim) buy.classList.add('is-static');
    const render = () => {
      qOut.textContent = qty;
      tot.textContent = money(qty * UNIT);
      badge.textContent = '×' + qty;
      badge.hidden = qty < 2;
      qBtns.forEach((b) => { b.disabled = state !== 'idle' || (b.dataset.d === '-1' ? qty <= 1 : qty >= 6); });
    };
    qBtns.forEach((b) => b.addEventListener('click', () => {
      qty = Math.min(6, Math.max(1, qty + Number(b.dataset.d)));
      render();
      if (anim) G.fromTo(tot, { scale: 1.14 }, { scale: 1, duration: .45, ease: 'back.out(3)' });
    }));
    const burst = () => {
      const h = buy.getBoundingClientRect(), r = pay.getBoundingClientRect();
      const cx = r.left - h.left + r.width / 2, cy = r.top - h.top + r.height / 2;
      const colors = ['#FFB8E8', '#F3D9F0', '#FFF6F0'];
      for (let i = 0; i < 14; i++) {
        const sp = d.createElement('span');
        sp.className = 'burst';
        sp.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="currentColor"/></svg>';
        sp.style.left = cx + 'px';
        sp.style.top = cy + 'px';
        sp.style.color = colors[i % colors.length];
        buy.appendChild(sp);
        const a = (i / 14) * Math.PI * 2 + Math.random() * .4, dist = 90 + Math.random() * 90;
        G.fromTo(sp, { x: 0, y: 0, scale: 0, rotation: 0 }, {
          x: Math.cos(a) * dist, y: Math.sin(a) * dist * .8 - 30, scale: .6 + Math.random() * .8, rotation: Math.random() * 240 - 120,
          duration: .9, ease: 'power3.out',
          onComplete: () => G.to(sp, { opacity: 0, y: '+=40', duration: .45, ease: 'power1.in', onComplete: () => sp.remove() })
        });
      }
    };
    pay.addEventListener('click', (e) => {
      if (state !== 'idle') return;
      const kb = e.detail === 0;
      state = 'loading';
      buy.classList.add('is-loading');
      pay.setAttribute('aria-busy', 'true');
      render();
      setTimeout(() => {
        state = 'done';
        buy.classList.remove('is-loading');
        buy.classList.add('is-done');
        pay.removeAttribute('aria-busy');
        hintText.textContent = qty > 1 ? T('paidMany', { n: qty }, 'Paiement confirmé : vos {n} billets sont envoyés par e-mail.') : T('paidOne', {}, 'Paiement confirmé : le billet est envoyé par e-mail.');
        replay.hidden = false;
        if (kb) replay.focus({ preventScroll: true });
        if (anim) {
          G.fromTo(tk, { y: 0, yPercent: 0, rotation: 0, scale: .92 }, { y: 0, yPercent: -62, rotation: -6, scale: 1, duration: 1.1, ease: 'back.out(1.5)' });
          G.fromTo(card, { scale: .97 }, { scale: 1, duration: .9, ease: 'elastic.out(1,.4)' });
          burst();
        }
      }, anim ? 500 : 0);
    });
    replay.addEventListener('click', () => {
      state = 'idle';
      buy.classList.remove('is-done');
      hintText.textContent = hintIdle;
      replay.hidden = true;
      if (anim) G.to(tk, { y: 0, yPercent: 0, rotation: 0, scale: .92, duration: .5, ease: 'power3.in' });
      render();
      pay.focus({ preventScroll: true });
    });
    render();
  }

  /* ---------- bandeau défilant ---------- */
  if (anim) {
    const loop = G.to('.band__track', { xPercent: -50, duration: 30, ease: 'none', repeat: -1 });
    loop.totalTime(loop.duration() * 60);
    let dir = 1;
    ST.create({
      start: 0, end: 'max',
      onUpdate: (self) => {
        dir = self.direction;
        const boost = Math.min(Math.abs(self.getVelocity()) / 350, 5);
        G.to(loop, { timeScale: dir * (1 + boost), duration: .2, overwrite: true, onComplete: () => G.to(loop, { timeScale: dir, duration: 1.1, ease: 'power2.out', overwrite: true }) });
      }
    });
  }

  /* ---------- curseurs : remplissage ---------- */
  const fill = (r) => r.style.setProperty('--f', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');

  /* ---------- calculateur : ce que l'organisateur touche en Free et en Pro (commission hors frais de paiement) ---------- */
  const cN = $('#calc-n'), cP = $('#calc-p');
  if (cN && cP) {
    const outN = $('#calc-n-out'), outP = $('#calc-p-out'), gross = $('#calc-gross'), net = $('#calc-net'), planEl = $('#calc-plan'), more = $('#calc-more'), live = $('#calc-live');
    const stubs = { free: $('[data-k="free"]'), pro: $('[data-k="pro"]') };
    const commProEl = $('#calc-comm-pro');
    const SUB = 29;
    // grille d'octobre 2026 : 0,29 € + 2 % par billet payant, plafonnée à 2,50 € (Free) et 1 € (Pro), arrondie au centime
    const comm = (p, cap) => Math.min(cap, Math.round((0.29 + 0.02 * p) * 100) / 100);
    const compute = () => {
      const n = +cN.value, p = +cP.value, g = n * p;
      const commFree = Math.round(n * comm(p, 2.5) * 100) / 100, commPro = Math.round(n * comm(p, 1) * 100) / 100;
      const pro = commPro + SUB, best = pro < commFree ? 'pro' : 'free';
      const gain = comm(p, 2.5) - comm(p, 1); // économie par billet en Pro
      return { n, p, g, commFree, commPro, pro, best, net: g - Math.min(commFree, pro), save: commFree - pro, from: gain > 0 ? Math.ceil(SUB / gain) : 0 };
    };
    const shown = {};
    const put = (key, el, val, now, write) => {
      const w = write || ((v) => { el.textContent = eur0(v); });
      if (!anim || now) { shown[key] = val; w(val); return; }
      if (shown[key] === undefined) shown[key] = val;
      G.to(shown, { [key]: val, duration: .5, ease: 'power3.out', overwrite: 'auto', onUpdate: () => w(shown[key]) });
    };
    const advice = (r) => r.best === 'pro' ? T('calcProSaves', { x: eur0(r.save) }, 'Le Pro vous fait économiser {x} à ce volume.')
      : r.from > 0 ? T('calcProFrom', { n: nf0.format(r.from) }, 'Le Pro devient rentable dès {n} billets à ce prix.')
      : T('calcFreeBest', {}, 'À ce prix, l’offre Free est la plus avantageuse.');
    const render = (now) => {
      const r = compute();
      outN.textContent = nf0.format(r.n);
      outP.textContent = eur0(r.p);
      fill(cN); fill(cP);
      put('g', gross, r.g, now);
      put('net', net, r.net, now);
      put('free', $('.stub__amt b', stubs.free), r.commFree, now);
      put('pro', $('.stub__amt b', stubs.pro), r.pro, now);
      put('cp', commProEl, r.commPro, now);
      more.textContent = advice(r);
      planEl.textContent = r.best === 'pro' ? 'Pro' : 'Free';
      stubs.free.classList.toggle('is-best', r.best === 'free');
      stubs.pro.classList.toggle('is-best', r.best === 'pro');
      const max = Math.max(1, r.commFree, r.pro);
      stubs.free.style.setProperty('--w', Math.max(2, (r.commFree / max) * 100) + '%');
      stubs.pro.style.setProperty('--w', Math.max(2, (r.pro / max) * 100) + '%');
    };
    const announce = () => {
      const r = compute();
      live.textContent = T('calcLive', { n: nf0.format(r.n), p: eur0(r.p), free: eur0(r.commFree), pro: eur0(r.pro), net: eur0(r.net) }, 'Pour {n} billets à {p} : {free} de commission avec Evoly Free, {pro} avec Evoly Pro abonnement compris. Vous percevez {net}.');
    };
    [cN, cP].forEach((i) => { i.addEventListener('input', () => render(false)); i.addEventListener('change', announce); });
    render(true);
  }

  /* ---------- trois étapes : narration au défilement ---------- */
  const track = $('.flow__track'), steps = $$('.step'), screens = $$('.screen'), dots = $$('.steps__dots i');
  let cur = -1;
  function setStep(i) {
    if (i === cur) return;
    cur = i;
    steps.forEach((s, k) => { s.classList.toggle('is-active', k === i); k === i ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current'); });
    screens.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((dd, k) => dd.classList.toggle('is-on', k <= i));
  }
  function onFlow() {
    const r = track.getBoundingClientRect();
    const total = Math.max(1, r.height - innerHeight);
    const p = Math.min(1, Math.max(0, -r.top / total));
    track.style.setProperty('--p', p.toFixed(3));
    setStep(p < .34 ? 0 : p < .68 ? 1 : 2);
  }
  addEventListener('scroll', onFlow, { passive: true });
  addEventListener('resize', onFlow);
  onFlow();
  steps.forEach((s, k) => s.addEventListener('click', () => {
    const top = track.getBoundingClientRect().top + scrollY;
    const total = track.offsetHeight - innerHeight;
    const y = top + total * [0.12, 0.5, 0.86][k];
    if (lenis) lenis.scrollTo(y, { duration: 1 }); else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }));

  /* ---------- revente : démonstration ---------- */
  const rsBuy = $('.rs-buy');
  if (rsBuy) {
    const oldFig = $('.stage__old'), newFig = $('.stage__new'), rsReplay = $('.rs-replay');
    const oldIn = $('.stage__tkin', oldFig), newIn = $('.stage__tkin', newFig);
    const fx = ticketFx($('svg', oldIn), oldIn);
    const idle = rsBuy.textContent;
    let sold = false;
    rsBuy.addEventListener('click', (e) => {
      if (sold) return;
      sold = true;
      const kb = e.detail === 0;
      rsBuy.disabled = true;
      rsBuy.textContent = T('resaleBought', {}, 'Achat simulé');
      oldFig.classList.add('is-void');
      fx.punch();
      newFig.classList.add('is-in');
      if (anim) G.fromTo(newIn, { y: -46, rotation: 10, scale: .9, opacity: 0 }, { y: 0, rotation: 3, scale: 1, opacity: 1, duration: 1, ease: 'back.out(1.6)', delay: .45 });
      rsReplay.hidden = false;
      if (kb) rsReplay.focus({ preventScroll: true });
      toast(T('resaleToast', {}, 'Achat simulé : le billet de Thomas est désactivé et celui de Léa a été envoyé par e-mail.'));
    });
    rsReplay.addEventListener('click', () => {
      sold = false;
      rsBuy.disabled = false;
      rsBuy.textContent = idle;
      oldFig.classList.remove('is-void');
      fx.reset();
      newFig.classList.remove('is-in');
      if (anim) { G.killTweensOf(newIn); G.set(newIn, { clearProps: 'all' }); }
      rsReplay.hidden = true;
      rsBuy.focus({ preventScroll: true });
    });
  }

  /* ---------- prix dynamiques ---------- */
  const day = $('#dyn-day');
  if (day) {
    const tiers = [{ name: T('tierPresale', {}, 'Prévente'), price: 18 }, { name: T('tierNormal', {}, 'Normal'), price: 24 }, { name: T('tierDay', {}, 'Jour J'), price: 29 }];
    const pos = $$('.dyn .stack__pos'), priceEl = $('.dyn__price'), tierEl = $('.dyn__tier'), whenEl = $('.dyn__when');
    const shownP = { v: tiers[0].price };
    let curT = -1, auto = null;
    const tierOf = (v) => { const left = 30 - v; return left >= 15 ? 0 : left >= 1 ? 1 : 2; };
    const upd = () => {
      const v = +day.value, left = 30 - v, t = tierOf(v);
      fill(day);
      whenEl.innerHTML = left === 0 ? T('buyOnDay', {}, 'pour un achat le jour J') : T('buyAt', { d: `<span class="nw">${T('dayMinus', { n: left }, 'J-{n}')}</span>` }, 'pour un achat à {d}');
      day.setAttribute('aria-valuetext', `${left === 0 ? T('dayJ', {}, 'Jour J') : T('dayMinus', { n: left }, 'J-{n}')}\u00a0: ${tiers[t].name.toLowerCase()}, ${eur0(tiers[t].price)}`);
      if (t === curT) return;
      curT = t;
      tierEl.textContent = tiers[t].name;
      pos.forEach((el, i) => { el.classList.toggle('is-on', i === t); el.classList.toggle('is-off', i !== t); });
      if (anim) G.to(shownP, { v: tiers[t].price, duration: .45, ease: 'power3.out', overwrite: true, onUpdate: () => { priceEl.textContent = eur0(shownP.v); } });
      else priceEl.textContent = eur0(tiers[t].price);
    };
    const stopAuto = () => { if (auto) { auto.kill(); auto = null; } day.dataset.touched = '1'; };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => day.addEventListener(ev, stopAuto, { passive: true }));
    day.addEventListener('input', upd);
    upd();
    if (anim) {
      ST.create({
        trigger: '.dyn__widget', start: 'top 70%', once: true,
        onEnter: () => {
          if (day.dataset.touched) return;
          const o = { v: 0 };
          day.value = 0; upd();
          const step = () => { const v = Math.round(o.v); if (+day.value !== v) { day.value = v; upd(); } };
          auto = G.timeline({ delay: .35, onComplete: () => { auto = null; } })
            .to(o, { v: 30, duration: 2.8, ease: 'power1.inOut', onUpdate: step })
            .to(o, { v: 9, duration: 1.3, ease: 'power2.inOut', delay: .9, onUpdate: step });
        }
      });
      const ts = $$('.dyn .stack__t');
      const mid = (ts.length - 1) / 2;
      const spread = () => (innerWidth < 700 ? 38 : 64);
      G.fromTo(ts,
        { x: 0, y: (i) => -i * 3, rotation: (i) => (i - mid) * 1.2 },
        { x: (i) => (i - mid) * spread(), y: (i) => Math.abs(i - mid) * 14, rotation: (i) => (i - mid) * 10, ease: 'none',
          scrollTrigger: { trigger: '.dyn .stack', start: 'top 90%', end: 'center 50%', scrub: .8, invalidateOnRefresh: true } });
    }
  }

  /* ---------- offres : mensuel / annuel ---------- */
  const bills = $$('.bill button');
  if (bills.length) {
    const pp = $('.pro-price'), pb = $('.pro-billed');
    const sp = { v: 29 };
    bills.forEach((b) => b.addEventListener('click', () => {
      const year = b.dataset.bill === 'year';
      if (b.getAttribute('aria-pressed') === 'true') return;
      bills.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pb.textContent = year ? T('yearly', {}, 'Soit 295,80\u202f€ facturés une fois par an') : T('monthly', {}, 'Facturé chaque mois');
      const to = year ? 24.65 : 29;
      if (anim) G.to(sp, { v: to, duration: .6, ease: 'power3.out', overwrite: true, onUpdate: () => { pp.textContent = eur(sp.v); }, onComplete: () => { pp.textContent = eur(to); } });
      else pp.textContent = eur(to);
    }));
  }

  /* ---------- questions : accordéon ---------- */
  $$('.qa').forEach((det) => {
    const sum = $('summary', det), body = $('.qa__a', det);
    let busy = false;
    sum.addEventListener('click', (e) => {
      if (!anim) return;
      e.preventDefault();
      if (busy) return;
      busy = true;
      if (det.open) {
        G.to(body, { height: 0, duration: .35, ease: 'power2.inOut', onComplete: () => { det.open = false; G.set(body, { clearProps: 'height' }); busy = false; ST.refresh(); } });
      } else {
        det.open = true;
        G.fromTo(body, { height: 0 }, { height: 'auto', duration: .45, ease: 'power3.out', clearProps: 'height', onComplete: () => { busy = false; ST.refresh(); } });
      }
    });
  });

  /* ---------- moyens de paiement : les pastilles arrivent ---------- */
  const pms = $$('.pm');
  if (anim && pms.length) {
    G.set(pms, { opacity: 0, y: 26, scale: .7 });
    ST.create({ trigger: '.paywall', start: 'top 88%', once: true, onEnter: () => G.to(pms, { opacity: 1, y: 0, scale: 1, duration: .75, stagger: { each: .035, from: 'random' }, ease: 'back.out(2)' }) });
  }

  /* ---------- marketing : configurateur de marque ---------- */
  const bpv = $('.bpv');
  if (bpv) {
    const nameIn = $('#bf-name'), domIn = $('#bf-domain'), fileIn = $('#bf-file'), c1 = $('#bf-c1'), c2 = $('#bf-c2'), hint = $('#bf-hint');
    const logo = $('#bpv-logo'), nameOut = $('#bpv-name'), domOut = $('#bpv-domain'), footOut = $('#bpv-foot');
    const STOP = ['le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'the', 'et', 'and', 'of'];
    const initials = (t) => {
      const w = t.split(/[\s'’\-]+/).filter((x) => x && !STOP.includes(x.toLowerCase()));
      return ((w.length ? w : [t]).slice(0, 2).map((x) => x[0]).join('') || 'EV').toUpperCase();
    };
    const toRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]);
    };
    const inkFor = (h) => { const L = lum(toRgb(h)); return (L + .05) / .066 >= 1.05 / (L + .05) ? '#222222' : '#FFFFFF'; };
    let hasLogo = false;
    const paint = () => {
      const name = nameIn.value.trim() || 'Votre organisation';
      const dom = domIn.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '') || 'billets.votre-site.com';
      nameOut.textContent = name;
      footOut.textContent = name;
      domOut.textContent = dom;
      if (!hasLogo) logo.textContent = initials(name);
      bpv.style.setProperty('--b1', c1.value);
      bpv.style.setProperty('--b1-ink', inkFor(c1.value));
      bpv.style.setProperty('--b2', c2.value);
      bpv.style.setProperty('--b2-ink', inkFor(c2.value));
    };
    [nameIn, domIn, c1, c2].forEach((el) => el.addEventListener('input', paint));
    const palette = (img) => {
      const S = 48, cv = d.createElement('canvas');
      cv.width = cv.height = S;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const k = Math.min(S / (img.naturalWidth || S), S / (img.naturalHeight || S));
      const w = Math.max(1, Math.round((img.naturalWidth || S) * k)), h = Math.max(1, Math.round((img.naturalHeight || S) * k));
      cx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      const px = cx.getImageData(0, 0, S, S).data, bins = new Map();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 160) continue;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
        if (l > .93 || l < .07) continue;
        const sat = mx === mn ? 0 : (mx - mn) / 255 / (1 - Math.abs(2 * l - 1));
        const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
        const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
        e.n++; e.r += r; e.g += g; e.b += b; e.s += sat;
        bins.set(key, e);
      }
      const cols = [...bins.values()].map((e) => ({ c: [e.r / e.n, e.g / e.n, e.b / e.n], w: e.n * (.3 + e.s / e.n) })).sort((a, b) => b.w - a.w);
      if (!cols.length) return null;
      const main = cols[0].c;
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const other = cols.find((x) => dist(x.c, main) > 90);
      return [toHex(main), other ? toHex(other.c) : (lum(main) > .4 ? '#222222' : '#fff6f0')];
    };
    fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type) || f.size > 5e6) { hint.textContent = T('logoTooBig', {}, 'Choisissez une image de moins de 5 Mo.'); return; }
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          hasLogo = true;
          logo.textContent = '';
          const im = d.createElement('img');
          im.src = rd.result;
          im.alt = '';
          logo.appendChild(im);
          let p = null;
          try { p = palette(img); } catch (e) { p = null; }
          if (p) { c1.value = p[0]; c2.value = p[1]; hint.textContent = T('logoColors', {}, 'Couleurs tirées de votre logo. Ajustez-les si besoin.'); }
          else hint.textContent = T('logoImported', {}, 'Logo importé. Choisissez vos couleurs ci-dessous.');
          paint();
          if (anim) G.fromTo('.bpv__page', { scale: .98 }, { scale: 1, duration: .6, ease: 'elastic.out(1,.5)' });
        };
        img.onerror = () => { hint.textContent = T('logoInvalid', {}, 'Ce fichier ne ressemble pas à une image. Essayez un PNG, un JPG ou un SVG.'); };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    paint();
  }

  /* ---------- marketing : e-mails automatiques ---------- */
  const mTabs = $$('.mm__tabs [role="tab"]'), mPanels = $$('.mm__panel');
  if (mTabs.length) {
    let mi = 0, mTimer = null, mUser = false;
    const showMail = (i, focus) => {
      mi = i;
      mTabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      mPanels.forEach((pn, k) => { pn.hidden = k !== i; });
      if (anim) G.fromTo(mPanels[i], { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .45, ease: 'power3.out' });
      if (focus) mTabs[i].focus();
    };
    const stopMail = () => { clearInterval(mTimer); mTimer = null; };
    const startMail = () => { if (!mTimer && !mUser) mTimer = setInterval(() => showMail((mi + 1) % mTabs.length), 3400); };
    mTabs.forEach((t, k) => {
      t.addEventListener('click', () => { mUser = true; stopMail(); showMail(k); });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        mUser = true; stopMail();
        showMail((mi + (e.key === 'ArrowRight' ? 1 : -1) + mTabs.length) % mTabs.length, true);
      });
    });
    if (anim) ST.create({ trigger: '.mailmock', start: 'top 85%', end: 'bottom 15%', onToggle: (self) => (self.isActive ? startMail() : stopMail()) });
  }

  /* ---------- stats : chiffres en direct ---------- */
  const dash = $('.stats .dash');
  if (dash) {
    const soldEl = $('.js-sold', dash), revEl = $('.js-rev', dash), fillEl = $('.js-fill', dash), meter = $('.meter i', dash), feed = $('.feed', dash);
    const CAP = 900, st = { sold: 842, rev: 20208 };
    const paint = () => {
      soldEl.textContent = nf0.format(st.sold);
      revEl.textContent = eur0(st.rev);
      fillEl.textContent = Math.round((st.sold / CAP) * 100) + '\u202f%';
      meter.style.width = (st.sold / CAP) * 100 + '%';
    };
    if (anim) {
      ST.create({
        trigger: dash, start: 'top 78%', once: true,
        onEnter: () => {
          const o = { s: 610, r: 610 * 24 };
          G.to(o, { s: 842, r: 20208, duration: 1.6, ease: 'power3.out', onUpdate: () => { st.sold = Math.round(o.s); st.rev = Math.round(o.r); paint(); } });
          G.from($$('.bars i', dash), { scaleY: 0, transformOrigin: '50% 100%', duration: .9, stagger: .06, ease: 'back.out(1.6)' });
        }
      });
      const ages = [T('feedNow', {}, 'à l’instant'), T('feedMin', { n: 1 }, 'il y a {n} min'), T('feedMin', { n: 3 }, 'il y a {n} min')];
      const sale = () => {
        if (st.sold >= CAP - 1) return;
        const vip = Math.random() < .25, k = vip ? 1 : (Math.random() < .3 ? 2 : 1);
        st.sold = Math.min(CAP - 1, st.sold + k);
        st.rev += (vip ? 45 : 24) * k;
        paint();
        const li = d.createElement('li');
        li.innerHTML = `<b>${vip ? T('feedVip', {}, 'Balcon VIP') : T('feedPit', {}, 'Fosse')}</b><span>${k > 1 ? T('feedMany', { n: k }, '{n} billets') : T('feedOne', {}, '1 billet')}</span><em></em>`;
        feed.prepend(li);
        while (feed.children.length > 3) feed.lastElementChild.remove();
        $$('em', feed).forEach((em, i) => { em.textContent = ages[i] || ages[2]; });
        G.from(li, { height: 0, paddingTop: 0, paddingBottom: 0, opacity: 0, duration: .5, ease: 'power3.out', clearProps: 'height,paddingTop,paddingBottom,opacity' });
        G.fromTo(soldEl, { scale: 1.08 }, { scale: 1, duration: .45, ease: 'back.out(3)' });
      };
      let tick = null;
      ST.create({ trigger: dash, start: 'top 85%', end: 'bottom 15%', onToggle: (self) => { if (self.isActive) { if (!tick) tick = setInterval(sale, 2600); } else { clearInterval(tick); tick = null; } } });
    }
    paint();
  }

  /* ---------- final : les O tournent, le logo se pose ---------- */
  if (anim) {
    const fST = { trigger: '.final', start: 'top bottom', end: 'bottom top', scrub: .7 };
    G.to('.bigo--c', { rotation: 80, ease: 'none', scrollTrigger: fST });
    G.to('.bigo--d', { rotation: -60, ease: 'none', scrollTrigger: { ...fST } });
    G.from('.final__logo path', { y: 90, opacity: 0, stagger: .05, ease: 'power3.out', scrollTrigger: { trigger: '.final__logo', start: 'top 98%', end: 'top 58%', scrub: .7 } });
  }

  /* ---------- boutons de démonstration ---------- */
  $$('[data-toast]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); toast(b.dataset.toast); }));

  if (hasG && d.fonts && d.fonts.ready) d.fonts.ready.then(() => ST.refresh());
})();
