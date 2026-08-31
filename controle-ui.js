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
    hora: { nome: "Por hora",             ajuda: "O ganho do dia sai de horas × valor." },
    dia:  { nome: "Valor lançado no dia", ajuda: "Você digita quanto fez no dia. Serve para trabalho por tarefa, por entrega ou por lote." },
    mes:  { nome: "Fixo no mês",          ajuda: "Valor mensal. O dia só registra as horas." },
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

  function painel({ titulo, subtitulo, corpo, acao, acaoTexto, largo, extra }) {
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
            <button type="button" class="u-btn" data-cancelar>Cancelar</button>
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

  function confirmar({ titulo, texto, acaoTexto, perigo }) {
    return new Promise(ok => {
      const dlg = painel({
        titulo,
        corpo: `<p class="u-texto">${texto}</p>`,
        acaoTexto: acaoTexto || "Confirmar",
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

    const corpo = `
      ${campo({ nome: "data", rotulo: "Dia", tipo: "date", valor: reg.data, obrigatorio: true })}
      ${campo({
        nome: "horas", rotulo: "Horas trabalhadas", tipo: "text",
        valor: reg.horas ? Dados.escreverHoras(reg.horas) : "",
        dica: "3h20",
        ajuda: `Aceita <b>3h20</b>, <b>3:20</b>, <b>3,5</b> ou <b>90min</b>. <span class="u-eco" id="ecoHoras"></span>`,
      })}
      ${forma === "dia" ? campo({
        nome: "valor", rotulo: "Quanto você fez neste dia (" + moeda + ")", tipo: "number",
        valor: reg.valor, dica: "0,00",
        ajuda: "O total do dia, do jeito que a plataforma mostra.",
      }) : ""}
      ${forma === "hora" ? `<div class="u-conta" id="contaDia"></div>` : ""}
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

        await Dados.salvar("registros", Object.assign(
          {}, existente || { trabalhoId: trabalho.id, data: novaData }, {
            trabalhoId: trabalho.id,
            data: novaData,
            horas: horas || 0,
            valor: forma === "dia" ? (ler(d, "valor") === "" ? 0 : +ler(d, "valor")) : 0,
            observacoes: ler(d, "observacoes"),
            blocos: Blocos.lerCamposDia(d),
          }));
        aviso("Dia salvo.");
        if (opcoes.aoSalvar) await opcoes.aoSalvar();
      },
    });

    Blocos.ligarCamposDia(dlg);

    // Eco do que a ferramenta entendeu nas horas, e a conta do ganho.
    const campoHoras = dlg.querySelector('[name="horas"]');
    const eco = dlg.querySelector("#ecoHoras");
    const conta = dlg.querySelector("#contaDia");
    function atualizarEco() {
      const h = Dados.lerHoras(campoHoras.value);
      if (!campoHoras.value) { eco.textContent = ""; if (conta) conta.innerHTML = ""; return; }
      if (h === null) { eco.textContent = "não entendi"; eco.className = "u-eco u-ruim"; if (conta) conta.innerHTML = ""; return; }
      eco.textContent = "entendi " + Dados.escreverHoras(h);
      eco.className = "u-eco u-bom";
      if (conta && forma === "hora") {
        const ganho = h * (+trabalho.valor || 0);
        conta.innerHTML = `Ganho do dia: <b>${esc(Dados.escreverDinheiro(ganho, moeda))}</b>
          <span>${Dados.escreverHoras(h)} × ${esc(Dados.escreverDinheiro(+trabalho.valor || 0, moeda))}</span>`;
      }
    }
    campoHoras.addEventListener("input", atualizarEco);
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
                ajuda: "Se você sabe quantos reais deu cada dólar de verdade, escreva aqui. Esse número ganha do automático." })}
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
     A CONTA DO DINHEIRO

     Regra de ouro: o valor guardado é sempre na moeda original.
     A conversão é só uma leitura, feita na hora de mostrar.

     Tudo aqui é BRUTO. Não desconta imposto, MEI nem taxa de saque:
     o número líquido de verdade é o do pagamento recebido.
     ══════════════════════════════════════════════════════════ */

  function ganhoBruto(registro, trabalho) {
    if (!trabalho) return 0;
    if (trabalho.pagamento === "hora") return (+registro.horas || 0) * (+trabalho.valor || 0);
    if (trabalho.pagamento === "dia")  return (+registro.valor || 0);
    return 0;   // fixo no mês não sai do registro do dia
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

  /* Resumo de um período. de e ate são datas ISO, ambas incluídas. */
  async function resumo({ trabalhos, registros, pagamentos, de, ate }) {
    const porId = {};
    trabalhos.forEach(t => porId[t.id] = t);

    const regs = registros.filter(r => r.data >= de && r.data <= ate);
    const pgs = pagamentos.filter(p => p.data >= de && p.data <= ate);

    let horas = 0;
    const dias = new Set();
    const previstoPorMoeda = {};
    let estimado = false;

    regs.forEach(r => {
      horas += +r.horas || 0;
      if (r.horas) dias.add(r.data);
      const t = porId[r.trabalhoId];
      const g = ganhoBruto(r, t);
      if (!g) return;
      const m = (t && t.moeda) || "BRL";
      previstoPorMoeda[m] = (previstoPorMoeda[m] || 0) + g;
    });

    // Fixo no mês: entra uma vez por mês em que o trabalho teve algum registro.
    const mesesComRegistro = {};
    regs.forEach(r => {
      const ym = r.data.slice(0, 7);
      (mesesComRegistro[r.trabalhoId] = mesesComRegistro[r.trabalhoId] || new Set()).add(ym);
    });
    trabalhos.filter(t => t.pagamento === "mes").forEach(t => {
      const meses = mesesComRegistro[t.id];
      if (!meses) return;
      const m = t.moeda || "BRL";
      previstoPorMoeda[m] = (previstoPorMoeda[m] || 0) + (+t.valor || 0) * meses.size;
    });

    // Converte tudo para reais usando a cotação do mês de cada linha.
    let previstoBRL = 0;
    for (const r of regs) {
      const t = porId[r.trabalhoId];
      const g = ganhoBruto(r, t);
      if (!g) continue;
      const tx = await taxaDoMes((t && t.moeda) || "BRL", r.data.slice(0, 7));
      previstoBRL += g * tx.taxa;
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
      dias: dias.size,
      previstoPorMoeda,
      previstoBRL,
      recebidoBRL,
      emAbertoBRL: previstoBRL - recebidoBRL,
      porHoraBRL: horas > 0 ? previstoBRL / horas : 0,
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
  .u-cab p { font-size:13px; color:var(--ink-3,#8A94A1); margin-top:3px; }
  .u-fechar {
    margin-left:auto; background:none; border:0; cursor:pointer; font-size:24px; line-height:1;
    color:var(--ink-3,#8A94A1); padding:2px 7px; border-radius:9px; flex-shrink:0;
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
  .u-btn:hover { border-color:var(--ink-3,#8A94A1); }
  .u-forte { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
  .u-forte:hover { background:#173E7E; border-color:#173E7E; }
  .u-forte:disabled { opacity:.6; cursor:default; }
  .u-perigo { background:#C4384A; border-color:#C4384A; }
  .u-perigo:hover { background:#A82C3D; border-color:#A82C3D; }
  .u-link {
    background:none; border:0; padding:0; cursor:pointer; font:inherit; font-size:13px;
    color:var(--ink-3,#8A94A1); text-decoration:underline; text-underline-offset:3px;
  }
  .u-link:hover { color:var(--ink,#10203A); }
  .u-perigo-txt:hover { color:#C4384A; }
  .u-texto { font-size:14.5px; line-height:1.6; }
  .u-nota { font-size:12.5px; color:var(--amber,#A85D24); background:var(--amber-suave,#FBF0E4);
    padding:9px 12px; border-radius:11px; }
  .u-erro { font-size:13.5px; color:#8E2233; background:#FBE9EB; border:1px solid #F1CDD2;
    padding:10px 13px; border-radius:11px; }
  .u-ajuda { font-size:12px; color:var(--ink-3,#8A94A1); line-height:1.5; }
  .u-ajuda b { color:var(--ink-2,#54606F); font-weight:600; }
  .u-eco { margin-left:2px; }
  .u-bom  { color:#1F7A6E; font-weight:500; }
  .u-ruim { color:#C4384A; font-weight:500; }
  .u-dupla { display:grid; grid-template-columns:1fr 128px; gap:12px; }
  .u-tripla { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .u-separa {
    font-size:11.5px; font-weight:500; letter-spacing:.07em; text-transform:uppercase;
    color:var(--ink-3,#8A94A1); padding-top:5px; border-top:1px solid var(--line-soft,#EAE4D9);
  }
  .u-conta {
    font-size:13.5px; color:var(--ink-2,#54606F); background:var(--signal-suave,#EAF1F8);
    border-radius:12px; padding:11px 14px; line-height:1.5;
  }
  .u-conta:empty { display:none; }
  .u-conta b { color:var(--ink,#10203A); font-weight:600; font-size:15px; }
  .u-conta span { display:block; font-size:12px; color:var(--ink-3,#8A94A1); margin-top:2px; }

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
    .u-botoes { width:100%; }
    .u-botoes .u-btn { flex:1; }
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
    ganhoBruto, taxaDoMes, resumo, escreverPorMoeda,
    PAGAMENTOS, CICLOS,
  };
})();
