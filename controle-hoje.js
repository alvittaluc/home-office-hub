/* ══════════════════════════════════════════════════════════════════════════
   controle-hoje.js — a tela Hoje do Meu Controle

   Por que ela existe: o resto da ferramenta é lugar de depositar o que já
   aconteceu, e só é aberto por quem tem algo para guardar. Esta tela fala
   primeiro, com dado que já está no banco.

   Regras que valem aqui:
   - Nenhuma coleção nova e nenhum campo novo. Tudo sai do que já existe.
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
.h-cab p { margin:4px 0 0; font-size:13px; color:var(--ink-3,#8A94A1); }

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
  display:block; font-size:12.5px; color:var(--ink-3,#8A94A1); margin-top:2px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.h-quando { font-size:12.5px; color:var(--ink-3,#8A94A1); white-space:nowrap; }
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
  color:var(--ink-3,#8A94A1); margin-bottom:6px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.h-dia-val { font-size:22px; font-weight:600; letter-spacing:-.01em; }
.h-dia-val.vazio { color:var(--ink-3,#8A94A1); font-weight:500; }

.h-linha-num { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
.h-num { font-size:26px; font-weight:600; letter-spacing:-.015em; }
.h-num-sub { font-size:13px; color:var(--ink-3,#8A94A1); }
.h-nota { font-size:12.5px; color:var(--ink-3,#8A94A1); margin-top:9px; }

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

  /* Quando o próximo passo está marcado: hoje, ontem, ou a data. */
  function quandoBonito(iso, hoje) {
    const dias = Dados.diasEntre(iso, hoje);   // positivo quando iso já passou
    if (dias === 0) return { txt: "hoje", atrasado: false };
    if (dias === 1) return { txt: "ontem", atrasado: true };
    if (dias > 1) return { txt: "há " + dias + " dias", atrasado: true };
    return { txt: Dados.dataBonita(iso), atrasado: false };
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
      trabalhos, aplicacoes, registros, pagamentos, cfg
      estadoDe(id), marcaHtml(empresa, tam)
      abrirAplicacao(ap), registrarDia(trabalho, data), irPara(rota)
      aoMudar()  -> recarrega os dados e redesenha
  */
  async function montar(alvo, ctx) {
    porEstilo();

    const hoje = Dados.hoje();
    const ativos = ctx.trabalhos.filter(t => t.estado === "ativo");
    const blocos = [];

    /* 1. O DIA ──────────────────────────────────────────────────────────
       Único bloco que escreve. Um cartão por trabalho ativo, com as horas
       já lançadas hoje. Clicar abre o formulário do dia daquele trabalho. */
    if (ativos.length) {
      const doDia = ctx.registros.filter(r => r.data === hoje);
      const cartoes = ativos.map(t => {
        const r = doDia.find(x => x.trabalhoId === t.id);
        const h = r ? +r.horas || 0 : 0;
        return `<button class="h-dia-cartao" data-dia="${esc(t.id)}">
          <span class="h-dia-nome">
            <i class="h-ponto" style="background:${esc(t.cor || "#2C6BB5")}"></i>
            ${esc(t.projeto || t.empresa)}
          </span>
          <span class="h-dia-val${h ? "" : " vazio"}">${h ? esc(Dados.escreverHoras(h)) : "lançar"}</span>
        </button>`;
      }).join("");

      const total = doDia.reduce((s, r) => s + (+r.horas || 0), 0);
      blocos.push({
        peso: 1,
        largo: true,
        html: cartao("O dia",
          total ? Dados.escreverHoras(total) + " lançadas até agora" : "nada lançado ainda",
          `<div class="h-dia">${cartoes}</div>`, true),
      });
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
            <span class="h-item-sub">${esc(a.empresa || "")} · aplicada em ${esc(Dados.dataBonita(a.data))}</span>
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

    /* 5. EM ABERTO ──────────────────────────────────────────────────────
       Previsto menos recebido, do começo de tudo até hoje. */
    if (ctx.trabalhos.length && ctx.registros.length) {
      const r = await UI.resumo({
        trabalhos: ctx.trabalhos, registros: ctx.registros,
        pagamentos: ctx.pagamentos, de: "0000-01-01", ate: hoje,
      });
      const aberto = Math.max(0, r.emAbertoBRL);
      if (aberto > 0) {
        const ultimo = ctx.pagamentos.slice().sort((a, b) => (a.data > b.data ? -1 : 1))[0];
        blocos.push({
          peso: 5,
          html: cartao("Em aberto", "trabalhado e ainda não pago", `
            <div class="h-linha-num">
              <span class="h-num">${esc(Dados.escreverDinheiro(aberto, "BRL"))}</span>
              ${r.estimado ? `<span class="h-num-sub">com câmbio estimado</span>` : ""}
            </div>
            <div class="h-nota">${ultimo
              ? "Último pagamento registrado em " + esc(Dados.dataBonita(ultimo.data)) + "."
              : "Nenhum pagamento registrado ainda."}</div>`),
        });
      }
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
            ? "Nada marcado para hoje e nenhuma aplicação parada."
            : "Comece cadastrando um trabalho ou registrando uma aplicação."}</p>
          <div class="ct-cab-bts">
            ${ativos.length ? `<button class="ct-b forte" data-dia="${esc(ativos[0].id)}">Registrar o dia</button>` : ""}
            <button class="ct-b" data-ir="aplicacoes">Ver as aplicações</button>
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
      if (t) ctx.registrarDia(t, hoje);
    }));

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

    const bt = alvo.querySelector("[data-sem-resposta]");
    if (bt) bt.addEventListener("click", async () => {
      const velhas = ctx.aplicacoes.filter(a => ["aplicado", "teste"].indexOf(a.estado) >= 0 &&
                                                a.data && Dados.diasEntre(a.data, hoje) >= 30);
      const ok = await UI.confirmar({
        titulo: "Marcar como sem resposta",
        texto: velhas.length === 1
          ? "Uma aplicação passou de 30 dias sem resposta. Ela continua na lista, só muda de estado."
          : velhas.length + " aplicações passaram de 30 dias sem resposta. Elas continuam na lista, só mudam de estado.",
        acaoTexto: "Marcar",
      });
      if (!ok) return;
      for (const a of velhas) await Dados.salvar("aplicacoes", Object.assign({}, a, { estado: "semresposta" }));
      await ctx.aoMudar();
    });
  }

  return { montar };
})();
