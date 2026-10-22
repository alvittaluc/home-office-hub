/* ══════════════════════════════════════════════════════════════════════════
   controle-hoje.js — a tela Hoje do Meu Controle

   Por que ela existe: o resto da ferramenta é lugar de depositar o que já
   aconteceu, e só é aberto por quem tem algo para guardar. Esta tela fala
   primeiro, com dado que já está no banco.

   Regras que valem aqui:
   - Só lê. Tudo sai do que já existe no Meu Controle, inclusive a Agenda
     (o plano de horas de cada trabalho e os compromissos marcados).
   - Bloco sem conteúdo não aparece. Nada de caixa vazia explicando que está
     vazia.
   - Não conta sequência de dias, não parabeniza e não cobra.

   O CSS mora aqui dentro, pela regra das peças compartilhadas.
   ══════════════════════════════════════════════════════════════════════════ */

const Hoje = (function () {
  "use strict";

  /* ── estilo ──────────────────────────────────────────────────────────── */

  const CSS = `
.h-cab { margin-bottom:18px; }
.h-cab h1 { margin:0; }
.h-cab p { margin:4px 0 0; font-size:13px; color:var(--ink-3,#66717F); }

.h-grade { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.h-larga { grid-column:1 / -1; }
@media (max-width:1040px){ .h-grade { grid-template-columns:minmax(0,1fr); } }

.h-itens { display:flex; flex-direction:column; gap:2px; }
.h-item {
  display:flex; align-items:center; gap:12px; width:100%; text-align:left;
  padding:11px 10px; border:0; border-radius:10px; background:transparent;
  font:inherit; color:inherit; cursor:pointer;
}
.h-item:hover { background:var(--bg-soft,#F1ECE3); }
.h-item + .h-item { border-top:1px solid var(--line-soft,#EAE4D9); border-radius:0; }
.h-item-txt { flex:1; min-width:0; }
.h-item-tit {
  display:block; font-weight:600; font-size:14px; line-height:1.35;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.h-item-sub {
  display:block; font-size:12.5px; color:var(--ink-3,#66717F); margin-top:2px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.h-quando { font-size:12.5px; color:var(--ink-3,#66717F); white-space:nowrap; }
.h-quando.atrasado { color:#8E2233; font-weight:600; }
.h-ponto { width:9px; height:9px; border-radius:50%; flex-shrink:0; }

.h-dia { display:flex; flex-wrap:wrap; gap:10px; }
.h-dia-cartao {
  flex:1 1 170px; min-width:0; padding:13px 14px; border-radius:11px;
  border:1px solid var(--line-soft,#EAE4D9); background:var(--bg-soft,#F1ECE3);
  text-align:left; font:inherit; color:inherit; cursor:pointer;
}
.h-dia-cartao:hover { border-color:var(--signal,#1A4893); background:#fff; }
.h-dia-nome {
  display:flex; align-items:center; gap:7px; font-size:12.5px;
  color:var(--ink-3,#66717F); margin-bottom:6px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.h-dia-val { font-size:22px; font-weight:600; letter-spacing:-.01em; }
.h-dia-val.vazio { color:var(--ink-3,#66717F); font-weight:500; }
.h-dia-plano { display:block; font-size:12.5px; color:var(--ink-3,#66717F); margin-top:5px; }
.h-dia-plano b { color:var(--ink-2,#54606F); font-weight:600; }

.h-ag-dia { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3,#66717F); margin:4px 10px 2px; }
.h-ag-dia + .h-item { border-top:0; }
.h-ag-hora { width:74px; flex-shrink:0; font-size:12.5px; color:var(--ink-2,#54606F); white-space:nowrap; }
.h-ag-cor { width:10px; height:10px; border-radius:3px; flex-shrink:0; }
.h-ag-mais { font:inherit; font-size:13px; font-weight:600; color:var(--signal,#1A4893); background:none; border:0; cursor:pointer; padding:10px 10px 0; }

.h-linha-num { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
.h-num { font-size:26px; font-weight:600; letter-spacing:-.015em; }
.h-num-sub { font-size:13px; color:var(--ink-3,#66717F); }
.h-nota { font-size:12.5px; color:var(--ink-3,#66717F); margin-top:9px; }
.h-per { display:inline-flex; align-items:center; gap:8px; font-size:12.5px; color:var(--ink-3,#66717F); margin:0 0 12px; }
.h-per select { font:inherit; font-size:13.5px; font-weight:500; color:var(--ink,#10203A); background:var(--panel,#fff);
  border:1px solid var(--line,#DED7CA); border-radius:10px; padding:6px 10px; cursor:pointer; }
.h-per select:focus-visible { outline:2px solid var(--signal,#1A4893); outline-offset:1px; }

.h-buracos { display:flex; flex-wrap:wrap; gap:8px; }
.h-buraco {
  padding:8px 13px; border-radius:999px; border:1px dashed var(--line-soft,#DED7CA);
  background:transparent; font:inherit; font-size:13px; color:var(--ink-2,#54606F);
  cursor:pointer;
}
.h-buraco:hover { border-style:solid; border-color:var(--signal,#1A4893); color:var(--signal,#1A4893); }

.h-calmo { padding:26px 22px; }
.h-calmo p { margin:0 0 16px; font-size:14px; color:var(--ink-2,#54606F); max-width:52ch; }
`;

  let estiloPosto = false;
  function porEstilo() {
    if (estiloPosto) return;
    const s = document.createElement("style");
    s.id = "estiloHoje";
    s.textContent = CSS;
    document.head.appendChild(s);
    estiloPosto = true;
  }

  /* ── apoio ───────────────────────────────────────────────────────────── */

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  function diaDaSemana(iso) {
    return new Date(iso + "T12:00:00").getDay();
  }

  function somarDias(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* "09:00" vira "9h", "14:30" vira "14h30". */
  function horaCurta(h) {
    const p = String(h || "").split(":").map(Number);
    return p[0] + "h" + (p[1] ? String(p[1]).padStart(2, "0") : "");
  }

  /* Quando o próximo passo está marcado: hoje, ontem, ou a data. */
  function quandoBonito(iso, hoje) {
    const dias = Dados.diasEntre(iso, hoje);   // positivo quando iso já passou
    if (dias === 0) return { txt: "hoje", atrasado: false };
    if (dias === 1) return { txt: "ontem", atrasado: true };
    if (dias > 1) return { txt: "há " + dias + " dias", atrasado: true };
    return { txt: Dados.dataBonita(iso), atrasado: false };
  }

  /* Períodos do cartão de ganhos: [meses, nome]. */
  const PERIODOS_GANHO = [[1, "Último mês"], [2, "Últimos 2 meses"], [3, "Últimos 3 meses"], [6, "Últimos 6 meses"], [12, "Último ano"]];

  /* A data de n meses atrás (no mesmo dia, ou no último dia do mês, se ele
     for mais curto), mais d dias. somarMeses("2026-10-22", -1, 1) = "2026-09-23". */
  function somarMeses(iso, n, d) {
    const p = iso.split("-").map(Number);
    const alvo = new Date(Date.UTC(p[0], p[1] - 1 + n, 1, 12));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
    alvo.setUTCDate(Math.min(p[2], ultimo));
    return somarDias(alvo.toISOString().slice(0, 10), d || 0);
  }

  function cartao(titulo, sub, corpo, largo) {
    return `<div class="ct-cartao${largo ? " h-larga" : ""}">
      <div class="ct-cab-cartao"><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
      ${corpo}
    </div>`;
  }

  /* ── a tela ──────────────────────────────────────────────────────────── */

  /*
    ctx traz o que a tela precisa e nada além disso:
      trabalhos, aplicacoes, registros, pagamentos, agenda, cfg
      estadoDe(id), marcaHtml(empresa, tam)
      abrirAplicacao(ap), registrarDia(trabalho, data), irPara(rota)
      aoMudar()  -> recarrega os dados e redesenha
  */
  async function montar(alvo, ctx) {
    porEstilo();

    const hoje = Dados.hoje();
    const ativos = ctx.trabalhos.filter(t => t.estado === "ativo");
    const blocos = [];
    const comAgenda = typeof Agenda !== "undefined";
    if (comAgenda) await Agenda.prepararParaHoje(ctx);

    /* 1. O DIA ──────────────────────────────────────────────────────────
       Único bloco que escreve. Um cartão por trabalho ativo, com as horas
       já lançadas hoje e, se o trabalho tem plano na Agenda, as horas que o
       plano pede para hoje. Clicar abre o formulário do dia, já com as horas
       do plano quando o dia ainda está em branco. */
    if (ativos.length) {
      const doDia = ctx.registros.filter(r => r.data === hoje);
      const cartoes = ativos.map(t => {
        const r = doDia.find(x => x.trabalhoId === t.id);
        const h = r ? +r.horas || 0 : 0;
        // trabalho pago por tarefa mostra as tarefas do dia; as horas vêm junto se houver
        const q = r ? UI.qtdTarefas(r) : 0;
        const feito = [q ? UI.escreverTarefas(q) : "", h ? Dados.escreverHoras(h) : ""].filter(Boolean).join(" · ");
        const pl = comAgenda ? Agenda.planoDoDia(t, hoje) : null;
        const plano = !pl ? "" : `<span class="h-dia-plano">plano: <b>${esc(Dados.escreverHoras(pl.horas))}</b>${
          pl.inicio ? ", das " + esc(horaCurta(pl.inicio)) + " às " + esc(horaCurta(pl.fim)) : ""}</span>`;
        return `<button class="h-dia-cartao" data-dia="${esc(t.id)}"${pl && !h ? ` data-horas="${pl.horas}"` : ""}>
          <span class="h-dia-nome">
            <i class="h-ponto" style="background:${esc(t.cor || "#2C6BB5")}"></i>
            ${esc(t.projeto || t.empresa)}
          </span>
          <span class="h-dia-val${feito ? "" : " vazio"}">${feito ? esc(feito) : "lançar"}</span>
          ${plano}
        </button>`;
      }).join("");

      const total = doDia.reduce((s, r) => s + (+r.horas || 0), 0);
      const totalTarefas = doDia.reduce((s, r) => s + UI.qtdTarefas(r), 0);
      const lancado = [total ? Dados.escreverHoras(total) : "", totalTarefas ? UI.escreverTarefas(totalTarefas) : ""]
        .filter(Boolean).join(" e ");
      blocos.push({
        peso: 1,
        largo: true,
        html: cartao("O dia",
          lancado ? lancado + (total || totalTarefas > 1 ? " lançadas até agora" : " lançada até agora") : "nada lançado ainda",
          `<div class="h-dia">${cartoes}</div>`, true),
      });
    }

    /* 1b. NA AGENDA ─────────────────────────────────────────────────────
       O que está marcado para hoje e amanhã: entrevistas, testes, prazos,
       estudo, fim de período e pagamento previsto. Sem nada, não aparece. */
    if (comAgenda) {
      const amanha = Agenda.somar(hoje, 1);
      const deHoje = Agenda.compromissos(ctx, ctx.agenda || [], hoje);
      const deAmanha = Agenda.compromissos(ctx, ctx.agenda || [], amanha);
      if (deHoje.length || deAmanha.length) {
        const lista = (rot, itens, dia) => !itens.length ? "" :
          `<div class="h-ag-dia">${rot}</div>` + itens.map((c, k) => `<button class="h-item" data-ag="${dia}|${k}">
            <span class="h-ag-hora">${esc(c.hora)}</span>
            <i class="h-ag-cor" style="background:${esc(c.cor)}"></i>
            <span class="h-item-txt">
              <span class="h-item-tit">${esc(c.titulo)}</span>
              ${c.sub ? `<span class="h-item-sub">${esc(c.sub)}</span>` : ""}
            </span>
          </button>`).join("");
        blocos.push({
          peso: 1.5,
          html: cartao("Na agenda", "hoje e amanhã",
            `<div class="h-itens">${lista("Hoje", deHoje, "h")}${lista("Amanhã", deAmanha, "a")}</div>
             <button class="h-ag-mais" data-ir="agenda">Ver a semana na Agenda →</button>`),
          ligar: el => el.querySelectorAll("[data-ag]").forEach(b => b.addEventListener("click", () => {
            const [dia, k] = b.dataset.ag.split("|");
            const c = (dia === "h" ? deHoje : deAmanha)[+k];
            if (c && c.aplicacao) ctx.abrirAplicacao(c.aplicacao);
            else ctx.irPara("agenda");
          })),
        });
      }
    }

    /* 2. PRECISA DE VOCÊ ────────────────────────────────────────────────
       Próximo passo marcado para hoje ou para trás, em aplicação que ainda
       está de pé. Atrasado primeiro. */
    const vivos = ["aplicado", "teste", "entrevista", "banco"];
    const pendentes = ctx.aplicacoes
      .filter(a => a.proximo && a.proximoEm && a.proximoEm <= hoje && vivos.indexOf(a.estado) >= 0)
      .sort((a, b) => (a.proximoEm > b.proximoEm ? 1 : -1));

    if (pendentes.length) {
      const itens = pendentes.map(a => {
        const q = quandoBonito(a.proximoEm, hoje);
        return `<button class="h-item" data-ap="${esc(a.id)}">
          ${ctx.marcaHtml(a.empresa, 34)}
          <span class="h-item-txt">
            <span class="h-item-tit">${esc(a.proximo)}</span>
            <span class="h-item-sub">${esc(a.empresa || "")}${a.titulo ? " · " + esc(a.titulo) : ""}</span>
          </span>
          <span class="h-quando${q.atrasado ? " atrasado" : ""}">${esc(q.txt)}</span>
        </button>`;
      }).join("");
      blocos.push({
        peso: 2,
        html: cartao("Precisa de você",
          pendentes.length === 1 ? "um próximo passo marcado" : pendentes.length + " próximos passos marcados",
          `<div class="h-itens">${itens}</div>`),
      });
    }

    /* 3. PARADAS ────────────────────────────────────────────────────────
       Aplicado ou Teste há 21 dias ou mais. Dos 30 em diante, oferece
       marcar como sem resposta ali mesmo. */
    const paradas = ctx.aplicacoes
      .filter(a => ["aplicado", "teste"].indexOf(a.estado) >= 0 && a.data &&
                   Dados.diasEntre(a.data, hoje) >= 21)
      .sort((a, b) => (a.data > b.data ? 1 : -1));

    if (paradas.length) {
      const itens = paradas.slice(0, 8).map(a => {
        const dias = Dados.diasEntre(a.data, hoje);
        return `<button class="h-item" data-ap="${esc(a.id)}">
          ${ctx.marcaHtml(a.empresa, 34)}
          <span class="h-item-txt">
            <span class="h-item-tit">${esc(a.titulo || "Vaga sem título")}</span>
            <span class="h-item-sub">${esc(a.empresa || "")} · enviada em ${esc(Dados.dataBonita(a.data))}</span>
          </span>
          <span class="h-quando">${dias} dias</span>
        </button>`;
      }).join("");

      const velhas = paradas.filter(a => Dados.diasEntre(a.data, hoje) >= 30);
      const pe = velhas.length
        ? `<div class="h-nota">${velhas.length === 1
            ? "Uma delas passou de 30 dias."
            : velhas.length + " delas passaram de 30 dias."}
           <button class="ct-b pequeno" style="margin-left:8px;" data-sem-resposta>Marcar como sem resposta</button></div>`
        : "";

      blocos.push({
        peso: 3,
        html: cartao("Paradas", "sem resposta há 21 dias ou mais",
          `<div class="h-itens">${itens}</div>${pe}`),
      });
    }

    /* 4. A SEMANA ───────────────────────────────────────────────────────
       Mesma conta da meta do painel, sem gráfico. Só aparece se a meta
       estiver configurada. */
    if (ctx.cfg.metaHorasSemana) {
      const de = Dados.segundaDa(hoje);
      const horas = ctx.registros.filter(r => r.data >= de && r.data <= hoje)
        .reduce((s, r) => s + (+r.horas || 0), 0);
      const meta = +ctx.cfg.metaHorasSemana;
      const parte = Math.min(1, horas / meta);
      const falta = Math.max(0, meta - horas);
      const restam = 7 - Dados.diasEntre(de, hoje);

      blocos.push({
        peso: 4,
        html: cartao("A semana", "de segunda até hoje", `
          <div class="ct-meta-topo">
            <span class="ct-meta-num">${esc(Dados.escreverHoras(horas) || "0h")}</span>
            <span class="ct-meta-de">de ${esc(Dados.escreverHoras(meta))} nesta semana</span>
          </div>
          <div class="ct-barra${parte >= 1 ? " cheia" : ""}"><span style="width:${(parte * 100).toFixed(1)}%"></span></div>
          <div class="h-nota">${falta <= 0 ? "Meta da semana alcançada."
            : "Faltam " + esc(Dados.escreverHoras(falta)) + ", e restam " + restam + (restam === 1 ? " dia." : " dias.")}</div>`),
      });
    }

    /* 5. GANHOS ─────────────────────────────────────────────────────────
       Quanto a pessoa ganhou num período que ela escolhe, do último mês ao
       último ano. A conta sai dos dias e tarefas registrados: não depende de
       registrar pagamento. A escolha fica guardada na configuração. */
    if (ctx.trabalhos.length && ctx.registros.length) {
      const escolhido = PERIODOS_GANHO.some(p => p[0] === +ctx.cfg.ganhoMeses) ? +ctx.cfg.ganhoMeses : 3;
      blocos.push({
        peso: 5,
        html: cartao("Ganhos", "quanto você ganhou, pelo que registrou", `
          <label class="h-per"><span>Período</span>
            <select data-ganho-per aria-label="Período dos ganhos">${PERIODOS_GANHO.map(p =>
              `<option value="${p[0]}"${p[0] === escolhido ? " selected" : ""}>${esc(p[1])}</option>`).join("")}</select>
          </label>
          <div data-ganho-val><div class="h-linha-num"><span class="h-num">…</span></div></div>`),
      });
    }

    /* 6. BURACOS ────────────────────────────────────────────────────────
       Dias úteis desta semana, até ontem, sem nenhum registro. Só para quem
       está em atividade: sem registro nos últimos 14 dias, o bloco some, que
       é quando ele viraria cobrança. */
    if (ativos.length) {
      const recente = ctx.registros.some(r => r.data >= somarDias(hoje, -14) && r.data <= hoje);
      if (recente) {
        const de = Dados.segundaDa(hoje);
        const comRegistro = new Set(ctx.registros.map(r => r.data));
        const buracos = [];
        for (let d = de; d < hoje; d = somarDias(d, 1)) {
          const s = diaDaSemana(d);
          if (s === 0 || s === 6) continue;
          if (!comRegistro.has(d)) buracos.push(d);
        }
        if (buracos.length) {
          blocos.push({
            peso: 6,
            largo: true,
            html: cartao("Sem registro", "dias úteis desta semana que ficaram em branco",
              `<div class="h-buracos">${buracos.map(d =>
                `<button class="h-buraco" data-buraco="${esc(d)}">${esc(DIA_SEMANA[diaDaSemana(d)])}, ${esc(Dados.dataBonita(d))}</button>`
              ).join("")}</div>`, true),
          });
        }
      }
    }

    /* ── desenho ─────────────────────────────────────────────────────── */

    const cabecalho = `
      <div class="h-cab">
        <h1>Hoje</h1>
        <p>${esc(DIA_SEMANA[diaDaSemana(hoje)].replace(/^./, c => c.toUpperCase()))}, ${esc(Dados.dataBonita(hoje))}</p>
      </div>`;

    if (!blocos.length) {
      alvo.innerHTML = cabecalho + `
        <div class="ct-cartao h-calmo">
          <p>${ctx.trabalhos.length || ctx.aplicacoes.length
            ? "Nada marcado para hoje e nenhuma candidatura parada."
            : "Comece cadastrando um trabalho ou registrando uma candidatura."}</p>
          <div class="ct-cab-bts">
            ${ativos.length ? `<button class="ct-b forte" data-dia="${esc(ativos[0].id)}">Registrar o dia</button>` : ""}
            <button class="ct-b" data-ir="aplicacoes">Ver as candidaturas</button>
            <button class="ct-b" data-ir="painel">Ver o painel</button>
          </div>
        </div>`;
    } else {
      blocos.sort((a, b) => a.peso - b.peso);
      alvo.innerHTML = cabecalho + `<div class="h-grade">${blocos.map(b => b.html).join("")}</div>`;
    }

    /* ── ligações ────────────────────────────────────────────────────── */

    alvo.querySelectorAll("[data-dia]").forEach(b => b.addEventListener("click", () => {
      const t = ctx.trabalhos.find(x => x.id === b.dataset.dia);
      if (!t) return;
      // dia em branco com plano na Agenda: o formulário já vem com as horas do plano
      if (b.dataset.horas) return UI.abrirRegistroDia(t, { data: hoje, horas: +b.dataset.horas, aoSalvar: ctx.aoMudar });
      ctx.registrarDia(t, hoje);
    }));
    blocos.forEach(b => { if (b.ligar) b.ligar(alvo); });

    alvo.querySelectorAll("[data-buraco]").forEach(b => b.addEventListener("click", () => {
      const t = ativos[0];
      if (ativos.length === 1) return ctx.registrarDia(t, b.dataset.buraco);
      ctx.registrarDia(null, b.dataset.buraco);
    }));

    alvo.querySelectorAll("[data-ap]").forEach(b => b.addEventListener("click", () => {
      const ap = ctx.aplicacoes.find(a => a.id === b.dataset.ap);
      if (ap) ctx.abrirAplicacao(ap);
    }));

    alvo.querySelectorAll("[data-ir]").forEach(b => b.addEventListener("click", () => ctx.irPara(b.dataset.ir)));

    const seletor = alvo.querySelector("[data-ganho-per]");
    if (seletor) {
      const desenharGanho = async meses => {
        const caixa = alvo.querySelector("[data-ganho-val]");
        const de = somarMeses(hoje, -meses, 1);
        // a primeira conta de um período longo busca a cotação de cada mês e pode demorar
        if (caixa) caixa.style.opacity = ".45";
        const r = await UI.resumo({ trabalhos: ctx.trabalhos, registros: ctx.registros, pagamentos: [], de, ate: hoje });
        if (caixa && +seletor.value === meses) caixa.style.opacity = "";
        const outras = Object.keys(r.previstoPorMoeda).filter(m => m !== "BRL" && r.previstoPorMoeda[m]);
        if (!caixa || +seletor.value !== meses) return;   // a pessoa já trocou de novo
        caixa.innerHTML = `
          <div class="h-linha-num">
            <span class="h-num">${esc(Dados.escreverDinheiro(r.previstoBRL, "BRL"))}</span>
            ${r.estimado ? `<span class="h-num-sub">com câmbio estimado</span>` : ""}
          </div>
          ${outras.length ? `<div class="h-nota">${outras.map(m =>
            esc(Dados.escreverDinheiro(r.previstoPorMoeda[m], m))).join(" + ")} na moeda original</div>` : ""}
          <div class="h-nota">De ${esc(Dados.dataBonita(de))} até hoje. Valor bruto, antes do imposto, pelos dias e tarefas que você registrou.</div>`;
      };
      seletor.addEventListener("change", async () => {
        const meses = +seletor.value;
        ctx.cfg.ganhoMeses = meses;
        try { await Dados.salvarConfig(ctx.cfg); } catch (e) { console.warn("Meu Controle: não deu para guardar o período", e); }
        desenharGanho(meses);
      });
      await desenharGanho(+seletor.value);
    }

    const bt = alvo.querySelector("[data-sem-resposta]");
    if (bt) bt.addEventListener("click", async () => {
      const velhas = ctx.aplicacoes.filter(a => ["aplicado", "teste"].indexOf(a.estado) >= 0 &&
                                                a.data && Dados.diasEntre(a.data, hoje) >= 30);
      const ok = await UI.confirmar({
        titulo: "Marcar como sem resposta",
        texto: velhas.length === 1
          ? "Uma candidatura passou de 30 dias sem resposta. Ela continua na lista, só muda de estado."
          : velhas.length + " candidaturas passaram de 30 dias sem resposta. Elas continuam na lista, só mudam de estado.",
        acaoTexto: "Marcar",
      });
      if (!ok) return;
      for (const a of velhas) await Dados.salvar("aplicacoes", Object.assign({}, a, { estado: "semresposta" }));
      await ctx.aoMudar();
    });
  }

  return { montar };
})();
