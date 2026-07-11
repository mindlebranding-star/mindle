/* ════════════════════════════════════════════════════════════
   CONFIG DA MINDLE — único arquivo de dados de backend/integração.
   Carregado por index, admin, briefing e branding.
   A publishable key é pública por design (pode ir no HTML).
   Para trocar de projeto Supabase, muda só aqui.
   ════════════════════════════════════════════════════════════ */
window.MINDLE_SUPABASE = {
  url:            'https://werssmpcjhkenjvafamv.supabase.co',
  anonKey:        'sb_publishable_tu2HAnxMsSaHNWgzkM2LNg_p281xrRH',
  table:          'leads',
  briefingTable:  'briefings',
  briefingBucket: 'briefing-arquivos'
};

// Agenda do diagnóstico (Cal.com) — caminho A agenda na hora
window.MINDLE_CAL = 'mindle-diagnostico/branding';

// WhatsApp do AGENTE da Mindle (demo viva em /automacao).
// Formato: só dígitos, com DDI e DDD — ex: '5541999998888'.
// Vazio = o botão de demo fica oculto.
window.MINDLE_WHATS = '';
