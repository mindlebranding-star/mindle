/* ════════════════════════════════════════════════════════════
   MINDLE — Briefing estratégico
   Wizard de 13 etapas · constelação de progresso · Supabase
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cfg = window.MINDLE_SUPABASE || {};
  const GS = typeof gsap !== 'undefined' && !REDUCED ? gsap : null;
  // A mesma engine serve os dois briefings (landing page e branding);
  // a página define tabela, chave de rascunho e prefixo de upload.
  const FORM = Object.assign({
    table: cfg.briefingTable || 'briefings',
    draftKey: 'mindle_briefing_rascunho',
    prefix: ''
  }, window.MINDLE_FORM || {});
  const DRAFT_KEY = FORM.draftKey;
  const MAX_FILE = 50 * 1024 * 1024; // 50MB (limite do bucket)

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

  const steps = $$('.bstep');
  const TOTAL = steps.length;
  let atual = 1;
  let enviado = false;

  const intro = $('#bf-intro');
  const stepLabel = $('#bf-step-label');
  const navCount = $('#bf-nav-count');
  const btnVoltar = $('#btn-voltar');
  const btnAvancar = $('#btn-avancar');
  const errBox = $('#bf-error');
  const files = {}; // { zona: File[] }

  /* ── Constelação de progresso ─────────────────── */
  const prog = $('#bf-progress');
  for (let i = 1; i <= TOTAL; i++) {
    const node = document.createElement('span');
    node.className = 'pnode';
    node.dataset.n = i;
    prog.appendChild(node);
    if (i < TOTAL) {
      const link = document.createElement('span');
      link.className = 'plink';
      link.dataset.n = i;
      prog.appendChild(link);
    }
  }
  function atualizarProgresso() {
    $$('.pnode', prog).forEach((n) => {
      const i = +n.dataset.n;
      n.classList.toggle('is-done', i < atual);
      n.classList.toggle('is-current', i === atual);
    });
    $$('.plink', prog).forEach((l) => l.classList.toggle('is-done', +l.dataset.n < atual));
  }

  /* ── UI por etapa ─────────────────────────────── */
  const pad = (n) => String(n).padStart(2, '0');
  function atualizarUI() {
    const el = steps[atual - 1];
    stepLabel.textContent = 'Etapa ' + pad(atual) + ' / ' + pad(TOTAL) + ' — ' + el.dataset.nome;
    navCount.textContent = pad(atual) + ' / ' + pad(TOTAL);
    btnVoltar.disabled = atual === 1;
    btnAvancar.innerHTML = atual === TOTAL ? 'Enviar briefing &check;' : 'Próximo &rarr;';
    intro.style.display = atual === 1 ? '' : 'none';
    atualizarProgresso();
  }

  function irPara(novo, dir) {
    // Troca de etapa é síncrona no DOM; o GSAP só decora a entrada.
    // (Nunca depender de onComplete para estado: rAF pausa em aba oculta.)
    if (novo < 1 || novo > TOTAL || novo === atual) return;
    const sai = steps[atual - 1];
    const entra = steps[novo - 1];
    atual = novo;
    errBox.hidden = true;

    if (GS) { GS.killTweensOf(sai); GS.set(sai, { clearProps: 'all' }); }
    sai.classList.remove('is-active');
    entra.classList.add('is-active');
    atualizarUI();
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });

    if (GS) {
      const els = [entra.querySelector('.bstep-head'), ...entra.querySelectorAll('.bfields > *')];
      GS.killTweensOf(els);
      GS.fromTo(els,
        { autoAlpha: 0, x: 28 * dir, y: 8 },
        { autoAlpha: 1, x: 0, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.05,
          onComplete: () => GS.set(els, { clearProps: 'all' }) }
      );
    }
  }

  /* ── Validação ────────────────────────────────── */
  function validarEtapa(i) {
    const el = steps[i - 1];
    let ok = true;
    let primeiro = null;
    $$('.bfield[data-required]', el).forEach((f) => {
      const input = f.querySelector('.binput');
      const vazio = !input.value.trim();
      f.classList.toggle('has-error', vazio);
      if (vazio) { ok = false; primeiro = primeiro || input; }
    });
    $$('[data-required-group]', el).forEach((g) => {
      const marcado = g.querySelector('input:checked');
      g.classList.toggle('has-error', !marcado);
      if (!marcado) ok = false;
    });
    if (primeiro) primeiro.focus();
    return ok;
  }
  document.addEventListener('input', (e) => {
    const f = e.target.closest('.bfield');
    if (f) f.classList.remove('has-error');
  });
  document.addEventListener('change', (e) => {
    const g = e.target.closest('[data-required-group]');
    if (g && g.querySelector('input:checked')) g.classList.remove('has-error');
  });

  /* ── Navegação ────────────────────────────────── */
  btnVoltar.addEventListener('click', () => irPara(atual - 1, -1));
  btnAvancar.addEventListener('click', () => {
    if (!validarEtapa(atual)) return;
    if (atual === TOTAL) enviar();
    else irPara(atual + 1, 1);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !enviado) {
      e.preventDefault();
      btnAvancar.click();
    }
  });

  /* ── Campo condicional ("Outro") ──────────────── */
  $$('[data-toggle]').forEach((t) => {
    t.addEventListener('change', () => {
      const alvo = document.getElementById(t.dataset.toggle);
      if (alvo) alvo.classList.toggle('is-open', t.checked);
    });
  });

  /* ── Uploads ──────────────────────────────────── */
  const fmtSize = (b) => b < 1024 ? b + ' B'
    : b < 1048576 ? (b / 1024).toFixed(1) + ' KB'
    : (b / 1048576).toFixed(1) + ' MB';

  /* Compressão automática de imagens (Canvas API, sem dependências).
     Política por zona: fotos/prints/provas comprimem; logo e paleta
     são material-fonte e chegam intactos; vídeo não se comprime no
     navegador de forma viável. */
  const ZONAS_COMPRIMEM = { prova: true, fotos: true, depo: true, logo: false, paleta: false, videos: false };
  const IMG_COMPRIMIVEL = ['image/jpeg', 'image/png', 'image/webp'];
  const IMG_QUALIDADE = 0.85;
  const IMG_MIN_BYTES = 600 * 1024; // abaixo disso não compensa mexer

  async function comprimirImagem(file) {
    // Re-encode na resolução ORIGINAL (sem redimensionar — o arquivo é material do cliente)
    if (!IMG_COMPRIMIVEL.includes(file.type) || file.size < IMG_MIN_BYTES) return file;
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      let blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', IMG_QUALIDADE));
      if (!blob || blob.type !== 'image/webp') {
        // navegador sem encoder WebP: JPEG para fotos; PNG original se houver risco de transparência
        if (file.type === 'image/png') return file;
        blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', IMG_QUALIDADE));
      }
      if (!blob || blob.size >= file.size) return file; // não compensou
      const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
      const novo = new File([blob], file.name.replace(/\.[^.]+$/, '') + ext, { type: blob.type });
      novo._tamanhoOriginal = file.size;
      return novo;
    } catch (e) {
      return file; // qualquer falha: envia o original
    }
  }

  function renderArquivo(file, zona, lista) {
    const li = document.createElement('li');
    li.className = 'ufile';
    const isImg = file.type.startsWith('image/');
    const ext = (file.name.split('.').pop() || '?').toUpperCase().slice(0, 5);
    if (isImg) {
      const img = document.createElement('img');
      img.className = 'ufile-thumb';
      img.alt = '';
      img.src = URL.createObjectURL(file);
      li.appendChild(img);
    } else {
      const tag = document.createElement('span');
      tag.className = 'ufile-ext';
      tag.textContent = ext;
      li.appendChild(tag);
    }
    const info = document.createElement('div');
    info.className = 'ufile-info';
    const nome = document.createElement('div');
    nome.className = 'ufile-name';
    nome.textContent = file.name;
    const tam = document.createElement('div');
    tam.className = 'ufile-size';
    tam.textContent = fmtSize(file.size);
    if (file._tamanhoOriginal) {
      const badge = document.createElement('span');
      badge.className = 'ufile-otim';
      badge.textContent = 'otimizado −' + Math.round((1 - file.size / file._tamanhoOriginal) * 100) + '%';
      tam.appendChild(badge);
    }
    info.append(nome, tam);
    li.appendChild(info);
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'ufile-remove';
    rm.setAttribute('aria-label', 'Remover ' + file.name);
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      const idx = files[zona].indexOf(file);
      if (idx > -1) files[zona].splice(idx, 1);
      li.remove();
      atualizarContagem(zona);
    });
    li.appendChild(rm);
    lista.appendChild(li);
  }

  function atualizarContagem(zona) {
    const c = $('[data-count="' + zona + '"]');
    if (!c) return;
    const n = files[zona].length;
    c.textContent = n + ' arquivo' + (n === 1 ? '' : 's');
  }

  $$('.uzone').forEach((zoneEl) => {
    const zona = zoneEl.dataset.zone;
    const input = zoneEl.querySelector('input[type="file"]');
    const lista = $('.ufiles[data-list="' + zona + '"]');
    files[zona] = [];

    const adicionar = async (fileList) => {
      const pendentes = Array.from(fileList);
      if (!pendentes.length) return;
      zoneEl.classList.add('is-busy');
      for (let file of pendentes) {
        if (ZONAS_COMPRIMEM[zona]) file = await comprimirImagem(file);
        if (file.size > MAX_FILE) {
          errBox.textContent = '"' + file.name + '" passa de 50MB mesmo após otimização — ' +
            (file.type.startsWith('video/')
              ? 'envie um corte menor ou cole um link (Drive/WeTransfer) nas observações finais.'
              : 'reduza o arquivo e tente de novo.');
          errBox.hidden = false;
          continue;
        }
        files[zona].push(file);
        renderArquivo(file, zona, lista);
      }
      zoneEl.classList.remove('is-busy');
      atualizarContagem(zona);
    };

    input.addEventListener('change', (e) => { adicionar(e.target.files); input.value = ''; });
    zoneEl.addEventListener('dragover', (e) => { e.preventDefault(); zoneEl.classList.add('is-drag'); });
    zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('is-drag'));
    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      zoneEl.classList.remove('is-drag');
      adicionar(e.dataTransfer.files);
    });
  });

  /* ── Rascunho (localStorage) ──────────────────── */
  function salvarRascunho() {
    const dados = { _step: atual, _checks: {} };
    $$('input[name], textarea[name]').forEach((el) => {
      if (el.type === 'checkbox') {
        if (el.checked) (dados._checks[el.name] = dados._checks[el.name] || []).push(el.value);
      } else {
        dados[el.name] = el.value;
      }
    });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(dados)); } catch (e) { /* cheio ou bloqueado */ }
  }
  function restaurarRascunho() {
    let dados;
    try { dados = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return; }
    if (!dados) return;
    $$('input[name], textarea[name]').forEach((el) => {
      if (el.type === 'checkbox') {
        const lista = dados._checks && dados._checks[el.name];
        el.checked = !!(lista && lista.includes(el.value));
        if (el.checked && el.dataset.toggle) {
          const alvo = document.getElementById(el.dataset.toggle);
          if (alvo) alvo.classList.add('is-open');
        }
      } else if (typeof dados[el.name] === 'string') {
        el.value = dados[el.name];
      }
    });
  }
  let draftTimer;
  document.addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(salvarRascunho, 400);
  });
  document.addEventListener('change', salvarRascunho);
  restaurarRascunho();

  /* ── Envio ────────────────────────────────────── */
  function coletar() {
    const dados = {};
    $$('input[name], textarea[name]').forEach((el) => {
      if (el.type === 'checkbox') return;
      const v = el.value.trim();
      dados[el.name] = v || null;
    });
    // grupos de checkbox viram arrays — só os que existem nesta página
    const grupos = new Set($$('input[type="checkbox"][name]').map((el) => el.name));
    grupos.forEach((nome) => {
      dados[nome] = $$('input[name="' + nome + '"]:checked').map((el) => el.value);
    });
    return dados;
  }

  async function uploadArquivo(zona, file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = FORM.prefix + zona + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const res = await fetch(cfg.url + '/storage/v1/object/' + (cfg.briefingBucket || 'briefing-arquivos') + '/' + path, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: file
    });
    if (!res.ok) throw new Error('Falha ao enviar "' + file.name + '" (HTTP ' + res.status + ')');
    return path;
  }

  async function enviar() {
    // revalida tudo; se algo faltou, volta para a etapa com problema
    for (let i = 1; i <= TOTAL; i++) {
      if (!validarEtapa(i)) {
        irPara(i, i > atual ? 1 : -1);
        errBox.textContent = 'Faltam campos obrigatórios na etapa ' + pad(i) + ' — ' + steps[i - 1].dataset.nome + '.';
        errBox.hidden = false;
        return;
      }
    }
    if (!cfg.url || !cfg.anonKey) {
      errBox.textContent = 'Configuração do Supabase ausente.';
      errBox.hidden = false;
      return;
    }

    enviado = true;
    btnAvancar.disabled = true;
    btnVoltar.disabled = true;
    errBox.hidden = true;

    try {
      // 1. Upload dos arquivos (caminhos privados no bucket)
      const totalArq = Object.values(files).reduce((s, a) => s + a.length, 0);
      let feitos = 0;
      const arquivos = {};
      for (const zona of Object.keys(files)) {
        if (!files[zona].length) continue;
        arquivos[zona] = [];
        for (const file of files[zona]) {
          btnAvancar.textContent = 'Enviando arquivos (' + (++feitos) + '/' + totalArq + ')…';
          arquivos[zona].push(await uploadArquivo(zona, file));
        }
      }

      // 2. Inserir o briefing
      btnAvancar.textContent = 'Registrando briefing…';
      const payload = coletar();
      payload.arquivos = arquivos;
      const res = await fetch(cfg.url + '/rest/v1/' + FORM.table, {
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
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'HTTP ' + res.status);
      }

      // 3. Sucesso
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      $('#bf-steps').hidden = true;
      $('#bf-progress').style.visibility = 'hidden';
      $('.bf-counter').hidden = true;
      intro.style.display = 'none';
      $('#bf-nav').hidden = true;
      const sucesso = $('#bf-success');
      sucesso.hidden = false;
      window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      setTimeout(() => { if (window.scrollY > 80) window.scrollTo(0, 0); }, 1200);
      if (GS) GS.from(sucesso, { autoAlpha: 0, y: 24, duration: 0.8, ease: 'power3.out' });
    } catch (err) {
      console.error('Erro ao enviar briefing:', err);
      enviado = false;
      btnAvancar.disabled = false;
      btnVoltar.disabled = atual === 1;
      btnAvancar.innerHTML = 'Enviar briefing &check;';
      errBox.textContent = 'Não conseguimos enviar agora: ' + err.message + ' — suas respostas continuam salvas aqui.';
      errBox.hidden = false;
    }
  }

  /* ── Magnético + entrada ──────────────────────── */
  if (GS && FINE) {
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        GS.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.14, y: (e.clientY - r.top - r.height / 2) * 0.14, duration: 0.4, ease: 'power3.out' });
      });
      el.addEventListener('pointerleave', () => GS.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,0.5)' }));
    });
  }
  if (GS) {
    GS.from(['.bf-intro', '.bf-progress', '.bf-counter', '.bstep.is-active .bstep-head', '.bstep.is-active .bfields > *'], {
      autoAlpha: 0, y: 22, duration: 0.8, ease: 'power3.out', stagger: 0.06, delay: 0.15,
      onComplete: function () { GS.set(this.targets(), { clearProps: 'all' }); }
    });
  }

  atualizarUI();
})();
