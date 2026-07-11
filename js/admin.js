/* ════════════════════════════════════════════════════════════
   MINDLE — Painel de leads
   Login por magic link (Supabase Auth) + gestão de leads
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const cfg = window.MINDLE_SUPABASE;
  const $ = (s) => document.querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

  const bootMsg = $('#boot-msg');
  const viewLogin = $('#view-login');
  const viewApp = $('#view-app');
  const appMsg = $('#app-msg');
  const btnSair = $('#btn-sair');

  if (!cfg || typeof supabase === 'undefined') {
    bootMsg.textContent = 'Configuração do Supabase ausente.';
    return;
  }
  const sb = supabase.createClient(cfg.url, cfg.anonKey);

  let leads = [];
  const filtro = { caminho: 'todos', status: 'todos', q: '' };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtData = (iso) => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  /* SLA: promessa pública de resposta em 1 dia útil */
  function slaEstourado(criadoEm) {
    const limite = new Date(new Date(criadoEm).getTime() + 24 * 3600 * 1000);
    const dia = limite.getDay();
    if (dia === 6) limite.setTime(limite.getTime() + 48 * 3600 * 1000);      // cai no sábado → segunda
    else if (dia === 0) limite.setTime(limite.getTime() + 24 * 3600 * 1000); // cai no domingo → segunda
    return Date.now() > limite.getTime();
  }

  const SITUACOES = {
    A: 'Tem presença, não representa',
    B: 'Começando do zero',
    C: 'Pesquisando, sem urgência'
  };
  const INVESTIMENTOS = {
    sim: 'Sim',
    breve: 'Ainda não, pretende em breve',
    entender: 'Precisa entender melhor'
  };
  const STATUS = ['novo', 'contatado', 'agendado', 'fechado', 'descartado'];

  /* ── Estado de tela ───────────────────────────── */
  function ajustarSticky() {
    const hdr = document.querySelector('.admin-header');
    const side = document.querySelector('.admin-side');
    if (!hdr) return;
    document.documentElement.style.setProperty('--admin-hdr-h', hdr.offsetHeight + 'px');
    // Menu lateral (desktop) não ocupa altura acima do conteúdo → 0.
    // No mobile ele vira barra horizontal no topo → usa a altura dela.
    const horizontal = window.matchMedia('(max-width: 820px)').matches;
    const tabsH = (horizontal && side) ? side.offsetHeight : 0;
    document.documentElement.style.setProperty('--admin-tabs-h', tabsH + 'px');
  }
  window.addEventListener('resize', ajustarSticky);

  function mostrar(tela) {
    bootMsg.hidden = true;
    viewLogin.hidden = tela !== 'login';
    viewApp.hidden = tela !== 'app';
    btnSair.hidden = tela !== 'app';
    requestAnimationFrame(ajustarSticky);
  }

  /* ── Login ────────────────────────────────────── */
  const formLogin = $('#form-login');
  const loginMsg = $('#login-msg');
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const senha = $('#login-senha').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !senha) {
      loginMsg.textContent = 'Preencha e-mail válido e senha.';
      loginMsg.classList.add('is-error');
      loginMsg.hidden = false;
      return;
    }
    const btn = $('#btn-login');
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) {
      loginMsg.classList.add('is-error');
      loginMsg.textContent = /invalid/i.test(error.message)
        ? 'E-mail ou senha incorretos.'
        : 'Não foi possível entrar: ' + error.message;
      loginMsg.hidden = false;
    } else {
      loginMsg.hidden = true; // SIGNED_IN dispara o carregamento
    }
  });

  btnSair.addEventListener('click', async () => {
    await sb.auth.signOut();
    location.reload();
  });

  /* ── Carga e render ───────────────────────────── */
  async function carregar() {
    // confirma que o e-mail logado é admin (RLS devolve a própria linha ou nada)
    const { data: adm, error: admErr } = await sb.from('admins').select('email').limit(1);
    if (admErr || !adm || !adm.length) {
      mostrar('login');
      loginMsg.textContent = 'Este e-mail não tem acesso ao painel. Fale com quem administra o projeto.';
      loginMsg.classList.add('is-error');
      loginMsg.hidden = false;
      await sb.auth.signOut();
      return;
    }
    const { data, error } = await sb.from(cfg.table || 'leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      mostrar('app');
      appMsg.textContent = 'Erro ao carregar leads: ' + error.message;
      appMsg.classList.add('is-error');
      appMsg.hidden = false;
      return;
    }
    leads = data || [];
    mostrar('app');
    appMsg.hidden = true;
    render();
    carregarBriefings();
    carregarBrandings();
    carregarClientes();
    carregarPropostas();
    carregarAutomacoes();
    carregarCadastro();
    dgPopularLeads();
  }

  function filtrados() {
    const q = filtro.q.toLowerCase();
    return leads.filter((l) =>
      (filtro.caminho === 'todos' || l.caminho === filtro.caminho) &&
      (filtro.status === 'todos' || l.status === filtro.status) &&
      (!q || [l.nome, l.email, l.profissao, l.servico, l.notas]
        .some((v) => v && v.toLowerCase().includes(q)))
    );
  }

  function render() {
    $('#stat-total').textContent = leads.length;
    $('#stat-a').textContent = leads.filter((l) => l.caminho === 'A').length;
    $('#stat-b').textContent = leads.filter((l) => l.caminho === 'B').length;
    $('#stat-novos').textContent = leads.filter((l) => l.status === 'novo').length;
    const atrasados = leads.filter((l) => l.status === 'novo' && slaEstourado(l.created_at)).length;
    $('#stat-novos').classList.toggle('is-alerta', atrasados > 0);
    $('#stat-novos').title = atrasados > 0 ? atrasados + ' fora do prazo de 1 dia útil' : '';

    const lista = filtrados();
    const wrap = $('#leads-list');
    $('#empty').hidden = lista.length > 0;
    wrap.innerHTML = lista.map((l) => {
      const atrasado = l.status === 'novo' && slaEstourado(l.created_at);
      const origem = [l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(' · ');
      return `
      <article class="lead-card${atrasado ? ' is-atrasado' : ''}" data-id="${esc(l.id)}">
        <div class="lead-top">
          <span class="badge ${l.caminho === 'A' ? 'badge-a' : 'badge-b'}">Caminho ${esc(l.caminho)}</span>
          <span class="badge badge-status">${esc(l.status || 'novo')}</span>
          ${atrasado ? '<span class="badge badge-sla">Responder hoje</span>' : ''}
          <span class="lead-nome">${esc(l.nome)}</span>
          <span class="lead-data">${esc(fmtData(l.created_at))}</span>
        </div>
        <dl class="lead-grid">
          <div class="lead-field"><dt>E-mail</dt><dd><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></dd></div>
          <div class="lead-field"><dt>Profissão</dt><dd>${esc(l.profissao)}</dd></div>
          <div class="lead-field"><dt>Link</dt><dd>${l.link && /^https?:\/\//i.test(l.link)
            ? `<a href="${esc(l.link)}" target="_blank" rel="noopener noreferrer">${esc(l.link)}</a>`
            : esc(l.link || '—')}</dd></div>
          <div class="lead-field"><dt>Serviço</dt><dd>${esc(l.servico)}</dd></div>
          <div class="lead-field"><dt>Situação</dt><dd>${esc(l.situacao)} — ${esc(SITUACOES[l.situacao] || '')}</dd></div>
          <div class="lead-field"><dt>Investimento</dt><dd>${esc(INVESTIMENTOS[l.investimento] || l.investimento)}</dd></div>
          ${(origem || l.referrer) ? `<div class="lead-field"><dt>Origem</dt><dd>${esc(origem || 'direto')}${l.referrer ? `<span class="lead-ref">${esc(l.referrer)}</span>` : ''}</dd></div>` : ''}
        </dl>
        ${(l.email_rascunho || l.proposta_prompt) ? `<div class="lead-views">
          ${l.email_rascunho ? '<button type="button" class="lead-view" data-view="email">✉ Ver e-mail</button>' : ''}
          ${l.proposta_prompt ? '<button type="button" class="lead-view" data-view="proposta">◳ Ver proposta</button>' : ''}
        </div>` : ''}
        <div class="lead-foot">
          <select class="lead-status" aria-label="Status do lead">
            ${STATUS.map((s) => `<option value="${s}" ${s === (l.status || 'novo') ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
          <textarea class="lead-notas" placeholder="Notas de follow-up…" aria-label="Notas">${esc(l.notas || '')}</textarea>
          <button type="button" class="ta-expand" aria-label="Expandir notas">expandir</button>
          <span class="lead-salvo" aria-hidden="true">salvo ✓</span>
        </div>
      </article>`;
    }).join('');
  }

  /* ── Atualizações (status / notas) ────────────── */
  async function salvar(id, patch, card) {
    const { error } = await sb.from(cfg.table || 'leads').update(patch).eq('id', id);
    const flag = card.querySelector('.lead-salvo');
    if (error) {
      flag.textContent = 'erro ao salvar';
      flag.style.color = 'var(--color-error)';
    } else {
      flag.textContent = 'salvo ✓';
      flag.style.color = '';
      const lead = leads.find((l) => l.id === id);
      if (lead) Object.assign(lead, patch);
      if ('status' in patch) {
        card.querySelector('.badge-status').textContent = patch.status;
        $('#stat-novos').textContent = leads.filter((l) => l.status === 'novo').length;
      }
    }
    flag.classList.add('is-on');
    setTimeout(() => flag.classList.remove('is-on'), 1800);
  }

  $('#leads-list').addEventListener('change', (e) => {
    if (!e.target.classList.contains('lead-status')) return;
    const card = e.target.closest('.lead-card');
    salvar(card.dataset.id, { status: e.target.value }, card);
  });
  $('#leads-list').addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('lead-notas')) return;
    const card = e.target.closest('.lead-card');
    const lead = leads.find((l) => l.id === card.dataset.id);
    const valor = e.target.value.trim() || null;
    if (lead && (lead.notas || null) !== valor) salvar(card.dataset.id, { notas: valor }, card);
  });

  /* ── Filtros ──────────────────────────────────── */
  $('#chips-caminho').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filtro.caminho = chip.dataset.caminho;
    document.querySelectorAll('#chips-caminho .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
    render();
  });
  $('#filtro-status').addEventListener('change', (e) => { filtro.status = e.target.value; render(); });
  $('#busca').addEventListener('input', (e) => { filtro.q = e.target.value.trim(); render(); });

  /* ── Abas ─────────────────────────────────────── */
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        const on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on);
      });
      $('#tab-leads').hidden = tab.dataset.tab !== 'leads';
      $('#tab-briefings').hidden = tab.dataset.tab !== 'briefings';
      $('#tab-brandings').hidden = tab.dataset.tab !== 'brandings';
      $('#tab-diagnostico').hidden = tab.dataset.tab !== 'diagnostico';
      $('#tab-clientes').hidden = tab.dataset.tab !== 'clientes';
      $('#tab-propostas').hidden = tab.dataset.tab !== 'propostas';
      $('#tab-faturamento').hidden = tab.dataset.tab !== 'faturamento';
      $('#tab-automacoes').hidden = tab.dataset.tab !== 'automacoes';
      $('#tab-cadastro').hidden = tab.dataset.tab !== 'cadastro';
      $('#tab-links').hidden = tab.dataset.tab !== 'links';
    });
  });

  /* ── Briefings ────────────────────────────────── */
  let briefings = [];
  const bfFiltro = { status: 'todos', q: '' };
  const BF_STATUS = { novo: 'Novo', em_analise: 'Em análise', em_producao: 'Em produção', concluido: 'Concluído' };
  const BF_ZONAS = { prova: 'Provas sociais', logo: 'Logo', fotos: 'Fotos', depo: 'Depoimentos', videos: 'Vídeos', paleta: 'Paleta / Identidade' };
  const BF_SECOES = [
    ['01 · Sobre o negócio', [['empresa_nome', 'Empresa'], ['segmento', 'Segmento'], ['cidade', 'Cidade / Região'], ['email', 'E-mail'], ['whatsapp', 'WhatsApp'], ['site', 'Site'], ['instagram', 'Instagram']]],
    ['02 · Oferta principal', [['servico', 'Serviço'], ['valor', 'Valor médio'], ['resultado', 'Resultado'], ['diferencial_oferta', 'Diferencial'], ['para_quem', 'Para quem é']]],
    ['03 · Público-alvo', [['cliente_ideal', 'Cliente ideal'], ['idade', 'Idade média'], ['genero', 'Gênero'], ['problema_pub', 'Problema principal'], ['medo', 'Maior medo'], ['valores', 'O que valoriza']]],
    ['04 · Problema e desejo', [['dor', 'Dor principal'], ['evitar', 'Quer evitar'], ['desejo', 'Deseja alcançar'], ['gatilho', 'O que faz procurar']]],
    ['05 · Diferenciais', [['por_que', 'Por que escolher'], ['vs_concorrencia', 'Vs. concorrência'], ['metodo', 'Método próprio'], ['elogios', 'O que elogiam']]],
    ['06 · Processo', [['como_funciona', 'Como funciona'], ['etapas', 'Etapas'], ['tempo', 'Tempo de atendimento'], ['avaliacao', 'Avaliação inicial']]],
    ['07 · Autoridade', [['experiencia', 'Experiência'], ['clientes_num', 'Clientes atendidos'], ['formacao', 'Formação'], ['certificacoes', 'Certificações'], ['especializacoes', 'Especializações']]],
    ['08 · Prova social', [['depoimentos', 'Depoimentos'], ['avaliacoes', 'Avaliações'], ['resultados_sociais', 'Resultados']]],
    ['09 · FAQ e objeções', [['duvidas', 'Dúvidas comuns'], ['objecoes', 'Objeções'], ['faq', 'Perguntas frequentes']]],
    ['10 · Objetivo da página', [['objetivo', 'Objetivo'], ['objetivo_outro', 'Outro objetivo']]],
    ['11 · Branding e referências', [['branding', 'Personalidade'], ['marcas_referencia', 'Marcas que admira'], ['concorrentes', 'Concorrentes']]],
    ['13 · Informações extras', [['promocao', 'Promoção'], ['urgencia', 'Urgência / prazo'], ['observacoes', 'Observações']]]
  ];

  async function carregarBriefings() {
    const { data, error } = await sb.from(cfg.briefingTable || 'briefings')
      .select('*')
      .order('created_at', { ascending: false });
    const msg = $('#bf-msg');
    if (error) {
      msg.textContent = 'Erro ao carregar briefings: ' + error.message +
        (/does not exist|schema cache/i.test(error.message) ? ' — rode o briefings.sql no SQL Editor.' : '');
      msg.classList.add('is-error');
      msg.hidden = false;
      return;
    }
    briefings = data || [];
    msg.hidden = true;
    const count = $('#tab-count-briefings');
    count.textContent = briefings.length;
    count.hidden = briefings.length === 0;
    renderBriefings();
  }

  function valorCampo(v) {
    if (v == null || v === '') return null;
    if (Array.isArray(v)) return v.length ? v.join(', ') : null;
    return String(v);
  }

  /* Monta um TXT formatado das respostas de um briefing (pra copiar/colar) */
  function briefingTexto(rec, secoes, titulo) {
    const L = [];
    L.push((titulo || 'Briefing').toUpperCase() + ' — ' + (rec.empresa_nome || '—'));
    L.push('Recebido em ' + fmtData(rec.created_at) + '  ·  Status: ' + (BF_STATUS[rec.status] || rec.status || '—'));
    L.push('');
    secoes.forEach(([sTit, campos]) => {
      const ls = campos
        .map(([k, label]) => { const v = valorCampo(rec[k]); return v ? label + ': ' + v : null; })
        .filter(Boolean);
      if (ls.length) { L.push('── ' + sTit + ' ──'); L.push(...ls); L.push(''); }
    });
    if (rec.notas) { L.push('── Notas internas ──'); L.push(rec.notas); L.push(''); }
    return L.join('\n').trim();
  }

  /* Seção "Materiais e arquivos" de um card (briefing ou branding) */
  function montarSecaoArquivos(arquivos) {
    const arq = arquivos || {};
    const zonas = Object.keys(BF_ZONAS).filter((z) => Array.isArray(arq[z]) && arq[z].length);
    if (!zonas.length) return '';
    const renderAnexo = (p) => {
      const nome = p.split('/').pop();
      if (/\.(jpe?g|png|webp|gif|avif)$/i.test(p)) {
        return `<figure class="fprev">
          <button type="button" class="fprev-btn" data-path="${esc(p)}" aria-label="Abrir ${esc(nome)}">
            <img class="fprev-img" data-path="${esc(p)}" alt="" loading="lazy">
          </button>
          <figcaption class="fprev-cap">${esc(nome)}</figcaption>
        </figure>`;
      }
      return `<button type="button" class="fchip" data-path="${esc(p)}">${esc(nome)} &nearr;</button>`;
    };
    return `<section class="bsec"><h4 class="bsec-t">12 · Materiais e arquivos</h4>${zonas.map((z) => `
      <div class="bzona"><span class="bzona-t">${esc(BF_ZONAS[z])}</span><div class="fchips">
        ${arq[z].map(renderAnexo).join('')}
      </div></div>`).join('')}</section>`;
  }

  function renderBriefings() {
    const q = bfFiltro.q.toLowerCase();
    const lista = briefings.filter((b) =>
      (bfFiltro.status === 'todos' || b.status === bfFiltro.status) &&
      (!q || [b.empresa_nome, b.segmento, b.cidade, b.servico, b.notas]
        .some((v) => v && v.toLowerCase().includes(q)))
    );
    $('#bf-empty').hidden = lista.length > 0;
    $('#briefings-list').innerHTML = lista.map((b) => {
      const secoes = BF_SECOES.map(([titulo, campos]) => {
        const linhas = campos
          .map(([k, label]) => {
            const v = valorCampo(b[k]);
            return v ? `<div class="lead-field"><dt>${esc(label)}</dt><dd>${esc(v)}</dd></div>` : '';
          })
          .join('');
        return linhas ? `<section class="bsec"><h4 class="bsec-t">${esc(titulo)}</h4><dl class="lead-grid">${linhas}</dl></section>` : '';
      }).join('');

      const arquivosHtml = montarSecaoArquivos(b.arquivos);

      return `
      <article class="lead-card bcard" data-id="${esc(b.id)}">
        <div class="lead-top">
          <span class="badge badge-status">${esc(BF_STATUS[b.status] || b.status)}</span>
          <span class="lead-nome">${esc(b.empresa_nome)}</span>
          <span class="bcard-meta">${esc(b.segmento)} · ${esc(b.cidade)}</span>
          <span class="lead-data">${esc(fmtData(b.created_at))}</span>
        </div>
        <div class="bcard-body" hidden>${secoes}${arquivosHtml}</div>
        <div class="lead-foot">
          <button type="button" class="bcard-toggle">Ver respostas</button>
          <button type="button" class="bcard-copiar">Copiar respostas</button>
          <select class="lead-status bf-status" aria-label="Status do briefing">
            ${Object.entries(BF_STATUS).map(([v, l]) => `<option value="${v}" ${v === b.status ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <textarea class="lead-notas bf-notas" placeholder="Notas do projeto…" aria-label="Notas">${esc(b.notas || '')}</textarea>
          <button type="button" class="ta-expand" aria-label="Expandir notas">expandir</button>
          <span class="lead-salvo" aria-hidden="true">salvo ✓</span>
        </div>
      </article>`;
    }).join('');
  }

  async function salvarProjeto(tabela, dados, id, patch, card) {
    const { error } = await sb.from(tabela).update(patch).eq('id', id);
    const flag = card.querySelector('.lead-salvo');
    if (error) {
      flag.textContent = 'erro ao salvar';
      flag.style.color = 'var(--color-error)';
    } else {
      flag.textContent = 'salvo ✓';
      flag.style.color = '';
      const b = dados.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
      if ('status' in patch) card.querySelector('.badge-status').textContent = BF_STATUS[patch.status] || patch.status;
    }
    flag.classList.add('is-on');
    setTimeout(() => flag.classList.remove('is-on'), 1800);
  }

  /* Miniaturas: assina as URLs das imagens quando o card expande */
  async function carregarMiniaturas(card) {
    const imgs = Array.from(card.querySelectorAll('.fprev-img:not([data-ok])'));
    if (!imgs.length) return;
    const { data, error } = await sb.storage
      .from(cfg.briefingBucket || 'briefing-arquivos')
      .createSignedUrls(imgs.map((i) => i.dataset.path), 3600);
    if (error || !data) return;
    data.forEach((d, i) => {
      if (d.signedUrl) {
        imgs[i].src = d.signedUrl;
        imgs[i].dataset.url = d.signedUrl;
        imgs[i].dataset.ok = '1';
      }
    });
  }

  /* Eventos compartilhados pelas listas de briefings e brandings */
  function ligarLista(listEl, ctx) {
    listEl.addEventListener('click', async (e) => {
      const toggle = e.target.closest('.bcard-toggle');
      if (toggle) {
        const card = toggle.closest('.bcard');
        const body = card.querySelector('.bcard-body');
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? 'Ver respostas' : 'Ocultar respostas';
        if (!body.hidden) carregarMiniaturas(card);
        return;
      }
      const copiar = e.target.closest('.bcard-copiar');
      if (copiar && ctx.secoes) {
        const card = copiar.closest('.bcard');
        const item = ctx.dados().find((x) => x.id === card.dataset.id);
        if (item) abrirModal((ctx.titulo || 'Briefing') + ' — ' + (item.empresa_nome || ''), briefingTexto(item, ctx.secoes, ctx.titulo));
        return;
      }
      const prev = e.target.closest('.fprev-btn');
      if (prev) {
        const img = prev.querySelector('.fprev-img');
        if (img.dataset.url) window.open(img.dataset.url, '_blank', 'noopener');
        return;
      }
      const chip = e.target.closest('.fchip');
      if (chip) {
        // abre a janela DURANTE o gesto do usuário; o await vem depois
        // (window.open após await é bloqueado como pop-up)
        const win = window.open('', '_blank');
        const original = chip.textContent;
        chip.textContent = 'abrindo…';
        chip.disabled = true;
        const { data, error } = await sb.storage
          .from(cfg.briefingBucket || 'briefing-arquivos')
          .createSignedUrl(chip.dataset.path, 3600);
        chip.textContent = original;
        chip.disabled = false;
        if (error || !data) {
          if (win) win.close();
          chip.textContent = 'erro — tente de novo';
          return;
        }
        if (win) win.location.href = data.signedUrl;
        else window.open(data.signedUrl, '_blank', 'noopener');
      }
    });
    listEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('lead-status')) return;
      const card = e.target.closest('.bcard');
      salvarProjeto(ctx.tabela(), ctx.dados(), card.dataset.id, { status: e.target.value }, card);
    });
    listEl.addEventListener('focusout', (e) => {
      if (!e.target.classList.contains('lead-notas')) return;
      const card = e.target.closest('.bcard');
      const item = ctx.dados().find((x) => x.id === card.dataset.id);
      const valor = e.target.value.trim() || null;
      if (item && (item.notas || null) !== valor) {
        salvarProjeto(ctx.tabela(), ctx.dados(), card.dataset.id, { notas: valor }, card);
      }
    });
  }

  ligarLista($('#briefings-list'), {
    tabela: () => cfg.briefingTable || 'briefings',
    dados: () => briefings,
    secoes: BF_SECOES,
    titulo: 'Briefing de LP'
  });
  $('#bf-filtro-status').addEventListener('change', (e) => { bfFiltro.status = e.target.value; renderBriefings(); });
  $('#bf-busca').addEventListener('input', (e) => { bfFiltro.q = e.target.value.trim(); renderBriefings(); });

  /* ── Brandings (briefing de marca) ────────────── */
  let brandings = [];
  const bdFiltro = { status: 'todos', q: '' };
  const BD_SECOES = [
    ['01 · Sobre a empresa', [['empresa_nome', 'Empresa'], ['segmento', 'Segmento'], ['cidade', 'Cidade / Região'], ['email', 'E-mail'], ['whatsapp', 'WhatsApp'], ['site', 'Site'], ['instagram', 'Instagram']]],
    ['02 · Negócio e serviço', [['o_que_faz', 'O que faz na prática'], ['como_funciona', 'Como funciona'], ['acompanhamento', 'Acompanhamento'], ['tempo_volume_motivo', 'Tempo, volume e motivação'], ['quem_por_tras', 'Quem está por trás'], ['valor', 'Valor médio']]],
    ['03 · Mercado e concorrência', [['perfis_concorrentes', 'Perfis de concorrentes'], ['incomoda_mercado', 'O que incomoda no mercado'], ['concorrentes', 'Concorrentes principais']]],
    ['04 · Público', [['cliente_ideal', 'Cliente ideal'], ['idade', 'Idade média'], ['genero', 'Gênero'], ['valores', 'O que valoriza']]],
    ['05 · Dores e desejos', [['problema_nomeado', 'Problema nomeado'], ['quer_conquistar', 'Quer sentir/conquistar'], ['frases_clientes', 'Frases de clientes'], ['medo', 'Maior medo'], ['evitar', 'Quer evitar'], ['gatilho', 'Gatilho']]],
    ['06 · Diferenciação e método', [['diferente_pratica', 'Diferente na prática'], ['recusas', 'Trabalhos que recusa'], ['unicos', 'Únicos que…']]],
    ['07 · Personalidade e voz', [['voz_marca', 'Voz da marca'], ['palavras_evitar', 'Palavras a evitar'], ['diria_jamais', 'Diria / jamais diria']]],
    ['08 · Identidade visual', [['sensacoes_visuais', 'Sensações e atmosferas'], ['marcas_referencia', 'Marcas que admira']]],
    ['09 · Objetivo', [['objetivo_projeto', 'Objetivo do projeto'], ['objetivo', 'Ação da página'], ['objetivo_outro', 'Outra ação']]],
    ['10 · Autoridade e prova', [['formacao', 'Formação'], ['certificacoes', 'Certificações'], ['especializacoes', 'Especializações'], ['depoimentos', 'Depoimentos'], ['avaliacoes', 'Avaliações'], ['resultados_sociais', 'Resultados']]],
    ['11 · FAQ e objeções', [['duvidas', 'Dúvidas comuns'], ['objecoes', 'Objeções'], ['faq', 'Perguntas frequentes']]],
    ['13 · Informações extras', [['promocao', 'Promoção'], ['urgencia', 'Urgência / prazo'], ['observacoes', 'Observações']]]
  ];

  async function carregarBrandings() {
    const { data, error } = await sb.from('brandings')
      .select('*')
      .order('created_at', { ascending: false });
    const msg = $('#bd-msg');
    if (error) {
      msg.textContent = 'Erro ao carregar brandings: ' + error.message +
        (/does not exist|schema cache/i.test(error.message) ? ' — rode o brandings.sql no SQL Editor.' : '');
      msg.classList.add('is-error');
      msg.hidden = false;
      return;
    }
    brandings = data || [];
    msg.hidden = true;
    const count = $('#tab-count-brandings');
    count.textContent = brandings.length;
    count.hidden = brandings.length === 0;
    renderBrandings();
  }

  function renderBrandings() {
    const q = bdFiltro.q.toLowerCase();
    const lista = brandings.filter((b) =>
      (bdFiltro.status === 'todos' || b.status === bdFiltro.status) &&
      (!q || [b.empresa_nome, b.segmento, b.cidade, b.o_que_faz, b.notas]
        .some((v) => v && v.toLowerCase().includes(q)))
    );
    $('#bd-empty').hidden = lista.length > 0;
    $('#brandings-list').innerHTML = lista.map((b) => {
      const secoes = BD_SECOES.map(([titulo, campos]) => {
        const linhas = campos
          .map(([k, label]) => {
            const v = valorCampo(b[k]);
            return v ? `<div class="lead-field"><dt>${esc(label)}</dt><dd>${esc(v)}</dd></div>` : '';
          })
          .join('');
        return linhas ? `<section class="bsec"><h4 class="bsec-t">${esc(titulo)}</h4><dl class="lead-grid">${linhas}</dl></section>` : '';
      }).join('');

      return `
      <article class="lead-card bcard" data-id="${esc(b.id)}">
        <div class="lead-top">
          <span class="badge badge-status">${esc(BF_STATUS[b.status] || b.status)}</span>
          <span class="lead-nome">${esc(b.empresa_nome)}</span>
          <span class="bcard-meta">${esc(b.segmento)} · ${esc(b.cidade)}</span>
          <span class="lead-data">${esc(fmtData(b.created_at))}</span>
        </div>
        <div class="bcard-body" hidden>${secoes}${montarSecaoArquivos(b.arquivos)}</div>
        <div class="lead-foot">
          <button type="button" class="bcard-toggle">Ver respostas</button>
          <button type="button" class="bcard-copiar">Copiar respostas</button>
          <select class="lead-status" aria-label="Status do branding">
            ${Object.entries(BF_STATUS).map(([v, l]) => `<option value="${v}" ${v === b.status ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <textarea class="lead-notas" placeholder="Notas do projeto…" aria-label="Notas">${esc(b.notas || '')}</textarea>
          <button type="button" class="ta-expand" aria-label="Expandir notas">expandir</button>
          <span class="lead-salvo" aria-hidden="true">salvo ✓</span>
        </div>
      </article>`;
    }).join('');
  }

  ligarLista($('#brandings-list'), {
    tabela: () => 'brandings',
    dados: () => brandings,
    secoes: BD_SECOES,
    titulo: 'Briefing de branding'
  });
  $('#bd-filtro-status').addEventListener('change', (e) => { bdFiltro.status = e.target.value; renderBrandings(); });
  $('#bd-busca').addEventListener('input', (e) => { bdFiltro.q = e.target.value.trim(); renderBrandings(); });

  /* ── Automações (briefings de automação) ── */
  let automacoes = [];
  const auFiltro = { status: 'todos', q: '' };
  const AU_SECOES = [
    ['01 · Contato e operação', [['whatsapp_agente', 'WhatsApp do agente'], ['whatsapp_humano', 'WhatsApp humano'], ['site', 'Site'], ['link_agendamento', 'Link de agendamento'], ['horarios', 'Horários']]],
    ['02 · Persona do agente', [['voz', 'Voz (1ª pessoa / assistente)'], ['resposta_robo', 'Resposta a "é um robô?"'], ['politica_preco', 'Política de preço'], ['estilo_proibido', 'Estilo proibido'], ['objetivo', 'Objetivo da conversa']]],
    ['03 · Objeções e fechamento', [['objecoes', 'Objeções e respostas'], ['observacoes', 'Observações']]]
  ];

  async function carregarAutomacoes() {
    const { data, error } = await sb.from('automacoes').select('*').order('created_at', { ascending: false });
    const msg = $('#au-msg');
    if (error) {
      msg.textContent = 'Erro ao carregar automações: ' + error.message +
        (/does not exist|schema cache/i.test(error.message) ? ' — rode o automacoes.sql no SQL Editor.' : '');
      msg.classList.add('is-error'); msg.hidden = false; return;
    }
    automacoes = data || [];
    msg.hidden = true;
    const count = $('#tab-count-automacoes');
    count.textContent = automacoes.length; count.hidden = automacoes.length === 0;
    renderAutomacoes();
  }

  function renderAutomacoes() {
    const q = auFiltro.q.toLowerCase();
    const lista = automacoes.filter((a) =>
      (auFiltro.status === 'todos' || a.status === auFiltro.status) &&
      (!q || [a.empresa_nome, a.objetivo, a.notas].some((v) => v && v.toLowerCase().includes(q)))
    );
    $('#au-empty').hidden = lista.length > 0;
    $('#automacoes-list').innerHTML = lista.map((a) => {
      const secoes = AU_SECOES.map(([titulo, campos]) => {
        const linhas = campos.map(([k, label]) => {
          const v = valorCampo(a[k]);
          return v ? `<div class="lead-field"><dt>${esc(label)}</dt><dd>${esc(v)}</dd></div>` : '';
        }).join('');
        return linhas ? `<section class="bsec"><h4 class="bsec-t">${esc(titulo)}</h4><dl class="lead-grid">${linhas}</dl></section>` : '';
      }).join('');
      return `
      <article class="lead-card bcard" data-id="${esc(a.id)}">
        <div class="lead-top">
          <span class="badge badge-status">${esc(BF_STATUS[a.status] || a.status)}</span>
          <span class="lead-nome">${esc(a.empresa_nome || '—')}</span>
          <span class="bcard-meta">${esc(a.objetivo || '')}</span>
          <span class="lead-data">${esc(fmtData(a.created_at))}</span>
        </div>
        <div class="bcard-body" hidden>${secoes}</div>
        <div class="lead-foot">
          <button type="button" class="bcard-toggle">Ver respostas</button>
          <button type="button" class="bcard-copiar">Copiar respostas</button>
          <a class="lead-view bcard-treino" href="treino.html?a=${esc(a.id)}" target="_blank" rel="noopener">FAQ / Correções &nearr;</a>
          <select class="lead-status" aria-label="Status da automação">
            ${Object.entries(BF_STATUS).map(([v, l]) => `<option value="${v}" ${v === a.status ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <textarea class="lead-notas" placeholder="Notas do projeto…" aria-label="Notas">${esc(a.notas || '')}</textarea>
          <button type="button" class="ta-expand" aria-label="Expandir notas">expandir</button>
          <span class="lead-salvo" aria-hidden="true">salvo ✓</span>
        </div>
      </article>`;
    }).join('');
  }

  ligarLista($('#automacoes-list'), { tabela: () => 'automacoes', dados: () => automacoes, secoes: AU_SECOES, titulo: 'Briefing de automação' });
  $('#au-filtro-status').addEventListener('change', (e) => { auFiltro.status = e.target.value; renderAutomacoes(); });
  $('#au-busca').addEventListener('input', (e) => { auFiltro.q = e.target.value.trim(); renderAutomacoes(); });

  /* ── Diagnóstico ao vivo — companheiro da call ── */
  const DG_KEY = 'mindle_diagnostico';

  function dgPopularLeads() {
    const sel = $('#dg-lead');
    const atual = sel.value;
    let salvo = '';
    try { salvo = (JSON.parse(localStorage.getItem(DG_KEY)) || {}).lead || ''; } catch (e) {}
    sel.innerHTML = '<option value="">— selecionar ou digitar abaixo —</option>' +
      leads.map((l) => `<option value="${esc(l.id)}">${esc(l.nome)} — ${esc(l.profissao)} (${esc(l.status)})</option>`).join('');
    sel.value = atual || salvo;
  }

  function dgEstado() {
    const o = { campos: {}, sinais: [], lead: $('#dg-lead').value };
    $$('#tab-diagnostico [data-dg]').forEach((el) => {
      if (el.type === 'checkbox') { if (el.checked) o.sinais.push(el.value); }
      else o.campos[el.id] = el.value;
    });
    return o;
  }
  function dgSalvarLocal() {
    try { localStorage.setItem(DG_KEY, JSON.stringify(dgEstado())); } catch (e) {}
  }
  function dgRestaurar() {
    let d;
    try { d = JSON.parse(localStorage.getItem(DG_KEY)); } catch (e) { return; }
    if (!d) return;
    Object.entries(d.campos || {}).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    });
    $$('#tab-diagnostico input[type="checkbox"][data-dg]').forEach((el) => {
      el.checked = (d.sinais || []).includes(el.value);
    });
  }

  function dgSinais() {
    const m = { lp: [], br: [], br1: [], rc: [], rc5: [] };
    $$('#tab-diagnostico input[data-sig]:checked').forEach((el) => m[el.dataset.sig].push(el.value));
    return m;
  }

  function dgVeredito() {
    const s = dgSinais();
    const brTotal = s.br1.length + s.br.length;

    if (s.rc.length) return { tipo: 'recusa', titulo: 'Recusar, com elegância',
      txt:
        '<strong>Por quê:</strong> apareceu desalinhamento com o que a Mindle faz bem ' +
        '(' + s.rc.join('; ') + '). Aceitar seria entregar abaixo do padrão e queimar o seu ' +
        'nome logo no primeiro case, quando ainda não há portfólio para absorver o tranco. ' +
        'Recusar aqui é o filtro de qualidade funcionando, não perda de venda.<br><br>' +
        '<strong>Para fechar:</strong> seja franco. "Pelo que você descreveu, o que você precisa ' +
        'é ___, e isso não é o que fazemos bem. Seria desonesto aceitar e te entregar morno. ' +
        'Quem resolve isso com qualidade é [tipo de profissional]." A recusa direta é a prova viva ' +
        'do "diagnóstico antes de prescrição", e costuma gerar mais confiança que um sim forçado, ' +
        'além de abrir porta para indicação futura.' };

    if (s.rc5.length) return { tipo: 'reagendar', titulo: 'Reagendar com o decisor',
      txt:
        '<strong>Por quê:</strong> quem decide de fato não está nesta conversa. Apresentar a ' +
        'proposta agora significa apresentá-la duas vezes, e a segunda, repassada de segunda mão, ' +
        'sempre perde força e detalhe. O diagnóstico vale mais dito direto a quem assina.<br><br>' +
        '<strong>Para fechar:</strong> "O que vamos definir aqui é importante demais para passar ' +
        'por intermediário. Faz mais sentido marcarmos 30 minutos com [quem decide] presente, para ' +
        'eu devolver a leitura direto a quem vai aprovar." Reagende ali mesmo, com data e hora.' };

    if (s.br1.length || brTotal >= 2) return { tipo: 'branding', titulo: 'Branding completo',
      txt:
        '<strong>Por quê:</strong> o fundamento não está de pé. ' +
        (s.br1.length ? 'O sinal decisivo apareceu: o cliente trava ao explicar o próprio diferencial, ' +
          'público ou oferta. ' : 'Os sinais se acumularam: ' + s.br.join('; ') + '. ') +
        'Quando a base é confusa ou cada ponto de contato comunica uma coisa, uma página seria ' +
        'construída sobre areia: ficaria bonita e continuaria não convertendo, porque o problema ' +
        'é anterior ao layout. Vender uma página aqui repetiria o erro das peças soltas que ele já comprou.<br><br>' +
        '<strong>Para fechar:</strong> ancore na frustração que ele te contou. "Uma página agora ' +
        'seria fachada sem fundação, e você já viveu isso: pagou por pedaços que não sustentaram nada. ' +
        'O caminho no seu caso é reconstruir a base, na ordem: diagnóstico e posicionamento, identidade ' +
        'verbal e visual, design system documentado e só então a página integrada. É mais investimento, ' +
        'mas é o único que você não vai precisar refazer depois." Nada avança sem aprovação por etapa, ' +
        'isso desarma o medo de gastar de novo.' };

    if (brTotal === 1 && s.lp.length >= 1) return { tipo: 'pagina-mais', titulo: 'Página agora, branding no horizonte',
      txt:
        '<strong>Por quê:</strong> a oferta está madura o bastante para uma página entregar resultado ' +
        'já, mas apareceu um sinal de que o problema é mais fundo (a marca ainda não é um sistema coeso). ' +
        'Forçar o branding agora seria empurrar; ignorar o sinal seria deixar dinheiro na mesa depois.<br><br>' +
        '<strong>Para fechar:</strong> "Começamos pela página, que resolve o que está te custando cliente ' +
        'agora. Mas vou ser honesto: o que vi sugere que, em algum momento, você vai precisar estruturar ' +
        'a marca inteira, e a página já vai ser construída de um jeito que conversa com esse próximo passo, ' +
        'sem retrabalho." Planta a semente do branding sem pressionar, e registra o sinal nas notas para o follow-up.' };

    if (s.lp.length >= 2) return { tipo: 'pagina', titulo: 'Página de vendas',
      txt:
        '<strong>Por quê:</strong> a oferta existe e está clara, você respondeu sem hesitar o que vende, ' +
        'para quem e por quanto. O que falha não é o negócio, é a vitrine: a presença atual não está à ' +
        'altura do que você entrega. Esse é exatamente o cenário da página de entrada, e tentar vender ' +
        'branding completo aqui seria empurrar escopo que o caso não pede.<br><br>' +
        '<strong>Para fechar:</strong> "O seu problema não é de estratégia, é de representação. Sua oferta ' +
        'já convence na conversa; ela só não está convencendo quem pesquisa seu nome antes de te procurar. ' +
        'A página resolve isso em 7 dias, construída a partir do fundamento da sua oferta, não um template ' +
        'com o nome trocado, e com 30 dias de ajustes. Nada avança sem a sua aprovação a cada etapa." ' +
        'Feche pedindo a data de início ainda na call.' };

    return { tipo: 'incompleto', titulo: 'Diagnóstico em andamento',
      txt: 'Marque os sinais durante a conversa. O veredito e o argumento de fechamento aparecem aqui assim que houver leitura suficiente.' };
  }

  function dgAtualizar() {
    const ecos = ['dg-inc1', 'dg-inc2', 'dg-inc3', 'dg-inc4']
      .map((id) => document.getElementById(id).value.trim()).filter(Boolean);
    $('#dg-ecos').innerHTML = ecos.length
      ? ecos.map((t) => `<li>&ldquo;${esc(t)}&rdquo;</li>`).join('')
      : '<li class="dg-eco-vazio">As incoerências anotadas na preparação aparecem aqui.</li>';
    const v = dgVeredito();
    $('#dg-veredito').dataset.tipo = v.tipo;
    $('#dg-veredito-txt').innerHTML = `<strong>${esc(v.titulo)}</strong><br>${v.txt}`;
    $('#dg-salvar').disabled = !$('#dg-lead').value;
    dgSalvarLocal();
  }

  $('#tab-diagnostico').addEventListener('input', dgAtualizar);
  $('#tab-diagnostico').addEventListener('change', (e) => {
    if (e.target.id === 'dg-lead' && e.target.value) {
      const l = leads.find((x) => x.id === e.target.value);
      if (l) $('#dg-nome').value = l.nome;
    }
    dgAtualizar();
  });

  /* Timer com fases */
  let dgAcum = 0, dgInicio = null, dgTimer = null;
  function dgTick() {
    const seg = Math.floor((dgAcum + (dgInicio ? Date.now() - dgInicio : 0)) / 1000);
    $('#dg-clock').textContent =
      String(Math.floor(seg / 60)).padStart(2, '0') + ':' + String(seg % 60).padStart(2, '0');
    const min = seg / 60;
    $$('#dg-fases li').forEach((li) => {
      li.classList.toggle('is-on', min >= +li.dataset.de && min < +li.dataset.ate);
    });
  }
  $('#dg-play').addEventListener('click', () => {
    if (dgTimer) {
      dgAcum += Date.now() - dgInicio;
      dgInicio = null;
      clearInterval(dgTimer); dgTimer = null;
      $('#dg-play').textContent = 'Retomar';
    } else {
      dgInicio = Date.now();
      dgTimer = setInterval(dgTick, 1000);
      $('#dg-play').textContent = 'Pausar';
    }
  });

  /* Geração do resumo (CRM) e da proposta */
  function dgGerar() {
    const g = (id) => document.getElementById(id).value.trim();
    const s = dgSinais();
    const v = dgVeredito();
    const nome = g('dg-nome') || 'Lead';
    const data = new Date().toLocaleDateString('pt-BR');
    const incos = ['dg-inc1', 'dg-inc2', 'dg-inc3', 'dg-inc4'].map(g).filter(Boolean);

    $('#dg-resumo').value =
`[DIAGNÓSTICO ${data}] ${nome}
Incoerências devolvidas:
${incos.map((t, i) => (i + 1) + '. ' + t).join('\n') || '—'}
Oferta/negócio: ${g('dg-oferta') || '—'}
Dor/gatilho: ${g('dg-dor') || '—'}
Sinais página: ${s.lp.join('; ') || '—'}
Sinais branding: ${s.br1.concat(s.br).join('; ') || '—'}
Sinais recusa: ${s.rc.concat(s.rc5).join('; ') || '—'}
VEREDITO: ${v.titulo.toUpperCase()}
Próximo passo: proposta enviada em ___ (mesmo dia).`;

    let bloco;
    if (v.tipo === 'branding') {
      bloco = 'Pelo que vimos na conversa, uma página agora seria construir fachada sem fundação — você pagaria duas vezes. O caminho certo no seu caso é o processo completo de branding: diagnóstico e posicionamento, identidade verbal e visual, design system documentado e a página integrada no final. Nada avança sem a sua aprovação na etapa anterior.\n\nInvestimento: R$ _____ · Início: _____';
    } else if (v.tipo === 'recusa' || v.tipo === 'reagendar') {
      bloco = '(Caso de recusa ou reagendamento — adapte: "o que você precisa é ___, e não é o que fazemos; quem faz isso bem é ___." Indicar caminho é parte do diagnóstico.)';
    } else {
      bloco = 'O seu caso é o cenário exato da página de vendas: a oferta existe e está clara — o que falta é uma presença à altura dela. A página é construída a partir do fundamento da sua oferta, com identidade visual própria e copy estruturado. Entrega em 7 dias, com 30 dias de ajustes incluídos — e nada avança sem a sua aprovação na etapa anterior.\n\nInvestimento: R$ _____ · Início: _____'
        + (v.tipo === 'pagina-mais' ? '\n\n(Obs. interna — remover antes de enviar: sinal de branding registrado; upsell natural na entrega.)' : '');
    }

    $('#dg-proposta').value =
`Assunto: Diagnóstico Mindle — ${nome}

${nome.split(' ')[0]}, obrigado pela conversa de hoje.

A leitura do seu caso, em duas linhas:
${incos.slice(0, 2).map((t) => '— ' + t).join('\n') || '— (resuma aqui as incoerências devolvidas na call)'}

${bloco}

Qualquer dúvida, respondo por aqui — e travamos sua data de início.

Mindle — ponto · linha · sistema`;

    /* Escopo da proposta conforme o veredito */
    let escopo;
    if (v.tipo === 'branding') {
      escopo = 'BRANDING COMPLETO: diagnóstico e posicionamento; identidade verbal e visual; design system documentado; página integrada. Processo sequencial com aprovação a cada etapa. Caminho natural de quem percebe que o problema é mais fundo que uma página.';
    } else if (v.tipo === 'recusa' || v.tipo === 'reagendar') {
      escopo = '(Caso de recusa/reagendamento — normalmente não se gera proposta. Em vez disso, indique a direção certa para o cliente.)';
    } else {
      escopo = 'PÁGINA DE VENDAS COM IDENTIDADE PRÓPRIA: construída a partir do fundamento da oferta, com identidade visual própria e copy estruturado (não um template com o nome trocado). Entrega em 7 dias, com 30 dias de ajustes incluídos. Processo com aprovação a cada etapa.'
        + (v.tipo === 'pagina-mais' ? ' Sinalizar que o branding completo é o passo natural depois.' : '');
    }

    /* Prompt pronto p/ colar no Claude e gerar a proposta desenhada */
    $('#dg-prompt').value =
`Você é redator e designer de propostas comerciais da Mindle — estúdio de branding digital.
Gere uma PROPOSTA visual pronta para enviar, como um artefato HTML de página única, no estilo
da Mindle: fundo escuro (#0F0F0E), acento teal (#2E8B8E), off-white para texto (#F0EDE6),
tipografia de display marcante + corpo legível, muito respiro, sóbrio e editorial.

TOM (obrigatório): diagnóstico antes de prescrição; economia verbal; posição, não observação
neutra. Proibido linguagem aspiracional ("eleve sua marca", "transforme sua presença"),
intimidade forçada e adjetivo vazio. Frases curtas. O cliente compra porque foi entendido.

DIAGNÓSTICO DO CLIENTE (da call de hoje):
- Nome: ${nome}
- O que vende / negócio: ${g('dg-oferta') || '(preencher)'}
- Dor e gatilho: ${g('dg-dor') || '(preencher)'}
- Incoerências encontradas (devolver na abertura):
${incos.map((t, i) => '  ' + (i + 1) + '. ' + t).join('\n') || '  (preencher as incoerências da call)'}
- Veredito: ${v.titulo}

ESCOPO A PROPOR:
${escopo}

ESTRUTURA (nesta ordem):
1. Abertura — devolva o diagnóstico em 2–3 linhas (as incoerências acima), provando entendimento.
2. O que será feito — o escopo acima em itens claros.
3. Como funciona — processo em etapas, com aprovação a cada etapa (nada avança sem o ok do cliente).
4. Prazo e o que está incluído.
5. Investimento — deixe "R$ ____" como campo para eu preencher.
6. Próximo passo — uma única ação (responder para travar a data de início).

Entregue como artefato HTML único e autocontido, bonito e pronto para apresentar/exportar.
Não invente cases, números ou depoimentos. Deixe valores monetários como campo a preencher.`;

    $('#dg-saida').hidden = false;
    $('#dg-saida').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#dg-gerar').addEventListener('click', dgGerar);

  $('#dg-salvar').addEventListener('click', async () => {
    const id = $('#dg-lead').value;
    if (!id) return;
    if (!$('#dg-resumo').value) dgGerar();
    const l = leads.find((x) => x.id === id);
    const notas = ((l && l.notas) ? l.notas + '\n\n' : '') + $('#dg-resumo').value;
    const emailRascunho = $('#dg-proposta').value || null;
    const propostaPrompt = $('#dg-prompt').value || null;
    const msg = $('#dg-msg');
    const completo = { notas, status: 'contatado', email_rascunho: emailRascunho, proposta_prompt: propostaPrompt };
    let { error } = await sb.from(cfg.table || 'leads').update(completo).eq('id', id);
    // colunas de entregáveis ainda não criadas? salva só o essencial (nunca falha por isso)
    if (error && /column|PGRST204|42703/i.test(error.message || '')) {
      ({ error } = await sb.from(cfg.table || 'leads').update({ notas, status: 'contatado' }).eq('id', id));
    }
    msg.classList.toggle('is-error', !!error);
    msg.textContent = error ? 'Erro ao salvar: ' + error.message : 'Salvo no lead — status: contatado.';
    msg.hidden = false;
    if (!error && l) {
      l.notas = notas; l.status = 'contatado';
      l.email_rascunho = emailRascunho; l.proposta_prompt = propostaPrompt;
      render(); dgPopularLeads();
    }
  });

  $$('.dg-copy').forEach((b) => b.addEventListener('click', async () => {
    const ta = document.getElementById(b.dataset.copy);
    try { await navigator.clipboard.writeText(ta.value); }
    catch (e) { ta.select(); document.execCommand('copy'); }
    b.textContent = 'copiado ✓';
    setTimeout(() => { b.textContent = 'copiar'; }, 1500);
  }));

  /* Expandir/recolher qualquer textarea (diagnóstico e notas dos cards) */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.ta-expand');
    if (!btn) return;
    const ta = btn.dataset.ta
      ? document.getElementById(btn.dataset.ta)
      : (btn.closest('.lead-foot') || btn.closest('.dg-card') || document).querySelector('textarea');
    if (!ta) return;
    const tall = ta.classList.toggle('ta-tall');
    btn.textContent = tall ? 'recolher' : 'expandir';
  });

  /* Modal de leitura — e-mail e proposta de um lead */
  const modal = $('#modal');
  function abrirModal(titulo, corpo) {
    $('#modal-title').textContent = titulo;
    $('#modal-body').textContent = corpo || '(vazio)';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function fecharModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]') || e.target.id === 'modal-close') fecharModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) fecharModal(); });
  $('#modal-copy').addEventListener('click', async () => {
    const txt = $('#modal-body').textContent;
    try { await navigator.clipboard.writeText(txt); }
    catch (e) { const r = document.createRange(); r.selectNode($('#modal-body')); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); }
    $('#modal-copy').textContent = 'copiado ✓';
    setTimeout(() => { $('#modal-copy').textContent = 'copiar'; }, 1500);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.lead-view');
    if (!btn) return;
    const card = btn.closest('.lead-card');
    const l = leads.find((x) => x.id === card.dataset.id);
    if (!l) return;
    if (btn.dataset.view === 'email') abrirModal('Rascunho do e-mail — ' + (l.nome || ''), l.email_rascunho);
    else abrirModal('Prompt da proposta — ' + (l.nome || ''), l.proposta_prompt);
  });

  $('#dg-limpar').addEventListener('click', () => {
    $$('#tab-diagnostico [data-dg]').forEach((el) => {
      if (el.type === 'checkbox') el.checked = false; else el.value = '';
    });
    $('#dg-lead').value = '';
    $('#dg-saida').hidden = true;
    $('#dg-resumo').value = '';
    $('#dg-proposta').value = '';
    $('#dg-prompt').value = '';
    $('#dg-msg').hidden = true;
    if (dgTimer) clearInterval(dgTimer);
    dgTimer = null; dgAcum = 0; dgInicio = null;
    $('#dg-clock').textContent = '00:00';
    $('#dg-play').textContent = 'Iniciar';
    $$('#dg-fases li').forEach((li) => li.classList.remove('is-on'));
    try { localStorage.removeItem(DG_KEY); } catch (e) {}
    dgAtualizar();
  });

  dgRestaurar();
  dgAtualizar();

  /* ── Clientes (pós-venda / recorrência) ───────── */
  let clientes = [];
  const clFiltro = { status: 'todos', q: '' };
  const CL_PLANOS = { manutencao: 'Manutenção', reputacao: 'Reputação', autoridade: 'Autoridade' };
  const CL_STATUS = ['ativo', 'pausado', 'encerrado'];
  const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // próxima ocorrência do dia de renovação; retorna { data, dias } ou null
  function proximaRenovacao(dia) {
    if (!dia) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const noMes = (ano, mes) => {
      const ultimo = new Date(ano, mes + 1, 0).getDate();
      return new Date(ano, mes, Math.min(dia, ultimo));
    };
    let alvo = noMes(hoje.getFullYear(), hoje.getMonth());
    if (alvo < hoje) alvo = noMes(hoje.getFullYear(), hoje.getMonth() + 1);
    return { data: alvo, dias: Math.round((alvo - hoje) / 86400000) };
  }

  async function carregarClientes() {
    const { data, error } = await sb.from('clientes').select('*').order('created_at', { ascending: false });
    const msg = $('#cl-msg');
    if (error) {
      msg.textContent = 'Erro ao carregar clientes: ' + error.message +
        (/does not exist|schema cache/i.test(error.message) ? ' — rode o clientes.sql no SQL Editor.' : '');
      msg.classList.add('is-error'); msg.hidden = false;
      return;
    }
    clientes = data || [];
    msg.hidden = true;
    const count = $('#tab-count-clientes');
    const ativos = clientes.filter((c) => c.status === 'ativo').length;
    count.textContent = ativos; count.hidden = ativos === 0;
    renderClientes();
  }

  function renderClientes() {
    const ativos = clientes.filter((c) => c.status === 'ativo');
    $('#cl-stat-ativos').textContent = ativos.length;
    $('#cl-stat-mrr').textContent = brl(ativos.reduce((s, c) => s + (Number(c.valor_mensal) || 0), 0));
    const renovam = ativos.filter((c) => { const r = proximaRenovacao(c.dia_renovacao); return r && r.dias <= 7; }).length;
    $('#cl-stat-renova').textContent = renovam;
    $('#cl-stat-renova').classList.toggle('is-alerta', renovam > 0);

    const q = clFiltro.q.toLowerCase();
    const lista = clientes.filter((c) =>
      (clFiltro.status === 'todos' || c.status === clFiltro.status) &&
      (!q || [c.nome, c.email, c.whatsapp, c.contato, c.notas].some((v) => v && v.toLowerCase().includes(q)))
    );
    $('#cl-empty').hidden = lista.length > 0;
    $('#clientes-list').innerHTML = lista.map((c) => {
      const r = proximaRenovacao(c.dia_renovacao);
      const perto = r && r.dias <= 7 && c.status === 'ativo';
      const planos = (c.planos || []).map((p) => `<span class="badge badge-b">${esc(CL_PLANOS[p] || p)}</span>`).join('');
      const renovTxt = r ? r.data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' · em ' + r.dias + 'd' : '—';
      return `
      <article class="lead-card${perto ? ' is-atrasado' : ''}" data-id="${esc(c.id)}">
        <div class="lead-top">
          <span class="badge badge-status">${esc(c.status)}</span>
          ${perto ? '<span class="badge badge-sla">Renova esta semana</span>' : ''}
          <span class="lead-nome">${esc(c.nome)}</span>
          <span class="lead-data">${brl(c.valor_mensal)}/mês</span>
        </div>
        <dl class="lead-grid">
          ${c.responsavel ? `<div class="lead-field"><dt>Responsável</dt><dd>${esc(c.responsavel)}</dd></div>` : ''}
          ${(c.tipos && c.tipos.length) ? `<div class="lead-field"><dt>Entrega</dt><dd>${esc(c.tipos.join(', '))}</dd></div>` : ''}
          ${c.email ? `<div class="lead-field"><dt>E-mail</dt><dd>${esc(c.email)}</dd></div>` : ''}
          ${c.whatsapp ? `<div class="lead-field"><dt>WhatsApp</dt><dd>${esc(c.whatsapp)}</dd></div>` : ''}
          ${c.contato ? `<div class="lead-field"><dt>Contato</dt><dd>${esc(c.contato)}</dd></div>` : ''}
          <div class="lead-field"><dt>Renovação</dt><dd>${esc(renovTxt)}</dd></div>
          <div class="lead-field"><dt>Cliente desde</dt><dd>${esc(fmtData(c.created_at))}</dd></div>
        </dl>
        <div class="cl-row">
          ${planos}
          <a class="lead-view cl-relatorio" href="relatorio-reputacao.html?cliente=${encodeURIComponent(c.nome)}" target="_blank" rel="noopener">Relatório de reputação &nearr;</a>
          <button type="button" class="lead-view cl-retentor">Oferta de recorrência</button>
        </div>
        <div class="lead-foot">
          <select class="lead-status cl-status" aria-label="Status do cliente">
            ${CL_STATUS.map((s) => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
          <textarea class="lead-notas cl-notas" placeholder="Notas do cliente…" aria-label="Notas">${esc(c.notas || '')}</textarea>
          <button type="button" class="ta-expand" aria-label="Expandir notas">expandir</button>
          <button type="button" class="cl-excluir" aria-label="Excluir cliente">excluir</button>
          <span class="lead-salvo" aria-hidden="true">salvo ✓</span>
        </div>
      </article>`;
    }).join('');
  }

  function clRetentorTexto(c) {
    const primeiro = (c.nome || '').split(' ')[0];
    const valor = c.valor_mensal ? brl(c.valor_mensal) : 'R$ [valor]';
    const tipo = (c.tipos && c.tipos[0]) || 'Site';
    const fecho = 'São ' + valor + '/mês, sem fidelidade. Quer que eu deixe ativo a partir de [dd/mm]?';

    if (tipo === 'Automação') {
      return primeiro + ', o agente está no ar e atendendo do jeito que a gente calibrou.\n\n' +
        'Só que agente bom é agente treinado: todo mês chegam perguntas novas e situações que ele ainda não viu. ' +
        'Se quiser, eu continuo cuidando disso pra ele ficar melhor a cada mês:\n\n' +
        '• revisão mensal das conversas (o que ele acertou, o que escorregou)\n' +
        '• treino com as correções e perguntas novas do seu dia a dia\n' +
        '• ajustes de tom e de regras quando o seu negócio mudar\n' +
        '• monitoramento de que está tudo no ar e respondendo\n\n' + fecho;
    }
    if (tipo === 'Branding') {
      return primeiro + ', a marca está entregue e documentada — exatamente como a gente alinhou.\n\n' +
        'O que mantém uma marca forte é a consistência depois da entrega. Se quiser, eu continuo cuidando disso:\n\n' +
        '• aplicação da marca em cada material novo que você precisar\n' +
        '• um olhar mensal na sua presença: o que aparece quando pesquisam o seu nome\n' +
        '• pequenos ajustes de identidade e comunicação quando surgir novidade\n\n' + fecho;
    }
    if (tipo === 'Sistema') {
      return primeiro + ', o sistema está no ar: página, busca e atendimento funcionando juntos.\n\n' +
        'Sistema funciona enquanto é operado. Se quiser, eu sigo na operação pra você nunca mais precisar pensar nisso:\n\n' +
        '• monitoramento de que está tudo no ar, rápido e respondendo\n' +
        '• treino mensal do agente com as perguntas reais que chegarem\n' +
        '• ajustes na página e nos textos quando precisar\n' +
        '• um olhar mensal nos contatos que chegam e no que aparece quando pesquisam o seu nome\n\n' + fecho;
    }
    if (tipo === 'SEO/GMN') {
      return primeiro + ', o seu Google está arrumado — perfil completo e informação certa.\n\n' +
        'Reputação de busca não é foto, é filme: o que aparece quando pesquisam o seu nome muda todo mês. ' +
        'Se quiser, eu continuo de olho:\n\n' +
        '• monitoramento mensal do que aparece na busca pelo seu nome\n' +
        '• Google Meu Negócio sempre atualizado (fotos, horários, novidades)\n' +
        '• acompanhamento das avaliações e resposta às novas\n' +
        '• um relatório simples por mês: o que mudou e o que fazer\n\n' + fecho;
    }
    // Site / Landing Page (padrão)
    return primeiro + ', o site está no ar e ficou exatamente como a gente alinhou.\n\n' +
      'Os seus 30 dias de ajustes incluídos vão até [dd/mm]. Depois disso, se quiser, eu continuo ' +
      'cuidando da sua presença pra você nunca mais precisar pensar nisso:\n\n' +
      '• pequenos ajustes quando precisar (trocar um texto, uma foto, adicionar um prêmio ou novidade)\n' +
      '• monitoramento de que está tudo no ar e rápido\n' +
      '• um olhar mensal nos contatos que chegam pelo site\n\n' + fecho;
  }

  async function salvarCliente(id, patch, card) {
    const { error } = await sb.from('clientes').update(patch).eq('id', id);
    const flag = card.querySelector('.lead-salvo');
    if (error) { flag.textContent = 'erro ao salvar'; flag.style.color = 'var(--color-error)'; }
    else {
      flag.textContent = 'salvo ✓'; flag.style.color = '';
      const c = clientes.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
      if ('status' in patch) { card.querySelector('.badge-status').textContent = patch.status; renderClientes(); }
    }
    flag.classList.add('is-on');
    setTimeout(() => flag.classList.remove('is-on'), 1800);
  }

  // formulário de novo cliente
  const clForm = $('#cl-form');
  $('#cl-novo-btn').addEventListener('click', () => { clForm.hidden = !clForm.hidden; if (!clForm.hidden) $('#cl-nome').focus(); });
  const clWhats = $('#cl-whatsapp');
  if (clWhats) clWhats.addEventListener('input', () => {
    const d = clWhats.value.replace(/\D/g, '').slice(0, 11);
    clWhats.value = d.length <= 2 ? (d ? '(' + d : '')
      : d.length <= 6 ? '(' + d.slice(0, 2) + ') ' + d.slice(2)
      : d.length <= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
      : '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  });
  $('#cl-cancelar').addEventListener('click', () => { clForm.hidden = true; clForm.reset(); $('#cl-form-msg').hidden = true; });
  clForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fmsg = $('#cl-form-msg');
    const nome = $('#cl-nome').value.trim();
    if (!nome) { fmsg.textContent = 'Informe o nome do cliente.'; fmsg.classList.add('is-error'); fmsg.hidden = false; return; }
    const planos = Array.from(clForm.querySelectorAll('#cl-planos-set input:checked')).map((i) => i.value);
    const tipos = Array.from(clForm.querySelectorAll('#cl-tipos input:checked')).map((i) => i.value);
    const novo = {
      nome,
      responsavel: $('#cl-responsavel').value || null,
      tipos,
      email: $('#cl-email').value.trim() || null,
      whatsapp: $('#cl-whatsapp').value.trim() || null,
      valor_mensal: Number($('#cl-valor').value) || 0,
      dia_renovacao: $('#cl-dia').value ? Number($('#cl-dia').value) : null,
      planos,
      notas: $('#cl-notas').value.trim() || null
    };
    const btn = $('#cl-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    const { error } = await sb.from('clientes').insert(novo);
    btn.disabled = false; btn.textContent = 'Salvar cliente';
    if (error) { fmsg.textContent = 'Erro ao salvar: ' + error.message; fmsg.classList.add('is-error'); fmsg.hidden = false; return; }
    clForm.reset(); clForm.hidden = true; fmsg.hidden = true;
    carregarClientes();
  });

  const clList = $('#clientes-list');
  clList.addEventListener('change', (e) => {
    if (!e.target.classList.contains('cl-status')) return;
    const card = e.target.closest('.lead-card');
    salvarCliente(card.dataset.id, { status: e.target.value }, card);
  });
  clList.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('cl-notas')) return;
    const card = e.target.closest('.lead-card');
    const c = clientes.find((x) => x.id === card.dataset.id);
    const valor = e.target.value.trim() || null;
    if (c && (c.notas || null) !== valor) salvarCliente(card.dataset.id, { notas: valor }, card);
  });
  clList.addEventListener('click', async (e) => {
    const ret = e.target.closest('.cl-retentor');
    if (ret) {
      const card = ret.closest('.lead-card');
      const c = clientes.find((x) => x.id === card.dataset.id);
      if (c) abrirModal('Oferta de recorrência — ' + c.nome, clRetentorTexto(c));
      return;
    }
    const btn = e.target.closest('.cl-excluir');
    if (!btn) return;
    const card = btn.closest('.lead-card');
    const c = clientes.find((x) => x.id === card.dataset.id);
    if (!confirm('Excluir o cliente "' + (c ? c.nome : '') + '" definitivamente?')) return;
    const { error } = await sb.from('clientes').delete().eq('id', card.dataset.id);
    if (error) { $('#cl-msg').textContent = 'Erro ao excluir: ' + error.message; $('#cl-msg').classList.add('is-error'); $('#cl-msg').hidden = false; return; }
    clientes = clientes.filter((x) => x.id !== card.dataset.id);
    renderClientes();
    const count = $('#tab-count-clientes'); const ativos = clientes.filter((x) => x.status === 'ativo').length;
    count.textContent = ativos; count.hidden = ativos === 0;
  });
  $('#cl-filtro-status').addEventListener('change', (e) => { clFiltro.status = e.target.value; renderClientes(); });
  $('#cl-busca').addEventListener('input', (e) => { clFiltro.q = e.target.value.trim(); renderClientes(); });

  /* ── Propostas (aceite eletrônico) ───────────────── */
  let propostas = [];
  const prFiltro = { q: '' };
  const ftFiltro = { resp: 'todos', q: '' };
  const PR_STATUS = { rascunho: 'Rascunho', enviada: 'Enviada', aprovada: 'Aprovada', recusada: 'Recusada' };
  const PR_FORMAS = ['PIX', 'Cartão de crédito', 'Transferência / TED', 'Boleto'];
  const PR_PARCELAS = ['À vista', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x', '11x', '12x'];
  const prValorNum = (v) => Number((v || '').replace(/[^\d]/g, '')) || 0;

  function prLink(p) { return location.origin + '/proposta?p=' + encodeURIComponent(p.codigo); }
  function prSlug(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proposta';
  }
  function prCodigoRandom() {
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    return Array.from(a).map((b) => (b % 36).toString(36)).join('').slice(0, 6);
  }
  // "7000" → "R$ 7.000"; "R$ 3.000" → "R$ 3.000"; texto sem número fica como está
  function prValorFmt(v) {
    if (!v) return null;
    const n = v.replace(/[^\d]/g, '');
    return n ? 'R$ ' + Number(n).toLocaleString('pt-BR') : v;
  }

  async function carregarPropostas() {
    const { data, error } = await sb.from('propostas').select('*').order('criado_em', { ascending: false });
    const msg = $('#pr-msg');
    if (error) {
      msg.textContent = 'Erro ao carregar propostas: ' + error.message +
        (/does not exist|schema cache/i.test(error.message) ? ' — rode o propostas.sql no SQL Editor.' : '');
      msg.classList.add('is-error'); msg.hidden = false; return;
    }
    msg.classList.remove('is-error');
    propostas = data || [];
    const count = $('#tab-count-propostas');
    const pend = propostas.filter((p) => p.status === 'enviada').length;
    count.textContent = pend; count.hidden = pend === 0;
    renderPropostas();
    renderFaturamento();
  }

  function renderPropostas() {
    const q = prFiltro.q.toLowerCase();
    const lista = propostas.filter((p) => !q || (p.cliente && p.cliente.toLowerCase().includes(q)));
    $('#pr-empty').hidden = propostas.length > 0;
    $('#propostas-list').innerHTML = lista.map((p) => {
      const link = prLink(p);
      const aprovada = p.status === 'aprovada';
      // proposta enviada e sem resposta há 7+ dias → sinaliza follow-up
      const diasParada = p.status === 'enviada' && p.criado_em
        ? Math.floor((Date.now() - new Date(p.criado_em).getTime()) / 864e5) : 0;
      const parada = diasParada >= 7;
      return `
      <article class="lead-card${aprovada ? ' is-ok' : ''}${parada ? ' is-atrasado' : ''}" data-id="${esc(p.id)}">
        <div class="lead-top">
          <span class="badge badge-status">${esc(PR_STATUS[p.status] || p.status)}</span>
          ${parada ? `<span class="badge badge-sla">Sem resposta há ${diasParada}d — faça o follow-up</span>` : ''}
          ${p.pago ? '<span class="badge badge-b">Pago</span>' : ''}
          ${p.tipo ? `<span class="badge badge-b">${esc(p.tipo)}</span>` : ''}
          <span class="lead-nome">${esc(p.cliente)}</span>
          <span class="lead-data">${p.valor ? esc(p.valor) : ''}</span>
        </div>
        <dl class="lead-grid">
          <div class="lead-field"><dt>Responsável</dt><dd>${esc(p.responsavel || '—')}</dd></div>
          <div class="lead-field"><dt>Criada em</dt><dd>${esc(fmtData(p.criado_em))}</dd></div>
          ${aprovada ? `
            <div class="lead-field"><dt>Aprovada por</dt><dd>${esc(p.aceito_nome || '—')}</dd></div>
            <div class="lead-field"><dt>Em</dt><dd>${esc(fmtData(p.aceito_em))}</dd></div>
            <div class="lead-field"><dt>E-mail</dt><dd>${esc(p.aceito_email || '—')}</dd></div>
            <div class="lead-field"><dt>CPF/CNPJ</dt><dd>${esc(p.aceito_doc || '—')}</dd></div>` : ''}
        </dl>
        <div class="cl-row">
          <input class="field-input pr-link-input" readonly value="${esc(link)}" aria-label="Link da proposta">
          <button type="button" class="lead-view pr-copiar" data-link="${esc(link)}">copiar link</button>
          <a class="lead-view" href="${esc(link)}" target="_blank" rel="noopener">abrir &nearr;</a>
        </div>
        ${p.pago ? `
        <div class="cl-row">
          <span class="badge badge-b">${esc(p.forma_pagamento || '—')}</span>
          <span class="badge">${esc(p.parcelas || '—')}</span>
          ${p.comprovante_path ? `<button type="button" class="lead-view pr-file" data-path="${esc(p.comprovante_path)}">ver comprovante &nearr;</button>` : '<span class="lead-data">sem comprovante</span>'}
          ${p.contrato_path ? `<button type="button" class="lead-view pr-file" data-path="${esc(p.contrato_path)}">ver contrato &nearr;</button>` : ''}
        </div>` : `
        <div class="pr-pay" hidden>
          <div class="cl-form-grid">
            <div class="dg-field"><label class="field-label">Forma de pagamento</label>
              <select class="field-input pr-pay-forma">${PR_FORMAS.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select></div>
            <div class="dg-field"><label class="field-label">Parcelamento</label>
              <select class="field-input pr-pay-parcelas">${PR_PARCELAS.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select></div>
          </div>
          <div class="cl-form-grid">
            <div class="dg-field"><label class="field-label">Comprovante (PDF ou imagem) — opcional</label>
              <input class="field-input pr-pay-file" type="file" accept="image/*,application/pdf"></div>
            <div class="dg-field"><label class="field-label">Contrato (PDF ou imagem) — opcional</label>
              <input class="field-input pr-pay-contrato" type="file" accept="image/*,application/pdf"></div>
          </div>
          <div class="cl-form-acoes">
            <button type="button" class="btn btn-primary pr-pay-confirmar">Confirmar pagamento</button>
            <p class="admin-msg pr-pay-msg" role="alert" hidden></p>
          </div>
        </div>` }
        <div class="lead-foot">
          ${p.pago ? '' : '<button type="button" class="lead-view pr-registrar">+ Registrar pagamento</button>'}
          <button type="button" class="cl-excluir pr-excluir" aria-label="Excluir proposta">excluir</button>
        </div>
      </article>`;
    }).join('');
  }

  const prForm = $('#pr-form');
  $('#pr-novo-btn').addEventListener('click', () => { prForm.hidden = !prForm.hidden; if (!prForm.hidden) $('#pr-cliente').focus(); });
  $('#pr-cancelar').addEventListener('click', () => { prForm.hidden = true; prForm.reset(); });

  prForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const responsavel = $('#pr-responsavel').value;
    const cliente = $('#pr-cliente').value.trim();
    const tipo = $('#pr-tipo').value;
    const valor = prValorFmt($('#pr-valor').value.trim());
    const file = $('#pr-pdf').files[0];
    const fmsg = $('#pr-form-msg');
    fmsg.hidden = true; fmsg.classList.remove('is-error');
    if (!responsavel || !cliente || !tipo || !file) { fmsg.textContent = 'Selecione o responsável, o cliente, o tipo e o PDF.'; fmsg.classList.add('is-error'); fmsg.hidden = false; return; }
    if (file.type !== 'application/pdf') { fmsg.textContent = 'O arquivo precisa ser um PDF.'; fmsg.classList.add('is-error'); fmsg.hidden = false; return; }

    const btn = $('#pr-salvar'); btn.disabled = true; btn.textContent = 'Enviando…';
    const codigo = prSlug(cliente) + '-' + prCodigoRandom();
    const pdf_path = codigo + '.pdf';

    const up = await sb.storage.from('propostas').upload(pdf_path, file, { contentType: 'application/pdf', upsert: false });
    if (up.error) { fmsg.textContent = 'Erro ao subir o PDF: ' + up.error.message; fmsg.classList.add('is-error'); fmsg.hidden = false; btn.disabled = false; btn.textContent = 'Gerar proposta'; return; }

    const { error } = await sb.from('propostas').insert({ codigo, cliente, valor, pdf_path, status: 'enviada', responsavel, tipo });
    if (error) {
      await sb.storage.from('propostas').remove([pdf_path]); // desfaz o upload órfão
      fmsg.textContent = 'Erro ao salvar: ' + error.message; fmsg.classList.add('is-error'); fmsg.hidden = false;
      btn.disabled = false; btn.textContent = 'Gerar proposta'; return;
    }

    btn.disabled = false; btn.textContent = 'Gerar proposta';
    prForm.hidden = true; prForm.reset();
    await carregarPropostas();

    const url = location.origin + '/proposta?p=' + codigo;
    const msg = $('#pr-msg');
    msg.innerHTML = 'Proposta criada. Link (copiado) pra enviar ao cliente: <strong>' + esc(url) + '</strong>';
    msg.classList.remove('is-error'); msg.hidden = false;
    try { await navigator.clipboard.writeText(url); } catch (err) {}
  });

  const prList = $('#propostas-list');
  prList.addEventListener('click', async (e) => {
    // copiar link
    const cp = e.target.closest('.pr-copiar');
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.link); cp.textContent = 'copiado ✓'; setTimeout(() => { cp.textContent = 'copiar link'; }, 1500); } catch (err) {}
      return;
    }
    // abrir/fechar o formulário de pagamento
    const reg = e.target.closest('.pr-registrar');
    if (reg) { const box = reg.closest('.lead-card').querySelector('.pr-pay'); if (box) box.hidden = !box.hidden; return; }
    // ver comprovante/contrato (URL assinada; abre a aba no clique pra não ser bloqueada)
    const vc = e.target.closest('.pr-file');
    if (vc) {
      const w = window.open('', '_blank');
      const { data } = await sb.storage.from('propostas').createSignedUrl(vc.dataset.path, 3600);
      if (data && data.signedUrl && w) w.location = data.signedUrl; else if (w) w.close();
      return;
    }
    // confirmar pagamento
    const conf = e.target.closest('.pr-pay-confirmar');
    if (conf) {
      const card = conf.closest('.lead-card');
      const p = propostas.find((x) => x.id === card.dataset.id);
      if (!p) return;
      const forma = card.querySelector('.pr-pay-forma').value;
      const parcelas = card.querySelector('.pr-pay-parcelas').value;
      const file = card.querySelector('.pr-pay-file').files[0];
      const contratoFile = card.querySelector('.pr-pay-contrato').files[0];
      const pmsg = card.querySelector('.pr-pay-msg');
      pmsg.hidden = true; pmsg.classList.remove('is-error');
      conf.disabled = true; conf.textContent = 'Salvando…';

      const falha = (msg) => { pmsg.textContent = msg; pmsg.classList.add('is-error'); pmsg.hidden = false; conf.disabled = false; conf.textContent = 'Confirmar pagamento'; };

      let comprovante_path = p.comprovante_path || null;
      if (file) {
        const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
        comprovante_path = `comprovantes/${p.codigo}-comprovante.${ext}`;
        const up = await sb.storage.from('propostas').upload(comprovante_path, file, { contentType: file.type || undefined, upsert: true });
        if (up.error) { falha('Erro ao subir o comprovante: ' + up.error.message); return; }
      }
      let contrato_path = p.contrato_path || null;
      if (contratoFile) {
        const ext = (contratoFile.name.split('.').pop() || 'pdf').toLowerCase();
        contrato_path = `contratos/${p.codigo}-contrato.${ext}`;
        const up = await sb.storage.from('propostas').upload(contrato_path, contratoFile, { contentType: contratoFile.type || undefined, upsert: true });
        if (up.error) { falha('Erro ao subir o contrato: ' + up.error.message); return; }
      }
      const patch = { pago: true, forma_pagamento: forma, parcelas, comprovante_path, contrato_path, faturado_em: new Date().toISOString() };
      const { error } = await sb.from('propostas').update(patch).eq('id', p.id);
      if (error) { pmsg.textContent = 'Erro ao salvar: ' + error.message; pmsg.classList.add('is-error'); pmsg.hidden = false; conf.disabled = false; conf.textContent = 'Confirmar pagamento'; return; }
      Object.assign(p, patch);
      renderPropostas(); renderFaturamento();
      return;
    }
    // excluir
    const del = e.target.closest('.pr-excluir');
    if (!del) return;
    const card = del.closest('.lead-card');
    const p = propostas.find((x) => x.id === card.dataset.id);
    if (!p) return;
    if (!confirm('Excluir a proposta de "' + p.cliente + '"? O link para de funcionar.')) return;
    const paths = [p.pdf_path]; if (p.comprovante_path) paths.push(p.comprovante_path); if (p.contrato_path) paths.push(p.contrato_path);
    await sb.storage.from('propostas').remove(paths);
    const { error } = await sb.from('propostas').delete().eq('id', p.id);
    if (error) { $('#pr-msg').textContent = 'Erro ao excluir: ' + error.message; $('#pr-msg').classList.add('is-error'); $('#pr-msg').hidden = false; return; }
    propostas = propostas.filter((x) => x.id !== p.id);
    const count = $('#tab-count-propostas'); const pend = propostas.filter((x) => x.status === 'enviada').length;
    count.textContent = pend; count.hidden = pend === 0;
    renderPropostas(); renderFaturamento();
  });
  $('#pr-busca').addEventListener('input', (e) => { prFiltro.q = e.target.value.trim(); renderPropostas(); });

  /* ── Faturamento (propostas pagas) ── */
  function brlNum(n) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR'); }
  function renderFaturamento() {
    const pagas = propostas.filter((p) => p.pago);
    const totalGeral = pagas.reduce((s, p) => s + prValorNum(p.valor), 0);
    const totRod = pagas.filter((p) => p.responsavel === 'Rodrigo').reduce((s, p) => s + prValorNum(p.valor), 0);
    const totMar = pagas.filter((p) => p.responsavel === 'Maria').reduce((s, p) => s + prValorNum(p.valor), 0);
    $('#ft-stat-total').textContent = brlNum(totalGeral);
    $('#ft-stat-rodrigo').textContent = brlNum(totRod);
    $('#ft-stat-maria').textContent = brlNum(totMar);
    const count = $('#tab-count-faturamento'); count.textContent = pagas.length; count.hidden = pagas.length === 0;

    const q = ftFiltro.q.toLowerCase();
    const lista = pagas.filter((p) =>
      (ftFiltro.resp === 'todos' || p.responsavel === ftFiltro.resp) &&
      (!q || (p.cliente && p.cliente.toLowerCase().includes(q)))
    ).sort((a, b) => (b.faturado_em || '').localeCompare(a.faturado_em || ''));
    $('#ft-empty').hidden = pagas.length > 0;
    $('#faturamento-list').innerHTML = lista.map((p) => `
      <article class="lead-card is-ok" data-id="${esc(p.id)}">
        <div class="lead-top">
          <span class="badge badge-b">${esc(p.responsavel || '—')}</span>
          <span class="lead-nome">${esc(p.cliente)}</span>
          <span class="lead-data">${p.valor ? esc(p.valor) : ''}</span>
        </div>
        <dl class="lead-grid">
          <div class="lead-field"><dt>Forma</dt><dd>${esc(p.forma_pagamento || '—')}</dd></div>
          <div class="lead-field"><dt>Parcelamento</dt><dd>${esc(p.parcelas || '—')}</dd></div>
          <div class="lead-field"><dt>Pago em</dt><dd>${esc(fmtData(p.faturado_em))}</dd></div>
          <div class="lead-field"><dt>Aceite do cliente</dt><dd>${p.status === 'aprovada' ? esc(p.aceito_nome || 'sim') : '—'}</dd></div>
        </dl>
        <div class="cl-row">
          ${p.comprovante_path ? `<button type="button" class="lead-view ft-file" data-path="${esc(p.comprovante_path)}">ver comprovante &nearr;</button>` : '<span class="lead-data">sem comprovante</span>'}
          ${p.contrato_path ? `<button type="button" class="lead-view ft-file" data-path="${esc(p.contrato_path)}">ver contrato &nearr;</button>` : ''}
        </div>
      </article>`).join('');
  }
  const ftList = $('#faturamento-list');
  ftList.addEventListener('click', async (e) => {
    const vc = e.target.closest('.ft-file');
    if (!vc) return;
    const w = window.open('', '_blank');
    const { data } = await sb.storage.from('propostas').createSignedUrl(vc.dataset.path, 3600);
    if (data && data.signedUrl && w) w.location = data.signedUrl; else if (w) w.close();
  });
  $('#ft-filtro-resp').addEventListener('change', (e) => { ftFiltro.resp = e.target.value; renderFaturamento(); });
  $('#ft-busca').addEventListener('input', (e) => { ftFiltro.q = e.target.value.trim(); renderFaturamento(); });

  /* ── Clientes (cadastro geral) ────────────────── */
  let cadastro = [];
  const cadFiltro = { q: '' };

  async function carregarCadastro() {
    const { data, error } = await sb.from('cadastro_clientes').select('*').order('created_at', { ascending: false });
    const msg = $('#cad-msg');
    if (error) {
      msg.textContent = 'Erro ao carregar clientes: ' + error.message +
        (/does not exist|schema cache/i.test(error.message) ? ' — rode o cadastro-clientes.sql no SQL Editor.' : '');
      msg.classList.add('is-error'); msg.hidden = false; return;
    }
    msg.hidden = true;
    cadastro = data || [];
    const count = $('#tab-count-cadastro');
    count.textContent = cadastro.length; count.hidden = cadastro.length === 0;
    renderCadastro();
  }

  function cadLinksHTML(txt) {
    if (!txt) return '';
    return txt.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((url) => {
      const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
      return `<a class="lead-view" href="${esc(href)}" target="_blank" rel="noopener">${esc(url)} &nearr;</a>`;
    }).join('');
  }

  function renderCadastro() {
    const q = cadFiltro.q.toLowerCase();
    const lista = cadastro.filter((c) => !q || [c.nome, c.email, c.cpf_cnpj, c.whatsapp, c.notas].some((v) => v && v.toLowerCase().includes(q)));
    $('#cad-empty').hidden = cadastro.length > 0;
    $('#cadastro-list').innerHTML = lista.map((c) => {
      const tipos = (c.tipos || []).map((t) => `<span class="badge badge-b">${esc(t)}</span>`).join('');
      return `
      <article class="lead-card" data-id="${esc(c.id)}">
        <div class="lead-top">
          <span class="lead-nome">${esc(c.nome)}</span>
          <span class="lead-data">${c.valor ? esc(c.valor) : ''}</span>
        </div>
        <dl class="lead-grid">
          ${c.email ? `<div class="lead-field"><dt>E-mail</dt><dd>${esc(c.email)}</dd></div>` : ''}
          ${c.whatsapp ? `<div class="lead-field"><dt>WhatsApp</dt><dd>${esc(c.whatsapp)}</dd></div>` : ''}
          ${c.cpf_cnpj ? `<div class="lead-field"><dt>CPF/CNPJ</dt><dd>${esc(c.cpf_cnpj)}</dd></div>` : ''}
          <div class="lead-field"><dt>Cadastrado</dt><dd>${esc(fmtData(c.created_at))}</dd></div>
        </dl>
        ${tipos ? `<div class="cl-row">${tipos}</div>` : ''}
        ${c.links ? `<div class="cl-row">${cadLinksHTML(c.links)}</div>` : ''}
        ${c.notas ? `<p style="color:var(--color-muted);font-size:var(--font-body-sm);line-height:1.6;margin-top:6px">${esc(c.notas)}</p>` : ''}
        <div class="lead-foot">
          <button type="button" class="lead-view cad-editar">editar</button>
          <button type="button" class="cl-excluir cad-excluir" aria-label="Excluir cliente">excluir</button>
        </div>
      </article>`;
    }).join('');
  }

  const cadForm = $('#cad-form');
  let cadEditId = null;
  function cadAbrirForm(c) {
    cadEditId = c ? c.id : null;
    $('#cad-nome').value = c ? (c.nome || '') : '';
    $('#cad-doc').value = c ? (c.cpf_cnpj || '') : '';
    $('#cad-email').value = c ? (c.email || '') : '';
    $('#cad-whatsapp').value = c ? (c.whatsapp || '') : '';
    $('#cad-valor').value = c ? (c.valor || '') : '';
    $('#cad-links').value = c ? (c.links || '') : '';
    $('#cad-notas').value = c ? (c.notas || '') : '';
    const tipos = (c && c.tipos) || [];
    cadForm.querySelectorAll('.cl-planos input').forEach((i) => { i.checked = tipos.includes(i.value); });
    $('#cad-salvar').textContent = c ? 'Salvar alterações' : 'Salvar cliente';
    $('#cad-form-msg').hidden = true;
    cadForm.hidden = false;
  }
  $('#cad-novo-btn').addEventListener('click', () => {
    if (cadForm.hidden) { cadAbrirForm(null); $('#cad-nome').focus(); }
    else { cadForm.hidden = true; }
  });
  $('#cad-cancelar').addEventListener('click', () => { cadForm.hidden = true; cadEditId = null; });
  const cadWhats = $('#cad-whatsapp');
  if (cadWhats) cadWhats.addEventListener('input', () => {
    const d = cadWhats.value.replace(/\D/g, '').slice(0, 11);
    cadWhats.value = d.length <= 2 ? (d ? '(' + d : '')
      : d.length <= 6 ? '(' + d.slice(0, 2) + ') ' + d.slice(2)
      : d.length <= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
      : '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  });

  cadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fmsg = $('#cad-form-msg');
    const nome = $('#cad-nome').value.trim();
    if (!nome) { fmsg.textContent = 'Informe o nome do cliente.'; fmsg.classList.add('is-error'); fmsg.hidden = false; return; }
    const tipos = Array.from(cadForm.querySelectorAll('.cl-planos input:checked')).map((i) => i.value);
    const dados = {
      nome,
      cpf_cnpj: $('#cad-doc').value.trim() || null,
      email: $('#cad-email').value.trim() || null,
      whatsapp: $('#cad-whatsapp').value.trim() || null,
      valor: prValorFmt($('#cad-valor').value.trim()),
      tipos,
      links: $('#cad-links').value.trim() || null,
      notas: $('#cad-notas').value.trim() || null,
    };
    const btn = $('#cad-salvar'); const rotulo = cadEditId ? 'Salvar alterações' : 'Salvar cliente';
    btn.disabled = true; btn.textContent = 'Salvando…';
    const { error } = cadEditId
      ? await sb.from('cadastro_clientes').update(dados).eq('id', cadEditId)
      : await sb.from('cadastro_clientes').insert(dados);
    btn.disabled = false; btn.textContent = rotulo;
    if (error) { fmsg.textContent = 'Erro ao salvar: ' + error.message; fmsg.classList.add('is-error'); fmsg.hidden = false; return; }
    cadForm.hidden = true; fmsg.hidden = true; cadEditId = null;
    carregarCadastro();
  });

  $('#cadastro-list').addEventListener('click', async (e) => {
    const edit = e.target.closest('.cad-editar');
    if (edit) {
      const c = cadastro.find((x) => x.id === edit.closest('.lead-card').dataset.id);
      if (c) { cadAbrirForm(c); cadForm.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#cad-nome').focus(); }
      return;
    }
    const del = e.target.closest('.cad-excluir');
    if (!del) return;
    const card = del.closest('.lead-card');
    const c = cadastro.find((x) => x.id === card.dataset.id);
    if (!c) return;
    if (!confirm('Excluir o cliente "' + c.nome + '"?')) return;
    const { error } = await sb.from('cadastro_clientes').delete().eq('id', c.id);
    if (error) { $('#cad-msg').textContent = 'Erro ao excluir: ' + error.message; $('#cad-msg').classList.add('is-error'); $('#cad-msg').hidden = false; return; }
    cadastro = cadastro.filter((x) => x.id !== c.id);
    const count = $('#tab-count-cadastro'); count.textContent = cadastro.length; count.hidden = cadastro.length === 0;
    renderCadastro();
  });
  $('#cad-busca').addEventListener('input', (e) => { cadFiltro.q = e.target.value.trim(); renderCadastro(); });

  /* ── Links da Mindle (central pra copiar/enviar) ── */
  const MINDLE_LINKS = [
    { nome: 'Site da Mindle', tag: '', url: 'https://mindlebrand.com.br', desc: 'A página principal — o sistema completo de presença digital.' },
    { nome: 'Agendar diagnóstico', tag: 'pro cliente', url: 'https://mindlebrand.com.br/agenda', desc: 'Link direto pro cliente escolher o horário da conversa de 30 min.' },
    { nome: 'Briefing — Landing Page', tag: 'pro cliente', url: 'https://mindlebrand.com.br/briefing', desc: 'Pro cliente preencher antes de uma landing page.' },
    { nome: 'Briefing — Branding', tag: 'pro cliente', url: 'https://mindlebrand.com.br/branding', desc: 'Pro cliente preencher antes do branding completo.' },
    { nome: 'Briefing — Automação', tag: 'pro cliente', url: 'https://mindlebrand.com.br/briefing-automacao', desc: 'Pro cliente configurar o tom e as regras do agente de atendimento.' },
    { nome: 'Oferta — Automação (Operação)', tag: 'pro cliente', url: 'https://mindlebrand.com.br/automacao', desc: 'A página comercial da camada 05: agente de WhatsApp, com demo.' },
    { nome: 'Painel (admin)', tag: 'interno', url: 'https://mindlebrand.com.br/admin', desc: 'Seu painel de gestão. Não enviar pro cliente.' },
  ];
  function renderLinks() {
    const el = $('#links-list'); if (!el) return;
    el.innerHTML = MINDLE_LINKS.map((l) => `
      <article class="lead-card">
        <div class="lead-top">
          <span class="lead-nome">${esc(l.nome)}</span>
          ${l.tag ? `<span class="badge${l.tag === 'interno' ? '' : ' badge-b'}">${esc(l.tag)}</span>` : ''}
        </div>
        <p style="color:var(--color-muted);font-size:var(--font-body-sm);line-height:1.5;margin:2px 0 4px">${esc(l.desc)}</p>
        <div class="cl-row">
          <input class="field-input pr-link-input" readonly value="${esc(l.url)}" aria-label="Link">
          <button type="button" class="lead-view links-copiar" data-copy="${esc(l.url)}">copiar</button>
          <a class="lead-view" href="${esc(l.url)}" target="_blank" rel="noopener">abrir &nearr;</a>
        </div>
      </article>`).join('');
  }
  renderLinks();
  $('#links-list').addEventListener('click', async (e) => {
    const b = e.target.closest('.links-copiar');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'copiado ✓'; setTimeout(() => { b.textContent = 'copiar'; }, 1500); } catch (err) {}
  });

  /* ── Boot ─────────────────────────────────────── */
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') carregar();
  });
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) carregar();
    else mostrar('login');
  });
})();
