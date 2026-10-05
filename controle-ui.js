/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — peças de tela e conta do dinheiro

   O que está aqui é usado pelas DUAS páginas (controle.html e
   trabalho.html). Se ficasse dentro de uma delas, a outra sairia
   do ar na primeira mudança.

   Traz três coisas:
     1. a janela de formulário, o aviso rápido e o confirmar
     2. o formulário do registro do dia e o de pagamento recebido
     3. a conta do dinheiro, com câmbio
   ══════════════════════════════════════════════════════════════ */

const UI = (function () {
  "use strict";

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ══════════════════════════════════════════════════════════
     FORMAS DE PAGAMENTO E MOEDAS
     ══════════════════════════════════════════════════════════ */

  const PAGAMENTOS = {
    hora:   { nome: "Por hora",             ajuda: "O ganho do dia sai de horas × valor." },
    tarefa: { nome: "Por tarefa",           ajuda: "Você lança quantas tarefas fez e a conta sai sozinha. Cada tipo de tarefa pode ter o seu valor. Serve também para pagamento por palavra, por áudio ou por item." },
    dia:    { nome: "Valor lançado no dia", ajuda: "Você digita o total do dia, do jeito que a plataforma mostra. Serve para entrega, lote ou quando a conta já vem pronta." },
    mes:    { nome: "Fixo no mês",          ajuda: "Valor mensal. O dia só registra as horas." },
  };

  const CICLOS = {
    semanal:   "Toda semana",
    quinzenal: "A cada quinze dias",
    mensal:    "Uma vez por mês",
    demanda:   "Quando eu peço",
  };

  /* ══════════════════════════════════════════════════════════
     JANELA DE FORMULÁRIO

     Usa o <dialog> do próprio navegador: ele já cuida do foco,
     do fundo escurecido e do Esc, e não precisa de biblioteca.
     ══════════════════════════════════════════════════════════ */

  function painel({ titulo, subtitulo, corpo, acao, acaoTexto, largo, extra, cancelarTexto }) {
    const antigo = document.getElementById("ui-painel");
    if (antigo) antigo.remove();

    const dlg = document.createElement("dialog");
    dlg.id = "ui-painel";
    dlg.className = "u-dlg" + (largo ? " u-larga" : "");
    dlg.innerHTML = `
      <form method="dialog" class="u-form" novalidate>
        <header class="u-cab">
          <div>
            <h2>${esc(titulo)}</h2>
            ${subtitulo ? `<p>${esc(subtitulo)}</p>` : ""}
          </div>
          <button type="button" class="u-fechar" aria-label="Fechar">×</button>
        </header>
        <div class="u-corpo">${corpo}</div>
        <footer class="u-rodape">
          <div class="u-extra">${extra || ""}</div>
          <div class="u-botoes">
            <button type="button" class="u-btn" data-cancelar>${esc(cancelarTexto || "Cancelar")}</button>
            <button type="button" class="u-btn u-forte" data-ok>${esc(acaoTexto || "Salvar")}</button>
          </div>
        </footer>
      </form>`;
    document.body.appendChild(dlg);

    const fechar = () => { try { dlg.close(); } catch (e) {} dlg.remove(); };
    dlg.querySelector(".u-fechar").addEventListener("click", fechar);
    dlg.querySelector("[data-cancelar]").addEventListener("click", fechar);
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); fechar(); });
    // Clicar no fundo escuro fecha, clicar dentro não.
    dlg.addEventListener("click", ev => { if (ev.target === dlg) fechar(); });

    const botao = dlg.querySelector("[data-ok]");
    botao.addEventListener("click", async () => {
      if (!acao) return fechar();
      botao.disabled = true;
      const texto = botao.textContent;
      botao.textContent = "Salvando…";
      try {
        const r = await acao(dlg);
        if (r !== false) fechar();
      } catch (e) {
        console.error(e);
        erroNoPainel(dlg, e && e.message ? e.message : "Não deu para salvar agora.");
      } finally {
        botao.disabled = false;
        botao.textContent = texto;
      }
    });

    // Enter em campo de uma linha confirma, menos em textarea.
    dlg.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && ev.target.tagName !== "TEXTAREA" && ev.target.tagName !== "BUTTON") {
        ev.preventDefault(); botao.click();
      }
    });

    try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); }

    // O foco vai para o primeiro campo AGORA, e não dentro de um setTimeout.
    // Com o atraso, quem começasse a digitar rápido perdia o que escreveu:
    // o foco pulava de campo no meio da digitação e a letra caía no lugar errado.
    const primeiro = dlg.querySelector(".u-corpo input:not([type=hidden]), .u-corpo select, .u-corpo textarea");
    if (primeiro) { try { primeiro.focus(); } catch (e) {} }
    return dlg;
  }

  function erroNoPainel(dlg, texto) {
    let caixa = dlg.querySelector(".u-erro");
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.className = "u-erro";
      caixa.setAttribute("role", "alert");
      dlg.querySelector(".u-corpo").prepend(caixa);
    }
    caixa.textContent = texto;
    caixa.scrollIntoView({ block: "nearest" });
  }

  function confirmar({ titulo, texto, acaoTexto, perigo, cancelarTexto }) {
    return new Promise(ok => {
      const dlg = painel({
        titulo,
        corpo: `<p class="u-texto">${texto}</p>`,
        acaoTexto: acaoTexto || "Confirmar",
        cancelarTexto,
        acao: () => { ok(true); return true; },
      });
      if (perigo) dlg.querySelector("[data-ok]").classList.add("u-perigo");
      dlg.addEventListener("close", () => ok(false), { once: true });
      dlg.querySelector("[data-cancelar]").addEventListener("click", () => ok(false));
      dlg.querySelector(".u-fechar").addEventListener("click", () => ok(false));
    });
  }

  /* Recado curto no canto, que some sozinho. */
  function aviso(texto, tipo) {
    let caixa = document.getElementById("ui-avisos");
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.id = "ui-avisos";
      caixa.setAttribute("role", "status");
      caixa.setAttribute("aria-live", "polite");
      document.body.appendChild(caixa);
    }
    const item = document.createElement("div");
    item.className = "u-aviso" + (tipo ? " u-" + tipo : "");
    item.textContent = texto;
    caixa.appendChild(item);
    setTimeout(() => { item.classList.add("u-saindo"); setTimeout(() => item.remove(), 320); }, 3600);
  }

  /* ══════════════════════════════════════════════════════════
     CAMPOS DE FORMULÁRIO
     ══════════════════════════════════════════════════════════ */

  function campo({ nome, rotulo, tipo, valor, dica, ajuda, opcoes, obrigatorio, lista, min, max, passo }) {
    const id = "c-" + nome;
    let controle;
    if (tipo === "texto-longo") {
      controle = `<textarea id="${id}" name="${nome}" class="d-campo" rows="3" placeholder="${esc(dica || "")}">${esc(valor || "")}</textarea>`;
    } else if (tipo === "escolha") {
      controle = `<select id="${id}" name="${nome}" class="d-campo">${
        (opcoes || []).map(o => {
          const v = typeof o === "string" ? o : o.valor;
          const n = typeof o === "string" ? o : o.nome;
          return `<option value="${esc(v)}"${String(v) === String(valor) ? " selected" : ""}>${esc(n)}</option>`;
        }).join("")}</select>`;
    } else {
      controle = `<input id="${id}" name="${nome}" class="d-campo" type="${tipo || "text"}"
        value="${esc(valor === null || valor === undefined ? "" : valor)}"
        placeholder="${esc(dica || "")}"${lista ? ` list="${esc(lista)}"` : ""}
        ${min !== undefined ? ` min="${min}"` : ""}${max !== undefined ? ` max="${max}"` : ""}
        ${passo ? ` step="${passo}"` : (tipo === "number" ? ' step="any"' : "")}>`;
    }
    return `<div class="d-linha${obrigatorio ? " u-obrig" : ""}">
      <label class="d-rot" for="${id}">${esc(rotulo)}${obrigatorio ? ' <span aria-hidden="true">*</span>' : ""}</label>
      ${controle}
      ${ajuda ? `<span class="u-ajuda">${ajuda}</span>` : ""}
    </div>`;
  }

  function ler(dlg, nome) {
    const el = dlg.querySelector(`[name="${nome}"]`);
    if (!el) return "";
    return el.type === "checkbox" ? el.checked : el.value.trim();
  }

  /* ══════════════════════════════════════════════════════════
     TAREFAS

     Trabalho pago por tarefa guarda em trabalho.tipos os tipos de
     tarefa do projeto, cada um com o seu valor:
       [{ id, nome, valor }]

     O dia guarda em registro.tarefas o que foi feito:
       [{ tipoId, nome, valor, qtd }]

     O nome e o valor ficam COPIADOS em cada linha do dia. É o que
     deixa o projeto mudar o valor de uma tarefa sem mexer nos dias
     que já passaram. Linha sem tipoId é tarefa avulsa, com o valor
     digitado na hora: serve para projeto em que cada tarefa vale um
     valor diferente, e para bônus.
     ══════════════════════════════════════════════════════════ */

  function tiposDe(trabalho) {
    return Array.isArray(trabalho && trabalho.tipos) ? trabalho.tipos.filter(t => t && t.id) : [];
  }

  function linhasDe(registro) {
    return Array.isArray(registro && registro.tarefas) ? registro.tarefas.filter(l => l && +l.qtd > 0) : [];
  }

  function ganhoTarefas(registro) {
    return linhasDe(registro).reduce((s, l) => s + (+l.qtd || 0) * (+l.valor || 0), 0);
  }

  function qtdTarefas(registro) {
    return linhasDe(registro).reduce((s, l) => s + (+l.qtd || 0), 0);
  }

  /* O dia tem trabalho lançado: horas, tarefas ou valor. */
  function diaFeito(registro) {
    return !!(registro && (+registro.horas || +registro.valor || linhasDe(registro).length));
  }

  /* O dia tem qualquer coisa escrita, nem que seja só uma observação. */
  function temAlgo(registro) {
    return !!(registro && (diaFeito(registro) || registro.observacoes));
  }

  function escreverQtd(q) {
    return (+q || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  /* "17 tarefas", "1 tarefa", "1,5 tarefa" */
  function escreverTarefas(q) {
    return escreverQtd(q) + ((+q || 0) > 1 ? " tarefas" : " tarefa");
  }

  /* Valor de UMA tarefa. Tarefa de centavo quebrado existe (US$ 0,005 por
     item, US$ 0,012 por palavra), e com duas casas ela viraria "US$ 0,01". */
  function escreverUnitario(valor, moeda) {
    const m = Dados.MOEDAS[moeda] ? moeda : "BRL";
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: m,
        minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(+valor || 0);
    } catch (e) { return Dados.escreverDinheiro(+valor || 0, m); }
  }

  /* "12 Avaliação de busca · 5 Lado a lado". O nome vem do tipo como ele
     está hoje no trabalho; se o tipo foi apagado, vale o nome copiado no dia. */
  function detalheTarefas(registro, trabalho) {
    const tipos = tiposDe(trabalho);
    return linhasDe(registro).map(l => {
      const t = l.tipoId ? tipos.find(x => x.id === l.tipoId) : null;
      return escreverQtd(l.qtd) + " " + ((t && t.nome) || l.nome || "avulsa");
    }).join(" · ");
  }

  /* As linhas que o formulário do dia mostra: os tipos do trabalho, na ordem
     do cadastro; depois o que o dia tem de um tipo que o trabalho não tem
     mais; por fim as avulsas. */
  function linhasDoFormulario(trabalho, reg) {
    const doDia = linhasDe(reg);
    const vistas = new Set();
    const linhas = [];

    tiposDe(trabalho).forEach(t => {
      const l = doDia.find(x => x.tipoId === t.id && !vistas.has(x));
      if (l) vistas.add(l);
      // dia já lançado mostra o valor que valia naquele dia, não o de hoje
      linhas.push({ fixa: true, tipoId: t.id, nome: t.nome, valor: l ? +l.valor || 0 : +t.valor || 0, qtd: l ? l.qtd : "" });
    });
    doDia.forEach(l => {
      if (vistas.has(l) || !l.tipoId) return;
      vistas.add(l);
      linhas.push({ fixa: true, tipoId: l.tipoId, nome: l.nome, valor: +l.valor || 0, qtd: l.qtd });
    });
    doDia.forEach(l => {
      if (!vistas.has(l)) linhas.push({ fixa: false, nome: l.nome || "", valor: l.valor, qtd: l.qtd });
    });
    // Dia lançado à mão antes de o trabalho virar "por tarefa": entra como
    // uma linha avulsa, para o valor continuar valendo e dar para corrigir.
    if (trabalho.pagamento === "tarefa" && +reg.valor > 0) {
      linhas.push({ fixa: false, nome: "Valor lançado no dia", valor: +reg.valor, qtd: 1 });
    }
    return linhas;
  }

  function htmlLinhaTarefa(l, moeda) {
    const num = v => esc(v === "" || v === null || v === undefined ? "" : v);
    if (l.fixa) {
      return `<div class="u-tar" data-tar data-tipo="${esc(l.tipoId)}" data-nome="${esc(l.nome)}" data-valor="${esc(l.valor)}">
        <span class="u-tar-nome">${esc(l.nome || "Tarefa")}<small>${esc(escreverUnitario(l.valor, moeda))} cada</small></span>
        <input class="d-campo u-tar-qtd" data-t="qtd" type="number" min="0" step="any" inputmode="decimal"
               value="${num(l.qtd)}" placeholder="0" aria-label="Quantas: ${esc(l.nome || "tarefa")}">
        <span class="u-tar-total" data-t="total"></span>
      </div>`;
    }
    return `<div class="u-tar u-avulsa" data-tar>
      <input class="d-campo u-tar-desc" data-t="nome" type="text" value="${esc(l.nome || "")}"
             placeholder="O que foi (opcional)" aria-label="O que foi">
      <button type="button" class="u-tira" data-tirar-tar aria-label="Remover esta linha" title="Remover">×</button>
      <label class="u-tar-din" title="Valor de cada uma"><span>${esc((Dados.MOEDAS[moeda] || {}).simbolo || moeda)}</span>
        <input class="u-tar-val" data-t="valor" type="number" min="0" step="any" inputmode="decimal"
               value="${num(l.valor)}" placeholder="valor" aria-label="Valor de cada uma, em ${esc(moeda)}"></label>
      <label class="u-tar-vezes" title="Quantas"><span>×</span>
        <input class="d-campo u-tar-qtd" data-t="qtd" type="number" min="0" step="any" inputmode="decimal"
               value="${num(l.qtd)}" placeholder="qtd" aria-label="Quantas"></label>
      <span class="u-tar-total" data-t="total"></span>
      <label class="u-guardar" hidden><input type="checkbox" data-t="guardar">
        Guardar como tipo deste trabalho, para os próximos dias</label>
    </div>`;
  }

  /* Lê as linhas de tarefa do formulário do dia.
     Devolve { erro } ou { linhas, guardar }, onde guardar são as avulsas que
     a pessoa pediu para virarem tipo do trabalho. */
  function lerLinhasTarefa(dlg) {
    const linhas = [], guardar = [];
    let erro = "";
    dlg.querySelectorAll("[data-tar]").forEach(el => {
      const cq = el.querySelector('[data-t="qtd"]');
      const cv = el.querySelector('[data-t="valor"]');
      const cn = el.querySelector('[data-t="nome"]');
      const fixa = !cv;
      if ((cq.validity && cq.validity.badInput) || (cv && cv.validity && cv.validity.badInput)) {
        erro = "Não entendi um dos números das tarefas. Use só números, como 12 ou 0,35.";
        return;
      }
      let qtd = cq.value === "" ? 0 : +cq.value;
      const valor = fixa ? (+el.dataset.valor || 0) : (cv.value === "" ? 0 : +cv.value);
      const nome = fixa ? (el.dataset.nome || "") : cn.value.trim();
      if (qtd < 0 || valor < 0) { erro = "Quantidade e valor de tarefa não podem ser negativos."; return; }
      if (!fixa && !qtd && valor) qtd = 1;        // valor digitado sem quantidade: foi uma tarefa
      if (!qtd) return;
      if (!fixa && !valor && !nome) return;       // linha avulsa em branco
      const linha = { tipoId: fixa ? el.dataset.tipo : "", nome, valor, qtd };
      linhas.push(linha);
      const cg = el.querySelector('[data-t="guardar"]');
      if (cg && cg.checked && nome) guardar.push(linha);
    });
    return erro ? { erro } : { linhas, guardar };
  }

  /* ══════════════════════════════════════════════════════════
     REGISTRO DO DIA
     ══════════════════════════════════════════════════════════ */

  async function abrirRegistroDia(trabalho, opcoes) {
    opcoes = opcoes || {};
    const data = opcoes.data || Dados.hoje();
    const blocos = (await Dados.listar("blocos", { trabalhoId: trabalho.id }))
      .filter(b => b.escopo === "dia").sort((a, b) => a.ordem - b.ordem);

    const jaTem = (await Dados.listar("registros", { trabalhoId: trabalho.id })).find(r => r.data === data);
    const reg = jaTem || { trabalhoId: trabalho.id, data, horas: "", valor: "", observacoes: "", blocos: {} };

    const forma = trabalho.pagamento || "hora";
    const moeda = trabalho.moeda || "BRL";

    // As tarefas aparecem em trabalho pago por tarefa, e também em dia que
    // já tem tarefa lançada: o trabalho pode ter mudado de forma de pagamento
    // depois, e o que foi lançado continua na conta.
    const porTarefa = forma === "tarefa";
    const linhas = linhasDoFormulario(trabalho, reg);
    const comTarefas = porTarefa || linhas.some(l => +l.qtd > 0);
    if (porTarefa && !linhas.length) linhas.push({ fixa: false, nome: "", valor: "", qtd: 1 });

    const campoHorasHtml = campo({
      nome: "horas", rotulo: porTarefa ? "Horas trabalhadas (opcional)" : "Horas trabalhadas", tipo: "text",
      valor: reg.horas ? Dados.escreverHoras(reg.horas) : "",
      dica: "3h20",
      ajuda: `${porTarefa ? "Com as horas, dá para ver quanto saiu a sua hora. " : ""}Aceita <b>3h20</b>, <b>3:20</b>, <b>3,5</b> ou <b>90min</b>. <span class="u-eco" id="ecoHoras"></span>`,
    });

    const tarefasHtml = !comTarefas ? "" : `
      <div class="d-linha">
        <span class="d-rot">Tarefas do dia</span>
        <div class="u-tarefas" id="listaTarefas">${linhas.map(l => htmlLinhaTarefa(l, moeda)).join("")}</div>
        <button type="button" class="u-link u-mais" data-add-tar>＋ Tarefa com outro valor</button>
      </div>`;

    const corpo = `
      ${campo({ nome: "data", rotulo: "Dia", tipo: "date", valor: reg.data, obrigatorio: true })}
      ${porTarefa ? tarefasHtml : ""}
      ${campoHorasHtml}
      ${forma === "dia" ? campo({
        nome: "valor", rotulo: "Quanto você fez neste dia (" + moeda + ")", tipo: "number",
        valor: reg.valor, dica: "0,00",
        ajuda: "O total do dia, do jeito que a plataforma mostra.",
      }) : ""}
      ${porTarefa ? "" : tarefasHtml}
      ${forma === "hora" || comTarefas ? `<div class="u-conta" id="contaDia"></div>` : ""}
      ${campo({ nome: "observacoes", rotulo: "Observações do dia", tipo: "texto-longo", valor: reg.observacoes,
                dica: "Como foi, o que travou, o que combinaram" })}
      ${blocos.length ? `<div class="u-separa">Seus blocos</div>` : ""}
      ${blocos.map(b => Blocos.campoDia(b, (reg.blocos || {})[b.id])).join("")}
    `;

    const dlg = painel({
      titulo: jaTem ? "Editar o dia" : "Registrar o dia",
      subtitulo: trabalho.projeto || trabalho.empresa,
      acaoTexto: "Salvar o dia",
      corpo,
      extra: jaTem ? `<button type="button" class="u-link u-perigo-txt" data-apagar>Apagar este dia</button>` : "",
      acao: async (d) => {
        const horasTexto = ler(d, "horas");
        const horas = horasTexto ? Dados.lerHoras(horasTexto) : 0;
        if (horasTexto && horas === null) { erroNoPainel(d, "Não entendi as horas. Escreva como 3h20, 3:20, 3,5 ou 90min."); return false; }
        const novaData = ler(d, "data");
        if (!novaData) { erroNoPainel(d, "Escolha o dia."); return false; }
        if (novaData > Dados.hoje()) { erroNoPainel(d, "Esse dia ainda não chegou."); return false; }

        // Grava SEMPRE em cima do registro daquela data, sem mover nenhum
        // outro de lugar. Antes, trocar a data levava junto o registro que
        // estava aberto, e o dia de origem sumia da lista.
        const existente = (await Dados.listar("registros", { trabalhoId: trabalho.id }))
          .find(r => r.data === novaData);

        let tarefas = null;
        if (comTarefas) {
          const lido = lerLinhasTarefa(d);
          if (lido.erro) { erroNoPainel(d, lido.erro); return false; }
          tarefas = lido.linhas;
          // Avulsa marcada para guardar vira tipo do trabalho, e a linha do
          // dia já fica ligada a ele.
          if (lido.guardar.length) {
            const atual = (await Dados.obter("trabalhos", trabalho.id)) || trabalho;
            const tipos = tiposDe(atual).slice();
            lido.guardar.forEach(l => {
              l.tipoId = Dados.novoId();
              tipos.push({ id: l.tipoId, nome: l.nome, valor: l.valor });
            });
            await Dados.salvar("trabalhos", Object.assign({}, atual, { tipos }));
          }
        }

        const novo = Object.assign(
          {}, existente || { trabalhoId: trabalho.id, data: novaData }, {
            trabalhoId: trabalho.id,
            data: novaData,
            horas: horas || 0,
            valor: forma === "dia" ? (ler(d, "valor") === "" ? 0 : +ler(d, "valor")) : 0,
            observacoes: ler(d, "observacoes"),
            blocos: Blocos.lerCamposDia(d),
          });
        if (tarefas) novo.tarefas = tarefas;
        await Dados.salvar("registros", novo);
        aviso("Dia salvo.");
        if (opcoes.aoSalvar) await opcoes.aoSalvar();
      },
    });

    Blocos.ligarCamposDia(dlg);

    // Eco do que a ferramenta entendeu nas horas, e a conta do ganho.
    const campoHoras = dlg.querySelector('[name="horas"]');
    const campoValor = dlg.querySelector('[name="valor"]');
    const eco = dlg.querySelector("#ecoHoras");
    const conta = dlg.querySelector("#contaDia");
    const listaTarefas = dlg.querySelector("#listaTarefas");

    /* Soma as linhas de tarefa e escreve o total de cada uma ao lado. */
    function somarTarefas() {
      let total = 0, qtd = 0;
      if (!listaTarefas) return { total, qtd };
      listaTarefas.querySelectorAll("[data-tar]").forEach(el => {
        const cq = el.querySelector('[data-t="qtd"]');
        const cv = el.querySelector('[data-t="valor"]');
        const cn = el.querySelector('[data-t="nome"]');
        const v = Math.max(0, cv ? +cv.value || 0 : +el.dataset.valor || 0);
        let q = Math.max(0, +cq.value || 0);
        if (cv && !q && v && cq.value === "") q = 1;
        const sub = q * v;
        el.querySelector('[data-t="total"]').textContent = q && (v || !cv) ? Dados.escreverDinheiro(sub, moeda) : "";
        // só oferece guardar como tipo a avulsa que tem nome
        const guardar = el.querySelector(".u-guardar");
        if (guardar) guardar.hidden = !(cn && cn.value.trim());
        if (cv && !v && !(cn && cn.value.trim())) return;   // avulsa em branco não conta
        total += sub; qtd += q;
      });
      return { total, qtd };
    }

    function atualizarEco() {
      let h = 0;
      if (!campoHoras.value) eco.textContent = "";
      else {
        const lido = Dados.lerHoras(campoHoras.value);
        if (lido === null) { eco.textContent = "não entendi"; eco.className = "u-eco u-ruim"; }
        else { h = lido; eco.textContent = "entendi " + Dados.escreverHoras(h); eco.className = "u-eco u-bom"; }
      }
      if (!conta) return;

      const t = somarTarefas();
      const dinheiro = v => esc(Dados.escreverDinheiro(v, moeda));
      const valorHora = +trabalho.valor || 0;
      let ganho = t.total;
      const partes = [];
      if (forma === "hora") {
        ganho += h * valorHora;
        if (h) partes.push(Dados.escreverHoras(h) + " × " + dinheiro(valorHora));
        if (t.qtd) partes.push(dinheiro(t.total) + " em " + esc(escreverTarefas(t.qtd)));
      } else {
        if (forma === "dia" && campoValor) ganho += Math.max(0, +campoValor.value || 0);
        if (t.qtd) partes.push(esc(escreverTarefas(t.qtd)));
        if (h && ganho) partes.push("em " + Dados.escreverHoras(h) + ", sai a " + dinheiro(ganho / h) + " por hora");
      }
      if (!partes.length) { conta.innerHTML = ""; return; }
      conta.innerHTML = `Ganho do dia: <b>${dinheiro(ganho)}</b><span>${partes.join(forma === "hora" ? " + " : " · ")}</span>`;
    }
    campoHoras.addEventListener("input", atualizarEco);
    if (campoValor && conta) campoValor.addEventListener("input", atualizarEco);

    if (listaTarefas) {
      listaTarefas.addEventListener("input", atualizarEco);
      listaTarefas.addEventListener("click", ev => {
        const b = ev.target.closest("[data-tirar-tar]");
        if (!b) return;
        b.closest("[data-tar]").remove();
        atualizarEco();
      });
      dlg.querySelector("[data-add-tar]").addEventListener("click", () => {
        listaTarefas.insertAdjacentHTML("beforeend", htmlLinhaTarefa({ fixa: false, nome: "", valor: "", qtd: 1 }, moeda));
        listaTarefas.lastElementChild.querySelector('[data-t="valor"]').focus();
        atualizarEco();
      });
      // Em trabalho por tarefa, o primeiro campo a preencher é a quantidade.
      if (porTarefa) {
        const alvo = listaTarefas.querySelector(".u-tar:not(.u-avulsa) [data-t='qtd']") ||
                     listaTarefas.querySelector(".u-avulsa [data-t='valor']");
        if (alvo) { try { alvo.focus(); alvo.select(); } catch (e) {} }
      }
    }
    atualizarEco();

    // Trocar a data reabre o formulário naquele dia, já com o que estiver
    // gravado nele. É o que a pessoa espera: a data escolhe o dia que se edita.
    const campoData = dlg.querySelector('[name="data"]');
    campoData.addEventListener("change", () => {
      const nova = campoData.value;
      if (!nova || nova === reg.data) return;
      dlg.close(); dlg.remove();
      abrirRegistroDia(trabalho, Object.assign({}, opcoes, { data: nova }));
    });

    const apagar = dlg.querySelector("[data-apagar]");
    if (apagar) apagar.addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: "Apagar o registro deste dia?",
        texto: "As horas e as observações de " + Dados.dataBonita(reg.data) + " somem. Não dá para desfazer.",
        acaoTexto: "Apagar o dia", perigo: true,
      });
      if (!ok) return;
      await Dados.remover("registros", reg.id);
      dlg.close(); dlg.remove();
      aviso("Registro apagado.");
      if (opcoes.aoSalvar) await opcoes.aoSalvar();
    });

    return dlg;
  }

  /* ══════════════════════════════════════════════════════════
     PAGAMENTO RECEBIDO

     Existe separado de propósito: hora trabalhada não é dinheiro na
     conta, e em trabalho internacional a diferença é de semanas.
     ══════════════════════════════════════════════════════════ */

  async function abrirPagamento(trabalho, opcoes) {
    opcoes = opcoes || {};
    const pg = opcoes.pagamento || { trabalhoId: trabalho.id, data: Dados.hoje(), valor: "", moeda: trabalho.moeda || "BRL", taxa: "", nota: "" };

    const corpo = `
      ${campo({ nome: "data", rotulo: "Dia em que caiu", tipo: "date", valor: pg.data, obrigatorio: true })}
      <div class="u-dupla">
        ${campo({ nome: "valor", rotulo: "Valor recebido", tipo: "number", valor: pg.valor, obrigatorio: true, dica: "0,00" })}
        ${campo({ nome: "moeda", rotulo: "Moeda", tipo: "escolha", valor: pg.moeda,
                  opcoes: Object.keys(Dados.MOEDAS).map(m => ({ valor: m, nome: m + " · " + Dados.MOEDAS[m].nome })) })}
      </div>
      ${campo({ nome: "taxa", rotulo: "Câmbio que a plataforma usou", tipo: "number", valor: pg.taxa, dica: "deixe vazio para usar o do dia",
                ajuda: "Se você sabe quantos reais recebeu por dólar, escreva aqui. Esse valor substitui a cotação automática." })}
      ${campo({ nome: "nota", rotulo: "Observação", tipo: "text", valor: pg.nota, dica: "Wise, Payoneer, referente a julho" })}
      <div class="u-conta" id="contaPg"></div>
    `;

    const dlg = painel({
      titulo: pg.id ? "Editar pagamento" : "Registrar pagamento recebido",
      subtitulo: trabalho.projeto || trabalho.empresa,
      acaoTexto: "Salvar",
      corpo,
      extra: pg.id ? `<button type="button" class="u-link u-perigo-txt" data-apagar>Apagar</button>` : "",
      acao: async (d) => {
        const valor = +ler(d, "valor");
        if (!valor) { erroNoPainel(d, "Escreva o valor recebido."); return false; }
        await Dados.salvar("pagamentos", Object.assign({}, pg, {
          trabalhoId: trabalho.id,
          data: ler(d, "data") || Dados.hoje(),
          valor,
          moeda: ler(d, "moeda"),
          taxa: ler(d, "taxa") ? +ler(d, "taxa") : null,
          nota: ler(d, "nota"),
        }));
        aviso("Pagamento registrado.");
        if (opcoes.aoSalvar) await opcoes.aoSalvar();
      },
    });

    async function contaPagamento() {
      const caixa = dlg.querySelector("#contaPg");
      const valor = +ler(dlg, "valor"), moeda = ler(dlg, "moeda"), taxa = ler(dlg, "taxa");
      if (!valor || moeda === "BRL") { caixa.innerHTML = ""; return; }
      const r = await Dados.emReais(valor, moeda, ler(dlg, "data"), taxa ? +taxa : null);
      caixa.innerHTML = `Em reais: <b>${esc(Dados.escreverDinheiro(r.valor, "BRL"))}</b>
        <span>${taxa ? "câmbio que você digitou" : "câmbio de " + esc(Dados.dataBonita(r.dataTaxa || ler(dlg, "data")))}
        · 1 ${esc(moeda)} = ${(r.taxa || 0).toFixed(4).replace(".", ",")}${r.estimada ? " (estimado)" : ""}</span>`;
    }
    ["valor", "moeda", "taxa", "data"].forEach(n => {
      const el = dlg.querySelector(`[name="${n}"]`);
      if (el) el.addEventListener("change", contaPagamento);
      if (el) el.addEventListener("input", () => { clearTimeout(el._t); el._t = setTimeout(contaPagamento, 400); });
    });
    contaPagamento();

    const apagar = dlg.querySelector("[data-apagar]");
    if (apagar) apagar.addEventListener("click", async () => {
      const ok = await confirmar({ titulo: "Apagar este pagamento?", texto: "Não dá para desfazer.", acaoTexto: "Apagar", perigo: true });
      if (!ok) return;
      await Dados.remover("pagamentos", pg.id);
      dlg.close(); dlg.remove();
      aviso("Pagamento apagado.");
      if (opcoes.aoSalvar) await opcoes.aoSalvar();
    });

    return dlg;
  }

  /* ══════════════════════════════════════════════════════════
     FORMA DE PAGAMENTO, NO FORMULÁRIO DO TRABALHO

     O formulário de trabalho novo e o de editar usam as mesmas
     peças: o campo de valor muda de nome conforme a forma de
     pagamento, e em "por tarefa" ele dá lugar à lista de tipos.
     ══════════════════════════════════════════════════════════ */

  function htmlTipo(t) {
    const valor = t.valor === undefined || t.valor === null ? "" : t.valor;
    return `<div class="u-tipo" data-tipo="${esc(t.id || "")}">
      <input class="d-campo" data-t="nome" type="text" value="${esc(t.nome || "")}"
             placeholder="Nome da tarefa" aria-label="Nome da tarefa">
      <input class="d-campo" data-t="valor" type="number" min="0" step="any" inputmode="decimal"
             value="${esc(valor)}" placeholder="Valor" aria-label="Valor de cada tarefa">
      <button type="button" class="u-tira" data-tirar-tipo aria-label="Remover este tipo" title="Remover">×</button>
    </div>`;
  }

  function campoTipos(trabalho) {
    const tipos = tiposDe(trabalho);
    return `<div class="d-linha" id="caixaTipos" hidden>
      <span class="d-rot">Tipos de tarefa e quanto cada um paga</span>
      <div class="u-tipos" id="listaTipos">${(tipos.length ? tipos : [{}]).map(htmlTipo).join("")}</div>
      <button type="button" class="u-link u-mais" data-add-tipo>＋ Adicionar outro tipo</button>
      <span class="u-ajuda">Um tipo para cada valor que o projeto paga. Se cada tarefa tem um valor próprio,
        deixe em branco: no dia você lança o valor de cada uma.</span>
    </div>`;
  }

  function ligarFormaDePagamento(dlg) {
    const sel = dlg.querySelector('[name="pagamento"]');
    const ajuda = dlg.querySelector("#ajudaPag");
    const linhaValor = dlg.querySelector('[name="valor"]').closest(".d-linha");
    const rotValor = dlg.querySelector('label[for="c-valor"]');
    const caixa = dlg.querySelector("#caixaTipos");
    const lista = dlg.querySelector("#listaTipos");

    function atualizar() {
      const k = sel.value;
      if (ajuda) ajuda.textContent = (PAGAMENTOS[k] || {}).ajuda || "";
      rotValor.textContent = k === "hora" ? "Valor por hora" : k === "mes" ? "Valor por mês" : "Valor de referência (opcional)";
      linhaValor.hidden = k === "tarefa";
      linhaValor.parentElement.classList.toggle("u-sem-valor", k === "tarefa");
      caixa.hidden = k !== "tarefa";
    }
    sel.addEventListener("change", atualizar);
    atualizar();

    caixa.querySelector("[data-add-tipo]").addEventListener("click", () => {
      lista.insertAdjacentHTML("beforeend", htmlTipo({}));
      lista.lastElementChild.querySelector("input").focus();
    });
    lista.addEventListener("click", ev => {
      const b = ev.target.closest("[data-tirar-tipo]");
      if (!b) return;
      b.closest(".u-tipo").remove();
      if (!lista.children.length) lista.insertAdjacentHTML("beforeend", htmlTipo({}));
    });
  }

  /* Lê os tipos de tarefa do formulário. Devolve { erro } ou { tipos }. */
  function lerTipos(dlg) {
    const tipos = [];
    let erro = "";
    dlg.querySelectorAll("#listaTipos .u-tipo").forEach(el => {
      const cn = el.querySelector('[data-t="nome"]'), cv = el.querySelector('[data-t="valor"]');
      if (cv.validity && cv.validity.badInput) { erro = "Não entendi o valor de uma das tarefas. Use só números, como 0,35."; return; }
      const nome = cn.value.trim();
      if (!nome && cv.value === "") return;   // linha em branco
      const valor = cv.value === "" ? 0 : +cv.value;
      if (valor < 0) { erro = "O valor da tarefa não pode ser negativo."; return; }
      tipos.push({ id: el.dataset.tipo || Dados.novoId(), nome, valor });
    });
    if (erro) return { erro };
    // Tipo sem nome ganha um: "Tarefa" se for o único, "Tarefa 2" em diante.
    tipos.forEach((t, i) => { if (!t.nome) t.nome = tipos.length === 1 ? "Tarefa" : "Tarefa " + (i + 1); });
    return { tipos };
  }

  /* "Por hora · US$ 5,00 por hora", "Por tarefa · 3 tipos" */
  function rotuloPagamento(trabalho) {
    const forma = trabalho.pagamento, moeda = trabalho.moeda || "BRL";
    const nome = (PAGAMENTOS[forma] || {}).nome || "";
    if (forma === "tarefa") {
      const tipos = tiposDe(trabalho);
      if (tipos.length === 1) return nome + " · " + escreverUnitario(tipos[0].valor, moeda) + " cada";
      if (tipos.length > 1) return nome + " · " + tipos.length + " tipos";
      return nome;
    }
    if (forma !== "dia" && +trabalho.valor) {
      return nome + " · " + Dados.escreverDinheiro(trabalho.valor, moeda) + (forma === "hora" ? " por hora" : " por mês");
    }
    return nome;
  }

  /* ══════════════════════════════════════════════════════════
     A CONTA DO DINHEIRO

     Regra de ouro: o valor guardado é sempre na moeda original.
     A conversão é só uma leitura, feita na hora de mostrar.

     Tudo aqui é BRUTO. Não desconta imposto, MEI nem taxa de saque:
     o número líquido de verdade é o do pagamento recebido.
     ══════════════════════════════════════════════════════════ */

  function ganhoBruto(registro, trabalho) {
    if (!trabalho) return 0;
    // Tarefa lançada conta sempre. Se o trabalho mudar de forma de pagamento
    // depois, os dias antigos não perdem o que foi lançado.
    const tarefas = ganhoTarefas(registro);
    const forma = trabalho.pagamento;
    if (forma === "hora") return tarefas + (+registro.horas || 0) * (+trabalho.valor || 0);
    // Em "por tarefa", o valor do registro é o dia lançado à mão de quando o
    // trabalho ainda era "valor lançado no dia". Continua valendo.
    if (forma === "dia" || forma === "tarefa") return tarefas + (+registro.valor || 0);
    return tarefas;   // fixo no mês não sai do registro do dia
  }

  /* ══════════════════════════════════════════════════════════
     PERÍODO DE PAGAMENTO

     Nem todo projeto fecha do dia 1 ao dia 30. Muitos contam do dia
     20 de um mês ao dia 19 do seguinte. Cada trabalho guarda em
     diaPeriodo o dia em que o período dele começa (1 = mês normal).

     Um período é { de, ate }, datas ISO, as duas incluídas.
     ══════════════════════════════════════════════════════════ */

  const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
                        "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function diaDoPeriodo(trabalho) {
    const d = Math.round(+((trabalho && trabalho.diaPeriodo) || 1));
    return d >= 1 && d <= 31 ? d : 1;
  }

  function isoDe(ano, mes0, dia) { return new Date(Date.UTC(ano, mes0, dia)).toISOString().slice(0, 10); }
  function somarDias(iso, n) {
    const p = iso.split("-").map(Number);
    return isoDe(p[0], p[1] - 1, p[2] + n);
  }

  /* Início do período dentro de um mês. Dia 31 num mês de 30 vira dia 30,
     e dia 30 em fevereiro vira o último dia de fevereiro. */
  function inicioNoMes(ano, mes0, dia) {
    const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
    return isoDe(ano, mes0, Math.min(dia, ultimo));
  }

  /* O período que contém uma data. */
  function periodoDe(dataISO, dia) {
    dia = dia || 1;
    const p = (dataISO || Dados.hoje()).split("-").map(Number);
    let ano = p[0], mes0 = p[1] - 1;
    let de = inicioNoMes(ano, mes0, dia);
    if ((dataISO || Dados.hoje()) < de) { mes0 -= 1; de = inicioNoMes(ano, mes0, dia); }
    const proximo = inicioNoMes(ano, mes0 + 1, dia);
    return { de, ate: somarDias(proximo, -1) };
  }

  /* O período de antes (sentido -1) ou o de depois (+1). */
  function periodoVizinho(periodo, dia, sentido) {
    return periodoDe(sentido < 0 ? somarDias(periodo.de, -1) : somarDias(periodo.ate, 1), dia);
  }

  /* "Outubro de 2026" no mês normal, "20 set a 19 out de 2026" no resto. */
  function nomeDoPeriodo(periodo, dia) {
    const a = periodo.de.split("-").map(Number), b = periodo.ate.split("-").map(Number);
    if ((dia || 1) === 1) return MESES_LONGOS[a[1] - 1] + " de " + a[0];
    return a[2] + " " + MESES_CURTOS[a[1] - 1] + (a[0] !== b[0] ? " de " + a[0] : "") +
           " a " + b[2] + " " + MESES_CURTOS[b[1] - 1] + " de " + b[0];
  }

  /* O mês a que um dia de trabalho pertence nas contas do Painel: o mês em
     que o período daquele trabalho FECHA. Num projeto que conta do dia 20 ao
     dia 19, o dia 25/09 pertence a outubro. No mês normal não muda nada. */
  function mesDeFechamento(dataISO, trabalho) {
    return periodoDe(dataISO, diaDoPeriodo(trabalho)).ate.slice(0, 7);
  }

  /* O dia cai no período atual do trabalho? */
  function noPeriodoAtual(dataISO, trabalho) {
    const hoje = Dados.hoje();
    return dataISO >= periodoDe(hoje, diaDoPeriodo(trabalho)).de && dataISO <= hoje;
  }

  function ultimoDiaDoMes(ym) {
    const hoje = Dados.hoje();
    if (ym === hoje.slice(0, 7)) return hoje;
    const [a, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  }

  /* Busca uma cotação por moeda e por mês, e não uma por registro.
     Doze meses de dólar são doze consultas, guardadas para sempre. */
  const cacheTaxas = {};
  async function taxaDoMes(moeda, ym) {
    if (!moeda || moeda === "BRL") return { taxa: 1, estimada: false };
    const chave = moeda + "|" + ym;
    if (cacheTaxas[chave]) return cacheTaxas[chave];
    cacheTaxas[chave] = await Dados.cotacao(moeda, ultimoDiaDoMes(ym));
    return cacheTaxas[chave];
  }

  /* Resumo de um período. de e ate são datas ISO, ambas incluídas.
     Em vez de datas, dá para passar cabe(registro, trabalho) e
     cabePg(pagamento, trabalho): funções que dizem o que entra. É o que o
     Painel usa, porque lá cada trabalho tem o próprio período. */
  async function resumo({ trabalhos, registros, pagamentos, de, ate, cabe, cabePg }) {
    const porId = {};
    trabalhos.forEach(t => porId[t.id] = t);

    const regs = cabe ? registros.filter(r => cabe(r, porId[r.trabalhoId]))
                      : registros.filter(r => r.data >= de && r.data <= ate);
    const pgs = cabePg ? pagamentos.filter(p => cabePg(p, porId[p.trabalhoId]))
                       : pagamentos.filter(p => p.data >= de && p.data <= ate);

    let horas = 0, tarefas = 0;
    const dias = new Set();
    const previstoPorMoeda = {};
    let estimado = false;

    regs.forEach(r => {
      horas += +r.horas || 0;
      tarefas += qtdTarefas(r);
      if (diaFeito(r)) dias.add(r.data);
      const t = porId[r.trabalhoId];
      const g = ganhoBruto(r, t);
      if (!g) return;
      const m = (t && t.moeda) || "BRL";
      previstoPorMoeda[m] = (previstoPorMoeda[m] || 0) + g;
    });

    // Fixo no mês: entra uma vez por período em que o trabalho teve algum
    // registro. O período é o do próprio trabalho: num projeto que conta do
    // dia 20 ao dia 19, os dias 25/09 e 05/10 são o mesmo período, e o valor
    // fixo entra uma vez só, não duas.
    const mesesComRegistro = {};
    regs.forEach(r => {
      const ym = periodoDe(r.data, diaDoPeriodo(porId[r.trabalhoId])).de.slice(0, 7);
      (mesesComRegistro[r.trabalhoId] = mesesComRegistro[r.trabalhoId] || new Set()).add(ym);
    });
    trabalhos.filter(t => t.pagamento === "mes").forEach(t => {
      const meses = mesesComRegistro[t.id];
      if (!meses) return;
      const m = t.moeda || "BRL";
      previstoPorMoeda[m] = (previstoPorMoeda[m] || 0) + (+t.valor || 0) * meses.size;
    });

    // Converte tudo para reais usando a cotação do mês de cada linha.
    // semHorasBRL é o ganho dos dias sem horas lançadas (dia de tarefa em que
    // a pessoa não anotou o tempo, por exemplo). Ele entra no ganho, mas fica
    // fora do "por hora, na prática": dividir por horas que ninguém lançou
    // daria um valor por hora que não existe.
    let previstoBRL = 0, semHorasBRL = 0;
    for (const r of regs) {
      const t = porId[r.trabalhoId];
      const g = ganhoBruto(r, t);
      if (!g) continue;
      const tx = await taxaDoMes((t && t.moeda) || "BRL", r.data.slice(0, 7));
      previstoBRL += g * tx.taxa;
      if (!(+r.horas)) semHorasBRL += g * tx.taxa;
      if (tx.estimada) estimado = true;
    }
    for (const t of trabalhos.filter(x => x.pagamento === "mes")) {
      const meses = mesesComRegistro[t.id];
      if (!meses) continue;
      for (const ym of meses) {
        const tx = await taxaDoMes(t.moeda || "BRL", ym);
        previstoBRL += (+t.valor || 0) * tx.taxa;
        if (tx.estimada) estimado = true;
      }
    }

    let recebidoBRL = 0;
    for (const p of pgs) {
      const r = await Dados.emReais(+p.valor || 0, p.moeda, p.data, p.taxa);
      recebidoBRL += r.valor;
      if (r.estimada) estimado = true;
    }

    return {
      horas,
      tarefas,
      dias: dias.size,
      previstoPorMoeda,
      previstoBRL,
      recebidoBRL,
      emAbertoBRL: previstoBRL - recebidoBRL,
      porHoraBRL: horas > 0 ? (previstoBRL - semHorasBRL) / horas : 0,
      estimado,
    };
  }

  /* Escreve "US$ 320,00 + € 40,00" quando há mais de uma moeda. */
  function escreverPorMoeda(mapa) {
    const chaves = Object.keys(mapa).filter(m => mapa[m]);
    if (!chaves.length) return Dados.escreverDinheiro(0, "BRL");
    return chaves.map(m => Dados.escreverDinheiro(mapa[m], m)).join(" + ");
  }

  /* ══════════════════════════════════════════════════════════
     ESTILO DAS PEÇAS COMPARTILHADAS
     ══════════════════════════════════════════════════════════ */

  const CSS = `
  .u-dlg {
    /* margin:auto é o que centraliza um <dialog>. O reset do estilo.css
       zera a margem de tudo, e sem esta linha a janela nasce grudada no
       canto de cima à esquerda. */
    margin:auto;
    border:0; padding:0; border-radius:22px; width:min(560px, calc(100vw - 28px));
    max-height:min(86vh, 900px); background:var(--panel,#fff); color:var(--ink-2,#54606F);
    box-shadow:0 30px 70px -24px rgba(16,32,58,.42); overflow:visible;
  }
  .u-dlg.u-larga { width:min(760px, calc(100vw - 28px)); }
  .u-dlg::backdrop { background:rgba(16,32,58,.42); backdrop-filter:blur(3px); }
  .u-form { display:flex; flex-direction:column; max-height:inherit; }
  .u-cab {
    display:flex; align-items:flex-start; gap:14px; padding:22px 24px 15px;
    border-bottom:1px solid var(--line-soft,#EAE4D9);
  }
  .u-cab h2 {
    font-family:var(--display,Georgia,serif); font-weight:400; font-size:23px;
    letter-spacing:-0.015em; color:var(--ink,#10203A); line-height:1.2;
  }
  .u-cab p { font-size:13px; color:var(--ink-3,#66717F); margin-top:3px; }
  .u-fechar {
    margin-left:auto; background:none; border:0; cursor:pointer; font-size:24px; line-height:1;
    color:var(--ink-3,#66717F); padding:2px 7px; border-radius:9px; flex-shrink:0;
  }
  .u-fechar:hover { background:var(--bg-soft,#F1ECE3); color:var(--ink,#10203A); }
  .u-corpo { padding:20px 24px; overflow-y:auto; display:flex; flex-direction:column; gap:15px; }
  .u-rodape {
    display:flex; align-items:center; gap:14px; padding:15px 24px 20px;
    border-top:1px solid var(--line-soft,#EAE4D9);
  }
  .u-extra { flex:1; min-width:0; }
  .u-botoes { display:flex; gap:9px; }
  .u-btn {
    font:inherit; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap;
    padding:11px 19px; border-radius:999px; border:1px solid var(--line,#DED7CA);
    background:var(--panel,#fff); color:var(--ink,#10203A); transition:all .16s;
  }
  .u-btn:hover { border-color:var(--ink-3,#66717F); }
  .u-forte { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
  .u-forte:hover { background:#173E7E; border-color:#173E7E; }
  .u-forte:disabled { opacity:.6; cursor:default; }
  .u-perigo { background:#C4384A; border-color:#C4384A; }
  .u-perigo:hover { background:#A82C3D; border-color:#A82C3D; }
  .u-link {
    background:none; border:0; padding:0; cursor:pointer; font:inherit; font-size:13px;
    color:var(--ink-3,#66717F); text-decoration:underline; text-underline-offset:3px;
  }
  .u-link:hover { color:var(--ink,#10203A); }
  .u-perigo-txt:hover { color:#C4384A; }
  .u-texto { font-size:14.5px; line-height:1.6; }
  .u-nota { font-size:12.5px; color:var(--amber,#A85D24); background:var(--amber-suave,#FBF0E4);
    padding:9px 12px; border-radius:11px; }
  .u-erro { font-size:13.5px; color:#8E2233; background:#FBE9EB; border:1px solid #F1CDD2;
    padding:10px 13px; border-radius:11px; }
  .u-ajuda { font-size:12px; color:var(--ink-3,#66717F); line-height:1.5; }
  .u-ajuda b { color:var(--ink-2,#54606F); font-weight:600; }
  .u-eco { margin-left:2px; }
  .u-bom  { color:#1F7A6E; font-weight:500; }
  .u-ruim { color:#C4384A; font-weight:500; }
  .u-dupla { display:grid; grid-template-columns:1fr 128px; gap:12px; }
  .u-tripla { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .u-separa {
    font-size:11.5px; font-weight:500; letter-spacing:.07em; text-transform:uppercase;
    color:var(--ink-3,#66717F); padding-top:5px; border-top:1px solid var(--line-soft,#EAE4D9);
  }
  .u-conta {
    font-size:13.5px; color:var(--ink-2,#54606F); background:var(--signal-suave,#EAF1F8);
    border-radius:12px; padding:11px 14px; line-height:1.5;
  }
  .u-conta:empty { display:none; }
  .u-conta b { color:var(--ink,#10203A); font-weight:600; font-size:15px; }
  .u-conta span { display:block; font-size:12px; color:var(--ink-3,#66717F); margin-top:2px; }

  /* ── tarefas: no formulário do dia e no do trabalho ── */
  .u-dupla.u-sem-valor { grid-template-columns:minmax(0,190px); }
  .u-mais { align-self:flex-start; text-decoration:none; font-weight:500; color:var(--signal,#1A4893); padding:3px 0; }
  .u-mais:hover { color:var(--signal,#1A4893); text-decoration:underline; text-underline-offset:3px; }
  .u-tira {
    width:30px; height:30px; flex-shrink:0; border:0; border-radius:9px; cursor:pointer; background:none;
    font-size:19px; line-height:1; color:var(--ink-3,#66717F);
  }
  .u-tira:hover { background:#FBE9EB; color:#C4384A; }

  .u-tipos { display:flex; flex-direction:column; gap:8px; }
  .u-tipo { display:grid; grid-template-columns:minmax(0,1fr) 118px 30px; gap:8px; align-items:center; }
  .u-tipo [data-t="valor"], .u-tar-qtd, .u-tar-val { font-variant-numeric:tabular-nums; }

  .u-tarefas { display:flex; flex-direction:column; gap:8px; }
  .u-tar {
    display:grid; grid-template-columns:minmax(0,1fr) 84px 104px; gap:10px; align-items:center;
    padding:10px 12px; border-radius:13px; background:var(--panel-2,#FBF9F5);
    border:1px solid var(--line-soft,#EAE4D9);
  }
  .u-tar-nome { font-size:14px; font-weight:500; color:var(--ink,#10203A); min-width:0; overflow-wrap:anywhere; line-height:1.35; }
  .u-tar-nome small { display:block; font-size:12px; font-weight:400; color:var(--ink-3,#66717F); margin-top:1px; }
  .u-tar .d-campo { padding:8px 10px; }
  .u-tar-qtd, .u-tar-val { text-align:right; }
  .u-tar-total { font-size:13.5px; font-weight:500; color:var(--ink,#10203A); text-align:right;
    white-space:nowrap; font-variant-numeric:tabular-nums; }
  .u-tar-total:empty::before { content:"—"; color:var(--line,#DED7CA); font-weight:400; }

  .u-avulsa { grid-template-columns:minmax(0,1fr) 108px 84px 88px 30px;
    grid-template-areas:"desc val qtd total tira" "guardar guardar guardar guardar guardar"; }
  .u-avulsa .u-tar-desc { grid-area:desc; }
  .u-avulsa .u-tar-din { grid-area:val; }
  .u-avulsa .u-tar-vezes { grid-area:qtd; }
  .u-avulsa .u-tar-total { grid-area:total; }
  .u-avulsa .u-tira { grid-area:tira; }
  /* valor da avulsa: o símbolo da moeda fica dentro da caixa, para ninguém
     confundir com a quantidade */
  .u-tar-din {
    display:flex; align-items:center; gap:5px; min-width:0; padding:0 10px 0 9px; cursor:text;
    background:#fff; border:1px solid var(--line,#DED7CA); border-radius:11px;
  }
  .u-tar-din:focus-within { border-color:var(--signal,#1A4893); box-shadow:0 0 0 3px var(--signal-suave,#EAF1F8); }
  .u-tar-din span { font-size:12px; color:var(--ink-3,#66717F); flex-shrink:0; }
  .u-tar-din input {
    width:100%; min-width:0; border:0; outline:0; background:none; padding:8px 0;
    font:inherit; font-size:14.5px; color:var(--ink,#10203A); text-align:right;
  }
  .u-tar-vezes { display:flex; align-items:center; gap:6px; min-width:0; }
  .u-tar-vezes span { font-size:13px; color:var(--ink-3,#66717F); flex-shrink:0; }
  .u-tar-vezes input { min-width:0; }
  .u-guardar { grid-area:guardar; display:flex; align-items:center; gap:7px; font-size:12.5px;
    color:var(--ink-2,#54606F); cursor:pointer; }
  .u-guardar input { width:15px; height:15px; accent-color:var(--signal,#1A4893); flex-shrink:0; }
  .u-guardar[hidden], .d-linha[hidden] { display:none; }

  #ui-avisos { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:950;
    display:flex; flex-direction:column; gap:8px; align-items:center; pointer-events:none; }
  .u-aviso {
    background:var(--escuro,#0F1D33); color:var(--ink-claro,#F2EFE9); font-size:13.5px;
    padding:11px 18px; border-radius:999px; box-shadow:0 10px 30px -10px rgba(16,32,58,.5);
    animation:u-entra .22s ease-out;
  }
  .u-saindo { opacity:0; transition:opacity .3s; }
  @keyframes u-entra { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:none; } }

  @media (max-width:560px) {
    .u-dupla, .u-tripla { grid-template-columns:1fr; }
    .u-rodape { flex-wrap:wrap; }
    .u-botoes { width:100%; flex-wrap:wrap; }
    .u-botoes .u-btn { flex:1; }
    .u-tipo { grid-template-columns:minmax(0,1fr) 92px 30px; }
    /* no celular o nome da tarefa fica com a largura quase toda, e o total
       desce para baixo da quantidade */
    .u-tar { gap:8px; }
    .u-tar:not(.u-avulsa) { grid-template-columns:minmax(0,1fr) 92px; grid-template-areas:"nome qtd" "nome total"; row-gap:4px; }
    .u-tar:not(.u-avulsa) .u-tar-nome { grid-area:nome; }
    .u-tar:not(.u-avulsa) .u-tar-qtd { grid-area:qtd; }
    .u-tar:not(.u-avulsa) .u-tar-total { grid-area:total; font-size:12.5px; }
    .u-tar:not(.u-avulsa) .u-tar-total:empty { display:none; }
    .u-avulsa { grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr) 30px;
      grid-template-areas:"desc desc desc tira" "val qtd total total" "guardar guardar guardar guardar"; }
  }
  `;

  function injetarCss() {
    if (document.getElementById("css-ui")) return;
    const s = document.createElement("style");
    s.id = "css-ui";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  injetarCss();

  return {
    esc, painel, confirmar, aviso, erroNoPainel, campo, ler,
    abrirRegistroDia, abrirPagamento,
    tiposDe, ganhoTarefas, qtdTarefas, diaFeito, temAlgo, detalheTarefas,
    escreverQtd, escreverTarefas, escreverUnitario,
    campoTipos, ligarFormaDePagamento, lerTipos, rotuloPagamento,
    ganhoBruto, taxaDoMes, resumo, escreverPorMoeda,
    diaDoPeriodo, periodoDe, periodoVizinho, nomeDoPeriodo, mesDeFechamento, noPeriodoAtual,
    PAGAMENTOS, CICLOS,
  };
})();
