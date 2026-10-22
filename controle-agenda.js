/* ══════════════════════════════════════════════════════════════════════════
   controle-agenda.js — a Agenda do Meu Controle

   Para a pessoa se planejar: quantas horas vai dar para cada trabalho em
   cada dia, e quando são as entrevistas, os testes e os prazos. É uma agenda
   própria, dentro do Meu Controle, e não fala com Google nem com nada de fora.

   O que ela mostra:
   - o plano da semana de cada trabalho: a pessoa diz uma vez quantas horas
     quer fazer por semana, em quais dias e a partir de que horas, e a agenda
     monta os blocos sozinha e vai dizendo quanto falta. Um bloco de dia que
     já chegou abre o registro do dia já preenchido com as horas;
   - o que a pessoa marcou (coleção "agenda"): entrevista, teste, prazo,
     estudo ou outro, com ou sem horário, e que pode se repetir toda semana
     ou de segunda a sexta;
   - o que já está no Meu Controle, sem a pessoa marcar de novo: as horas
     lançadas em cada dia, o próximo passo das candidaturas, o dia em que
     fecha o período de cada trabalho e, se a pessoa disse quantos dias
     depois o pagamento cai, o dia previsto e o valor pelas horas lançadas.

   O plano fica dentro do próprio trabalho:
     trabalho.plano = { horas, dias: [0-6, 0 = domingo], inicio, desde }
     trabalho.diasAtePagar = dias entre o fim do período e o pagamento
   Um item da agenda:
     { tipo, titulo, data, inicio, fim, aplicacaoId, nota,
       repetir: "" | "semana" | "uteis", repetirAte, pular: [datas] }
   Sem inicio, é do dia inteiro.

   A tela Hoje usa planoDoDia() e compromissos() para mostrar o dia.

   O CSS mora aqui dentro, pela regra das peças compartilhadas.
   ══════════════════════════════════════════════════════════════════════════ */

