/* ══════════════════════════════════════════════════════════════════════════
   controle-agenda.js — a Agenda do Meu Controle

   Um calendário do mês, como qualquer calendário, e a semana como segunda
   forma de ver. É uma agenda própria, dentro do Meu Controle, e não fala com
   Google nem com nada de fora. Tudo escrito por extenso ("5 horas", "às 16h")
   para hora do relógio e quantidade de horas não se confundirem.

   Em cada dia aparece:
   - as horas de cada trabalho: planejadas ("5 horas") ou feitas ("✓ 3 horas").
     O plano vem do plano da semana do trabalho ou de horas marcadas só para
     aquele dia;
   - os compromissos: entrevista, teste, prazo, estudo ou outro;
   - o que já está no Meu Controle: o próximo passo das candidaturas, o fim
     do período de cada trabalho e o dia de receber, com o valor previsto
     pelas horas lançadas.

   Clicar num dia abre o resumo do dia, de onde se lança horas, muda as horas
   planejadas do dia e marca compromisso.

   O plano da semana fica dentro do próprio trabalho:
     trabalho.plano = { horas, dias: [0-6, 0 = domingo], desde }
     trabalho.diasAtePagar = dias entre o fim do período e o pagamento
   Um item da agenda (coleção "agenda"):
     compromisso  { tipo, titulo, data, inicio, fim, aplicacaoId, nota }
     horas do dia { tipo: "trabalho", trabalhoId, data, horas }   (troca o
                  plano da semana naquele dia; horas 0 tira o trabalho do dia)

   A tela Hoje usa planoDoDia(), compromissos() e horas().
   O CSS mora aqui dentro, pela regra das peças compartilhadas.
   ══════════════════════════════════════════════════════════════════════════ */

