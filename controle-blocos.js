/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — sistema de blocos

   É o que faz a página de cada trabalho ser diferente das outras.
   A pessoa acrescenta os blocos que quiser, de um catálogo.

   ── Duas regras que vieram do primeiro uso ────────────────────

   1. CADA BLOCO TEM UM ESCOPO SÓ, decidido aqui e não pela pessoa.
      Antes ela tinha que responder "este bloco é do dia ou do
      trabalho?" na hora de criar, e ninguém entendia a pergunta.

        escopo "dia" ....... um valor por dia. Contador, nota,
                             sim ou não. Vira histórico e gráfico.
        escopo "trabalho" .. um valor só, vale sempre. Anotações,
                             lista de tarefas, links, meta, gráfico.

   2. BLOCO DO DIA SE PREENCHE NA PRÓPRIA PÁGINA, no dia de hoje,
      com um clique. Antes ele só mostrava o valor e a pessoa tinha
      que abrir "Registrar o dia" para escrever nele: parecia
      quebrado. Continua aparecendo no formulário do dia também,
      que é como se lança um dia passado.

   Onde o valor mora:
     escopo trabalho ......... no próprio bloco, campo .valor
     escopo dia .............. no registro do dia, em .blocos[idDoBloco]

   Guardar o valor do dia dentro do registro, com o id do bloco como
   chave, é de propósito: apagar um bloco não estraga o histórico,
   e recriar o bloco traz os números de volta.
   ══════════════════════════════════════════════════════════════ */