const Agenda = (function () {
  "use strict";

  const esc = s => UI.esc(s);

  // trabalho só aparece pelo plano da semana; os outros a pessoa marca à mão
  const TIPOS = {
    trabalho:   { nome: "Horas de trabalho", cor: null },
    entrevista: { nome: "Entrevista",        cor: "#5B4B9E" },
    teste:      { nome: "Teste",             cor: "#1A4893" },
    prazo:      { nome: "Prazo",             cor: "#A85D24" },
    estudo:     { nome: "Estudo",            cor: "#1F7A6E" },
    outro:      { nome: "Outro",             cor: "#66717F" },
  };
  const REPETIR = [
    { valor: "",      nome: "Não repete" },
    { valor: "semana", nome: "Toda semana, neste dia" },
    { valor: "uteis",  nome: "De segunda a sexta" },
  ];
  const DSEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const DSEM_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                        "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const HORA_PX = 44;          // altura de uma hora na semana
  const VIVOS = ["aplicado", "teste", "entrevista", "banco"];

  /* ── estilo ──────────────────────────────────────────────────────────── */

  const CSS = `
.ag-barra { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
.ag-nav { display:flex; align-items:center; gap:6px; }
.ag-nav h2 { font-family:var(--body,'Geist',sans-serif); font-size:17px; font-weight:600; color:var(--ink,#10203A); margin:0 0 0 8px; }
.ag-seta { width:34px; height:34px; border-radius:50%; border:1px solid var(--line,#DED7CA); background:var(--panel,#fff);
  font:inherit; font-size:17px; line-height:1; color:var(--ink-2,#54606F); cursor:pointer; display:grid; place-items:center; }
.ag-seta:hover { border-color:var(--ink-3,#66717F); }
.ag-hoje { font:inherit; font-size:13.5px; font-weight:500; padding:8px 14px; border-radius:999px; cursor:pointer;
  border:1px solid var(--line,#DED7CA); background:var(--panel,#fff); color:var(--ink,#10203A); }
.ag-vistas { display:inline-flex; padding:3px; border-radius:999px; background:var(--bg-soft,#F1ECE3); border:1px solid var(--line-soft,#EAE4D9); }
.ag-vistas button { font:inherit; font-size:13px; font-weight:500; padding:7px 14px; border:0; border-radius:999px;
  background:transparent; color:var(--ink-2,#54606F); cursor:pointer; }
.ag-vistas button[aria-selected="true"] { background:var(--panel,#fff); color:var(--ink,#10203A); box-shadow:0 1px 3px rgba(16,32,58,.12); }

.ag-planos-cab { display:flex; align-items:baseline; gap:10px; margin:0 0 10px; }
.ag-planos-cab h2 { font-family:var(--body,'Geist',sans-serif); font-size:15px; font-weight:600; color:var(--ink,#10203A); margin:0; }
.ag-planos-cab p { font-size:12.5px; color:var(--ink-3,#66717F); margin:0; }
.ag-planos { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; margin-bottom:20px; }
.ag-plano { background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9); border-radius:16px; padding:15px 16px 14px;
  display:flex; flex-direction:column; gap:8px; min-width:0; }
.ag-plano-nome { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; color:var(--ink,#10203A); }
.ag-plano-nome i { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.ag-plano-nome span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-plano-nome button { font:inherit; font-size:12.5px; font-weight:600; color:var(--signal,#1A4893); background:none; border:0; cursor:pointer; padding:2px 0; }
.ag-plano-num { font-size:22px; font-weight:600; color:var(--ink,#10203A); letter-spacing:-.01em; line-height:1.1; }
.ag-plano-num small { font-size:13px; font-weight:500; color:var(--ink-3,#66717F); }
.ag-plano-barra { height:7px; border-radius:99px; background:var(--bg-soft,#F1ECE3); overflow:hidden; }
.ag-plano-barra i { display:block; height:100%; border-radius:99px; }
.ag-plano-txt { font-size:13px; line-height:1.5; color:var(--ink-2,#54606F); }
.ag-plano-dias { font-size:12px; color:var(--ink-3,#66717F); }
.ag-plano-pg { display:flex; align-items:center; gap:7px; margin-top:2px; padding-top:9px; border-top:1px solid var(--line-soft,#EAE4D9);
  font-size:12.5px; color:var(--ink-2,#54606F); }
.ag-plano-pg b { color:#1F7A6E; font-weight:600; }
.ag-plano.vazio { border-style:dashed; background:transparent; }
.ag-plano.vazio .ct-b { align-self:flex-start; }
.ag-dias { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 14px; }
.ag-dias label { cursor:pointer; }
.ag-dias input { position:absolute; opacity:0; pointer-events:none; }
.ag-dias span { display:inline-block; min-width:44px; text-align:center; font-size:13px; font-weight:500; padding:8px 10px; border-radius:999px;
  border:1px solid var(--line,#DED7CA); background:var(--panel,#fff); color:var(--ink-2,#54606F); }
.ag-dias input:checked + span { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
.ag-dias input:focus-visible + span { outline:2px solid var(--signal,#1A4893); outline-offset:2px; }
.ag-conta { font-size:13px; color:var(--ink-2,#54606F); background:var(--bg,#F7F4EF); border-radius:10px; padding:10px 12px; margin:-4px 0 14px; }

.ag-cal { padding:0 !important; overflow:hidden; }
.ag-rolar-x { overflow-x:auto; }
.ag-semana { min-width:720px; }
.ag-cab { display:grid; grid-template-columns:54px repeat(7,minmax(0,1fr)); border-bottom:1px solid var(--line-soft,#EAE4D9); background:var(--bg,#F7F4EF); }
.ag-cab-dia { padding:10px 8px 8px; text-align:center; border-left:1px solid var(--line-soft,#EAE4D9); cursor:pointer; }
.ag-cab-dia small { display:block; font-size:11px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--ink-3,#66717F); }
.ag-cab-dia b { display:inline-grid; place-items:center; width:30px; height:30px; margin-top:3px; border-radius:50%; font-size:16px; font-weight:600; color:var(--ink,#10203A); }
.ag-cab-dia.hoje b { background:var(--signal,#1A4893); color:#fff; }
.ag-todo { display:grid; grid-template-columns:54px repeat(7,minmax(0,1fr)); border-bottom:1px solid var(--line,#DED7CA); min-height:34px; }
.ag-todo-rot { font-size:10.5px; color:var(--ink-3,#66717F); padding:8px 6px 0; text-align:right; }
.ag-todo-dia { border-left:1px solid var(--line-soft,#EAE4D9); padding:4px; display:flex; flex-direction:column; gap:3px; min-width:0; }
.ag-chip { display:block; width:100%; text-align:left; font:inherit; font-size:11.5px; line-height:1.3; font-weight:500;
  padding:3px 7px; border-radius:6px; border:0; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  background:color-mix(in srgb, var(--c) 14%, #fff); color:color-mix(in srgb, var(--c) 82%, #000); }
.ag-chip.feito { background:var(--c); color:#fff; }
.ag-chip.auto { background:transparent; box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, #fff); }
.ag-mais { font-size:11.5px; color:var(--signal,#1A4893); font-weight:600; background:none; border:0; padding:1px 7px; cursor:pointer; text-align:left; font-family:inherit; }

.ag-corpo { position:relative; max-height:560px; overflow-y:auto; }
.ag-grade { display:grid; grid-template-columns:54px repeat(7,minmax(0,1fr)); position:relative; }
.ag-horas { position:relative; }
.ag-hora { height:${HORA_PX}px; font-size:10.5px; color:var(--ink-3,#66717F); text-align:right; padding-right:7px; transform:translateY(-7px); }
.ag-col { position:relative; border-left:1px solid var(--line-soft,#EAE4D9); cursor:copy;
  background-image:linear-gradient(var(--line-soft,#EAE4D9) 1px, transparent 1px); background-size:100% ${HORA_PX}px; }
.ag-col.hoje { background-color:rgba(26,72,147,.035); }
.ag-ev { position:absolute; box-sizing:border-box; border:0; text-align:left; font:inherit; cursor:pointer; overflow:hidden;
  border-radius:8px; padding:4px 7px; border-left:3px solid var(--c);
  background:color-mix(in srgb, var(--c) 15%, #fff); color:color-mix(in srgb, var(--c) 85%, #000); }
.ag-ev:hover { box-shadow:0 6px 16px -8px rgba(16,32,58,.45); z-index:3; }
.ag-ev b { display:block; font-size:12px; font-weight:600; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-ev span { display:block; font-size:11px; line-height:1.3; opacity:.85; }
.ag-ev .ag-st { display:inline-block; margin-top:3px; font-size:10.5px; font-weight:600; border-radius:999px; padding:0 7px; opacity:1;
  background:#fff; color:color-mix(in srgb, var(--c) 85%, #000); }
.ag-ev.feito { background:var(--c); color:#fff; }
.ag-ev.feito .ag-st { color:var(--c); }
.ag-agora { position:absolute; left:0; right:0; height:2px; background:#D93B3B; z-index:4; pointer-events:none; }
.ag-agora::before { content:""; position:absolute; left:-5px; top:-4px; width:10px; height:10px; border-radius:50%; background:#D93B3B; }

.ag-mes { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
.ag-mes-dsem { font-size:11px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--ink-3,#66717F);
  padding:9px 8px; background:var(--bg,#F7F4EF); border-bottom:1px solid var(--line-soft,#EAE4D9); }
.ag-mes-dia { min-height:104px; padding:5px; border-bottom:1px solid var(--line-soft,#EAE4D9); border-left:1px solid var(--line-soft,#EAE4D9);
  display:flex; flex-direction:column; gap:3px; min-width:0; cursor:copy; }
.ag-mes-dia:nth-child(7n+1) { border-left:0; }
.ag-mes-dia.fora { background:#FBF9F5; }
.ag-mes-dia.fora .ag-mes-n { color:#B4BAC2; }
.ag-mes-n { align-self:flex-start; font:inherit; font-size:12.5px; font-weight:600; color:var(--ink-2,#54606F); width:26px; height:26px;
  border-radius:50%; border:0; background:none; cursor:pointer; }
.ag-mes-dia.hoje .ag-mes-n { background:var(--signal,#1A4893); color:#fff; }

.ag-lista { padding:6px 20px 14px; }
.ag-lista-dia { padding:12px 0 6px; border-top:1px solid var(--line-soft,#EAE4D9); }
.ag-lista-dia:first-child { border-top:0; }
.ag-lista-dia h3 { font-size:13px !important; font-weight:600; color:var(--ink-3,#66717F) !important; margin:0 0 6px !important; }
.ag-lista-dia.hoje h3 { color:var(--signal,#1A4893) !important; }
.ag-li { display:flex; align-items:center; gap:12px; width:100%; padding:9px 8px; border:0; border-radius:10px; background:none;
  font:inherit; color:inherit; text-align:left; cursor:pointer; }
.ag-li:hover { background:var(--bg-soft,#F1ECE3); }
.ag-li-hora { width:88px; flex-shrink:0; font-size:12.5px; color:var(--ink-2,#54606F); font-variant-numeric:tabular-nums; white-space:nowrap; }
.ag-li i { width:10px; height:10px; border-radius:3px; flex-shrink:0; background:var(--c); }
.ag-li-txt { flex:1; min-width:0; }
.ag-li-txt b { display:block; font-size:14px; font-weight:600; color:var(--ink,#10203A); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ag-li-txt span { display:block; font-size:12.5px; color:var(--ink-3,#66717F); }
.ag-li-st { font-size:11.5px; font-weight:600; border-radius:999px; padding:2px 9px; white-space:nowrap;
  background:color-mix(in srgb, var(--c) 14%, #fff); color:color-mix(in srgb, var(--c) 85%, #000); }
.ag-vazio { padding:34px 20px; text-align:center; color:var(--ink-3,#66717F); font-size:14px; }
.ag-vazio .ct-b { margin-top:12px; }

.ag-dicas { font-size:12.5px; color:var(--ink-3,#66717F); margin-top:10px; }
.ag-chk { display:flex; align-items:center; gap:8px; font-size:14px; color:var(--ink,#10203A); margin:-2px 0 12px; cursor:pointer; }
.ag-chk input { width:16px; height:16px; accent-color:var(--signal,#1A4893); }
.ag-duas { display:grid; grid-template-columns:1fr 1fr; gap:0 12px; }
.ag-acoes-extra { display:flex; flex-wrap:wrap; gap:8px; }
.ag-link { font:inherit; font-size:13px; font-weight:500; background:none; border:0; padding:6px 2px; cursor:pointer; color:var(--signal,#1A4893); }
.ag-link.perigo { color:#8E2233; }
.ag-lancar { font:inherit; font-size:13px; font-weight:600; border-radius:999px; padding:8px 14px; cursor:pointer;
  border:1px solid #C6E5DE; background:#E4F3F0; color:#1F7A6E; }
@media (max-width:700px) {
  .ag-nav h2 { font-size:15px; width:100%; margin:6px 0 0; }
  .ag-nav { flex-wrap:wrap; }
  .ag-lista { padding:4px 12px 12px; }
  .ag-li { gap:10px; padding:9px 4px; }
  .ag-li-hora { width:78px; font-size:12px; }
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
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const horaCurta = h => { const m = minutos(h); return m === null ? "" : (m % 60 ? hhmm(m).replace(":", "h") : Math.floor(m / 60) + "h"); };
  function duracao(it) {
    if (it._plano) return it.horas || 0;
    const a = minutos(it.inicio), b = minutos(it.fim);
    return a !== null && b !== null && b > a ? (b - a) / 60 : 0;
  }
  const diaCurto = s => { const p = partes(s); return p[2] + " " + MESES[p[1] - 1]; };
  const diaLongo = s => DSEM_LONGO[dsem(s)] + ", " + partes(s)[2] + " de " + MESES_LONGOS[partes(s)[1] - 1];
  const faixa = it => it.inicio ? horaCurta(it.inicio) + (it.fim ? " – " + horaCurta(it.fim) : "")
    : (it._plano ? Dados.escreverHoras(it.horas) : "dia todo");

  /* ── o que cai em cada dia ───────────────────────────────────────────── */

  /* Cada item da agenda vira uma ocorrência por dia em que acontece. */
  function ocorrencias(itens, de, ate) {
    const out = [];
    for (const it of itens || []) {
      if (!it || !it.data) continue;
      if (!it.repetir) { if (it.data >= de && it.data <= ate) out.push({ item: it, data: it.data }); continue; }
      const fim = it.repetirAte && it.repetirAte < ate ? it.repetirAte : ate;
      const pular = it.pular || [];
      for (let d = it.data > de ? it.data : de; d <= fim; d = somar(d, 1)) {
        const w = dsem(d);
        if (it.repetir === "semana" && w !== dsem(it.data)) continue;
        if (it.repetir === "uteis" && (w === 0 || w === 6)) continue;
        if (pular.indexOf(d) >= 0) continue;
        out.push({ item: it, data: d });
      }
    }
    return out;
  }

  /* ── plano da semana ─────────────────────────────────────────────────── */

  /* As horas que o plano do trabalho pede num dia, ou null. Vale da semana
     em que o plano foi feito em diante, e só para trabalho ativo. */
  function planoDoDia(t, data) {
    const p = t && t.plano;
    if (!p || !(+p.horas > 0) || !Array.isArray(p.dias) || !p.dias.length || t.estado !== "ativo") return null;
    if (p.desde && data < p.desde) return null;
    if (p.dias.indexOf(dsem(data)) < 0) return null;
    const horas = Math.round(+p.horas / p.dias.length * 4) / 4;    // de 15 em 15 minutos
    const ini = minutos(p.inicio);
    if (ini === null) return { horas, inicio: "", fim: "" };
    return { horas, inicio: hhmm(ini), fim: hhmm(Math.min(ini + Math.round(horas * 60), 23 * 60 + 59)) };
  }

  /* Os blocos do plano no intervalo, no mesmo formato das ocorrências. */
  function ocorrenciasDoPlano(trabalhos, de, ate) {
    const out = [];
    for (const t of trabalhos) {
      for (let d = de; d <= ate; d = somar(d, 1)) {
        const p = planoDoDia(t, d);
        if (p) out.push({ item: { tipo: "trabalho", _plano: true, trabalhoId: t.id, horas: p.horas, inicio: p.inicio, fim: p.fim }, data: d });
      }
    }
    return out;
  }

  /* A semana do plano: quanto já foi lançado, quanto falta e em quantos dias. */
  function contaDaSemana(t, registros, hoje) {
    const de = segunda(hoje), ate = somar(de, 6);
    const feitas = registros.filter(r => r.trabalhoId === t.id && r.data >= de && r.data <= ate)
      .reduce((s, r) => s + (+r.horas || 0), 0);
    const meta = t.plano ? +t.plano.horas || 0 : 0;
    const falta = Math.max(0, meta - feitas);
    let dias = 0;
    for (let d = hoje; d <= ate; d = somar(d, 1)) if (planoDoDia(t, d)) dias++;
    return { feitas, meta, falta, dias, ultimo: ate };
  }

  /* ── quando cai o dinheiro ───────────────────────────────────────────── */

  /* Os pagamentos previstos que caem no intervalo: o fim de cada período mais
     os dias que a pessoa disse que a empresa leva para pagar. */
  function pagamentosPrevistos(trabalhos, de, ate) {
    const out = [];
    for (const t of trabalhos) {
      const n = parseInt(t.diasAtePagar, 10);
      if (t.estado !== "ativo" || !(n >= 0)) continue;
      const dia = UI.diaDoPeriodo(t);
      let p = UI.periodoDe(somar(de, -n), dia);
      for (let k = 0; k < 4; k++) {
        const quando = somar(p.ate, n);
        if (quando > ate) break;
        if (quando >= de) out.push({ auto: "pagamento", data: quando, cor: "#1F7A6E", trabalho: t, periodo: p,
          texto: "Pagamento previsto · " + (t.projeto || t.empresa) });
        p = UI.periodoVizinho(p, dia, 1);
      }
    }
    return out;
  }

  /* Quanto deve cair: o que foi lançado no período, na moeda do trabalho.
     A conta é a mesma do resto do Meu Controle (UI.resumo). */
  const VALORES = {};
  async function valorDoPeriodo(t, periodo, registros) {
    const hoje = Dados.hoje();
    const ate = periodo.ate < hoje ? periodo.ate : hoje;
    const chave = t.id + "|" + periodo.de + "|" + ate + "|" + registros.length;
    if (VALORES[chave]) return VALORES[chave];
    const r = await UI.resumo({ trabalhos: [t], registros: registros.filter(x => x.trabalhoId === t.id), pagamentos: [], de: periodo.de, ate });
    const moeda = t.moeda || "BRL";
    const v = (r.previstoPorMoeda && r.previstoPorMoeda[moeda]) || 0;
    VALORES[chave] = { texto: v ? "~" + Dados.escreverDinheiro(v, moeda) : "", parcial: periodo.ate >= hoje };
    return VALORES[chave];
  }

  /* O que já está no Meu Controle e aparece na agenda sem ser marcado. */
  function automaticos(ctx, de, ate) {
    const out = [];
    // horas lançadas: uma marca por trabalho e dia
    for (const r of ctx.registros) {
      if (r.data < de || r.data > ate || !(+r.horas > 0)) continue;
      const t = ctx.trabalhos.find(x => x.id === r.trabalhoId);
      if (!t) continue;
      out.push({ auto: "lancado", data: r.data, cor: t.cor || "#2C6BB5", trabalho: t, horas: +r.horas,
        texto: "✓ " + Dados.escreverHoras(+r.horas) + " · " + (t.projeto || t.empresa) });
    }
    // próximo passo das candidaturas
    for (const a of ctx.aplicacoes) {
      if (!a.proximo || !a.proximoEm || a.proximoEm < de || a.proximoEm > ate || VIVOS.indexOf(a.estado) < 0) continue;
      const cor = a.estado === "entrevista" ? TIPOS.entrevista.cor : a.estado === "teste" ? TIPOS.teste.cor : "#54606F";
      out.push({ auto: "passo", data: a.proximoEm, cor, aplicacao: a, texto: a.proximo + (a.empresa ? " · " + a.empresa : "") });
    }
    // dia em que fecha o período de cada trabalho ativo
    for (const t of ctx.trabalhos) {
      if (t.estado !== "ativo") continue;
      const dia = UI.diaDoPeriodo(t);
      let p = UI.periodoDe(de, dia);
      for (let n = 0; n < 4 && p.ate <= ate; n++) {
        if (p.ate >= de) out.push({ auto: "periodo", data: p.ate, cor: "#54606F", trabalho: t,
          texto: "Fecha o período · " + (t.projeto || t.empresa), curto: "Fecha · " + (t.projeto || t.empresa) });
        p = UI.periodoVizinho(p, dia, 1);
      }
    }
    // pagamento previsto, com o valor quando já foi calculado
    for (const a of pagamentosPrevistos(ctx.trabalhos, de, ate)) {
      const ate2 = a.periodo.ate < Dados.hoje() ? a.periodo.ate : Dados.hoje();
      const v = VALORES[a.trabalho.id + "|" + a.periodo.de + "|" + ate2 + "|" + ctx.registros.length];
      const nome = a.trabalho.projeto || a.trabalho.empresa;
      if (v && v.texto) {
        a.texto = "Pagamento previsto " + v.texto + (v.parcial ? " até agora" : "") + " · " + nome;
        a.curto = "Recebe " + v.texto + " · " + nome;
      } else a.curto = "Recebe · " + nome;
      out.push(a);
    }
    return out;
  }

  /* Calcula antes de desenhar os valores dos pagamentos que vão aparecer. */
  async function prepararValores(de, ate) {
    const lista = pagamentosPrevistos(CTX.trabalhos, de, ate);
    // e o próximo pagamento de cada trabalho, que aparece no cartão do plano
    for (const t of CTX.trabalhos) { const p = proximoPagamento(t); if (p) lista.push(p); }
    try { await Promise.all(lista.map(a => valorDoPeriodo(a.trabalho, a.periodo, CTX.registros))); }
    catch (e) { console.warn("Agenda: não deu para calcular o valor previsto", e); }
  }

  function proximoPagamento(t) {
    const hoje = Dados.hoje();
    return pagamentosPrevistos([t], hoje, somar(hoje, 70))[0] || null;
  }

  /* ── estado da tela ──────────────────────────────────────────────────── */

  let CTX = null, CAIXA = null, ITENS = [];
  let vista = null;                 // "semana", "mes" ou "lista"
  let ref = null;                   // um dia dentro do que está na tela
  let rolarPara = null;             // onde a semana abre (minutos)

  const estreito = () => window.matchMedia("(max-width:700px)").matches;

  async function montar(alvo, contexto) {
    porCss();
    CTX = contexto; CAIXA = alvo;
    if (!vista) vista = estreito() ? "lista" : "semana";
    if (!ref) ref = Dados.hoje();
    ITENS = await Dados.listar("agenda");
    await desenhar();
  }

  function corDe(oc) {
    const it = oc.item;
    if (it.tipo === "trabalho") {
      const t = CTX.trabalhos.find(x => x.id === it.trabalhoId);
      return (t && t.cor) || "#2C6BB5";
    }
    return (TIPOS[it.tipo] || TIPOS.outro).cor;
  }

  function tituloDe(it) {
    if (it.titulo) return it.titulo;
    if (it.tipo === "trabalho") {
      const t = CTX.trabalhos.find(x => x.id === it.trabalhoId);
      return t ? (t.projeto || t.empresa) : "Horas de trabalho";
    }
    const a = it.aplicacaoId && CTX.aplicacoes.find(x => x.id === it.aplicacaoId);
    return (TIPOS[it.tipo] || TIPOS.outro).nome + (a && a.empresa ? " · " + a.empresa : "");
  }

  /* Horas já lançadas no trabalho do bloco, naquele dia. */
  function lancadas(oc) {
    if (oc.item.tipo !== "trabalho") return 0;
    return CTX.registros.filter(r => r.trabalhoId === oc.item.trabalhoId && r.data === oc.data)
      .reduce((s, r) => s + (+r.horas || 0), 0);
  }

  /* Bloco de trabalho: já lançado, para lançar ou ainda por vir. */
  function situacao(oc) {
    if (oc.item.tipo !== "trabalho") return "";
    if (lancadas(oc) > 0) return "feito";
    return oc.data <= Dados.hoje() ? "lancar" : "";
  }
  function textoSituacao(oc) {
    const st = situacao(oc);
    if (st === "feito") return "✓ lançado: " + Dados.escreverHoras(lancadas(oc));
    return st === "lancar" ? "lançar horas" : "";
  }

  function intervalo() {
    if (vista === "semana") { const de = segunda(ref); return { de, ate: somar(de, 6) }; }
    if (vista === "lista") return { de: ref, ate: somar(ref, 13) };
    // mês: as semanas inteiras que cobrem o mês, de segunda a domingo
    const p = partes(ref);
    return { de: segunda(iso(p[0], p[1] - 1, 1)), ate: somar(segunda(iso(p[0], p[1], 0)), 6) };
  }

  function tituloDoIntervalo(i) {
    const a = partes(i.de), b = partes(i.ate);
    if (vista === "mes") { const p = partes(ref); return MESES_LONGOS[p[1] - 1][0].toUpperCase() + MESES_LONGOS[p[1] - 1].slice(1) + " de " + p[0]; }
    const ano = " de " + b[0];
    if (a[1] === b[1]) return a[2] + " a " + b[2] + " de " + MESES_LONGOS[b[1] - 1] + ano;
    return diaCurto(i.de) + " a " + diaCurto(i.ate) + ano;
  }

  /* ── desenho ─────────────────────────────────────────────────────────── */

  async function desenhar() {
    const i = intervalo();
    await prepararValores(i.de, i.ate);
    const ocs = ocorrencias(ITENS, i.de, i.ate).concat(ocorrenciasDoPlano(CTX.trabalhos, i.de, i.ate));
    // horas lançadas num dia que já tem bloco planejado do mesmo trabalho
    // aparecem no próprio bloco, e não de novo como marca à parte
    const autos = automaticos(CTX, i.de, i.ate).filter(a => !(a.auto === "lancado" &&
      ocs.some(o => o.item.tipo === "trabalho" && o.item.trabalhoId === a.trabalho.id && o.data === a.data)));

    CAIXA.innerHTML = `
      <div class="ct-cab-tela">
        <div><h1>Agenda</h1><p>O plano de horas de cada trabalho, as entrevistas, os testes, os prazos e os dias de receber.</p></div>
        <div class="ct-cab-bts"><button class="ct-b forte" type="button" data-novo>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Marcar compromisso</button></div>
      </div>
      ${htmlPlanos()}
      <div class="ag-barra">
        <div class="ag-nav">
          <button class="ag-seta" type="button" data-ir="-1" aria-label="Anterior">‹</button>
          <button class="ag-seta" type="button" data-ir="1" aria-label="Próximo">›</button>
          <button class="ag-hoje" type="button" data-hoje>Hoje</button>
          <h2>${esc(tituloDoIntervalo(i))}</h2>
        </div>
        <div class="ag-vistas" role="tablist">
          ${[["semana", "Semana"], ["mes", "Mês"], ["lista", "Lista"]].map(v =>
            `<button type="button" role="tab" data-vista="${v[0]}" aria-selected="${vista === v[0]}">${v[1]}</button>`).join("")}
        </div>
      </div>
      <div class="ct-cartao ag-cal">
        ${vista === "semana" ? htmlSemana(i, ocs, autos) : vista === "mes" ? htmlMes(i, ocs, autos) : htmlLista(i, ocs, autos)}
      </div>
      <p class="ag-dicas">${vista === "lista" ? "Os próximos 14 dias." :
        "Clique num espaço vazio para marcar um compromisso ali. Os blocos de trabalho vêm do plano da semana; o que tem contorno vem do resto do Meu Controle."}</p>`;

    ligar(ocs, autos);

    if (vista === "semana") {
      const corpo = CAIXA.querySelector(".ag-corpo");
      const primeiro = ocs.filter(o => o.item.inicio).map(o => minutos(o.item.inicio)).sort((a, b) => a - b)[0];
      const alvo = rolarPara !== null ? rolarPara : Math.min(7 * 60, primeiro === undefined ? 7 * 60 : primeiro);
      corpo.scrollTop = Math.max(0, alvo / 60 * HORA_PX - 8);
      rolarPara = null;
    }
  }

  /* Um cartão por trabalho ativo: o plano desta semana, quanto falta e o
     próximo pagamento. Trabalho sem plano mostra o convite para planejar. */
  function htmlPlanos() {
    const ativos = CTX.trabalhos.filter(t => t.estado === "ativo");
    if (!ativos.length) return "";
    const hoje = Dados.hoje();
    const cartoes = ativos.map(t => {
      const cor = esc(t.cor || "#2C6BB5");
      const nome = esc(t.projeto || t.empresa);
      const pg = proximoPagamento(t);
      let linhaPg = "";
      if (pg) {
        const ate2 = pg.periodo.ate < hoje ? pg.periodo.ate : hoje;
        const v = VALORES[t.id + "|" + pg.periodo.de + "|" + ate2 + "|" + CTX.registros.length];
        linhaPg = `<div class="ag-plano-pg">Próximo pagamento: <b>${esc(diaCurto(pg.data))}</b>${
          v && v.texto ? ` · ${esc(v.texto)}${v.parcial ? " até agora" : ""}` : ""}</div>`;
      } else {
        const p = UI.periodoDe(hoje, UI.diaDoPeriodo(t));
        linhaPg = `<div class="ag-plano-pg">O período fecha em ${esc(diaCurto(p.ate))}.
          <button type="button" class="ag-link" data-plano="${esc(t.id)}" style="padding:0">Quando cai o pagamento?</button></div>`;
      }
      if (!t.plano || !(+t.plano.horas > 0)) {
        return `<div class="ag-plano vazio">
          <div class="ag-plano-nome"><i style="background:${cor}"></i><span>${nome}</span></div>
          <div class="ag-plano-txt">Diga quantas horas quer fazer por semana e em quais dias. A agenda monta a semana para você.</div>
          <button type="button" class="ct-b pequeno" data-plano="${esc(t.id)}">Planejar a semana</button>
          ${linhaPg}
        </div>`;
      }
      const c = contaDaSemana(t, CTX.registros, hoje);
      const pct = Math.min(100, Math.round(c.feitas / c.meta * 100));
      const fim = DSEM_LONGO[dsem(c.ultimo)].toLowerCase();
      let txt;
      if (c.falta <= 0) txt = "Plano da semana cumprido.";
      else if (c.dias === 0) txt = "Faltam " + Dados.escreverHoras(c.falta) + ", e os dias do plano desta semana já passaram.";
      else if (c.dias === 1) {
        let d = hoje; while (!planoDoDia(t, d)) d = somar(d, 1);
        txt = "Faltam " + Dados.escreverHoras(c.falta) + ", e o último dia do plano é " + (d === hoje ? "hoje." : DSEM_LONGO[dsem(d)].toLowerCase() + ".");
      }
      else txt = "Faltam " + Dados.escreverHoras(c.falta) + ": dá " + Dados.escreverHoras(Math.ceil(c.falta / c.dias * 4) / 4) + " por dia em " + c.dias + " dias.";
      const dias = t.plano.dias.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DSEM[d]).join(", ");
      return `<div class="ag-plano">
        <div class="ag-plano-nome"><i style="background:${cor}"></i><span>${nome}</span><button type="button" data-plano="${esc(t.id)}">Ajustar</button></div>
        <div class="ag-plano-num">${esc(Dados.escreverHoras(c.feitas) || "0h")} <small>de ${esc(Dados.escreverHoras(c.meta))} nesta semana</small></div>
        <div class="ag-plano-barra"><i style="width:${pct}%;background:${cor}"></i></div>
        <div class="ag-plano-txt">${esc(txt)}</div>
        <div class="ag-plano-dias">${esc(dias)}${t.plano.inicio ? " · a partir das " + esc(horaCurta(t.plano.inicio)) : ""}</div>
        ${linhaPg}
      </div>`;
    }).join("");
    return `<div class="ag-planos-cab"><h2>Plano desta semana</h2><p>de segunda a domingo</p></div>
      <div class="ag-planos">${cartoes}</div>`;
  }

  function chipItem(oc, idx) {
    const st = situacao(oc), it = oc.item;
    const texto = it._plano && !it.inicio
      ? Dados.escreverHoras(it.horas) + " · " + tituloDe(it)
      : (it.inicio ? horaCurta(it.inicio) + " " : "") + tituloDe(it);
    return `<button type="button" class="ag-chip${st === "feito" ? " feito" : ""}" style="--c:${esc(corDe(oc))}" data-oc="${idx}">${esc(texto)}</button>`;
  }
  function chipAuto(a, idx) {
    return `<button type="button" class="ag-chip auto" style="--c:${esc(a.cor)}" data-auto="${idx}" title="${esc(a.texto)}">${esc(a.curto || a.texto)}</button>`;
  }

  function htmlSemana(i, ocs, autos) {
    const dias = [0, 1, 2, 3, 4, 5, 6].map(n => somar(i.de, n));
    const hoje = Dados.hoje();
    const cab = dias.map(d => `<div class="ag-cab-dia${d === hoje ? " hoje" : ""}" data-dia="${d}">
      <small>${DSEM[dsem(d)]}</small><b>${partes(d)[2]}</b></div>`).join("");

    const todo = dias.map(d => {
      const chips = autos.map((a, k) => a.data === d ? chipAuto(a, k) : "").join("") +
        ocs.map((o, k) => (o.data === d && !o.item.inicio) ? chipItem(o, k) : "").join("");
      return `<div class="ag-todo-dia" data-dia="${d}">${chips}</div>`;
    }).join("");

    const horas = Array.from({ length: 24 }, (_, h) => `<div class="ag-hora">${h ? h + "h" : ""}</div>`).join("");
    const colunas = dias.map(d => {
      const doDia = ocs.map((o, k) => ({ o, k })).filter(x => x.o.data === d && x.o.item.inicio)
        .map(x => {
          const ini = minutos(x.o.item.inicio);
          let fim = minutos(x.o.item.fim);
          if (fim === null || fim <= ini) fim = ini + 60;
          return Object.assign(x, { ini, fim });
        });
      arrumar(doDia);
      const evs = doDia.map(x => {
        const st = situacao(x.o);
        const top = x.ini / 60 * HORA_PX, alt = Math.max(22, (x.fim - x.ini) / 60 * HORA_PX - 2);
        const larg = 100 / x.ncol;
        const curto = alt < 40;
        return `<button type="button" class="ag-ev${st === "feito" ? " feito" : ""}" data-oc="${x.k}"
          style="--c:${esc(corDe(x.o))};top:${top}px;height:${alt}px;left:calc(${x.col * larg}% + 2px);width:calc(${larg}% - 5px);">
          <b>${esc(tituloDe(x.o.item))}</b>
          ${curto ? "" : `<span>${esc(hhmm(x.ini))} – ${esc(hhmm(x.fim))}</span>`}
          ${!curto && st ? `<span class="ag-st">${esc(textoSituacao(x.o))}</span>` : ""}
        </button>`;
      }).join("");
      let agora = "";
      if (d === hoje) {
        const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
        agora = `<div class="ag-agora" style="top:${m / 60 * HORA_PX}px"></div>`;
      }
      return `<div class="ag-col${d === hoje ? " hoje" : ""}" data-dia="${d}" style="height:${24 * HORA_PX}px">${evs}${agora}</div>`;
    }).join("");

    return `<div class="ag-rolar-x"><div class="ag-semana">
      <div class="ag-cab"><div></div>${cab}</div>
      <div class="ag-todo"><div class="ag-todo-rot">dia todo</div>${todo}</div>
      <div class="ag-corpo"><div class="ag-grade"><div class="ag-horas">${horas}</div>${colunas}</div></div>
    </div></div>`;
  }

  /* Eventos que se cruzam no mesmo dia dividem a largura, lado a lado. */
  function arrumar(evs) {
    evs.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
    let grupo = [], fimGrupo = -1;
    const fechar = () => {
      const cols = [];
      grupo.forEach(e => {
        let c = cols.findIndex(f => f <= e.ini);
        if (c < 0) { c = cols.length; cols.push(0); }
        cols[c] = e.fim; e.col = c;
      });
      grupo.forEach(e => { e.ncol = cols.length; });
    };
    evs.forEach(e => {
      if (grupo.length && e.ini >= fimGrupo) { fechar(); grupo = []; fimGrupo = -1; }
      grupo.push(e); fimGrupo = Math.max(fimGrupo, e.fim);
    });
    if (grupo.length) fechar();
  }

  function htmlMes(i, ocs, autos) {
    const hoje = Dados.hoje(), mes = ref.slice(0, 7);
    let html = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="ag-mes-dsem">${d}</div>`).join("");
    for (let d = i.de; d <= i.ate; d = somar(d, 1)) {
      const doDia = ocs.map((o, k) => ({ o, k })).filter(x => x.o.data === d)
        .sort((a, b) => (a.o.item.inicio || "") > (b.o.item.inicio || "") ? 1 : -1);
      const chips = [
        ...doDia.map(x => chipItem(x.o, x.k)),
        ...autos.map((a, k) => a.data === d ? chipAuto(a, k) : "").filter(Boolean),
      ];
      const mostrar = chips.slice(0, 3).join("");
      const resto = chips.length - 3;
      html += `<div class="ag-mes-dia${d.slice(0, 7) !== mes ? " fora" : ""}${d === hoje ? " hoje" : ""}" data-dia="${d}">
        <button type="button" class="ag-mes-n" data-semana="${d}" aria-label="Abrir a semana de ${esc(diaLongo(d))}">${partes(d)[2]}</button>
        ${mostrar}${resto > 0 ? `<button type="button" class="ag-mais" data-semana="${d}">+${resto} mais</button>` : ""}</div>`;
    }
    return `<div class="ag-mes">${html}</div>`;
  }

  function htmlLista(i, ocs, autos) {
    const hoje = Dados.hoje();
    let html = "";
    for (let d = i.de; d <= i.ate; d = somar(d, 1)) {
      const linhas = [
        ...ocs.map((o, k) => ({ o, k })).filter(x => x.o.data === d).map(x => {
          const it = x.o.item, st = situacao(x.o), cor = corDe(x.o);
          const t = it.tipo === "trabalho" && CTX.trabalhos.find(y => y.id === it.trabalhoId);
          const sub = it.tipo === "trabalho" ? (t ? t.empresa + (duracao(it) ? " · " + Dados.escreverHoras(duracao(it)) : "") : "")
            : (TIPOS[it.tipo] || TIPOS.outro).nome;
          return { ordem: it.inicio || "", html: `<button type="button" class="ag-li" style="--c:${esc(cor)}" data-oc="${x.k}">
            <span class="ag-li-hora">${esc(faixa(it))}</span><i></i>
            <span class="ag-li-txt"><b>${esc(tituloDe(it))}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span>
            ${st ? `<span class="ag-li-st">${esc(textoSituacao(x.o))}</span>` : ""}
          </button>` };
        }),
        ...autos.map((a, k) => ({ a, k })).filter(x => x.a.data === d).map(x => ({ ordem: "", html:
          `<button type="button" class="ag-li" style="--c:${esc(x.a.cor)}" data-auto="${x.k}">
            <span class="ag-li-hora">dia todo</span><i style="background:transparent;box-shadow:inset 0 0 0 2px var(--c)"></i>
            <span class="ag-li-txt"><b>${esc(x.a.texto)}</b><span>${x.a.auto === "lancado" ? "Horas lançadas" : x.a.auto === "passo" ? "Próximo passo da candidatura" : "Fim do período do trabalho"}</span></span>
          </button>` })),
      ].sort((a, b) => (a.ordem > b.ordem ? 1 : -1));
      if (!linhas.length) continue;
      html += `<div class="ag-lista-dia${d === hoje ? " hoje" : ""}"><h3>${d === hoje ? "Hoje · " : ""}${esc(diaLongo(d))}</h3>${linhas.map(l => l.html).join("")}</div>`;
    }
    return html ? `<div class="ag-lista">${html}</div>`
      : `<div class="ag-vazio">Nada marcado nos próximos 14 dias.<br><button class="ct-b" type="button" data-novo>Marcar algo</button></div>`;
  }

  /* ── cliques ─────────────────────────────────────────────────────────── */

  function ligar(ocs, autos) {
    CAIXA.querySelectorAll("[data-novo]").forEach(b => b.addEventListener("click", () => abrir(null, { data: vista === "lista" ? Dados.hoje() : ref })));
    CAIXA.querySelectorAll("[data-ir]").forEach(b => b.addEventListener("click", () => {
      const n = +b.dataset.ir;
      if (vista === "semana") ref = somar(ref, 7 * n);
      else if (vista === "lista") ref = somar(ref, 14 * n);
      else { const p = partes(ref); ref = iso(p[0], p[1] - 1 + n, 1); }
      desenhar();
    }));
    CAIXA.querySelector("[data-hoje]").addEventListener("click", () => { ref = Dados.hoje(); desenhar(); });
    CAIXA.querySelectorAll("[data-vista]").forEach(b => b.addEventListener("click", () => {
      vista = b.dataset.vista;
      if (vista === "lista" && ref < Dados.hoje()) ref = Dados.hoje();
      desenhar();
    }));
    CAIXA.querySelectorAll("[data-semana]").forEach(b => b.addEventListener("click", ev => {
      ev.stopPropagation(); ref = b.dataset.semana; vista = "semana"; desenhar();
    }));
    CAIXA.querySelectorAll("[data-oc]").forEach(b => b.addEventListener("click", ev => {
      ev.stopPropagation(); abrir(ocs[+b.dataset.oc]);
    }));
    CAIXA.querySelectorAll("[data-plano]").forEach(b => b.addEventListener("click", () => {
      const t = CTX.trabalhos.find(x => x.id === b.dataset.plano);
      if (t) abrirPlano(t);
    }));
    CAIXA.querySelectorAll("[data-auto]").forEach(b => b.addEventListener("click", ev => {
      ev.stopPropagation();
      const a = autos[+b.dataset.auto];
      if (a.auto === "passo" && CTX.abrirAplicacao) CTX.abrirAplicacao(a.aplicacao);
      else if (a.auto === "lancado") UI.abrirRegistroDia(a.trabalho, { data: a.data, aoSalvar: depois });
      else if (a.trabalho && CTX.irPara) CTX.irPara("trabalho/" + a.trabalho.id);
    }));
    // espaço vazio da semana: marca naquela hora, de meia em meia hora
    CAIXA.querySelectorAll(".ag-col").forEach(col => col.addEventListener("click", ev => {
      if (ev.target !== col) return;
      const y = ev.offsetY;
      const ini = Math.min(23 * 60, Math.floor(y / HORA_PX * 2) * 30);
      rolarPara = Math.max(0, ini - 120);
      abrir(null, { data: col.dataset.dia, inicio: hhmm(ini), fim: hhmm(Math.min(ini + 60, 23 * 60 + 59)) });
    }));
    CAIXA.querySelectorAll(".ag-todo-dia, .ag-mes-dia").forEach(c => c.addEventListener("click", ev => {
      if (ev.target !== c) return;
      abrir(null, { data: c.dataset.dia, diaInteiro: c.classList.contains("ag-todo-dia") });
    }));
    CAIXA.querySelectorAll(".ag-cab-dia").forEach(c => c.addEventListener("click", () =>
      abrir(null, { data: c.dataset.dia })));
  }

  async function depois() {
    if (CTX.aoMudar) await CTX.aoMudar();
    else { ITENS = await Dados.listar("agenda"); desenhar(); }
  }

  /* ── janela de marcar e editar ───────────────────────────────────────── */

  function abrir(oc, novo) {
    // Bloco do plano: dia que já chegou abre o registro do dia, preenchido
    // com as horas do plano; dia que ainda vem abre o plano do trabalho.
    if (oc && oc.item._plano) {
      const t = CTX.trabalhos.find(x => x.id === oc.item.trabalhoId);
      if (!t) return;
      if (oc.data <= Dados.hoje()) return UI.abrirRegistroDia(t, { data: oc.data, horas: oc.item.horas, aoSalvar: depois });
      return abrirPlano(t);
    }
    const it = oc ? oc.item : Object.assign({
      tipo: "entrevista", titulo: "", data: Dados.hoje(), inicio: "09:00", fim: "10:00", nota: "", repetir: "", repetirAte: "",
    }, novo || {});
    if (novo && novo.diaInteiro) { it.inicio = ""; it.fim = ""; }
    const dataDaVez = oc ? oc.data : it.data;
    const cands = CTX.aplicacoes.filter(a => VIVOS.indexOf(a.estado) >= 0 || a.id === it.aplicacaoId);
    const diaInteiro = !it.inicio;

    const corpo = `
      ${UI.campo({ nome: "tipo", rotulo: "O que é", tipo: "escolha", valor: it.tipo,
        opcoes: Object.keys(TIPOS).filter(k => k !== "trabalho").map(k => ({ valor: k, nome: TIPOS[k].nome })) })}
      <div data-so="candidatura">${UI.campo({ nome: "aplicacaoId", rotulo: "Candidatura", tipo: "escolha", valor: it.aplicacaoId || "",
        opcoes: [{ valor: "", nome: "Nenhuma" }].concat(cands.map(a => ({ valor: a.id, nome: (a.empresa || "?") + " · " + (a.titulo || "vaga") }))) })}</div>
      ${UI.campo({ nome: "titulo", rotulo: "Título", valor: it.titulo })}
      ${UI.campo({ nome: "data", rotulo: "Dia", tipo: "date", valor: oc ? oc.data : it.data, obrigatorio: true })}
      <label class="ag-chk"><input type="checkbox" name="diaInteiro"${diaInteiro ? " checked" : ""}> O dia todo, sem horário</label>
      <div class="ag-duas" data-horario>
        ${UI.campo({ nome: "inicio", rotulo: "Começa", tipo: "time", valor: it.inicio || "09:00", passo: 900 })}
        ${UI.campo({ nome: "fim", rotulo: "Termina", tipo: "time", valor: it.fim || "10:00", passo: 900 })}
      </div>
      <div class="ag-duas">
        ${UI.campo({ nome: "repetir", rotulo: "Repetir", tipo: "escolha", valor: it.repetir || "", opcoes: REPETIR })}
        <div data-ate>${UI.campo({ nome: "repetirAte", rotulo: "Até (opcional)", tipo: "date", valor: it.repetirAte || "" })}</div>
      </div>
      ${UI.campo({ nome: "nota", rotulo: "Anotação", tipo: "texto-longo", valor: it.nota, dica: "Link da chamada, o que levar, o que estudar" })}`;

    const extra = !oc ? "" : `<div class="ag-acoes-extra">
      ${it.repetir ? `<button type="button" class="ag-link" data-pular>Tirar só ${esc(diaCurto(dataDaVez))}</button>` : ""}
      <button type="button" class="ag-link perigo" data-apagar>Apagar${it.repetir ? " todos" : ""}</button></div>`;

    const dlg = UI.painel({
      titulo: oc ? "Na agenda" : "Marcar na agenda",
      subtitulo: oc ? diaLongo(dataDaVez) + (it.repetir ? " · se repete" : "") : "",
      corpo, extra, acaoTexto: "Salvar",
      acao: async (d) => {
        const tipo = UI.ler(d, "tipo");
        const todo = UI.ler(d, "diaInteiro");
        const dado = {
          tipo,
          titulo: UI.ler(d, "titulo"),
          data: UI.ler(d, "data"),
          inicio: todo ? "" : UI.ler(d, "inicio"),
          fim: todo ? "" : UI.ler(d, "fim"),
          aplicacaoId: ["entrevista", "teste", "prazo"].indexOf(tipo) >= 0 ? UI.ler(d, "aplicacaoId") : "",
          nota: UI.ler(d, "nota"),
          repetir: UI.ler(d, "repetir"),
          repetirAte: UI.ler(d, "repetir") ? UI.ler(d, "repetirAte") : "",
        };
        if (!dado.data) throw new Error("Escolha o dia.");
        if (dado.inicio && dado.fim && minutos(dado.fim) <= minutos(dado.inicio)) throw new Error("O fim precisa ser depois do começo.");
        if (dado.repetirAte && dado.repetirAte < dado.data) throw new Error("O \"até\" precisa ser depois do dia.");
        // Item que se repete guarda o primeiro dia da série; mudar o dia de
        // uma ocorrência muda a série inteira a partir dele.
        if (oc && it.repetir && dado.data === dataDaVez) dado.data = it.data;
        const salvo = Object.assign({}, oc ? it : {}, dado);
        await Dados.salvar("agenda", salvo);
        // a tela vai para o dia do que acabou de ser marcado
        if (!oc && vista !== "lista") ref = salvo.data;
        if (vista === "lista" && salvo.data < ref) ref = salvo.data;
        UI.aviso(oc ? "Agenda atualizada." : "Marcado na agenda.", "ok");
        await depois();
      },
    });

    const mostrar = () => {
      const tipo = UI.ler(dlg, "tipo");
      dlg.querySelector('[data-so="candidatura"]').hidden = ["entrevista", "teste", "prazo"].indexOf(tipo) < 0;
      dlg.querySelector("[data-horario]").hidden = UI.ler(dlg, "diaInteiro");
      dlg.querySelector("[data-ate]").style.visibility = UI.ler(dlg, "repetir") ? "visible" : "hidden";
      dlg.querySelector('[name="titulo"]').placeholder = "Fica \"" + (TIPOS[tipo] || TIPOS.outro).nome + "\" se você deixar vazio";
    };
    ["tipo", "diaInteiro", "repetir"].forEach(n => dlg.querySelector(`[name="${n}"]`).addEventListener("change", mostrar));
    mostrar();

    const pular = dlg.querySelector("[data-pular]");
    if (pular) pular.addEventListener("click", async () => {
      const salvo = Object.assign({}, it, { pular: (it.pular || []).concat(dataDaVez) });
      await Dados.salvar("agenda", salvo);
      dlg.close(); dlg.remove();
      UI.aviso("Tirado só deste dia.", "ok");
      await depois();
    });
    const apagar = dlg.querySelector("[data-apagar]");
    if (apagar) apagar.addEventListener("click", async () => {
      const ok = await UI.confirmar({
        titulo: it.repetir ? "Apagar todas as repetições?" : "Apagar da agenda?",
        texto: it.repetir ? "Some de todos os dias em que se repete. Para tirar um dia só, use \"Tirar só este dia\"." : "Não dá para desfazer.",
        acaoTexto: "Apagar", perigo: true,
      });
      if (!ok) return;
      await Dados.remover("agenda", it.id);
      UI.aviso("Apagado da agenda.", "ok");
      await depois();
    });
  }

  /* ── janela do plano de um trabalho ──────────────────────────────────── */

  function abrirPlano(t) {
    const p = t.plano || {};
    const dias = Array.isArray(p.dias) && p.dias.length ? p.dias : [1, 2, 3, 4, 5];
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const corpo = `
      ${UI.campo({ nome: "horas", rotulo: "Quantas horas por semana", tipo: "number", valor: p.horas || "", dica: "15", min: 0, passo: 0.5 })}
      <div class="d-linha"><span class="d-rot">Em quais dias</span>
        <div class="ag-dias">${ordem.map(d => `<label><input type="checkbox" name="dia${d}"${dias.indexOf(d) >= 0 ? " checked" : ""}><span>${DSEM[d]}</span></label>`).join("")}</div>
      </div>
      <div class="ag-conta" data-conta></div>
      ${UI.campo({ nome: "inicio", rotulo: "A partir de que horas (opcional)", tipo: "time", valor: p.inicio || "", passo: 900,
        ajuda: "Com o horário, os blocos aparecem na semana no lugar certo. Sem ele, aparecem no topo do dia." })}
      ${UI.campo({ nome: "diasAtePagar", rotulo: "O pagamento cai quantos dias depois que o período fecha (opcional)", tipo: "number",
        valor: t.diasAtePagar === 0 || t.diasAtePagar ? t.diasAtePagar : "", dica: "15", min: 0, passo: 1,
        ajuda: "Com isso, a agenda marca o dia previsto do pagamento e quanto deve cair, pelas horas que você lançou. Deixe vazio se não sabe." })}`;

    const dlg = UI.painel({
      titulo: "Plano da semana",
      subtitulo: t.projeto || t.empresa,
      corpo,
      extra: t.plano ? `<button type="button" class="ag-link perigo" data-tirar>Tirar o plano</button>` : "",
      acaoTexto: "Salvar o plano",
      acao: async (d) => {
        const horas = parseFloat(String(UI.ler(d, "horas")).replace(",", "."));
        const escolhidos = ordem.filter(x => UI.ler(d, "dia" + x));
        const pagar = UI.ler(d, "diasAtePagar");
        if (!(horas > 0)) throw new Error("Diga quantas horas por semana.");
        if (horas > 112) throw new Error("Confira as horas: passa de 16 por dia.");
        if (!escolhidos.length) throw new Error("Escolha pelo menos um dia.");
        const plano = { horas, dias: escolhidos, inicio: UI.ler(d, "inicio"),
          desde: (t.plano && t.plano.desde) || segunda(Dados.hoje()) };
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
        ? "Dá " + Dados.escreverHoras(Math.round(h / n * 4) / 4) + " em cada dia escolhido."
        : "Escolha as horas e os dias para ver quanto dá por dia.";
    };
    dlg.querySelectorAll('[name="horas"], .ag-dias input').forEach(el => el.addEventListener("input", conta));
    dlg.querySelectorAll(".ag-dias input").forEach(el => el.addEventListener("change", conta));
    conta();

    const tirar = dlg.querySelector("[data-tirar]");
    if (tirar) tirar.addEventListener("click", async () => {
      const ok = await UI.confirmar({ titulo: "Tirar o plano deste trabalho?", texto: "Os blocos somem da agenda. As horas lançadas continuam.",
        acaoTexto: "Tirar o plano", perigo: true });
      if (!ok) return;
      const copia = Object.assign({}, t); delete copia.plano;
      await Dados.salvar("trabalhos", copia);
      await depois();
    });
  }

  /* ── para a tela Hoje ────────────────────────────────────────────────── */

  /* Os compromissos de um dia, já prontos para listar: o que a pessoa marcou,
     o fim de período e o pagamento previsto. O plano de horas e o próximo
     passo das candidaturas a tela Hoje já mostra do jeito dela. */
  function compromissos(ctx, itens, data) {
    const out = ocorrencias(itens, data, data).map(o => {
      const it = o.item;
      const a = it.aplicacaoId && ctx.aplicacoes.find(x => x.id === it.aplicacaoId);
      return {
        ordem: it.inicio || "", hora: faixa(it), cor: (TIPOS[it.tipo] || TIPOS.outro).cor,
        titulo: it.titulo || ((TIPOS[it.tipo] || TIPOS.outro).nome + (a && a.empresa ? " · " + a.empresa : "")),
        sub: it.titulo ? (TIPOS[it.tipo] || TIPOS.outro).nome + (a && a.empresa ? " · " + a.empresa : "") : (it.nota || ""),
        aplicacao: a || null,
      };
    });
    automaticos(ctx, data, data).filter(x => x.auto === "periodo" || x.auto === "pagamento").forEach(x => {
      out.push({ ordem: "", hora: "dia todo", cor: x.cor, titulo: x.texto, sub: x.auto === "pagamento" ? "previsão pelas horas lançadas" : "", trabalho: x.trabalho });
    });
    return out.sort((x, y) => (x.ordem > y.ordem ? 1 : -1));
  }

  /* Calcula os valores dos pagamentos de hoje e de amanhã antes da tela Hoje desenhar. */
  async function prepararParaHoje(ctx) {
    const hoje = Dados.hoje();
    const lista = pagamentosPrevistos(ctx.trabalhos, hoje, somar(hoje, 1));
    try { await Promise.all(lista.map(a => valorDoPeriodo(a.trabalho, a.periodo, ctx.registros))); } catch (e) { /* sem valor, segue */ }
  }

  /* Quantos itens a pessoa marcou para hoje (o número do menu). */
  function quantosHoje(itens) {
    const h = Dados.hoje();
    return ocorrencias(itens, h, h).length;
  }

  return { montar, ocorrencias, quantosHoje, planoDoDia, compromissos, prepararParaHoje, somar };
})();
