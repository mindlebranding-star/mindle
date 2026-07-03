/* ════════════════════════════════════════════════════════════
   MINDLE — coreografia de página
   Ponto · Linha · Sistema
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const doc = document.documentElement;

  doc.classList.add('js-on');
  if (FINE) doc.classList.add('has-fine-pointer');

  if (typeof gsap !== 'undefined') gsap.registerPlugin(ScrollTrigger);

  /* ──────────────────────────────────────────────
     Constelação — ponto, linha, sistema
  ────────────────────────────────────────────── */
  class Constellation {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign({
        density: 18500,        // px² por ponto
        maxPoints: 96,
        speed: 0.16,
        linkDist: 155,
        lineAlpha: 0.5,
        settled: false,
        mouse: false
      }, opts);
      if (this.opts.settled) {
        this.opts.speed *= 0.3;
        this.opts.linkDist = 200;
        this.opts.lineAlpha = 0.55;
      }
      this.points = [];
      this.mouse = { x: -9999, y: -9999 };
      this.running = false;
      this.raf = null;

      this.resize = this.resize.bind(this);
      this.loop = this.loop.bind(this);

      this.resize();
      let t;
      window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(this.resize, 180); });

      if (this.opts.mouse && FINE) {
        const host = canvas.parentElement;
        host.addEventListener('pointermove', (e) => {
          const r = canvas.getBoundingClientRect();
          this.mouse.x = e.clientX - r.left;
          this.mouse.y = e.clientY - r.top;
        });
        host.addEventListener('pointerleave', () => { this.mouse.x = -9999; this.mouse.y = -9999; });
      }

      if (REDUCED) { this.draw(); return; }

      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          this.visible = en.isIntersecting;
          if (en.isIntersecting && !document.hidden) this.start(); else this.stop();
        });
      });
      io.observe(canvas);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop(); else if (this.visible) this.start();
      });
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = r.width; this.h = r.height;
      this.canvas.width = r.width * dpr;
      this.canvas.height = r.height * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mobile = window.innerWidth < 768;
      const density = this.opts.density * (mobile ? 1.7 : 1);
      const n = Math.min(this.opts.maxPoints, Math.round((this.w * this.h) / density));
      this.points = Array.from({ length: n }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * this.opts.speed * 2,
        vy: (Math.random() - 0.5) * this.opts.speed * 2,
        r: 0.8 + Math.random() * 0.9,
        a: 0.2 + Math.random() * 0.25,
        accent: this.opts.settled && Math.random() < 0.09
      }));
      if (REDUCED) this.draw();
    }

    start() { if (!this.running) { this.running = true; this.raf = requestAnimationFrame(this.loop); } }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }

    loop() {
      if (!this.running) return;
      for (const p of this.points) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -24) p.x = this.w + 24; else if (p.x > this.w + 24) p.x = -24;
        if (p.y < -24) p.y = this.h + 24; else if (p.y > this.h + 24) p.y = -24;
      }
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }

    draw() {
      const ctx = this.ctx, pts = this.points, ld = this.opts.linkDist;
      ctx.clearRect(0, 0, this.w, this.h);
      // linhas
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > ld * ld) continue;
          const d = Math.sqrt(d2);
          let alpha = (1 - d / ld) * this.opts.lineAlpha;
          const mx = (a.x + b.x) / 2 - this.mouse.x;
          const my = (a.y + b.y) / 2 - this.mouse.y;
          const nearMouse = (mx * mx + my * my) < 150 * 150;
          ctx.strokeStyle = nearMouse
            ? 'rgba(46,139,142,' + (alpha * 1.6).toFixed(3) + ')'
            : 'rgba(154,152,144,' + (alpha * 0.55).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      // pontos
      for (const p of pts) {
        ctx.fillStyle = p.accent
          ? 'rgba(88,211,213,' + (p.a + 0.15).toFixed(3) + ')'
          : 'rgba(240,237,230,' + p.a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const heroCanvas = document.getElementById('canvas-hero');
  const convCanvas = document.getElementById('canvas-conversa');
  if (heroCanvas) new Constellation(heroCanvas, { mouse: true });
  if (convCanvas) new Constellation(convCanvas, { settled: true, maxPoints: 60 });

  /* ──────────────────────────────────────────────
     Split de palavras (preserva .tx / strong / <br>)
  ────────────────────────────────────────────── */
  function splitWords(target) {
    const frag = document.createDocumentFragment();
    const make = (word, sourceEl) => {
      const w = document.createElement('span'); w.className = 'w';
      const wi = document.createElement('span'); wi.className = 'wi';
      if (sourceEl) {
        const clone = sourceEl.cloneNode(false);
        clone.textContent = word;
        wi.appendChild(clone);
      } else {
        wi.textContent = word;
      }
      w.appendChild(wi);
      return w;
    };
    const pushTokens = (text, sourceEl) => {
      text.split(/(\s+)/).forEach((tok) => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) frag.appendChild(document.createTextNode(' '));
        else frag.appendChild(make(tok, sourceEl));
      });
    };
    Array.from(target.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) pushTokens(node.textContent);
      else if (node.nodeName === 'BR') frag.appendChild(node.cloneNode());
      else pushTokens(node.textContent, node);
    });
    target.textContent = '';
    target.appendChild(frag);
    return Array.from(target.querySelectorAll('.wi'));
  }

  /* ──────────────────────────────────────────────
     FAQ — uma resposta aberta por vez
  ────────────────────────────────────────────── */
  const faqItems = Array.from(document.querySelectorAll('.faq-item'));
  faqItems.forEach((item) => {
    const btn = item.querySelector('.faq-q');
    btn.addEventListener('click', () => {
      const open = item.classList.contains('is-open');
      faqItems.forEach((it) => {
        it.classList.remove('is-open');
        it.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
      setTimeout(() => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); }, 600);
    });
  });

  /* ──────────────────────────────────────────────
     Origem do lead — UTM + referrer (campanhas pagas)
  ────────────────────────────────────────────── */
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  (function captarUtm() {
    try {
      const p = new URLSearchParams(location.search);
      if (UTM_KEYS.some((k) => p.get(k))) {
        const o = {};
        UTM_KEYS.forEach((k) => { if (p.get(k)) o[k] = p.get(k).slice(0, 180); });
        if (document.referrer) o.referrer = document.referrer.slice(0, 300);
        sessionStorage.setItem('mindle_utm', JSON.stringify(o));
      } else if (document.referrer && !document.referrer.startsWith(location.origin) &&
                 !sessionStorage.getItem('mindle_utm')) {
        sessionStorage.setItem('mindle_utm', JSON.stringify({ referrer: document.referrer.slice(0, 300) }));
      }
    } catch (e) { /* storage bloqueado: segue sem origem */ }
  })();
  function lerUtm() {
    try { return JSON.parse(sessionStorage.getItem('mindle_utm')) || {}; }
    catch (e) { return {}; }
  }

  /* ──────────────────────────────────────────────
     Agenda Cal.com — embutida no sucesso do caminho A
  ────────────────────────────────────────────── */
  let calMontado = false;
  function montarCal(nome, email) {
    if (calMontado || !window.MINDLE_CAL || !document.getElementById('cal-slot')) return;
    calMontado = true;
    (function (C, A, L) {
      let p = function (a, ar) { a.q.push(ar); };
      let d = C.document;
      C.Cal = C.Cal || function () {
        let cal = C.Cal, ar = arguments;
        if (!cal.loaded) {
          cal.ns = {}; cal.q = cal.q || [];
          d.head.appendChild(d.createElement('script')).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          const api = function () { p(api, arguments); };
          const namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === 'string') {
            cal.ns[namespace] = cal.ns[namespace] || api;
            p(cal.ns[namespace], ar);
            p(cal, ['initNamespace', namespace]);
          } else p(cal, ar);
          return;
        }
        p(cal, ar);
      };
    })(window, 'https://app.cal.com/embed/embed.js', 'init');
    Cal('init', { origin: 'https://app.cal.com' });
    Cal('inline', {
      elementOrSelector: '#cal-slot',
      calLink: window.MINDLE_CAL,
      // pré-preenche com os dados que o lead acabou de informar (sobrescreve
      // qualquer prefill da conta Cal logada no navegador)
      config: { theme: 'dark', name: nome || '', email: email || '', locale: 'pt-BR' }
    });
    Cal('ui', { theme: 'dark', styles: { branding: { brandColor: '#2E8B8E' } } });
  }

  /* ──────────────────────────────────────────────
     Formulário — qualificação, roteamento e envio
     Caminho A (diagnóstico ao vivo): situação A/B + investimento sim/breve
     Caminho B (nurture): situação C ou investimento "entender"
  ────────────────────────────────────────────── */
  async function enviarLead(payload) {
    const cfg = window.MINDLE_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey) return 'demo';
    const res = await fetch(cfg.url + '/rest/v1/' + (cfg.table || 'leads'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      throw new Error('Supabase HTTP ' + res.status + ' ' + corpo.slice(0, 220));
    }
    return 'ok';
  }

  const form = document.getElementById('form-conversa');
  if (form) {
    const errorBox = document.getElementById('form-error');
    const successA = document.getElementById('success-a');
    const successB = document.getElementById('success-b');
    const submitBtn = form.querySelector('.btn-submit');
    const submitLabel = submitBtn.textContent;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => form[n].value.trim();
      const nome = v('nome');
      const email = v('email');
      const profissao = v('profissao');
      const link = v('link');
      const servico = v('servico');
      const sitEl = form.querySelector('input[name="situacao"]:checked');
      const invEl = form.querySelector('input[name="investimento"]:checked');
      const situacao = sitEl ? sitEl.value : '';
      const investimento = invEl ? invEl.value : '';
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      form.nome.classList.toggle('is-invalid', !nome);
      form.email.classList.toggle('is-invalid', !emailOk);
      form.profissao.classList.toggle('is-invalid', !profissao);
      form.servico.classList.toggle('is-invalid', !servico);
      document.querySelector('#grupo-situacao .choices').classList.toggle('is-invalid', !situacao);
      document.querySelector('#grupo-investimento .choices').classList.toggle('is-invalid', !investimento);

      if (!nome || !emailOk || !profissao || !servico || !situacao || !investimento) {
        errorBox.hidden = false;
        const firstBad = form.querySelector('.is-invalid input, .field-input.is-invalid');
        if (firstBad) firstBad.focus();
        return;
      }
      errorBox.hidden = true;

      const caminho = (situacao !== 'C' && investimento !== 'entender') ? 'A' : 'B';

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando…';
      const base = { nome, email, profissao, link: link || null, servico, situacao, investimento };
      let resultado;
      try {
        resultado = await enviarLead(Object.assign({}, base, lerUtm()));
      } catch (err) {
        // colunas de UTM ainda não criadas no banco? Reenvia sem elas — lead nunca se perde
        if (/column|PGRST204|42703/i.test(err.message || '')) {
          try { resultado = await enviarLead(base); } catch (err2) { err = err2; resultado = null; }
        } else resultado = null;
        if (!resultado) {
          console.error('Falha ao registrar lead:', err);
          submitBtn.disabled = false;
          submitBtn.textContent = submitLabel;
          errorBox.textContent = 'Não conseguimos registrar agora. Tente de novo em instantes.';
          errorBox.hidden = false;
          return;
        }
      }
      if (resultado === 'demo') console.info('MINDLE_SUPABASE não configurado — lead não persistido (modo demo).');

      // Troca de estado síncrona — nunca depender de onComplete do GSAP
      // (rAF pausa em aba oculta e o sucesso não apareceria)
      const success = caminho === 'A' ? successA : successB;
      if (caminho === 'A') montarCal(nome, email);
      form.hidden = true;
      success.hidden = false;
      if (typeof gsap !== 'undefined' && !REDUCED) {
        gsap.from(success, { autoAlpha: 0, y: 24, duration: 0.8, ease: 'power3.out' });
      }
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      // o documento encolhe na troca e o navegador clamparia o scroll no rodapé:
      // reancora a viewport no painel de sucesso
      const alvoSucesso = () => Math.max(0, success.getBoundingClientRect().top + window.scrollY - 100);
      if (window.__lenis) window.__lenis.scrollTo(alvoSucesso(), { duration: 0.9 });
      else window.scrollTo({ top: alvoSucesso(), behavior: REDUCED ? 'auto' : 'smooth' });
      // garantia: se a animação não rodou (aba oculta/throttled), salta direto
      setTimeout(() => {
        const alvo = alvoSucesso();
        if (Math.abs(window.scrollY - alvo) > 160) {
          if (window.__lenis) window.__lenis.scrollTo(alvo, { immediate: true });
          window.scrollTo(0, alvo);
        }
      }, 1300);
    });

    form.addEventListener('input', (e) => {
      if (e.target.classList) e.target.classList.remove('is-invalid');
      const group = e.target.closest('.choices');
      if (group) group.classList.remove('is-invalid');
    });
  }

  /* ──────────────────────────────────────────────
     Sem GSAP (fallback) — página estática legível
  ────────────────────────────────────────────── */
  if (typeof gsap === 'undefined') return;

  /* ──────────────────────────────────────────────
     Lenis — rolagem suave + âncoras
  ────────────────────────────────────────────── */
  let lenis = null;
  if (!REDUCED && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: -64, duration: 1.5 });
      else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    });
  });

  /* ──────────────────────────────────────────────
     Header — estado rolado
  ────────────────────────────────────────────── */
  ScrollTrigger.create({
    trigger: document.body,
    start: 'top -64',
    end: 'max',
    toggleClass: { className: 'is-scrolled', targets: '.site-header' }
  });

  /* ──────────────────────────────────────────────
     Seção invertida — morph do território
  ────────────────────────────────────────────── */
  ScrollTrigger.create({
    trigger: '#posicao',
    start: 'top 74%',
    end: 'bottom 38%',
    onEnter: () => doc.classList.add('is-light'),
    onEnterBack: () => doc.classList.add('is-light'),
    onLeave: () => doc.classList.remove('is-light'),
    onLeaveBack: () => doc.classList.remove('is-light')
  });

  /* ──────────────────────────────────────────────
     Etapas do método — ativação + linha de progresso
  ────────────────────────────────────────────── */
  document.querySelectorAll('[data-step]').forEach((step) => {
    ScrollTrigger.create({
      trigger: step,
      start: 'top 62%',
      onEnter: () => step.classList.add('is-active'),
      onLeaveBack: () => step.classList.remove('is-active')
    });
  });
  const railProgress = document.querySelector('.rail-progress');
  if (railProgress) {
    gsap.to(railProgress, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.rail', start: 'top 62%', end: 'bottom 50%', scrub: 0.5 }
    });
  }

  if (REDUCED) return; // o resto é coreografia

  /* ──────────────────────────────────────────────
     Split + revelações
  ────────────────────────────────────────────── */
  const splitTargets = Array.from(document.querySelectorAll('[data-split]'));
  const splitMap = new Map();
  const fontsReady = Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((res) => setTimeout(res, 1100))
  ]);

  fontsReady.then(() => {
    splitTargets.forEach((el) => splitMap.set(el, splitWords(el)));

    const inHero = (el) => !!el.closest('.hero');

    /* Entrada do hero */
    const heroTitleWis = splitMap.get(document.querySelector('.hero-title')) || [];
    const heroEyebrow = document.querySelector('.hero-eyebrow');
    const heroFades = Array.from(document.querySelectorAll('.hero [data-anim="fade"]'));
    const cue = document.querySelector('.hero-cue');

    gsap.set('.site-header', { autoAlpha: 0, y: -18 });
    gsap.set(heroEyebrow, { autoAlpha: 0, x: -14 });
    gsap.set(heroTitleWis, { yPercent: 118 });
    gsap.set(heroFades, { autoAlpha: 0, y: 26 });
    gsap.set(heroCanvas, { autoAlpha: 0 });

    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.to(heroCanvas, { autoAlpha: 1, duration: 2.2, ease: 'power1.inOut' }, 0.15)
      .to('.site-header', { autoAlpha: 1, y: 0, duration: 0.9 }, 0.1)
      .to(heroEyebrow, { autoAlpha: 1, x: 0, duration: 0.8 }, 0.25)
      .to(heroTitleWis, { yPercent: 0, duration: 1.25, stagger: 0.05 }, 0.35)
      .to(heroFades, { autoAlpha: 1, y: 0, duration: 0.95, stagger: 0.14 }, 1.0);

    /* Saída suave do hero */
    gsap.to('.hero-inner', {
      yPercent: -7,
      autoAlpha: 0.3,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: '62% top', end: 'bottom top', scrub: true }
    });

    /* Headlines fora do hero */
    splitTargets.filter((el) => !inHero(el)).forEach((el) => {
      const wis = splitMap.get(el);
      gsap.set(wis, { yPercent: 118 });
      gsap.to(wis, {
        yPercent: 0,
        duration: 1.05,
        ease: 'power4.out',
        stagger: 0.045,
        scrollTrigger: { trigger: el, start: 'top 85%' },
        onComplete: () => gsap.set(wis, { clearProps: 'transform' })
      });
    });

    /* Eyebrows fora do hero */
    document.querySelectorAll('[data-anim="eyebrow"]').forEach((el) => {
      if (inHero(el)) return;
      gsap.set(el, { autoAlpha: 0, x: -14 });
      gsap.to(el, {
        autoAlpha: 1, x: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    /* Fades fora do hero */
    document.querySelectorAll('[data-anim="fade"]').forEach((el) => {
      if (inHero(el)) return;
      gsap.set(el, { autoAlpha: 0, y: 28 });
      gsap.to(el, {
        autoAlpha: 1, y: 0, duration: 0.95, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%' }
      });
    });

    /* Cards — entrada em lote + desenho dos glifos */
    ['.vao-grid', '.camadas-grid'].forEach((sel) => {
      const cards = gsap.utils.toArray(sel + ' [data-anim="card"]');
      if (!cards.length) return;
      gsap.set(cards, { autoAlpha: 0, y: 44 });
      ScrollTrigger.batch(cards, {
        start: 'top 84%',
        onEnter: (batch) => gsap.to(batch, {
          autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.13
        })
      });
    });
    document.querySelectorAll('.piece-card').forEach((card) => {
      const draws = card.querySelectorAll('.draw');
      const dots = card.querySelectorAll('.glyph-dot');
      const tlg = gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 80%' } });
      if (draws.length) {
        gsap.set(draws, { strokeDasharray: 1, strokeDashoffset: 1 });
        tlg.to(draws, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.12 }, 0.25);
      }
      if (dots.length) {
        gsap.set(dots, { scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' });
        tlg.to(dots, { scale: 1, duration: 0.6, ease: 'back.out(2.5)' }, 0.5);
      }
    });

    /* Recusas — riscadas uma a uma */
    document.querySelectorAll('[data-anim="strike"] .recusa-text').forEach((el, i) => {
      gsap.to(el, {
        '--strike': 1,
        duration: 0.65,
        ease: 'power2.inOut',
        delay: i * 0.18,
        scrollTrigger: { trigger: el.closest('.recusas'), start: 'top 78%' }
      });
    });

    /* Dupla — linha entre os dois pontos */
    const duoLine = document.querySelector('.duo-line');
    if (duoLine) {
      gsap.to(duoLine, {
        strokeDashoffset: 0,
        duration: 1.7,
        ease: 'power2.inOut',
        scrollTrigger: { trigger: '.duo', start: 'top 78%' }
      });
    }

    /* Itens do FAQ — entrada sutil */
    const faqEls = gsap.utils.toArray('.faq-item');
    gsap.set(faqEls, { autoAlpha: 0, y: 22 });
    ScrollTrigger.batch(faqEls, {
      start: 'top 88%',
      onEnter: (batch) => gsap.to(batch, {
        autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08
      })
    });

    ScrollTrigger.refresh();
  });

  /* ──────────────────────────────────────────────
     Cursor custom + botões magnéticos
  ────────────────────────────────────────────── */
  if (FINE) {
    const cursor = document.querySelector('.cursor');
    const dot = cursor.querySelector('.cursor-dot');
    const ring = cursor.querySelector('.cursor-ring');
    let tx = -100, ty = -100, dx = -100, dy = -100, rx = -100, ry = -100;

    window.addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      cursor.classList.add('is-ready');
    }, { passive: true });

    gsap.ticker.add(() => {
      dx += (tx - dx) * 0.4; dy += (ty - dy) * 0.4;
      rx += (tx - rx) * 0.16; ry += (ty - ry) * 0.16;
      dot.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translate(-50%,-50%)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
    });

    const hoverSel = '[data-hover], a, button, input, select, .faq-q';
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest(hoverSel)) cursor.classList.add('is-on');
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest(hoverSel)) cursor.classList.remove('is-on');
    });

    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const strength = 0.16;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        gsap.to(el, { x: mx * strength, y: my * strength, duration: 0.5, ease: 'power3.out' });
      });
      el.addEventListener('pointerleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)' });
      });
    });
  }
})();