const Agenda = (function () {
  "use strict";

  const esc = s => UI.esc(s);

  const TIPOS = {
    entrevista: { nome: "Entrevista", cor: "#5B4B9E" },
    teste:      { nome: "Teste",      cor: "#1A4893" },
    prazo:      { nome: "Prazo",      cor: "#A85D24" },
    estudo:     { nome: "Estudo",     cor: "#1F7A6E" },
    outro:      { nome: "Outro",      cor: "#66717F" },
  };
  const DSEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const DSEM_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                 "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const VIVOS = ["aplicado", "teste", "entrevista", "banco"];

  /* ── estilo ──────────────────────────────────────────────────────────── */

  const CSS = `
.ag-plano { margin-bottom:18px; }
.ag-pl { display:grid; grid-template-columns:minmax(150px,1.1fr) minmax(90px,.8fr) minmax(0,1.9fr) auto; gap:6px 16px;
  align-items:center; padding:12px 0; border-top:1px solid var(--line-soft,#EAE4D9); }
.ag-pl-nome { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--ink,#10203A); min-width:0; }
.ag-pl-nome i { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.ag-pl-nome span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-pl-barra { height:7px; border-radius:99px; background:var(--bg-soft,#F1ECE3); overflow:hidden; }
.ag-pl-barra i { display:block; height:100%; border-radius:99px; }
.ag-pl-txt { font-size:13.5px; color:var(--ink-2,#54606F); line-height:1.45; }
.ag-pl-txt b { color:var(--ink,#10203A); font-weight:600; }
.ag-pl-txt small { display:block; font-size:12.5px; color:var(--ink-3,#66717F); margin-top:1px; }
.ag-pl-bt { font:inherit; font-size:13px; font-weight:600; color:var(--signal,#1A4893); background:none; border:0; cursor:pointer; padding:4px 0; white-space:nowrap; }

.ag-barra { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 12px; }
.ag-barra h2 { font-family:var(--body,'Geist',sans-serif); font-size:17px; font-weight:600; color:var(--ink,#10203A); margin:0 0 0 6px; }
.ag-seta { width:34px; height:34px; border-radius:50%; border:1px solid var(--line,#DED7CA); background:var(--panel,#fff);
  font:inherit; font-size:17px; line-height:1; color:var(--ink-2,#54606F); cursor:pointer; display:grid; place-items:center; }
.ag-esta { font:inherit; font-size:13px; font-weight:500; padding:8px 14px; border-radius:999px; cursor:pointer;
  border:1px solid var(--line,#DED7CA); background:var(--panel,#fff); color:var(--ink,#10203A); }
.ag-vistas { margin-left:auto; display:inline-flex; padding:3px; border-radius:999px; background:var(--bg-soft,#F1ECE3); border:1px solid var(--line-soft,#EAE4D9); }
.ag-vistas button { font:inherit; font-size:13px; font-weight:500; padding:7px 15px; border:0; border-radius:999px; background:transparent; color:var(--ink-2,#54606F); cursor:pointer; }
.ag-vistas button[aria-selected="true"] { background:var(--panel,#fff); color:var(--ink,#10203A); box-shadow:0 1px 3px rgba(16,32,58,.12); }

/* mês */
.ag-mes { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); background:var(--panel,#fff);
  border:1px solid var(--line-soft,#EAE4D9); border-radius:16px; overflow:hidden; }
.ag-mes-sem { font-size:11.5px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--ink-3,#66717F);
  padding:10px 10px 8px; background:var(--bg,#F7F4EF); border-bottom:1px solid var(--line-soft,#EAE4D9); }
.ag-cel { display:flex; flex-direction:column; gap:3px; min-height:120px; min-width:0; padding:6px 6px 8px; text-align:left; font:inherit; color:inherit;
  background:var(--panel,#fff); border:0; border-right:1px solid var(--line-soft,#EAE4D9); border-bottom:1px solid var(--line-soft,#EAE4D9); cursor:pointer; }
.ag-cel:nth-child(7n) { border-right:0; }
.ag-cel:hover { background:#FBF9F5; }
.ag-cel.fora { background:#FBF9F5; }
.ag-cel.fora .ag-cel-n { color:#B4BAC2; }
.ag-cel-n { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font-size:13px; font-weight:600; color:var(--ink-2,#54606F); }
.ag-cel.hoje .ag-cel-n { background:var(--signal,#1A4893); color:#fff; }
.ag-ch { display:block; font-size:11.5px; line-height:1.35; padding:2px 7px; border-radius:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  background:color-mix(in srgb, var(--c) 13%, #fff); color:color-mix(in srgb, var(--c) 82%, #000); }
.ag-ch.feito { background:var(--c); color:#fff; }
.ag-ch.auto { background:transparent; box-shadow:inset 0 0 0 1px var(--line,#DED7CA); color:var(--ink-2,#54606F); }
.ag-ch.dinheiro { background:#E4F3F0; color:#1F7A6E; font-weight:600; }
.ag-cel-mais { font-size:11px; font-weight:600; color:var(--signal,#1A4893); padding:0 7px; }

/* semana */
.ag-semana { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; }
.ag-dia { background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9); border-radius:14px; padding:10px 8px 8px;
  display:flex; flex-direction:column; gap:6px; min-height:190px; min-width:0; cursor:pointer; text-align:left; font:inherit; color:inherit; }
.ag-dia:hover { border-color:var(--line,#DED7CA); }
.ag-dia.hoje { border-color:var(--signal,#1A4893); box-shadow:0 0 0 1px var(--signal,#1A4893); }
.ag-dia.passou { background:#FBF9F5; }
.ag-dia-cab { display:flex; align-items:baseline; gap:6px; padding:0 3px 4px; }
.ag-dia-cab span { font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3,#66717F); }
.ag-dia-cab b { font-size:17px; font-weight:600; color:var(--ink,#10203A); }
.ag-dia-cab em { margin-left:auto; font-style:normal; font-size:11px; font-weight:600; color:#fff; background:var(--signal,#1A4893); border-radius:999px; padding:1px 8px; }
.ag-it { display:block; border-radius:9px; padding:7px 8px 7px 9px; background:var(--bg,#F7F4EF); box-shadow:inset 3px 0 0 var(--c,#66717F); }
.ag-it b { display:block; font-size:12.5px; font-weight:600; color:var(--ink,#10203A); line-height:1.3;
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.ag-it small { display:block; font-size:11.5px; color:var(--ink-3,#66717F); line-height:1.3; margin-bottom:1px; }
.ag-it span { display:block; font-size:12px; color:var(--ink-2,#54606F); line-height:1.35; margin-top:2px; }
.ag-it.feito { background:color-mix(in srgb, var(--c) 12%, #fff); }
.ag-it.feito span { color:color-mix(in srgb, var(--c) 80%, #000); font-weight:600; }
.ag-it.auto { background:transparent; box-shadow:inset 0 0 0 1px var(--line,#DED7CA); }
.ag-it.dinheiro { background:#E9F5F1; box-shadow:inset 3px 0 0 #1F7A6E; }
.ag-it.dinheiro span { color:#1F7A6E; font-weight:600; }
.ag-dicas { font-size:12.5px; color:var(--ink-3,#66717F); margin-top:10px; }

/* resumo do dia */
.ag-dd-sec + .ag-dd-sec { margin-top:16px; }
.ag-dd-sec h3 { font-family:var(--body,'Geist',sans-serif) !important; font-size:11.5px !important; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
  color:var(--ink-3,#66717F); margin:0 0 4px !important; }
.ag-dd { display:flex; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--line-soft,#EAE4D9); }
.ag-dd:first-of-type { border-top:0; }
.ag-dd i { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.ag-dd-txt { flex:1; min-width:0; }
.ag-dd-txt b { display:block; font-size:14.5px; font-weight:600; color:var(--ink,#10203A); }
.ag-dd-txt span { display:block; font-size:13px; color:var(--ink-2,#54606F); margin-top:1px; }
.ag-dd-bt { font:inherit; font-size:13px; font-weight:600; white-space:nowrap; padding:7px 13px; border-radius:999px; cursor:pointer;
  border:1px solid var(--line,#DED7CA); background:var(--panel,#fff); color:var(--ink,#10203A); }
.ag-dd-bt.forte { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
.ag-dd-vazio { font-size:13.5px; color:var(--ink-3,#66717F); padding:6px 0; }
.ag-dd-mais { font:inherit; font-size:13px; font-weight:600; color:var(--signal,#1A4893); background:none; border:0; cursor:pointer; padding:8px 0 0; }

.ag-duas { display:grid; grid-template-columns:1fr 1fr; gap:0 12px; }
/* os grupos que aparecem e somem na janela de marcar têm o mesmo espaço do resto */
.u-corpo [data-so] { display:flex; flex-direction:column; gap:15px; }
.u-corpo [data-so][hidden], .u-corpo [data-cand][hidden] { display:none; }
.ag-link { font:inherit; font-size:13px; font-weight:500; background:none; border:0; padding:6px 2px; cursor:pointer; color:var(--signal,#1A4893); }
.ag-link.perigo { color:#8E2233; }
.ag-dias { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 14px; }
.ag-dias label { cursor:pointer; }
.ag-dias input { position:absolute; opacity:0; pointer-events:none; }
.ag-dias span { display:inline-block; min-width:44px; text-align:center; font-size:13px; font-weight:500; padding:8px 10px; border-radius:999px;
  border:1px solid var(--line,#DED7CA); background:var(--panel,#fff); color:var(--ink-2,#54606F); }
.ag-dias input:checked + span { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
.ag-dias input:focus-visible + span { outline:2px solid var(--signal,#1A4893); outline-offset:2px; }
.ag-conta { font-size:13.5px; color:var(--ink,#10203A); background:var(--signal-suave,#EAF1F8); border-radius:10px; padding:10px 12px; margin:-4px 0 14px; }

@media (max-width:1100px) {
  .ag-semana { grid-template-columns:repeat(4,minmax(0,1fr)); }
}
@media (max-width:700px) {
  .ag-pl { grid-template-columns:1fr auto; }
  .ag-pl-bt { grid-row:1; grid-column:2; }
  .ag-pl-barra { grid-column:1 / -1; }
  .ag-pl-txt { grid-column:1 / -1 !important; }
  .ag-vistas { margin-left:0; }
  .ag-mes-sem { padding:8px 2px; text-align:center; font-size:10.5px; letter-spacing:.03em; }
  .ag-cel { min-height:62px; padding:4px 3px 6px; align-items:center; gap:2px; }
  .ag-cel-n { width:24px; height:24px; font-size:12.5px; }
  .ag-ch { font-size:0; height:5px; width:80%; padding:0; border-radius:3px; }
  .ag-ch.feito, .ag-ch.dinheiro { background:var(--c, #1F7A6E); }
  .ag-ch.auto { box-shadow:none; background:var(--line,#DED7CA); }
  .ag-cel-mais { display:none; }
  .ag-semana { grid-template-columns:1fr; }
  .ag-dia { min-height:0; }
}`;

  let cssPosto = false;
  function porCss() {
    if (cssPosto) return;
    cssPosto = true;
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── datas e horas ───────────────────────────────────────────────────── */

  const iso = (a, m0, d) => new Date(Date.UTC(a, m0, d)).toISOString().slice(0, 10);
  const partes = s => s.split("-").map(Number);
  function somar(s, n) { const p = partes(s); return iso(p[0], p[1] - 1, p[2] + n); }
  function dsem(s) { const p = partes(s); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
  const segunda = s => somar(s, -((dsem(s) + 6) % 7));
  const minutos = h => { if (!h) return null; const p = h.split(":").map(Number); return p[0] * 60 + (p[1] || 0); };
  /* Hora do relógio: "16h", "16h30". */
  const relogio = h => { const m = minutos(h); return m === null ? "" : Math.floor(m / 60) + "h" + (m % 60 ? String(m % 60).padStart(2, "0") : ""); };
  /* Quantidade de horas, por extenso, para não confundir com a hora do
     relógio: "5 horas", "1 hora e meia", "2 horas e 20 min". */
  function horas(h) {
    const m = Math.round((+h || 0) * 60);
    const H = Math.floor(m / 60), M = m % 60;
    if (!H) return M + " min";
    const base = H + (H === 1 ? " hora" : " horas");
    return M === 0 ? base : M === 30 ? base + " e meia" : base + " e " + M + " min";
  }
  const diaMes = s => { const p = partes(s); return p[2] + " de " + MESES[p[1] - 1]; };
  const diaLongo = s => { const n = DSEM_LONGO[dsem(s)]; return n[0].toUpperCase() + n.slice(1) + ", " + diaMes(s); };
  function tituloDaSemana(de, ate, estaSemana) {
    const a = partes(de), b = partes(ate);
    const faixa = a[1] === b[1] ? a[2] + " a " + b[2] + " de " + MESES[b[1] - 1] : diaMes(de) + " a " + diaMes(ate);
    return (estaSemana ? "Esta semana, " : "") + faixa;
  }

  /* ── horas planejadas ────────────────────────────────────────────────── */

  /* As horas planejadas de um trabalho num dia, ou null. Horas marcadas só
     para aquele dia mandam; sem elas, vale o plano da semana, da semana em
     que foi feito em diante. Só para trabalho ativo. */
  function planoDoDia(t, data, itens) {
    if (!t || t.estado !== "ativo") return null;
    const doDia = (itens || []).find(it => it.tipo === "trabalho" && it.trabalhoId === t.id && it.data === data);
    if (doDia) return +doDia.horas > 0 ? { horas: +doDia.horas, avulso: true } : null;
    const p = t.plano;
    if (!p || !(+p.horas > 0) || !Array.isArray(p.dias) || !p.dias.length) return null;
    if (p.desde && data < p.desde) return null;
    if (p.dias.indexOf(dsem(data)) < 0) return null;
    return { horas: Math.round(+p.horas / p.dias.length * 4) / 4 };   // de 15 em 15 minutos
  }

  const feitasNoDia = (t, data, registros) => registros
    .filter(r => r.trabalhoId === t.id && r.data === data).reduce((s, r) => s + (+r.horas || 0), 0);

  /* ── quando cai o dinheiro ───────────────────────────────────────────── */

  function diasDeReceber(trabalhos, de, ate) {
    const out = [];
    for (const t of trabalhos) {
      const n = parseInt(t.diasAtePagar, 10);
      if (t.estado !== "ativo" || !(n >= 0)) continue;
      const dia = UI.diaDoPeriodo(t);
      let p = UI.periodoDe(somar(de, -n), dia);
      for (let k = 0; k < 4; k++) {
        const quando = somar(p.ate, n);
        if (quando > ate) break;
        if (quando >= de) out.push({ data: quando, trabalho: t, periodo: p });
        p = UI.periodoVizinho(p, dia, 1);
      }
    }
    return out;
  }

  /* Quanto deve cair: o que foi lançado no período, na moeda do trabalho
     (a mesma conta do resto do Meu Controle, UI.resumo). */
  const VALORES = {};
  const chaveValor = (t, periodo, registros) => {
    const hoje = Dados.hoje();
    return t.id + "|" + periodo.de + "|" + (periodo.ate < hoje ? periodo.ate : hoje) + "|" + registros.length;
  };
  async function calcularValor(t, periodo, registros) {
    const chave = chaveValor(t, periodo, registros);
    if (VALORES[chave]) return;
    const hoje = Dados.hoje();
    const r = await UI.resumo({ trabalhos: [t], registros: registros.filter(x => x.trabalhoId === t.id), pagamentos: [],
      de: periodo.de, ate: periodo.ate < hoje ? periodo.ate : hoje });
    const moeda = t.moeda || "BRL";
    const v = (r.previstoPorMoeda && r.previstoPorMoeda[moeda]) || 0;
    VALORES[chave] = { valor: v ? Dados.escreverDinheiro(v, moeda) : "", parcial: periodo.ate >= hoje };
  }
  const valorDe = (t, periodo, registros) => VALORES[chaveValor(t, periodo, registros)] || null;
  const textoValor = v => !v || !v.valor ? "" : "cerca de " + v.valor + (v.parcial ? " até agora" : "");

  function proximoDiaDeReceber(t) {
    const hoje = Dados.hoje();
    return diasDeReceber([t], hoje, somar(hoje, 70))[0] || null;
  }

  async function prepararValores(trabalhos, registros, de, ate) {
    const lista = diasDeReceber(trabalhos, de, ate);
    trabalhos.forEach(t => { const p = proximoDiaDeReceber(t); if (p) lista.push(p); });
    try { await Promise.all(lista.map(a => calcularValor(a.trabalho, a.periodo, registros))); }
    catch (e) { console.warn("Agenda: não deu para calcular o valor previsto", e); }
  }

  /* ── o que cai em cada dia ───────────────────────────────────────────── */

  function doDia(ctx, itens, data) {
    const hoje = Dados.hoje();
    const out = [];
    for (const t of ctx.trabalhos) {
      const pl = planoDoDia(t, data, itens);
      const feitas = feitasNoDia(t, data, ctx.registros);
      if (!pl && !feitas) continue;
      out.push({ tipo: "trabalho", trabalho: t, plano: pl ? pl.horas : 0, feitas, cor: t.cor || "#2C6BB5", futuro: data > hoje, hoje: data === hoje });
    }
    itens.filter(it => it.data === data && it.tipo !== "trabalho")
      .sort((a, b) => ((a.inicio || "") > (b.inicio || "") ? 1 : -1))
      .forEach(it => out.push({ tipo: "compromisso", item: it, cor: (TIPOS[it.tipo] || TIPOS.outro).cor }));
    for (const a of ctx.aplicacoes) {
      if (a.proximo && a.proximoEm === data && VIVOS.indexOf(a.estado) >= 0) out.push({ tipo: "passo", aplicacao: a });
    }
    for (const t of ctx.trabalhos) {
      if (t.estado === "ativo" && UI.periodoDe(data, UI.diaDoPeriodo(t)).ate === data) out.push({ tipo: "periodo", trabalho: t });
    }
    diasDeReceber(ctx.trabalhos, data, data).forEach(r =>
      out.push({ tipo: "receber", trabalho: r.trabalho, valor: valorDe(r.trabalho, r.periodo, ctx.registros) }));
    return out;
  }

  /* "5 horas planejadas", "2 horas de 5 horas", "✓ 3 horas feitas". */
  function situacao(x) {
    if (!x.plano) return { texto: "✓ " + horas(x.feitas) + " feitas", feito: true };
    if (x.futuro) return { texto: horas(x.plano) + " planejadas", feito: false };
    if (x.feitas >= x.plano) return { texto: "✓ " + horas(x.feitas) + " feitas", feito: true };
    if (x.feitas) return { texto: horas(x.feitas) + " de " + horas(x.plano), feito: false };
    return { texto: horas(x.plano) + " planejadas", feito: false };
  }

  function nomeDoCompromisso(it, aplicacoes) {
    const a = it.aplicacaoId && aplicacoes.find(x => x.id === it.aplicacaoId);
    const tipo = (TIPOS[it.tipo] || TIPOS.outro).nome + (a && a.empresa ? " · " + a.empresa : "");
    return it.titulo ? { titulo: it.titulo, sub: tipo, aplicacao: a } : { titulo: tipo, sub: "", aplicacao: a };
  }

  /* ── estado da tela ──────────────────────────────────────────────────── */

  let CTX = null, CAIXA = null, ITENS = [];
  let vista = "mes";   // "mes" ou "semana"
  let ref = null;      // um dia dentro do mês ou da semana na tela

  async function montar(alvo, contexto) {
    porCss();
    CTX = contexto; CAIXA = alvo;
    if (!ref) ref = Dados.hoje();
    ITENS = await Dados.listar("agenda");
    await desenhar();
  }

  function intervalo() {
    if (vista === "semana") { const de = segunda(ref); return { de, ate: somar(de, 6) }; }
    const p = partes(ref);
    return { de: segunda(iso(p[0], p[1] - 1, 1)), ate: somar(segunda(iso(p[0], p[1], 0)), 6) };
  }

  /* ── desenho ─────────────────────────────────────────────────────────── */

  async function desenhar() {
    const i = intervalo();
    const hoje = Dados.hoje();
    await prepararValores(CTX.trabalhos, CTX.registros, i.de, i.ate);
    const p = partes(ref);
    const titulo = vista === "mes"
      ? MESES[p[1] - 1][0].toUpperCase() + MESES[p[1] - 1].slice(1) + " de " + p[0]
      : tituloDaSemana(i.de, i.ate, segunda(hoje) === i.de);
    const naTela = vista === "mes" ? ref.slice(0, 7) === hoje.slice(0, 7) : segunda(hoje) === i.de;

    CAIXA.innerHTML = `
      <div class="ct-cab-tela">
        <div><h1>Agenda</h1><p>As horas de cada trabalho, os seus compromissos e os dias de receber.</p></div>
        <div class="ct-cab-bts"><button class="ct-b forte" type="button" data-marcar>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Marcar</button></div>
      </div>
      ${htmlPlano()}
      <div class="ag-barra">
        <button class="ag-seta" type="button" data-ir="-1" aria-label="Anterior">‹</button>
        <button class="ag-seta" type="button" data-ir="1" aria-label="Próximo">›</button>
        ${naTela ? "" : `<button class="ag-esta" type="button" data-esta>${vista === "mes" ? "Este mês" : "Esta semana"}</button>`}
        <h2>${esc(titulo)}</h2>
        <div class="ag-vistas" role="tablist">
          <button type="button" role="tab" data-vista="mes" aria-selected="${vista === "mes"}">Mês</button>
          <button type="button" role="tab" data-vista="semana" aria-selected="${vista === "semana"}">Semana</button>
        </div>
      </div>
      ${vista === "mes" ? htmlMes(i) : htmlSemana(i)}
      <p class="ag-dicas">Clique num dia para ver tudo dele, lançar horas ou marcar um compromisso.</p>`;

    ligar();
  }

  /* Uma linha por trabalho ativo: o plano desta semana e o próximo pagamento. */
  function htmlPlano() {
    const ativos = CTX.trabalhos.filter(t => t.estado === "ativo");
    if (!ativos.length) return "";
    const hoje = Dados.hoje();
    const de = segunda(hoje), ate = somar(de, 6);
    const linhas = ativos.map(t => {
      const cor = esc(t.cor || "#2C6BB5");
      const nome = esc(t.projeto || t.empresa);
      const receber = proximoDiaDeReceber(t);
      const valor = receber ? textoValor(valorDe(t, receber.periodo, CTX.registros)) : "";
      const pe = receber
        ? `Próximo pagamento: ${esc(diaMes(receber.data))}${valor ? ", " + esc(valor) : ""}.`
        : `O período fecha em ${esc(diaMes(UI.periodoDe(hoje, UI.diaDoPeriodo(t)).ate))}.`;
      let meta = 0, feitas = 0;
      const restam = [];
      for (let d = de; d <= ate; d = somar(d, 1)) {
        const pl = planoDoDia(t, d, ITENS);
        if (pl) { meta += pl.horas; if (d >= hoje) restam.push(d); }
        feitas += feitasNoDia(t, d, CTX.registros);
      }
      if (!meta) {
        return `<div class="ag-pl">
          <span class="ag-pl-nome"><i style="background:${cor}"></i><span>${nome}</span></span>
          <span class="ag-pl-txt" style="grid-column:2 / 4">Sem horas planejadas nesta semana.<small>${pe}</small></span>
          <button type="button" class="ag-pl-bt" data-plano="${esc(t.id)}">Planejar</button>
        </div>`;
      }
      const falta = Math.max(0, meta - feitas);
      let detalhe;
      if (falta <= 0) detalhe = "Plano da semana cumprido.";
      else if (!restam.length) detalhe = "Faltaram " + horas(falta) + ".";
      else if (restam.length === 1) detalhe = "Faltam " + horas(falta) + (restam[0] === hoje ? ", para hoje." : ", para " + DSEM_LONGO[dsem(restam[0])] + ".");
      else detalhe = "Faltam " + horas(falta) + ": " + horas(Math.ceil(falta / restam.length * 4) / 4) + " por dia até " + DSEM_LONGO[dsem(restam[restam.length - 1])] + ".";
      return `<div class="ag-pl">
        <span class="ag-pl-nome"><i style="background:${cor}"></i><span>${nome}</span></span>
        <span class="ag-pl-barra"><i style="width:${Math.min(100, Math.round(feitas / meta * 100))}%;background:${cor}"></i></span>
        <span class="ag-pl-txt"><b>${esc(horas(feitas))}</b> feitas de ${esc(horas(meta))} · ${esc(detalhe)}<small>${pe}</small></span>
        <button type="button" class="ag-pl-bt" data-plano="${esc(t.id)}">Ajustar</button>
      </div>`;
    }).join("");
    return `<div class="ct-cartao ag-plano">
      <div class="ct-cab-cartao"><h2>Plano desta semana</h2><p>quantas horas você quer fazer em cada trabalho</p></div>
      ${linhas}
    </div>`;
  }

  /* Uma linha curta de cada coisa do dia, para caber no quadrinho do mês. */
  function chips(x) {
    if (x.tipo === "trabalho") {
      const s = situacao(x);
      const texto = (s.feito ? "✓ " + horas(x.feitas) : horas(x.feitas && !x.futuro ? x.feitas : x.plano) + (x.feitas && !x.futuro ? " de " + horas(x.plano) : "")) + " · " + (x.trabalho.projeto || x.trabalho.empresa);
      return `<span class="ag-ch${s.feito ? " feito" : ""}" style="--c:${esc(x.cor)}">${esc(texto)}</span>`;
    }
    if (x.tipo === "compromisso") {
      const n = nomeDoCompromisso(x.item, CTX.aplicacoes);
      return `<span class="ag-ch" style="--c:${esc(x.cor)}">${esc((x.item.inicio ? "às " + relogio(x.item.inicio) + " · " : "") + n.titulo)}</span>`;
    }
    if (x.tipo === "receber") return `<span class="ag-ch dinheiro" style="--c:#1F7A6E">${esc("Receber" + (x.valor && x.valor.valor ? " ~" + x.valor.valor : "") + " · " + (x.trabalho.projeto || x.trabalho.empresa))}</span>`;
    if (x.tipo === "periodo") return `<span class="ag-ch auto">${esc("Fecha o período · " + (x.trabalho.projeto || x.trabalho.empresa))}</span>`;
    return `<span class="ag-ch auto">${esc(x.aplicacao.proximo)}</span>`;
  }

  function htmlMes(i) {
    const hoje = Dados.hoje(), mes = ref.slice(0, 7);
    let html = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="ag-mes-sem">${d}</div>`).join("");
    for (let d = i.de; d <= i.ate; d = somar(d, 1)) {
      const lista = doDia(CTX, ITENS, d);
      const mostrar = lista.slice(0, 3).map(chips).join("");
      const resto = lista.length - 3;
      html += `<button type="button" class="ag-cel${d.slice(0, 7) !== mes ? " fora" : ""}${d === hoje ? " hoje" : ""}" data-dia="${d}"
        aria-label="${esc(diaLongo(d))}${lista.length ? ", " + lista.length + (lista.length === 1 ? " item" : " itens") : ""}">
        <span class="ag-cel-n">${partes(d)[2]}</span>${mostrar}${resto > 0 ? `<span class="ag-cel-mais">+${resto} mais</span>` : ""}
      </button>`;
    }
    return `<div class="ag-mes">${html}</div>`;
  }

  function htmlSemana(i) {
    const hoje = Dados.hoje();
    let html = "";
    for (let d = i.de; d <= i.ate; d = somar(d, 1)) {
      const corpo = doDia(CTX, ITENS, d).map(x => {
        if (x.tipo === "trabalho") {
          const s = situacao(x);
          return `<span class="ag-it${s.feito ? " feito" : ""}" style="--c:${esc(x.cor)}"><b>${esc(x.trabalho.projeto || x.trabalho.empresa)}</b><span>${esc(s.texto)}</span></span>`;
        }
        if (x.tipo === "compromisso") {
          const n = nomeDoCompromisso(x.item, CTX.aplicacoes);
          const pequeno = [x.item.inicio ? "às " + relogio(x.item.inicio) : "", n.sub].filter(Boolean).join(" · ");
          return `<span class="ag-it" style="--c:${esc(x.cor)}">${pequeno ? `<small>${esc(pequeno)}</small>` : ""}<b>${esc(n.titulo)}</b></span>`;
        }
        if (x.tipo === "receber") return `<span class="ag-it dinheiro"><small>dia de receber</small><b>${esc(x.trabalho.projeto || x.trabalho.empresa)}</b>${textoValor(x.valor) ? `<span>${esc(textoValor(x.valor))}</span>` : ""}</span>`;
        if (x.tipo === "periodo") return `<span class="ag-it auto"><small>fecha o período</small><b>${esc(x.trabalho.projeto || x.trabalho.empresa)}</b></span>`;
        return `<span class="ag-it auto"><small>próximo passo</small><b>${esc(x.aplicacao.proximo)}</b></span>`;
      }).join("");
      html += `<button type="button" class="ag-dia${d === hoje ? " hoje" : d < hoje ? " passou" : ""}" data-dia="${d}">
        <span class="ag-dia-cab"><span>${DSEM[dsem(d)]}</span><b>${partes(d)[2]}</b>${d === hoje ? "<em>hoje</em>" : ""}</span>
        ${corpo}
      </button>`;
    }
    return `<div class="ag-semana">${html}</div>`;
  }

  /* ── cliques ─────────────────────────────────────────────────────────── */

  function ligar() {
    CAIXA.querySelectorAll("[data-ir]").forEach(b => b.addEventListener("click", () => {
      const n = +b.dataset.ir;
      if (vista === "semana") ref = somar(ref, 7 * n);
      else { const p = partes(ref); ref = iso(p[0], p[1] - 1 + n, 1); }
      desenhar();
    }));
    const esta = CAIXA.querySelector("[data-esta]");
    if (esta) esta.addEventListener("click", () => { ref = Dados.hoje(); desenhar(); });
    CAIXA.querySelectorAll("[data-vista]").forEach(b => b.addEventListener("click", () => { vista = b.dataset.vista; desenhar(); }));
    CAIXA.querySelector("[data-marcar]").addEventListener("click", () => abrir(null, { data: Dados.hoje() }));
    CAIXA.querySelectorAll("[data-plano]").forEach(b => b.addEventListener("click", () => {
      const t = CTX.trabalhos.find(x => x.id === b.dataset.plano);
      if (t) abrirPlano(t);
    }));
    CAIXA.querySelectorAll("[data-dia]").forEach(b => b.addEventListener("click", () => abrirDia(b.dataset.dia)));
  }

  async function depois() {
    if (CTX.aoMudar) await CTX.aoMudar();
    else { ITENS = await Dados.listar("agenda"); await desenhar(); }
  }

  /* Fecha a janela aberta e abre outra logo em seguida. */
  function trocar(dlg, abrirOutra) { try { dlg.close(); } catch (e) {} dlg.remove(); setTimeout(abrirOutra, 60); }

  /* ── o resumo de um dia ──────────────────────────────────────────────── */

  function abrirDia(d) {
    const hoje = Dados.hoje();
    const lista = doDia(CTX, ITENS, d);
    const trabs = lista.filter(x => x.tipo === "trabalho");
    const comps = lista.filter(x => x.tipo === "compromisso");
    const outros = lista.filter(x => ["passo", "periodo", "receber"].indexOf(x.tipo) >= 0);
    const semNoDia = CTX.trabalhos.filter(t => t.estado === "ativo" && !trabs.some(x => x.trabalho.id === t.id));

    const linhaTrab = (x, k) => {
      const s = situacao(x);
      const acao = d <= hoje ? (x.feitas ? "Editar o dia" : "Lançar horas") : "Mudar as horas";
      return `<div class="ag-dd"><i style="background:${esc(x.cor)}"></i>
        <span class="ag-dd-txt"><b>${esc(x.trabalho.projeto || x.trabalho.empresa)}</b><span>${esc(s.texto)}</span></span>
        <button type="button" class="ag-dd-bt${d <= hoje && !x.feitas ? " forte" : ""}" data-trab="${k}">${acao}</button></div>`;
    };
    const linhaComp = (x, k) => {
      const n = nomeDoCompromisso(x.item, CTX.aplicacoes);
      const quando = x.item.inicio ? "às " + relogio(x.item.inicio) + (x.item.fim ? " até " + relogio(x.item.fim) : "") : "o dia todo";
      return `<div class="ag-dd"><i style="background:${esc(x.cor)}"></i>
        <span class="ag-dd-txt"><b>${esc(n.titulo)}</b><span>${esc([quando, n.sub].filter(Boolean).join(" · "))}${x.item.nota ? " · " + esc(x.item.nota) : ""}</span></span>
        <button type="button" class="ag-dd-bt" data-comp="${k}">Abrir</button></div>`;
    };
    const linhaOutro = (x, k) => {
      if (x.tipo === "receber") return `<div class="ag-dd"><i style="background:#1F7A6E"></i>
        <span class="ag-dd-txt"><b>Dia de receber · ${esc(x.trabalho.projeto || x.trabalho.empresa)}</b><span>${esc(textoValor(x.valor) || "previsão pelo plano do trabalho")}</span></span></div>`;
      if (x.tipo === "periodo") return `<div class="ag-dd"><i style="background:#9AA3AE"></i>
        <span class="ag-dd-txt"><b>Fecha o período · ${esc(x.trabalho.projeto || x.trabalho.empresa)}</b><span>Bom dia para conferir as horas lançadas.</span></span></div>`;
      return `<div class="ag-dd"><i style="background:#9AA3AE"></i>
        <span class="ag-dd-txt"><b>${esc(x.aplicacao.proximo)}</b><span>Próximo passo · ${esc(x.aplicacao.empresa || "")}</span></span>
        <button type="button" class="ag-dd-bt" data-passo="${k}">Abrir</button></div>`;
    };

    const corpo = `
      <div class="ag-dd-sec"><h3>Trabalho</h3>
        ${trabs.length ? trabs.map(linhaTrab).join("") : `<div class="ag-dd-vazio">Nenhuma hora planejada ou lançada.</div>`}
        ${semNoDia.length ? `<button type="button" class="ag-dd-mais" data-outro>+ ${d <= hoje ? "Lançar horas" : "Planejar horas"} de ${semNoDia.length === 1 ? esc(semNoDia[0].projeto || semNoDia[0].empresa) : "outro trabalho"}</button>` : ""}
      </div>
      <div class="ag-dd-sec"><h3>Compromissos</h3>
        ${comps.length ? comps.map(linhaComp).join("") : `<div class="ag-dd-vazio">Nada marcado.</div>`}
      </div>
      ${outros.length ? `<div class="ag-dd-sec"><h3>Também neste dia</h3>${outros.map(linhaOutro).join("")}</div>` : ""}`;

    const dlg = UI.painel({
      titulo: diaLongo(d), subtitulo: d === hoje ? "hoje" : "",
      corpo, acaoTexto: "Marcar compromisso", cancelarTexto: "Fechar",
      acao: () => { setTimeout(() => abrir(null, { data: d, tipo: "entrevista" }), 60); return true; },
    });

    dlg.querySelectorAll("[data-trab]").forEach(b => b.addEventListener("click", () => {
      const x = trabs[+b.dataset.trab];
      if (d <= hoje) return trocar(dlg, () => UI.abrirRegistroDia(x.trabalho, { data: d, horas: x.feitas ? undefined : x.plano || undefined, aoSalvar: depois }));
      trocar(dlg, () => abrir(null, { data: d, tipo: "trabalho", trabalhoId: x.trabalho.id, horas: x.plano }));
    }));
    dlg.querySelectorAll("[data-comp]").forEach(b => b.addEventListener("click", () => trocar(dlg, () => abrir(comps[+b.dataset.comp].item))));
    dlg.querySelectorAll("[data-passo]").forEach(b => b.addEventListener("click", () => {
      const x = outros[+b.dataset.passo];
      if (CTX.abrirAplicacao) trocar(dlg, () => CTX.abrirAplicacao(x.aplicacao));
    }));
    const outro = dlg.querySelector("[data-outro]");
    if (outro) outro.addEventListener("click", () => trocar(dlg, () =>
      abrir(null, { data: d, tipo: "trabalho", trabalhoId: semNoDia.length === 1 ? semNoDia[0].id : "" })));
  }

  /* ── marcar: horas de trabalho ou compromisso ────────────────────────── */

  function abrir(it, novo) {
    const hoje = Dados.hoje();
    const ehNovo = !it;
    const ativos = CTX.trabalhos.filter(t => t.estado === "ativo");
    it = it || Object.assign({ tipo: ativos.length ? "trabalho" : "entrevista", titulo: "", data: hoje, inicio: "", fim: "",
      nota: "", aplicacaoId: "", trabalhoId: ativos.length === 1 ? ativos[0].id : "", horas: "" }, novo || {});
    const cands = CTX.aplicacoes.filter(a => VIVOS.indexOf(a.estado) >= 0 || a.id === it.aplicacaoId);
    const tipos = (ativos.length ? [{ valor: "trabalho", nome: "Horas de trabalho" }] : [])
      .concat(Object.keys(TIPOS).map(k => ({ valor: k, nome: TIPOS[k].nome })));

    const corpo = `
      ${ehNovo ? UI.campo({ nome: "tipo", rotulo: "O que você quer marcar", tipo: "escolha", valor: it.tipo, opcoes: tipos }) : `<input type="hidden" name="tipo" value="${esc(it.tipo)}">`}
      ${UI.campo({ nome: "data", rotulo: "Dia", tipo: "date", valor: it.data, obrigatorio: true })}
      <div data-so="trabalho">
        ${ativos.length ? UI.campo({ nome: "trabalhoId", rotulo: "Trabalho", tipo: "escolha", valor: it.trabalhoId || "",
          opcoes: [{ valor: "", nome: "Escolha o trabalho" }].concat(ativos.map(t => ({ valor: t.id, nome: t.projeto || t.empresa }))) }) : ""}
        ${UI.campo({ nome: "horas", rotulo: "Quantas horas", valor: it.horas ? Dados.escreverHoras(+it.horas) : "", dica: "3h, 2h30, 4",
          ajuda: "<span data-explica></span>" })}
      </div>
      <div data-so="compromisso">
        <div data-cand>${cands.length ? UI.campo({ nome: "aplicacaoId", rotulo: "De qual candidatura (opcional)", tipo: "escolha", valor: it.aplicacaoId || "",
          opcoes: [{ valor: "", nome: "Nenhuma" }].concat(cands.map(a => ({ valor: a.id, nome: (a.empresa || "?") + " · " + (a.titulo || "vaga") }))) }) : ""}</div>
        ${UI.campo({ nome: "titulo", rotulo: "Título (opcional)", valor: it.titulo })}
        <div class="ag-duas">
          ${UI.campo({ nome: "inicio", rotulo: "Horário (opcional)", tipo: "time", valor: it.inicio, passo: 900 })}
          ${UI.campo({ nome: "fim", rotulo: "Até (opcional)", tipo: "time", valor: it.fim, passo: 900 })}
        </div>
        ${UI.campo({ nome: "nota", rotulo: "Anotação", tipo: "texto-longo", valor: it.nota, dica: "Link da chamada, o que levar, o que estudar" })}
      </div>`;

    const avulso = it.tipo === "trabalho" && ITENS.find(x => x.tipo === "trabalho" && x.trabalhoId === it.trabalhoId && x.data === it.data);
    const dlg = UI.painel({
      titulo: ehNovo ? "Marcar na agenda" : (it.tipo === "trabalho" ? "Horas planejadas" : "Compromisso"),
      corpo,
      extra: !ehNovo && it.id ? `<button type="button" class="ag-link perigo" data-apagar>Apagar</button>`
        : (it.tipo === "trabalho" && it.data > hoje && (avulso || it.horas)) ? `<div style="display:flex;flex-wrap:wrap;gap:4px 12px">${
          avulso ? `<button type="button" class="ag-link" data-voltar>Voltar ao plano da semana</button>` : ""}
          <button type="button" class="ag-link perigo" data-folga>Não trabalhar neste dia</button></div>` : "",
      acaoTexto: "Salvar",
      acao: async (d) => {
        const tipo = UI.ler(d, "tipo"), data = UI.ler(d, "data");
        if (!data) throw new Error("Escolha o dia.");
        if (tipo === "trabalho") {
          const t = ativos.find(x => x.id === UI.ler(d, "trabalhoId"));
          if (!t) throw new Error("Escolha o trabalho.");
          const h = Dados.lerHoras(UI.ler(d, "horas"));
          if (h === null || !(h > 0)) throw new Error("Diga quantas horas. Aceita 3h, 2h30 ou 4.");
          // dia que já chegou: as horas vão para o registro do dia, que abre preenchido
          if (data <= hoje) { setTimeout(() => UI.abrirRegistroDia(t, { data, horas: h, aoSalvar: depois }), 60); return true; }
          const ja = ITENS.find(x => x.tipo === "trabalho" && x.trabalhoId === t.id && x.data === data);
          await Dados.salvar("agenda", Object.assign({}, ja || {}, { tipo: "trabalho", trabalhoId: t.id, data, horas: h }));
          UI.aviso(horas(h) + " planejadas para " + diaMes(data) + ".", "ok");
        } else {
          const dado = {
            tipo, titulo: UI.ler(d, "titulo"), data,
            inicio: UI.ler(d, "inicio"), fim: UI.ler(d, "inicio") ? UI.ler(d, "fim") : "",
            aplicacaoId: ["entrevista", "teste", "prazo"].indexOf(tipo) >= 0 ? UI.ler(d, "aplicacaoId") : "",
            nota: UI.ler(d, "nota"),
          };
          if (dado.inicio && dado.fim && minutos(dado.fim) <= minutos(dado.inicio)) throw new Error("O fim precisa ser depois do começo.");
          await Dados.salvar("agenda", Object.assign({}, ehNovo ? {} : it, dado));
          UI.aviso(ehNovo ? "Marcado na agenda." : "Compromisso salvo.", "ok");
        }
        ref = data;
        await depois();
      },
    });

    const botao = dlg.querySelector("[data-ok]");
    const mostrar = () => {
      const tipo = UI.ler(dlg, "tipo"), data = UI.ler(dlg, "data");
      const ehTrab = tipo === "trabalho";
      dlg.querySelector('[data-so="trabalho"]').hidden = !ehTrab;
      dlg.querySelector('[data-so="compromisso"]').hidden = ehTrab;
      const cand = dlg.querySelector("[data-cand]");
      if (cand) cand.hidden = ["entrevista", "teste", "prazo"].indexOf(tipo) < 0;
      const explica = dlg.querySelector("[data-explica]");
      if (explica) explica.textContent = !data ? "" : data <= hoje
        ? "Este dia já chegou: as horas vão para o registro do dia, que abre em seguida para você conferir."
        : "Horas planejadas só para este dia. Elas trocam o plano da semana neste dia.";
      botao.textContent = ehTrab && data && data <= hoje ? "Continuar para lançar" : "Salvar";
    };
    ["tipo", "data"].forEach(n => { const el = dlg.querySelector(`[name="${n}"]`); if (el) { el.addEventListener("change", mostrar); el.addEventListener("input", mostrar); } });
    mostrar();

    const apagar = dlg.querySelector("[data-apagar]");
    if (apagar) apagar.addEventListener("click", async () => {
      const ok = await UI.confirmar({ titulo: it.tipo === "trabalho" ? "Voltar ao plano da semana neste dia?" : "Apagar este compromisso?",
        texto: it.tipo === "trabalho" ? "As horas marcadas só para este dia saem, e volta a valer o plano da semana." : "Não dá para desfazer.",
        acaoTexto: "Apagar", perigo: true });
      if (!ok) return;
      await Dados.remover("agenda", it.id);
      UI.aviso("Apagado da agenda.", "ok");
      await depois();
    });
    const voltar = dlg.querySelector("[data-voltar]");
    if (voltar) voltar.addEventListener("click", async () => {
      await Dados.remover("agenda", avulso.id);
      dlg.close(); dlg.remove();
      UI.aviso("Voltou o plano da semana em " + diaMes(it.data) + ".", "ok");
      await depois();
    });
    const folga = dlg.querySelector("[data-folga]");
    if (folga) folga.addEventListener("click", async () => {
      await Dados.salvar("agenda", Object.assign({}, avulso || {}, { tipo: "trabalho", trabalhoId: it.trabalhoId, data: it.data, horas: 0 }));
      dlg.close(); dlg.remove();
      UI.aviso("Sem trabalho em " + diaMes(it.data) + ".", "ok");
      await depois();
    });
  }

  /* ── janela do plano da semana de um trabalho ────────────────────────── */

  function abrirPlano(t) {
    const p = t.plano || {};
    const dias = Array.isArray(p.dias) && p.dias.length ? p.dias : [1, 2, 3, 4, 5];
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const corpo = `
      ${UI.campo({ nome: "horas", rotulo: "Quantas horas você quer fazer por semana", tipo: "number", valor: p.horas || "", dica: "15", min: 0, passo: 0.5 })}
      <div class="d-linha"><span class="d-rot">Em quais dias</span>
        <div class="ag-dias">${ordem.map(d => `<label><input type="checkbox" name="dia${d}"${dias.indexOf(d) >= 0 ? " checked" : ""}><span>${DSEM[d]}</span></label>`).join("")}</div>
      </div>
      <div class="ag-conta" data-conta></div>
      ${UI.campo({ nome: "diasAtePagar", rotulo: "O pagamento cai quantos dias depois que o período fecha (opcional)", tipo: "number",
        valor: t.diasAtePagar === 0 || t.diasAtePagar ? t.diasAtePagar : "", dica: "15", min: 0, passo: 1,
        ajuda: "Com isso, a agenda mostra o dia de receber e quanto deve cair, pelas horas que você lançou. Deixe vazio se não sabe." })}`;

    const dlg = UI.painel({
      titulo: "Plano da semana",
      subtitulo: t.projeto || t.empresa,
      corpo,
      extra: t.plano ? `<button type="button" class="ag-link perigo" data-tirar>Tirar o plano</button>` : "",
      acaoTexto: "Salvar o plano",
      acao: async (d) => {
        const h = parseFloat(String(UI.ler(d, "horas")).replace(",", "."));
        const escolhidos = ordem.filter(x => UI.ler(d, "dia" + x));
        const pagar = UI.ler(d, "diasAtePagar");
        if (!(h > 0)) throw new Error("Diga quantas horas por semana.");
        if (h > 112) throw new Error("Confira as horas: passa de 16 por dia.");
        if (!escolhidos.length) throw new Error("Escolha pelo menos um dia.");
        const plano = { horas: h, dias: escolhidos, desde: (t.plano && t.plano.desde) || segunda(Dados.hoje()) };
        const n = parseInt(pagar, 10);
        await Dados.salvar("trabalhos", Object.assign({}, t, { plano, diasAtePagar: pagar === "" || !(n >= 0) ? "" : n }));
        UI.aviso("Plano salvo.", "ok");
        await depois();
      },
    });

    const conta = () => {
      const h = parseFloat(String(UI.ler(dlg, "horas")).replace(",", "."));
      const n = ordem.filter(x => UI.ler(dlg, "dia" + x)).length;
      dlg.querySelector("[data-conta]").textContent = h > 0 && n
        ? "Dá " + horas(Math.round(h / n * 4) / 4) + " em cada dia escolhido."
        : "Escolha as horas e os dias para ver quanto dá por dia.";
    };
    dlg.querySelectorAll('[name="horas"], .ag-dias input').forEach(el => el.addEventListener("input", conta));
    dlg.querySelectorAll(".ag-dias input").forEach(el => el.addEventListener("change", conta));
    conta();

    const tirar = dlg.querySelector("[data-tirar]");
    if (tirar) tirar.addEventListener("click", async () => {
      const ok = await UI.confirmar({ titulo: "Tirar o plano deste trabalho?", texto: "As horas planejadas somem da agenda. As horas lançadas continuam.",
        acaoTexto: "Tirar o plano", perigo: true });
      if (!ok) return;
      const copia = Object.assign({}, t); delete copia.plano;
      await Dados.salvar("trabalhos", copia);
      await depois();
    });
  }

  /* ── para a tela Hoje ────────────────────────────────────────────────── */

  /* Os compromissos de um dia, prontos para listar: o que a pessoa marcou,
     o fim de período e o dia de receber. As horas de trabalho e o próximo
     passo das candidaturas a tela Hoje já mostra do jeito dela. */
  function compromissos(ctx, itens, data) {
    return doDia(ctx, itens, data).filter(x => x.tipo === "compromisso" || x.tipo === "periodo" || x.tipo === "receber").map(x => {
      if (x.tipo === "compromisso") {
        const n = nomeDoCompromisso(x.item, ctx.aplicacoes);
        return { hora: x.item.inicio ? relogio(x.item.inicio) + (x.item.fim ? " – " + relogio(x.item.fim) : "") : "dia todo",
          cor: x.cor, titulo: n.titulo, sub: n.sub || x.item.nota || "", aplicacao: n.aplicacao || null };
      }
      if (x.tipo === "periodo") return { hora: "dia todo", cor: "#54606F", titulo: "Fecha o período · " + (x.trabalho.projeto || x.trabalho.empresa), sub: "", trabalho: x.trabalho };
      return { hora: "dia todo", cor: "#1F7A6E", titulo: "Dia de receber · " + (x.trabalho.projeto || x.trabalho.empresa), sub: textoValor(x.valor), trabalho: x.trabalho };
    });
  }

  /* Calcula o valor do dia de receber de hoje e de amanhã antes da tela Hoje desenhar. */
  async function prepararParaHoje(ctx) {
    const hoje = Dados.hoje();
    const lista = diasDeReceber(ctx.trabalhos, hoje, somar(hoje, 1));
    try { await Promise.all(lista.map(a => calcularValor(a.trabalho, a.periodo, ctx.registros))); } catch (e) { /* sem valor, segue */ }
  }

  /* Quantos compromissos a pessoa marcou para hoje (o número do menu). */
  function quantosHoje(itens) {
    const h = Dados.hoje();
    return (itens || []).filter(it => it.data === h && it.tipo !== "trabalho").length;
  }

  return { montar, quantosHoje, planoDoDia, compromissos, prepararParaHoje, somar, horas };
})();