const Blocos = (function () {
  "use strict";

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function ic(caminho) {
    return `<svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">${caminho}</svg>`;
  }

  const ICONES = {
    contador:  ic('<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v6M7 10h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    nota:      ic('<path d="m10 3.5 2 4.2 4.5.6-3.3 3.2.8 4.5L10 13.8 6 16l.8-4.5L3.5 8.3l4.5-.6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'),
    simnao:    ic('<rect x="2.5" y="6" width="15" height="8" rx="4" stroke="currentColor" stroke-width="1.5"/><circle cx="13.5" cy="10" r="2.2" fill="currentColor"/>'),
    anotacoes: ic('<rect x="3.5" y="3.5" width="13" height="13" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 8h7M6.5 11.5h4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    tarefas:   ic('<path d="M3.5 6.2 5 7.7l2.8-3M3.5 13.2 5 14.7l2.8-3M10.5 6.5H17M10.5 13.5H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    links:     ic('<path d="M8.4 11.6a3 3 0 0 0 4.3 0l2.1-2.1a3 3 0 1 0-4.3-4.3l-1 1M11.6 8.4a3 3 0 0 0-4.3 0l-2.1 2.1a3 3 0 1 0 4.3 4.3l1-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    meta:      ic('<circle cx="10" cy="10" r="6.8" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="0.9" fill="currentColor"/>'),
    grafico:   ic('<path d="M4 15V9M8 15V5M12 15v-4M16 15V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    texto:     ic('<path d="M4 5h12M4 10h12M4 15h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    numero:    ic('<path d="M7 4 5.5 16M14 4l-1.5 12M4 8h12M3.5 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    escolha:   ic('<rect x="3" y="6" width="14" height="8" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="m8 9 2 2 2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    tabela:    ic('<rect x="3" y="4.5" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8.5h14M8.5 8.5v7" stroke="currentColor" stroke-width="1.4"/>'),
  };

  /* ══════════════════════════════════════════════════════════
     O CATÁLOGO

     Oito blocos, e nada além disso. Cada um traz um exemplo do
     que serve, porque nome de bloco sozinho não explica nada.

     Os quatro do fim estão marcados `legado`. Não aparecem mais
     no catálogo, mas continuam desenhando: quem já tiver um deles
     na página não perde nada.
     ══════════════════════════════════════════════════════════ */

  const CATALOGO = {

    /* ─────────── do dia ─────────── */

    contador: {
      nome: "Contador", icone: ICONES.contador, escopo: "dia",
      descricao: "Botão de mais e de menos, para contar sem digitar.",
      exemplo: "Quantas tarefas você fez hoje",
      rotuloPadrao: "Tarefas concluídas",
      config: [{ campo: "passo", rotulo: "Quanto soma a cada clique", tipo: "numero", min: 1, max: 100 }],
      padrao: { passo: 1 },
    },

    nota: {
      nome: "Nota de 1 a 5", icone: ICONES.nota, escopo: "dia",
      descricao: "Cinco estrelas para clicar.",
      exemplo: "Como foi o dia de trabalho",
      rotuloPadrao: "Como foi o dia",
      config: [], padrao: {},
    },

    simnao: {
      nome: "Sim ou não", icone: ICONES.simnao, escopo: "dia",
      descricao: "Uma chavinha para responder todo dia.",
      exemplo: "Bateu a meta? Teve reunião?",
      rotuloPadrao: "Bateu a meta?",
      config: [], padrao: {},
    },

    /* ─────────── do trabalho ─────────── */

    anotacoes: {
      nome: "Anotações", icone: ICONES.anotacoes, escopo: "trabalho",
      descricao: "Espaço grande para escrever à vontade.",
      exemplo: "As regras do projeto que você sempre esquece",
      rotuloPadrao: "Anotações",
      config: [{ campo: "altura", rotulo: "Altura da caixa", tipo: "escolha", opcoes: ["baixa", "média", "alta"] }],
      padrao: { altura: "média" },
    },

    tarefas: {
      nome: "Lista de tarefas", icone: ICONES.tarefas, escopo: "trabalho",
      descricao: "Itens que se marcam e desmarcam.",
      exemplo: "O que conferir antes de começar o expediente",
      rotuloPadrao: "Antes de começar",
      config: [], padrao: {},
    },

    links: {
      nome: "Links úteis", icone: ICONES.links, escopo: "trabalho",
      descricao: "Atalhos para abrir com um clique. Nunca guarde senha aqui.",
      exemplo: "O painel de tarefas e o guia do projeto",
      rotuloPadrao: "Links do projeto",
      config: [], padrao: {},
    },

    meta: {
      nome: "Meta", icone: ICONES.meta, escopo: "trabalho",
      descricao: "Um alvo e uma barra de progresso.",
      exemplo: "80 horas neste mês, ou 500 tarefas",
      rotuloPadrao: "Meta do mês",
      config: [
        { campo: "fonte", rotulo: "Contar o quê", tipo: "fonte" },
        { campo: "alvo", rotulo: "Alvo", tipo: "numero", min: 1 },
        { campo: "periodo", rotulo: "Período", tipo: "escolha", opcoes: ["semana", "mês", "sempre"] },
      ],
      padrao: { fonte: "horas", alvo: 40, periodo: "mês" },
    },

    grafico: {
      nome: "Gráfico", icone: ICONES.grafico, escopo: "trabalho",
      descricao: "Desenha dia a dia as suas horas ou um contador seu.",
      exemplo: "As horas dos últimos 30 dias",
      rotuloPadrao: "Evolução",
      config: [
        { campo: "fonte", rotulo: "O que desenhar", tipo: "fonte" },
        { campo: "dias", rotulo: "Quantos dias mostrar", tipo: "numero", min: 7, max: 365 },
      ],
      padrao: { fonte: "horas", dias: 30 },
    },

    /* ─────────── legado: não entram mais, mas continuam desenhando ─────────── */

    texto: {
      nome: "Texto curto", icone: ICONES.texto, escopo: "trabalho", legado: true,
      descricao: "Uma linha de texto.", exemplo: "", rotuloPadrao: "Anotação",
      config: [{ campo: "dica", rotulo: "Texto de ajuda dentro do campo", tipo: "texto" }],
      padrao: { dica: "" },
    },
    numero: {
      nome: "Número", icone: ICONES.numero, escopo: "trabalho", legado: true,
      descricao: "Um número com unidade.", exemplo: "", rotuloPadrao: "Número",
      config: [
        { campo: "unidade", rotulo: "Unidade", tipo: "texto" },
        { campo: "casas", rotulo: "Casas decimais", tipo: "numero", min: 0, max: 3 },
      ],
      padrao: { unidade: "", casas: 0 },
    },
    escolha: {
      nome: "Escolha", icone: ICONES.escolha, escopo: "trabalho", legado: true,
      descricao: "Menu de opções.", exemplo: "", rotuloPadrao: "Tipo",
      config: [{ campo: "opcoes", rotulo: "Opções, uma por linha", tipo: "linhas" }],
      padrao: { opcoes: ["Opção A", "Opção B"] },
    },
    tabela: {
      nome: "Tabela", icone: ICONES.tabela, escopo: "trabalho", legado: true,
      descricao: "Colunas que você define.", exemplo: "", rotuloPadrao: "Tabela",
      config: [{ campo: "colunas", rotulo: "Colunas, uma por linha", tipo: "linhas" }],
      padrao: { colunas: ["Item", "Valor"] },
    },
  };

  /* Os que a pessoa pode acrescentar hoje, na ordem do catálogo. */
  function disponiveis() {
    return Object.keys(CATALOGO).filter(k => !CATALOGO[k].legado);
  }

  /* Blocos do dia que guardam número, e por isso viram gráfico ou meta. */
  const NUMERICOS = ["contador", "nota", "numero"];

  function ehNumerico(bloco) {
    return bloco.escopo === "dia" && NUMERICOS.indexOf(bloco.tipo) >= 0;
  }

  function escopoDe(tipo) {
    const d = CATALOGO[tipo];
    // `escopos` (plural) é do formato antigo, quando a pessoa escolhia.
    return d ? (d.escopo || (d.escopos && d.escopos[0]) || "trabalho") : "trabalho";
  }

  function novo(trabalhoId, tipo, ordem) {
    const def = CATALOGO[tipo];
    return {
      trabalhoId, tipo,
      escopo: escopoDe(tipo),
      rotulo: def.rotuloPadrao,
      config: JSON.parse(JSON.stringify(def.padrao || {})),
      valor: valorInicial(tipo),
      largura: (tipo === "grafico" || tipo === "tabela" || tipo === "anotacoes") ? 2 : 1,
      ordem: ordem || 0,
    };
  }

  function valorInicial(tipo) {
    if (tipo === "tarefas" || tipo === "links" || tipo === "tabela") return [];
    return "";
  }

  /* ══════════════════════════════════════════════════════════
     O BLOCO NA PÁGINA DO TRABALHO

     ctx precisa de:
       salvar(bloco)             grava o bloco (valor do escopo trabalho)
       salvarDia(blocoId, valor) grava o valor de HOJE no registro do dia
       registros                 registros do trabalho
       blocos                    todos os blocos, para o gráfico achar a fonte
     ══════════════════════════════════════════════════════════ */

  function montar(caixa, bloco, ctx) {
    const def = CATALOGO[bloco.tipo];
    if (!def) { caixa.innerHTML = `<p class="b-erro">Bloco desconhecido.</p>`; return; }

    if (bloco.escopo === "dia") {
      switch (bloco.tipo) {
        case "contador": return montarContador(caixa, bloco, ctx);
        case "nota":     return montarNota(caixa, bloco, ctx);
        case "simnao":   return montarSimNao(caixa, bloco, ctx);
        default:         return montarResumoDia(caixa, bloco, ctx);   // legado
      }
    }

    switch (bloco.tipo) {
      case "anotacoes": return montarTexto(caixa, bloco, ctx, true);
      case "texto":     return montarTexto(caixa, bloco, ctx, false);
      case "tarefas":   return montarTarefas(caixa, bloco, ctx);
      case "links":     return montarLinks(caixa, bloco, ctx);
      case "meta":      return montarMeta(caixa, bloco, ctx);
      case "grafico":   return montarGrafico(caixa, bloco, ctx);
      case "numero":    return montarNumeroFixo(caixa, bloco, ctx);
      case "escolha":   return montarEscolhaFixa(caixa, bloco, ctx);
      case "tabela":    return montarTabela(caixa, bloco, ctx);
      default:          caixa.innerHTML = `<p class="b-erro">Bloco sem desenho.</p>`;
    }
  }

  /* Valor de hoje de um bloco do dia. */
  function valorDeHoje(bloco, ctx) {
    const hoje = Dados.hoje();
    const r = (ctx.registros || []).find(x => x.data === hoje);
    return r && r.blocos ? r.blocos[bloco.id] : undefined;
  }

  /* A série dos últimos dias, para a miniatura embaixo do bloco. */
  function serieDe(bloco, ctx, quantos) {
    const regs = (ctx.registros || []).slice().sort((a, b) => (a.data < b.data ? -1 : 1));
    return regs.slice(-(quantos || 30)).map(r => +((r.blocos || {})[bloco.id]) || 0);
  }

  function rodapeHoje(extra) {
    return `<div class="b-hoje">${extra || "guarda no dia de hoje"}</div>`;
  }

  /* ── contador: preenche no clique, no dia de hoje ── */
  function montarContador(caixa, bloco, ctx) {
    const passo = +bloco.config.passo || 1;
    const v = +valorDeHoje(bloco, ctx) || 0;

    caixa.innerHTML =
      `<div class="b-contador">
         <button type="button" data-menos aria-label="Diminuir">−</button>
         <span class="b-conta num">${v}</span>
         <button type="button" data-mais aria-label="Aumentar">+</button>
       </div>
       ${rodapeHoje()}
       <div class="b-mini"></div>`;

    const mostra = caixa.querySelector(".b-conta");
    let atual = v, relogio = null;

    function mexer(quanto) {
      atual = Math.max(0, atual + quanto);
      mostra.textContent = atual;
      mostra.classList.add("b-pulso");
      setTimeout(() => mostra.classList.remove("b-pulso"), 260);
      // Grava pouco depois do último clique: quem aperta cinco vezes seguidas
      // gera uma gravação, não cinco.
      clearTimeout(relogio);
      relogio = setTimeout(() => ctx.salvarDia(bloco.id, atual), 500);
    }
    caixa.querySelector("[data-menos]").addEventListener("click", () => mexer(-passo));
    caixa.querySelector("[data-mais]").addEventListener("click", () => mexer(passo));

    const serie = serieDe(bloco, ctx, 30);
    const mini = caixa.querySelector(".b-mini");
    if (serie.filter(x => x).length >= 2) Graficos.miniatura(mini, { valores: serie, cor: Graficos.corDe(0), altura: 46 });
    else mini.remove();
  }

  /* ── nota de 1 a 5 ── */
  function montarNota(caixa, bloco, ctx) {
    const v = +valorDeHoje(bloco, ctx) || 0;
    caixa.innerHTML =
      `<div class="b-estrelas" role="radiogroup" aria-label="${esc(bloco.rotulo)}">
         ${[1, 2, 3, 4, 5].map(n =>
           `<button type="button" role="radio" aria-checked="${v === n}" data-n="${n}"
             class="${v >= n && v > 0 ? "on" : ""}" aria-label="${n} de 5">★</button>`).join("")}
       </div>
       ${rodapeHoje(v ? "hoje: " + v + " de 5" : "guarda no dia de hoje")}`;

    caixa.querySelectorAll("[data-n]").forEach(b => b.addEventListener("click", () => {
      const n = +b.dataset.n;
      const novoValor = (n === +valorAtual()) ? 0 : n;   // clicar de novo na mesma estrela limpa
      caixa.querySelectorAll("[data-n]").forEach(x => {
        const on = +x.dataset.n <= novoValor && novoValor > 0;
        x.classList.toggle("on", on);
        x.setAttribute("aria-checked", String(+x.dataset.n === novoValor));
      });
      caixa.querySelector(".b-hoje").textContent = novoValor ? "hoje: " + novoValor + " de 5" : "guarda no dia de hoje";
      ctx.salvarDia(bloco.id, novoValor || "");
    }));

    function valorAtual() {
      const marcadas = caixa.querySelectorAll("[data-n].on").length;
      return marcadas;
    }
  }

  /* ── sim ou não ── */
  function montarSimNao(caixa, bloco, ctx) {
    const v = valorDeHoje(bloco, ctx);
    const sim = v === true || v === "sim";
    caixa.innerHTML =
      `<label class="b-chave"><input type="checkbox"${sim ? " checked" : ""}><span></span><em>${sim ? "Sim" : "Não"}</em></label>
       ${rodapeHoje()}`;
    const c = caixa.querySelector("input");
    c.addEventListener("change", () => {
      caixa.querySelector("em").textContent = c.checked ? "Sim" : "Não";
      ctx.salvarDia(bloco.id, c.checked);
    });
  }

  /* Bloco do dia legado (número, escolha, texto do dia): só mostra. */
  function montarResumoDia(caixa, bloco, ctx) {
    const regs = (ctx.registros || []).slice().sort((a, b) => (a.data < b.data ? 1 : -1));
    const v = valorDeHoje(bloco, ctx);
    if (v === undefined || v === "" || v === null) {
      const ultimo = regs.find(r => r.blocos && r.blocos[bloco.id] !== undefined && r.blocos[bloco.id] !== "");
      caixa.innerHTML = ultimo
        ? `<div class="b-grande b-apagado">${esc(mostrarValor(bloco, ultimo.blocos[bloco.id]))}</div>
           <div class="b-hoje">último registro, ${esc(Dados.dataBonita(ultimo.data))}</div>`
        : `<div class="b-vaziozinho">Ainda sem registro.</div>`;
      return;
    }
    caixa.innerHTML = `<div class="b-grande">${esc(mostrarValor(bloco, v))}</div>${rodapeHoje("hoje")}`;
  }

  function mostrarValor(bloco, v) {
    if (v === undefined || v === null || v === "") return "";
    switch (bloco.tipo) {
      case "numero":   return Number(v).toFixed(bloco.config.casas || 0).replace(".", ",") + (bloco.config.unidade ? " " + bloco.config.unidade : "");
      case "contador": return String(v);
      case "nota":     return "★".repeat(+v) + "☆".repeat(5 - +v);
      case "simnao":   return v === true || v === "sim" ? "Sim" : "Não";
      default:         return String(v);
    }
  }

  /* ── anotações e texto curto ── */
  function montarTexto(caixa, bloco, ctx, grande) {
    const alturas = { baixa: 70, "média": 120, alta: 200 };
    if (grande) {
      caixa.innerHTML = `<textarea class="b-campo b-area" style="min-height:${alturas[bloco.config.altura] || 120}px"
        placeholder="Escreva aqui">${esc(bloco.valor || "")}</textarea>`;
    } else {
      caixa.innerHTML = `<input class="b-campo" type="text" value="${esc(bloco.valor || "")}"
        placeholder="${esc(bloco.config.dica || "Escreva aqui")}">`;
    }
    autoGravar(caixa.querySelector(".b-campo"), bloco, ctx, el => el.value);
  }

  function montarNumeroFixo(caixa, bloco, ctx) {
    caixa.innerHTML = `<div class="b-numlinha">
      <input class="b-campo b-numero" type="number" step="any" value="${esc(bloco.valor === "" ? "" : bloco.valor)}">
      ${bloco.config.unidade ? `<span class="b-unid">${esc(bloco.config.unidade)}</span>` : ""}</div>`;
    autoGravar(caixa.querySelector(".b-campo"), bloco, ctx, el => (el.value === "" ? "" : +el.value));
  }

  function montarEscolhaFixa(caixa, bloco, ctx) {
    const ops = bloco.config.opcoes || [];
    caixa.innerHTML = `<select class="b-campo"><option value="">Não escolhido</option>${
      ops.map(o => `<option${o === bloco.valor ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    autoGravar(caixa.querySelector(".b-campo"), bloco, ctx, el => el.value);
  }

  /* ── lista de tarefas ── */
  function montarTarefas(caixa, bloco, ctx) {
    const itens = Array.isArray(bloco.valor) ? bloco.valor : [];
    const feitos = itens.filter(i => i.feito).length;

    caixa.innerHTML =
      `${itens.length ? `<div class="b-hoje">${feitos} de ${itens.length} feitos</div>` : ""}
       <ul class="b-tarefas">${itens.map((it, i) =>
        `<li><label><input type="checkbox" data-i="${i}"${it.feito ? " checked" : ""}>
          <span${it.feito ? ' class="b-riscado"' : ""}>${esc(it.texto)}</span></label>
         <button class="b-x" data-tira="${i}" aria-label="Remover item">×</button></li>`).join("")}</ul>
       <form class="b-add"><input type="text" placeholder="Novo item" aria-label="Novo item"><button class="b-mais" type="submit">Adicionar</button></form>`;

    caixa.querySelectorAll('input[type="checkbox"]').forEach(c => c.addEventListener("change", () => {
      itens[+c.dataset.i].feito = c.checked;
      bloco.valor = itens; ctx.salvar(bloco).then(() => montarTarefas(caixa, bloco, ctx));
    }));
    caixa.querySelectorAll("[data-tira]").forEach(b => b.addEventListener("click", () => {
      itens.splice(+b.dataset.tira, 1);
      bloco.valor = itens; ctx.salvar(bloco).then(() => montarTarefas(caixa, bloco, ctx));
    }));
    caixa.querySelector(".b-add").addEventListener("submit", ev => {
      ev.preventDefault();
      const campo = ev.target.querySelector("input");
      const texto = campo.value.trim();
      if (!texto) return;
      itens.push({ texto, feito: false });
      bloco.valor = itens;
      ctx.salvar(bloco).then(() => { montarTarefas(caixa, bloco, ctx); caixa.querySelector(".b-add input").focus(); });
    });
  }

  /* ── links úteis ──
     O campo do endereço é type="text" de propósito, e não type="url":
     com type="url" o navegador recusa "toloka.ai" e o botão de adicionar
     não faz nada, sem dizer por quê. Aqui a gente aceita o endereço curto
     e completa o https:// na hora de salvar. */
  function montarLinks(caixa, bloco, ctx) {
    const itens = Array.isArray(bloco.valor) ? bloco.valor : [];
    caixa.innerHTML =
      `<ul class="b-links">${itens.map((it, i) =>
        `<li><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.nome || it.url)}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 2h6v6M10 2 3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></a>
         <button class="b-x" data-tira="${i}" aria-label="Remover link">×</button></li>`).join("")}</ul>
       <form class="b-add b-add2">
         <input type="text" placeholder="Nome" aria-label="Nome do link">
         <input type="text" inputmode="url" placeholder="toloka.ai" aria-label="Endereço do link">
         <button class="b-mais" type="submit">Adicionar</button>
       </form>
       <p class="b-aviso">Guarde só o endereço. Nunca escreva senha aqui.</p>`;

    caixa.querySelectorAll("[data-tira]").forEach(b => b.addEventListener("click", () => {
      itens.splice(+b.dataset.tira, 1);
      bloco.valor = itens; ctx.salvar(bloco).then(() => montarLinks(caixa, bloco, ctx));
    }));
    caixa.querySelector(".b-add").addEventListener("submit", ev => {
      ev.preventDefault();
      const [nome, url] = ev.target.querySelectorAll("input");
      let endereco = url.value.trim();
      if (!endereco) return;
      if (!/^https?:\/\//i.test(endereco)) endereco = "https://" + endereco;
      itens.push({ nome: nome.value.trim() || endereco, url: endereco });
      bloco.valor = itens; ctx.salvar(bloco).then(() => montarLinks(caixa, bloco, ctx));
    });
  }

  /* ── tabela livre (legado) ── */
  function montarTabela(caixa, bloco, ctx) {
    const cols = bloco.config.colunas && bloco.config.colunas.length ? bloco.config.colunas : ["Item", "Valor"];
    const linhas = Array.isArray(bloco.valor) ? bloco.valor : [];

    caixa.innerHTML = `<div class="b-rolagem"><table class="b-tab">
      <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}<th></th></tr></thead>
      <tbody>${linhas.map((l, i) =>
        `<tr>${cols.map((c, j) =>
          `<td><input type="text" data-l="${i}" data-c="${j}" value="${esc(l[j] || "")}"></td>`).join("")}
         <td><button class="b-x" data-tira="${i}" aria-label="Remover linha">×</button></td></tr>`).join("")}
      </tbody></table></div>
      <button class="b-mais b-solto" data-nova>Nova linha</button>`;

    caixa.querySelectorAll("input[data-l]").forEach(inp => {
      inp.addEventListener("change", () => {
        const l = +inp.dataset.l, c = +inp.dataset.c;
        if (!linhas[l]) linhas[l] = [];
        linhas[l][c] = inp.value;
        bloco.valor = linhas; ctx.salvar(bloco);
      });
    });
    caixa.querySelectorAll("[data-tira]").forEach(b => b.addEventListener("click", () => {
      linhas.splice(+b.dataset.tira, 1);
      bloco.valor = linhas; ctx.salvar(bloco).then(() => montarTabela(caixa, bloco, ctx));
    }));
    caixa.querySelector("[data-nova]").addEventListener("click", () => {
      linhas.push(cols.map(() => ""));
      bloco.valor = linhas; ctx.salvar(bloco).then(() => montarTabela(caixa, bloco, ctx));
    });
  }

  /* ── meta ── */
  function montarMeta(caixa, bloco, ctx) {
    const { total, unidade } = somarFonte(bloco.config.fonte, bloco.config.periodo, ctx);
    const alvo = +bloco.config.alvo || 1;
    const parte = Math.max(0, Math.min(1, total / alvo));
    const falta = Math.max(0, alvo - total);
    const escrever = v => (unidade === "horas" ? Dados.escreverHoras(v) : Number(v).toFixed(0));

    caixa.innerHTML =
      `<div class="b-metatopo"><span class="b-grande">${esc(escrever(total))}</span>
        <span class="b-hoje">de ${esc(escrever(alvo))} · ${esc(bloco.config.periodo || "mês")}</span></div>
       <div class="b-barra${parte >= 1 ? " b-cheia" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="${alvo}" aria-valuenow="${total.toFixed(2)}">
         <span style="width:${(parte * 100).toFixed(1)}%"></span></div>
       <div class="b-hoje">${falta > 0 ? "faltam " + esc(escrever(falta)) : "meta alcançada"}</div>`;
  }

  /* Soma a fonte escolhida no período pedido.
     A fonte é "horas" ou o id de um bloco do dia numérico. */
  function somarFonte(fonte, periodo, ctx) {
    const regs = ctx.registros || [];
    const hoje = Dados.hoje();
    let de = "0000-01-01";
    if (periodo === "semana") de = Dados.segundaDa(hoje);
    else if (periodo === "mês" || periodo === "mes" || !periodo) de = hoje.slice(0, 8) + "01";

    let total = 0;
    regs.forEach(r => {
      if (r.data < de || r.data > hoje) return;
      if (fonte === "horas") total += +r.horas || 0;
      else if (r.blocos && r.blocos[fonte] !== undefined) total += +r.blocos[fonte] || 0;
    });
    return { total, unidade: fonte === "horas" ? "horas" : "numero" };
  }

  /* ── gráfico montado pela pessoa ── */
  function montarGrafico(caixa, bloco, ctx) {
    const dias = Math.max(7, Math.min(365, +bloco.config.dias || 30));
    const fonte = bloco.config.fonte || "horas";
    const nomeFonte = fonte === "horas" ? "Horas"
      : ((ctx.blocos || []).find(b => b.id === fonte) || {}).rotulo || "Valor";

    // Uma coluna por dia da janela, inclusive os dias sem registro.
    const hoje = new Date(Dados.hoje() + "T12:00:00");
    const categorias = [], valores = [];
    const porData = {};
    (ctx.registros || []).forEach(r => {
      porData[r.data] = fonte === "horas" ? (+r.horas || 0) : (+((r.blocos || {})[fonte]) || 0);
    });
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoje.getTime() - i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      categorias.push(iso.slice(8, 10) + "/" + iso.slice(5, 7));
      valores.push(porData[iso] || 0);
    }

    caixa.innerHTML = `<div class="b-gr"></div>`;
    Graficos.colunas(caixa.querySelector(".b-gr"), {
      categorias,
      series: [{ nome: nomeFonte, valores, cor: Graficos.corDe(0) }],
      altura: 190,
      titulo: nomeFonte + " nos últimos " + dias + " dias",
      formatar: v => (fonte === "horas" ? Dados.escreverHoras(v) : Graficos.numeroCurto(v)),
      formatarEixo: v => (fonte === "horas" ? (v ? v + "h" : "0") : Graficos.numeroCurto(v)),
      vazio: "Sem números nesta janela ainda.",
    });
  }

  /* Grava sozinho pouco depois de parar de digitar, e na saída do campo.
     Sem botão de salvar: o bloco é a folha de rascunho da pessoa. */
  function autoGravar(el, bloco, ctx, ler) {
    if (!el) return;
    let relogio = null;
    function guardar() {
      bloco.valor = ler(el);
      ctx.salvar(bloco);
      el.classList.add("b-gravado");
      setTimeout(() => el.classList.remove("b-gravado"), 900);
    }
    el.addEventListener("input", () => { clearTimeout(relogio); relogio = setTimeout(guardar, 700); });
    el.addEventListener("change", () => { clearTimeout(relogio); guardar(); });
    el.addEventListener("blur", () => { clearTimeout(relogio); guardar(); });
  }

  /* ══════════════════════════════════════════════════════════
     O CAMPO NO FORMULÁRIO DO DIA
     É por aqui que se lança um dia passado.
     ══════════════════════════════════════════════════════════ */

  function campoDia(bloco, valor) {
    const v = valor === undefined ? "" : valor;
    const id = "bl-" + bloco.id;
    let campo;
    switch (bloco.tipo) {
      case "contador":
        campo = `<div class="d-contador" data-bloco="${bloco.id}" data-tipo="contador" data-passo="${+bloco.config.passo || 1}">
                  <button type="button" data-menos aria-label="Diminuir">−</button>
                  <input id="${id}" type="number" step="any" value="${v === "" ? 0 : esc(v)}" aria-label="${esc(bloco.rotulo)}">
                  <button type="button" data-mais aria-label="Aumentar">+</button></div>`; break;
      case "simnao":
        campo = `<label class="d-chave"><input id="${id}" type="checkbox" data-bloco="${bloco.id}" data-tipo="simnao"
                  ${v === true || v === "sim" ? "checked" : ""}><span></span><em>${v === true || v === "sim" ? "Sim" : "Não"}</em></label>`; break;
      case "nota":
        campo = `<div class="d-estrelas" data-bloco="${bloco.id}" data-tipo="nota" data-valor="${+v || 0}" role="radiogroup" aria-label="${esc(bloco.rotulo)}">
                  ${[1, 2, 3, 4, 5].map(n =>
                    `<button type="button" role="radio" aria-checked="${+v === n}" data-n="${n}"
                      class="${+v >= n && +v > 0 ? "on" : ""}" aria-label="${n} de 5">★</button>`).join("")}
                  <button type="button" class="d-limpa" data-n="0" aria-label="Limpar nota">limpar</button></div>`; break;

      /* ── legado ── */
      case "texto":
        campo = `<input id="${id}" class="d-campo" type="text" data-bloco="${bloco.id}" data-tipo="texto"
                  value="${esc(v)}" placeholder="${esc(bloco.config.dica || "")}">`; break;
      case "anotacoes":
        campo = `<textarea id="${id}" class="d-campo" data-bloco="${bloco.id}" data-tipo="anotacoes" rows="3">${esc(v)}</textarea>`; break;
      case "numero":
        campo = `<div class="d-numlinha"><input id="${id}" class="d-campo" type="number" step="any"
                  data-bloco="${bloco.id}" data-tipo="numero" value="${esc(v)}">
                  ${bloco.config.unidade ? `<span class="d-unid">${esc(bloco.config.unidade)}</span>` : ""}</div>`; break;
      case "escolha":
        campo = `<select id="${id}" class="d-campo" data-bloco="${bloco.id}" data-tipo="escolha">
                  <option value="">Não escolhido</option>
                  ${(bloco.config.opcoes || []).map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}
                 </select>`; break;
      default:
        return "";
    }
    return `<div class="d-linha"><label class="d-rot" for="${id}">${esc(bloco.rotulo)}</label>${campo}</div>`;
  }

  /* Liga os campos que não são um <input> comum. */
  function ligarCamposDia(raiz) {
    raiz.querySelectorAll(".d-contador").forEach(c => {
      const inp = c.querySelector("input"), passo = +c.dataset.passo || 1;
      c.querySelector("[data-menos]").addEventListener("click", () => { inp.value = Math.max(0, (+inp.value || 0) - passo); });
      c.querySelector("[data-mais]").addEventListener("click", () => { inp.value = (+inp.value || 0) + passo; });
    });
    raiz.querySelectorAll(".d-estrelas").forEach(g => {
      g.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
        const n = +b.dataset.n;
        g.dataset.valor = n;
        g.querySelectorAll("[data-n]").forEach(x => {
          if (!x.dataset.n || x.classList.contains("d-limpa")) return;
          const on = +x.dataset.n <= n && n > 0;
          x.classList.toggle("on", on);
          x.setAttribute("aria-checked", String(+x.dataset.n === n));
        });
      }));
    });
    raiz.querySelectorAll(".d-chave input").forEach(c => c.addEventListener("change", () => {
      const em = c.closest(".d-chave").querySelector("em");
      if (em) em.textContent = c.checked ? "Sim" : "Não";
    }));
  }

  /* Lê tudo o que os blocos do dia colocaram no formulário. */
  function lerCamposDia(raiz) {
    const saida = {};
    raiz.querySelectorAll("[data-bloco]").forEach(el => {
      const id = el.dataset.bloco, tipo = el.dataset.tipo;
      let v;
      if (tipo === "contador") v = +el.querySelector("input").value || 0;
      else if (tipo === "nota") v = +(el.dataset.valor || 0) || "";
      else if (tipo === "simnao") v = el.checked;
      else if (tipo === "numero") v = el.value === "" ? "" : +el.value;
      else v = el.value;
      if (v === "" || v === undefined || v === null) return;   // campo vazio não vira registro
      saida[id] = v;
    });
    return saida;
  }

  /* ══════════════════════════════════════════════════════════
     ESTILO DOS BLOCOS E DOS CAMPOS DO DIA

     Fica aqui, e não no <style> das páginas, porque duas telas
     desenham estes mesmos campos: a página do trabalho e o
     formulário do dia.
     ══════════════════════════════════════════════════════════ */

  const CSS = `
  .b-campo {
    width:100%; font:inherit; font-size:14.5px; color:var(--ink,#10203A);
    background:var(--bg,#F7F4EF); border:1px solid var(--line-soft,#EAE4D9);
    border-radius:11px; padding:10px 12px; transition:border-color .15s, background .15s;
  }
  .b-campo:focus { outline:none; border-color:var(--signal,#1A4893); background:#fff; }
  .b-campo.b-gravado { border-color:#2AA198; }
  .b-area { resize:vertical; line-height:1.55; }
  .b-numlinha { display:flex; align-items:center; gap:9px; }
  .b-numero { max-width:130px; font-variant-numeric:tabular-nums; }
  .b-unid, .d-unid { font-size:13px; color:var(--ink-3,#8A94A1); }

  .b-grande {
    font-size:27px; font-weight:600; color:var(--ink,#10203A); line-height:1.15;
    letter-spacing:-0.015em;
  }
  .b-apagado { color:var(--ink-3,#8A94A1); }
  .b-hoje { font-size:12px; color:var(--ink-3,#8A94A1); margin-top:7px; }
  .b-vaziozinho { font-size:13.5px; color:var(--ink-3,#8A94A1); padding:6px 0; }
  .b-erro { font-size:13px; color:#C4384A; }
  .b-mini { margin-top:12px; }

  /* ── contador na própria página ── */
  .b-contador { display:inline-flex; align-items:center; gap:0; }
  .b-contador button {
    width:40px; height:44px; font:inherit; font-size:21px; cursor:pointer; line-height:1;
    background:var(--bg,#F7F4EF); border:1px solid var(--line-soft,#EAE4D9); color:var(--ink,#10203A);
    transition:background .14s, color .14s;
  }
  .b-contador button:first-child { border-radius:12px 0 0 12px; }
  .b-contador button:last-child  { border-radius:0 12px 12px 0; }
  .b-contador button:hover { background:var(--signal-suave,#EAF1F8); color:var(--signal,#1A4893); }
  .b-contador button:active { transform:translateY(1px); }
  .b-conta {
    min-width:74px; height:44px; display:grid; place-items:center;
    font-size:22px; font-weight:600; color:var(--ink,#10203A);
    border-top:1px solid var(--line-soft,#EAE4D9); border-bottom:1px solid var(--line-soft,#EAE4D9);
    background:#fff; transition:transform .2s;
  }
  .b-conta.b-pulso { transform:scale(1.14); }

  /* ── estrelas na própria página ── */
  .b-estrelas { display:inline-flex; align-items:center; gap:3px; }
  .b-estrelas button {
    background:none; border:0; cursor:pointer; font-size:27px; line-height:1; padding:1px 3px;
    color:var(--line,#DED7CA); transition:color .12s, transform .12s;
  }
  .b-estrelas button:hover { transform:scale(1.12); }
  .b-estrelas button.on { color:#C1701F; }

  /* ── chavinha na própria página ── */
  .b-chave { display:inline-flex; align-items:center; gap:11px; cursor:pointer; font-size:14.5px; color:var(--ink,#10203A); }
  .b-chave input { position:absolute; opacity:0; width:0; height:0; }
  .b-chave span {
    width:46px; height:26px; border-radius:999px; background:var(--line,#DED7CA);
    position:relative; transition:background .18s; flex-shrink:0;
  }
  .b-chave span::after {
    content:''; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%;
    background:#fff; transition:transform .18s; box-shadow:0 1px 3px rgba(16,32,58,.25);
  }
  .b-chave input:checked + span { background:var(--signal,#1A4893); }
  .b-chave input:checked + span::after { transform:translateX(20px); }
  .b-chave input:focus-visible + span { box-shadow:0 0 0 3px var(--signal-suave,#EAF1F8); }
  .b-chave em { font-style:normal; font-weight:500; }

  .b-tarefas, .b-links { list-style:none; margin:0 0 10px; padding:0; display:flex; flex-direction:column; gap:2px; }
  .b-tarefas li, .b-links li { display:flex; align-items:center; gap:8px; font-size:14px; }
  .b-tarefas label { display:flex; align-items:center; gap:9px; flex:1; cursor:pointer; min-width:0; }
  .b-tarefas input[type=checkbox] { width:16px; height:16px; accent-color:var(--signal,#1A4893); flex-shrink:0; }
  .b-riscado { text-decoration:line-through; color:var(--ink-3,#8A94A1); }
  .b-links a {
    flex:1; min-width:0; display:inline-flex; align-items:center; gap:6px;
    color:var(--signal,#1A4893); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .b-links a:hover { text-decoration:underline; }
  .b-x {
    background:none; border:0; cursor:pointer; color:var(--ink-3,#8A94A1);
    font-size:17px; line-height:1; padding:3px 5px; border-radius:7px; flex-shrink:0;
  }
  .b-x:hover { background:var(--bg-soft,#F1ECE3); color:#C4384A; }
  .b-add { display:flex; gap:7px; }
  .b-add input { flex:1; min-width:0; font:inherit; font-size:13.5px; padding:8px 11px;
    border:1px solid var(--line-soft,#EAE4D9); border-radius:10px; background:var(--bg,#F7F4EF); }
  .b-add input:focus { outline:none; border-color:var(--signal,#1A4893); background:#fff; }
  /* Cada campo pede pelo menos 140px e quebra a linha quando não cabe:
     num cartão de uma coluna os dois lado a lado ficavam espremidos a ponto
     de o endereço aparecer cortado. */
  .b-add2 { flex-wrap:wrap; }
  .b-add2 input { flex:1 1 140px; }
  .b-mais {
    font:inherit; font-size:13px; font-weight:500; cursor:pointer; white-space:nowrap;
    background:var(--bg-soft,#F1ECE3); border:1px solid var(--line-soft,#EAE4D9);
    color:var(--ink,#10203A); border-radius:10px; padding:8px 14px;
  }
  .b-mais:hover { background:var(--signal-suave,#EAF1F8); border-color:#D3E2F1; color:var(--signal,#1A4893); }
  .b-solto { margin-top:9px; }
  .b-aviso { font-size:11.5px; color:var(--ink-3,#8A94A1); margin-top:9px; }

  .b-tab { width:100%; border-collapse:collapse; font-size:13.5px; }
  .b-tab th { text-align:left; font-weight:500; font-size:11.5px; text-transform:uppercase;
    letter-spacing:.05em; color:var(--ink-3,#8A94A1); padding:0 6px 7px; }
  .b-tab td { padding:2px 3px; }
  .b-tab input { width:100%; min-width:80px; font:inherit; font-size:13.5px; padding:7px 9px;
    border:1px solid transparent; border-radius:8px; background:var(--bg,#F7F4EF); color:var(--ink,#10203A); }
  .b-tab input:focus { outline:none; border-color:var(--signal,#1A4893); background:#fff; }
  .b-rolagem { overflow-x:auto; }

  .b-metatopo { display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; }
  .b-metatopo .b-hoje { margin-top:0; }
  .b-barra { height:9px; border-radius:999px; background:var(--signal-suave,#EAF1F8); overflow:hidden; margin:11px 0 0; }
  .b-barra span { display:block; height:100%; border-radius:999px; background:var(--signal,#1A4893); transition:width .4s; }
  .b-barra.b-cheia span { background:#2AA198; }

  /* ── campos no formulário do dia ── */
  .d-linha { display:flex; flex-direction:column; gap:6px; }
  .d-rot { font-size:12.5px; font-weight:500; color:var(--ink-2,#54606F); }
  .d-campo {
    width:100%; font:inherit; font-size:14.5px; color:var(--ink,#10203A); background:#fff;
    border:1px solid var(--line,#DED7CA); border-radius:11px; padding:10px 12px;
  }
  .d-campo:focus { outline:none; border-color:var(--signal,#1A4893); box-shadow:0 0 0 3px var(--signal-suave,#EAF1F8); }
  textarea.d-campo { resize:vertical; line-height:1.55; }
  .d-numlinha { display:flex; align-items:center; gap:9px; }
  .d-numlinha .d-campo { max-width:140px; font-variant-numeric:tabular-nums; }

  .d-contador { display:inline-flex; align-items:center; gap:0; }
  .d-contador button {
    width:38px; height:40px; font:inherit; font-size:19px; cursor:pointer;
    background:#fff; border:1px solid var(--line,#DED7CA); color:var(--ink,#10203A);
  }
  .d-contador button:first-child { border-radius:11px 0 0 11px; }
  .d-contador button:last-child  { border-radius:0 11px 11px 0; }
  .d-contador button:hover { background:var(--signal-suave,#EAF1F8); color:var(--signal,#1A4893); }
  .d-contador input {
    width:74px; height:40px; text-align:center; font:inherit; font-size:15px; font-weight:600;
    border:1px solid var(--line,#DED7CA); border-left:0; border-right:0; background:#fff;
    color:var(--ink,#10203A); font-variant-numeric:tabular-nums;
  }
  .d-contador input:focus { outline:none; }

  .d-chave { display:inline-flex; align-items:center; gap:10px; cursor:pointer; font-size:14px; color:var(--ink-2,#54606F); }
  .d-chave input { position:absolute; opacity:0; width:0; height:0; }
  .d-chave span {
    width:42px; height:24px; border-radius:999px; background:var(--line,#DED7CA);
    position:relative; transition:background .18s; flex-shrink:0;
  }
  .d-chave span::after {
    content:''; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
    background:#fff; transition:transform .18s; box-shadow:0 1px 3px rgba(16,32,58,.25);
  }
  .d-chave input:checked + span { background:var(--signal,#1A4893); }
  .d-chave input:checked + span::after { transform:translateX(18px); }
  .d-chave input:focus-visible + span { box-shadow:0 0 0 3px var(--signal-suave,#EAF1F8); }
  .d-chave em { font-style:normal; }

  .d-estrelas { display:inline-flex; align-items:center; gap:3px; }
  .d-estrelas button {
    background:none; border:0; cursor:pointer; font-size:23px; line-height:1; padding:1px 2px;
    color:var(--line,#DED7CA); transition:color .12s, transform .12s;
  }
  .d-estrelas button:hover { transform:scale(1.12); }
  .d-estrelas button.on { color:#C1701F; }
  .d-estrelas .d-limpa { font-size:11.5px; color:var(--ink-3,#8A94A1); margin-left:8px; }
  .d-estrelas .d-limpa:hover { color:var(--ink-2,#54606F); transform:none; }
  `;

  function injetarCss() {
    if (document.getElementById("css-blocos")) return;
    const s = document.createElement("style");
    s.id = "css-blocos";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  injetarCss();

  return {
    CATALOGO, ICONES, disponiveis, escopoDe, novo, montar,
    campoDia, ligarCamposDia, lerCamposDia,
    ehNumerico, mostrarValor, somarFonte, NUMERICOS,
  };
})();
