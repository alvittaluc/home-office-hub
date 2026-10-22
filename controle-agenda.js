/* ══════════════════════════════════════════════════════════════════════════
   controle-agenda.js — a Agenda do Meu Controle

   Uma semana por vez, um quadro por dia, tudo escrito por extenso. É uma
   agenda própria, dentro do Meu Controle, e não fala com Google nem com nada
   de fora.

   Em cada dia aparece:
   - cada trabalho com plano para aquele dia: "5 horas planejadas" e, nos
     dias que já chegaram, quanto foi feito ("3 de 5 horas feitas"). Clicar
     abre o registro do dia, já com as horas do plano se ainda está em branco;
   - os compromissos que a pessoa marcou: entrevista, teste, prazo, estudo
     ou outro, com ou sem horário;
   - o que já está no Meu Controle: o próximo passo das candidaturas, o fim
     do período de cada trabalho e o dia de receber, com o valor previsto
     pelas horas lançadas.

   O plano fica dentro do próprio trabalho:
     trabalho.plano = { horas, dias: [0-6, 0 = domingo], desde }
     trabalho.diasAtePagar = dias entre o fim do período e o pagamento
   Um compromisso (coleção "agenda"):
     { tipo, titulo, data, inicio, fim, aplicacaoId, nota }

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
.ag-pl:first-of-type { border-top:0; padding-top:4px; }
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
.ag-barra h2 { font-family:var(--body,'Geist',sans-serif); font-size:16px; font-weight:600; color:var(--ink,#10203A); margin:0 0 0 6px; }
.ag-seta { width:34px; height:34px; border-radius:50%; border:1px solid var(--line,#DED7CA); background:var(--panel,#fff);
  font:inherit; font-size:17px; line-height:1; color:var(--ink-2,#54606F); cursor:pointer; display:grid; place-items:center; }
.ag-esta { font:inherit; font-size:13px; font-weight:500; padding:8px 14px; border-radius:999px; cursor:pointer;
  border:1px solid var(--line,#DED7CA); background:var(--panel,#fff); color:var(--ink,#10203A); }

.ag-semana { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; }
.ag-dia { background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9); border-radius:14px; padding:10px 8px 8px;
  display:flex; flex-direction:column; gap:6px; min-height:190px; min-width:0; }
.ag-dia.hoje { border-color:var(--signal,#1A4893); box-shadow:0 0 0 1px var(--signal,#1A4893); }
.ag-dia.passou { background:#FBF9F5; }
.ag-dia-cab { display:flex; align-items:baseline; gap:6px; padding:0 3px 4px; }
.ag-dia-cab span { font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3,#66717F); }
.ag-dia-cab b { font-size:17px; font-weight:600; color:var(--ink,#10203A); }
.ag-dia-cab em { margin-left:auto; font-style:normal; font-size:11px; font-weight:600; color:#fff; background:var(--signal,#1A4893);
  border-radius:999px; padding:1px 8px; }
.ag-it { display:block; width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer; border:0; border-radius:9px;
  padding:7px 8px 7px 9px; background:var(--bg,#F7F4EF); box-shadow:inset 3px 0 0 var(--c,#66717F); }
.ag-it:hover { background:var(--bg-soft,#F1ECE3); }
.ag-it b { display:block; font-size:12.5px; font-weight:600; color:var(--ink,#10203A); line-height:1.3;
  overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.ag-it small { display:block; font-size:11.5px; color:var(--ink-3,#66717F); line-height:1.3; margin-bottom:1px; }
.ag-it span { display:block; font-size:12px; color:var(--ink-2,#54606F); line-height:1.35; margin-top:2px; }
.ag-it .ag-it-barra { display:block; height:4px; border-radius:99px; background:#fff; overflow:hidden; margin-top:5px; }
.ag-it .ag-it-barra i { display:block; height:100%; background:var(--c); border-radius:99px; }
.ag-it.feito { background:color-mix(in srgb, var(--c) 12%, #fff); }
.ag-it.feito span { color:color-mix(in srgb, var(--c) 80%, #000); font-weight:600; }
.ag-it.auto { background:transparent; box-shadow:inset 0 0 0 1px var(--line,#DED7CA); }
.ag-it.dinheiro { background:#E9F5F1; box-shadow:inset 3px 0 0 #1F7A6E; }
.ag-it.dinheiro span { color:#1F7A6E; font-weight:600; }
.ag-dia-add { margin-top:auto; font:inherit; font-size:12px; color:var(--ink-3,#66717F); background:none; border:1px dashed transparent;
  border-radius:9px; padding:6px; cursor:pointer; text-align:center; }
.ag-dia:hover .ag-dia-add, .ag-dia-add:focus-visible { border-color:var(--line,#DED7CA); color:var(--signal,#1A4893); }
.ag-dicas { font-size:12.5px; color:var(--ink-3,#66717F); margin-top:10px; }

.ag-chk { display:flex; align-items:center; gap:8px; font-size:14px; color:var(--ink,#10203A); margin:-2px 0 12px; cursor:pointer; }
.ag-chk input { width:16px; height:16px; accent-color:var(--signal,#1A4893); }
.ag-duas { display:grid; grid-template-columns:1fr 1fr; gap:0 12px; }
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
  .ag-semana { grid-template-columns:1fr; }
  .ag-dia { min-height:0; flex-direction:row; flex-wrap:wrap; align-items:flex-start; padding:10px; }
  .ag-dia-cab { width:100%; }
  .ag-dia .ag-it { flex:1 1 100%; }
  .ag-dia-add { margin-top:0; flex:1 1 100%; border-color:var(--line-soft,#EAE4D9); }
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
  /* "Esta semana, 19 a 25 de outubro" ou "26 de outubro a 1 de novembro". */
  function tituloDaSemana(de, ate, estaSemana) {
    const a = partes(de), b = partes(ate);
    const faixa = a[1] === b[1] ? a[2] + " a " + b[2] + " de " + MESES[b[1] - 1] : diaMes(de) + " a " + diaMes(ate);
    return (estaSemana ? "Esta semana, " : "") + faixa;
  }

  /* ── plano da semana ─────────────────────────────────────────────────── */

  /* As horas que o plano do trabalho pede num dia, ou null. Vale da semana
     em que o plano foi feito em diante, e só para trabalho ativo. */
  function planoDoDia(t, data) {
    const p = t && t.plano;
    if (!p || !(+p.horas > 0) || !Array.isArray(p.dias) || !p.dias.length || t.estado !== "ativo") return null;
    if (p.desde && data < p.desde) return null;
    if (p.dias.indexOf(dsem(data)) < 0) return null;
    return { horas: Math.round(+p.horas / p.dias.length * 4) / 4 };   // de 15 em 15 minutos
  }

  const feitasNoDia = (t, data, registros) => registros
    .filter(r => r.trabalhoId === t.id && r.data === data).reduce((s, r) => s + (+r.horas || 0), 0);

  /* ── quando cai o dinheiro ───────────────────────────────────────────── */

  /* Os dias de receber que caem no intervalo: o fim de cada período mais os
     dias que a pessoa disse que a empresa leva para pagar. */
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

  /* Quanto deve cair: o que foi lançado no período, na moeda do trabalho.
     A conta é a mesma do resto do Meu Controle (UI.resumo). */
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
    VALORES[chave] = { texto: v ? "cerca de " + Dados.escreverDinheiro(v, moeda) : "", parcial: periodo.ate >= hoje };
  }
  const valorDe = (t, periodo, registros) => VALORES[chaveValor(t, periodo, registros)] || null;
  const textoValor = v => !v || !v.texto ? "" : v.texto + (v.parcial ? " até agora" : "");

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

  /* Tudo o que aparece num dia, na ordem da tela: trabalhos, compromissos
     (pelo horário) e o que vem do resto do Meu Controle. */
  function doDia(ctx, itens, data) {
    const hoje = Dados.hoje();
    const out = [];
    for (const t of ctx.trabalhos) {
      const pl = planoDoDia(t, data);
      const feitas = feitasNoDia(t, data, ctx.registros);
      if (!pl && !feitas) continue;
      out.push({ tipo: "trabalho", trabalho: t, plano: pl ? pl.horas : 0, feitas, cor: t.cor || "#2C6BB5", futuro: data > hoje });
    }
    itens.filter(it => it.data === data)
      .sort((a, b) => ((a.inicio || "") > (b.inicio || "") ? 1 : -1))
      .forEach(it => out.push({ tipo: "compromisso", item: it, cor: (TIPOS[it.tipo] || TIPOS.outro).cor }));
    for (const a of ctx.aplicacoes) {
      if (a.proximo && a.proximoEm === data && VIVOS.indexOf(a.estado) >= 0) out.push({ tipo: "passo", aplicacao: a });
    }
    for (const t of ctx.trabalhos) {
      if (t.estado !== "ativo") continue;
      if (UI.periodoDe(data, UI.diaDoPeriodo(t)).ate === data) out.push({ tipo: "periodo", trabalho: t });
    }
    diasDeReceber(ctx.trabalhos, data, data).forEach(r =>
      out.push({ tipo: "receber", trabalho: r.trabalho, valor: textoValor(valorDe(r.trabalho, r.periodo, ctx.registros)) }));
    return out;
  }

  function nomeDoCompromisso(it, aplicacoes) {
    const a = it.aplicacaoId && aplicacoes.find(x => x.id === it.aplicacaoId);
    const tipo = (TIPOS[it.tipo] || TIPOS.outro).nome + (a && a.empresa ? " · " + a.empresa : "");
    return it.titulo ? { titulo: it.titulo, sub: tipo, aplicacao: a } : { titulo: tipo, sub: "", aplicacao: a };
  }

  /* ── estado da tela ──────────────────────────────────────────────────── */

  let CTX = null, CAIXA = null, ITENS = [];
  let ref = null;   // a segunda-feira da semana na tela

  async function montar(alvo, contexto) {
    porCss();
    CTX = contexto; CAIXA = alvo;
    if (!ref) ref = segunda(Dados.hoje());
    ITENS = await Dados.listar("agenda");
    await desenhar();
  }

  /* ── desenho ─────────────────────────────────────────────────────────── */

  async function desenhar() {
    const de = ref, ate = somar(ref, 6);
    await prepararValores(CTX.trabalhos, CTX.registros, de, ate);
    const estaSemana = segunda(Dados.hoje()) === ref;
    const dias = [0, 1, 2, 3, 4, 5, 6].map(n => somar(de, n));
    const porDia = dias.map(d => doDia(CTX, ITENS, d));

    CAIXA.innerHTML = `
      <div class="ct-cab-tela">
        <div><h1>Agenda</h1><p>Quantas horas você quer fazer em cada trabalho, os seus compromissos e os dias de receber.</p></div>
        <div class="ct-cab-bts"><button class="ct-b forte" type="button" data-add="${estaSemana ? Dados.hoje() : de}">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Marcar compromisso</button></div>
      </div>
      ${htmlPlano(de, ate, estaSemana)}
      <div class="ag-barra">
        <button class="ag-seta" type="button" data-ir="-1" aria-label="Semana anterior">‹</button>
        <button class="ag-seta" type="button" data-ir="1" aria-label="Próxima semana">›</button>
        ${estaSemana ? "" : `<button class="ag-esta" type="button" data-esta>Esta semana</button>`}
        <h2>${esc(tituloDaSemana(de, ate, estaSemana))}</h2>
      </div>
      <div class="ag-semana">${dias.map((d, i) => htmlDia(d, porDia[i])).join("")}</div>
      <p class="ag-dicas">Clique num trabalho para lançar as horas do dia, ou no + de um dia para marcar um compromisso.</p>`;

    ligar(dias, porDia);
  }

  /* Uma linha por trabalho ativo: o plano da semana e o próximo pagamento. */
  function htmlPlano(de, ate, estaSemana) {
    const ativos = CTX.trabalhos.filter(t => t.estado === "ativo");
    if (!ativos.length) return "";
    const hoje = Dados.hoje();
    const linhas = ativos.map(t => {
      const cor = esc(t.cor || "#2C6BB5");
      const nome = esc(t.projeto || t.empresa);
      const receber = proximoDiaDeReceber(t);
      const pe = receber
        ? `Próximo pagamento: ${esc(diaMes(receber.data))}${textoValor(valorDe(t, receber.periodo, CTX.registros)) ? ", " + esc(textoValor(valorDe(t, receber.periodo, CTX.registros))) : ""}.`
        : `O período fecha em ${esc(diaMes(UI.periodoDe(hoje, UI.diaDoPeriodo(t)).ate))}.`;

      let meta = 0, feitas = 0, diasComPlano = [];
      for (let d = de; d <= ate; d = somar(d, 1)) {
        const pl = planoDoDia(t, d);
        if (pl) { meta += pl.horas; diasComPlano.push(d); }
        feitas += feitasNoDia(t, d, CTX.registros);
      }
      if (!meta) {
        return `<div class="ag-pl">
          <span class="ag-pl-nome"><i style="background:${cor}"></i><span>${nome}</span></span>
          <span class="ag-pl-txt" style="grid-column:2 / 4">Sem plano para esta semana.<small>${pe}</small></span>
          <button type="button" class="ag-pl-bt" data-plano="${esc(t.id)}">Planejar</button>
        </div>`;
      }
      const pct = Math.min(100, Math.round(feitas / meta * 100));
      let principal, detalhe;
      if (de > hoje) { principal = `<b>${esc(horas(meta))}</b> planejadas`; detalhe = ""; }
      else if (ate < hoje) { principal = `<b>${esc(horas(feitas))}</b> feitas de ${esc(horas(meta))}`; detalhe = ""; }
      else {
        principal = `<b>${esc(horas(feitas))}</b> feitas de ${esc(horas(meta))}`;
        const falta = Math.max(0, meta - feitas);
        const restam = diasComPlano.filter(d => d >= hoje);
        if (falta <= 0) detalhe = "Plano da semana cumprido.";
        else if (!restam.length) detalhe = "Faltaram " + horas(falta) + " nesta semana.";
        else if (restam.length === 1) detalhe = "Faltam " + horas(falta) + (restam[0] === hoje ? ", para hoje." : ", para " + DSEM_LONGO[dsem(restam[0])] + ".");
        else detalhe = "Faltam " + horas(falta) + ": " + horas(Math.ceil(falta / restam.length * 4) / 4) + " por dia até " + DSEM_LONGO[dsem(restam[restam.length - 1])] + ".";
      }
      return `<div class="ag-pl">
        <span class="ag-pl-nome"><i style="background:${cor}"></i><span>${nome}</span></span>
        <span class="ag-pl-barra"><i style="width:${pct}%;background:${cor}"></i></span>
        <span class="ag-pl-txt">${principal}${detalhe ? " · " + esc(detalhe) : ""}<small>${pe}</small></span>
        <button type="button" class="ag-pl-bt" data-plano="${esc(t.id)}">Ajustar</button>
      </div>`;
    }).join("");
    return `<div class="ct-cartao ag-plano">
      <div class="ct-cab-cartao"><h2>Plano da semana</h2><p>${estaSemana ? "de segunda a domingo" : "na semana que está na tela"}</p></div>
      ${linhas}
    </div>`;
  }

  function htmlDia(d, itens) {
    const hoje = Dados.hoje();
    const corpo = itens.map((x, k) => {
      const alvo = `data-dia="${d}" data-k="${k}"`;
      if (x.tipo === "trabalho") {
        const nome = esc(x.trabalho.projeto || x.trabalho.empresa);
        let linha, barra = "", feito = false;
        if (!x.plano) { linha = "✓ " + horas(x.feitas) + " feitas"; feito = true; }
        else if (x.futuro) linha = horas(x.plano) + " planejadas";
        else if (x.feitas >= x.plano) { linha = "✓ " + horas(x.feitas) + " feitas"; feito = true; }
        else {
          linha = x.feitas ? horas(x.feitas) + " de " + horas(x.plano) : horas(x.plano) + " planejadas · lançar";
          if (x.feitas) barra = `<i class="ag-it-barra"><i style="width:${Math.round(x.feitas / x.plano * 100)}%"></i></i>`;
        }
        return `<button type="button" class="ag-it${feito ? " feito" : ""}" style="--c:${esc(x.cor)}" ${alvo}><b>${nome}</b><span>${esc(linha)}</span>${barra}</button>`;
      }
      if (x.tipo === "compromisso") {
        const n = nomeDoCompromisso(x.item, CTX.aplicacoes);
        const quando = x.item.inicio ? "às " + relogio(x.item.inicio) : "";
        const pequeno = [quando, n.sub].filter(Boolean).join(" · ");
        return `<button type="button" class="ag-it" style="--c:${esc(x.cor)}" ${alvo}>${pequeno ? `<small>${esc(pequeno)}</small>` : ""}<b>${esc(n.titulo)}</b></button>`;
      }
      if (x.tipo === "passo") return `<button type="button" class="ag-it auto" ${alvo}><small>próximo passo</small><b>${esc(x.aplicacao.proximo)}${x.aplicacao.empresa ? " · " + esc(x.aplicacao.empresa) : ""}</b></button>`;
      if (x.tipo === "periodo") return `<button type="button" class="ag-it auto" ${alvo}><small>fecha o período</small><b>${esc(x.trabalho.projeto || x.trabalho.empresa)}</b></button>`;
      return `<button type="button" class="ag-it dinheiro" ${alvo}><small>dia de receber</small><b>${esc(x.trabalho.projeto || x.trabalho.empresa)}</b>${x.valor ? `<span>${esc(x.valor)}</span>` : ""}</button>`;
    }).join("");
    return `<div class="ag-dia${d === hoje ? " hoje" : d < hoje ? " passou" : ""}">
      <div class="ag-dia-cab"><span>${DSEM[dsem(d)]}</span><b>${partes(d)[2]}</b>${d === hoje ? "<em>hoje</em>" : ""}</div>
      ${corpo}
      <button type="button" class="ag-dia-add" data-add="${d}" aria-label="Marcar compromisso em ${esc(diaMes(d))}">+ marcar</button>
    </div>`;
  }

  /* ── cliques ─────────────────────────────────────────────────────────── */

  function ligar(dias, porDia) {
    CAIXA.querySelectorAll("[data-ir]").forEach(b => b.addEventListener("click", () => { ref = somar(ref, 7 * +b.dataset.ir); desenhar(); }));
    const esta = CAIXA.querySelector("[data-esta]");
    if (esta) esta.addEventListener("click", () => { ref = segunda(Dados.hoje()); desenhar(); });
    CAIXA.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => abrir(null, b.dataset.add)));
    CAIXA.querySelectorAll("[data-plano]").forEach(b => b.addEventListener("click", () => {
      const t = CTX.trabalhos.find(x => x.id === b.dataset.plano);
      if (t) abrirPlano(t);
    }));
    CAIXA.querySelectorAll("[data-k]").forEach(b => b.addEventListener("click", () => {
      const d = b.dataset.dia, x = porDia[dias.indexOf(d)][+b.dataset.k];
      if (!x) return;
      if (x.tipo === "trabalho") {
        // dia que já chegou: o registro do dia, com as horas do plano se ainda está em branco
        if (d <= Dados.hoje()) return UI.abrirRegistroDia(x.trabalho, { data: d, horas: x.feitas ? undefined : x.plano || undefined, aoSalvar: depois });
        return abrirPlano(x.trabalho);
      }
      if (x.tipo === "compromisso") return abrir(x.item, d);
      if (x.tipo === "passo" && CTX.abrirAplicacao) return CTX.abrirAplicacao(x.aplicacao);
      if (x.trabalho && CTX.irPara) CTX.irPara("trabalho/" + x.trabalho.id);
    }));
  }

  async function depois() {
    if (CTX.aoMudar) await CTX.aoMudar();
    else { ITENS = await Dados.listar("agenda"); await desenhar(); }
  }

  /* ── janela de marcar e editar um compromisso ────────────────────────── */

  function abrir(it, data) {
    const novo = !it;
    it = it || { tipo: "entrevista", titulo: "", data: data || Dados.hoje(), inicio: "", fim: "", nota: "", aplicacaoId: "" };
    const cands = CTX.aplicacoes.filter(a => VIVOS.indexOf(a.estado) >= 0 || a.id === it.aplicacaoId);
    const corpo = `
      ${UI.campo({ nome: "tipo", rotulo: "O que é", tipo: "escolha", valor: it.tipo,
        opcoes: Object.keys(TIPOS).map(k => ({ valor: k, nome: TIPOS[k].nome })) })}
      <div data-cand>${cands.length ? UI.campo({ nome: "aplicacaoId", rotulo: "De qual candidatura (opcional)", tipo: "escolha", valor: it.aplicacaoId || "",
        opcoes: [{ valor: "", nome: "Nenhuma" }].concat(cands.map(a => ({ valor: a.id, nome: (a.empresa || "?") + " · " + (a.titulo || "vaga") }))) }) : ""}</div>
      ${UI.campo({ nome: "titulo", rotulo: "Título (opcional)", valor: it.titulo })}
      ${UI.campo({ nome: "data", rotulo: "Dia", tipo: "date", valor: it.data, obrigatorio: true })}
      <div class="ag-duas">
        ${UI.campo({ nome: "inicio", rotulo: "Horário (opcional)", tipo: "time", valor: it.inicio, passo: 900 })}
        ${UI.campo({ nome: "fim", rotulo: "Até (opcional)", tipo: "time", valor: it.fim, passo: 900 })}
      </div>
      ${UI.campo({ nome: "nota", rotulo: "Anotação", tipo: "texto-longo", valor: it.nota, dica: "Link da chamada, o que levar, o que estudar" })}`;

    const dlg = UI.painel({
      titulo: novo ? "Marcar compromisso" : "Compromisso",
      corpo,
      extra: novo ? "" : `<button type="button" class="ag-link perigo" data-apagar>Apagar</button>`,
      acaoTexto: "Salvar",
      acao: async (d) => {
        const tipo = UI.ler(d, "tipo");
        const dado = {
          tipo, titulo: UI.ler(d, "titulo"), data: UI.ler(d, "data"),
          inicio: UI.ler(d, "inicio"), fim: UI.ler(d, "inicio") ? UI.ler(d, "fim") : "",
          aplicacaoId: ["entrevista", "teste", "prazo"].indexOf(tipo) >= 0 ? UI.ler(d, "aplicacaoId") : "",
          nota: UI.ler(d, "nota"),
        };
        if (!dado.data) throw new Error("Escolha o dia.");
        if (dado.inicio && dado.fim && minutos(dado.fim) <= minutos(dado.inicio)) throw new Error("O fim precisa ser depois do começo.");
        await Dados.salvar("agenda", Object.assign({}, novo ? {} : it, dado));
        ref = segunda(dado.data);   // a tela vai para a semana do compromisso
        UI.aviso(novo ? "Marcado na agenda." : "Compromisso salvo.", "ok");
        await depois();
      },
    });

    const mostrar = () => {
      const caixa = dlg.querySelector("[data-cand]");
      if (caixa) caixa.hidden = ["entrevista", "teste", "prazo"].indexOf(UI.ler(dlg, "tipo")) < 0;
    };
    dlg.querySelector('[name="tipo"]').addEventListener("change", mostrar);
    mostrar();

    const apagar = dlg.querySelector("[data-apagar]");
    if (apagar) apagar.addEventListener("click", async () => {
      const ok = await UI.confirmar({ titulo: "Apagar este compromisso?", texto: "Não dá para desfazer.", acaoTexto: "Apagar", perigo: true });
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
        const salvo = Object.assign({}, t, { plano, diasAtePagar: pagar === "" || !(n >= 0) ? "" : n });
        await Dados.salvar("trabalhos", salvo);
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
     o fim de período e o dia de receber. O plano de horas e o próximo passo
     das candidaturas a tela Hoje já mostra do jeito dela. */
  function compromissos(ctx, itens, data) {
    return doDia(ctx, itens, data).filter(x => x.tipo === "compromisso" || x.tipo === "periodo" || x.tipo === "receber").map(x => {
      if (x.tipo === "compromisso") {
        const n = nomeDoCompromisso(x.item, ctx.aplicacoes);
        return { hora: x.item.inicio ? relogio(x.item.inicio) + (x.item.fim ? " – " + relogio(x.item.fim) : "") : "dia todo",
          cor: x.cor, titulo: n.titulo, sub: n.sub || x.item.nota || "", aplicacao: n.aplicacao || null };
      }
      if (x.tipo === "periodo") return { hora: "dia todo", cor: "#54606F", titulo: "Fecha o período · " + (x.trabalho.projeto || x.trabalho.empresa), sub: "", trabalho: x.trabalho };
      return { hora: "dia todo", cor: "#1F7A6E", titulo: "Dia de receber · " + (x.trabalho.projeto || x.trabalho.empresa), sub: x.valor || "", trabalho: x.trabalho };
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
    return (itens || []).filter(it => it.data === h).length;
  }

  return { montar, quantosHoje, planoDoDia, compromissos, prepararParaHoje, somar, horas };
})();
