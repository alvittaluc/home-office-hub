/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — a tela de um trabalho

   Era uma página inteira (trabalho.html). Virou um módulo que
   desenha dentro de um pedaço da tela, para o Meu Controle ser
   uma página só: trocar de trabalho na coluna da esquerda não
   recarrega nada.

   Uso:
     Trabalho.montar(caixa, idDoTrabalho, { aoMudar, marcaHtml })

       aoMudar()    chamado quando algo muda e a coluna da esquerda
                    precisa se atualizar junto (horas, nome, cor)
       marcaHtml()  desenha o logo da empresa, do jeito do site
   ══════════════════════════════════════════════════════════════ */

const Trabalho = (function () {
  "use strict";

  const esc = UI.esc;

  let CAIXA = null, ID = null, OPC = {};
  let T = null, REGISTROS = [], PAGAMENTOS = [], BLOCOS = [];
  let editando = false;

  /* Uma data qualquer dentro do período que está na tela. null = o período
     de hoje. É o que as setas e a tabela de períodos mudam. */
  let REF = null;

  function periodoNaTela() { return UI.periodoDe(REF || Dados.hoje(), UI.diaDoPeriodo(T)); }
  function periodoDeHoje() { return UI.periodoDe(Dados.hoje(), UI.diaDoPeriodo(T)); }
  function ehOAtual(per) { return per.de === periodoDeHoje().de; }

  async function resumoDoPeriodo(per) {
    return await UI.resumo({
      trabalhos: [T], registros: REGISTROS, pagamentos: PAGAMENTOS, de: per.de, ate: per.ate,
    });
  }

  /* ══════════════════════════════════════════════════════════
     CARREGAR
     ══════════════════════════════════════════════════════════ */

  async function ler() {
    T = await Dados.obter("trabalhos", ID);
    if (!T) return false;
    [REGISTROS, PAGAMENTOS, BLOCOS] = await Promise.all([
      Dados.listar("registros", { trabalhoId: ID }),
      Dados.listar("pagamentos", { trabalhoId: ID }),
      Dados.listar("blocos", { trabalhoId: ID }),
    ]);
    REGISTROS.sort((a, b) => (a.data < b.data ? 1 : -1));
    PAGAMENTOS.sort((a, b) => (a.data < b.data ? 1 : -1));
    BLOCOS.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    return true;
  }

  async function montar(caixa, id, opcoes) {
    CAIXA = caixa; ID = id; OPC = opcoes || {};
    editando = false;
    REF = null;
    if (!(await ler())) {
      caixa.innerHTML = `<div class="t-cartao t-vaziao">
        <h3>Este trabalho não existe mais</h3>
        <p>Ele pode ter sido apagado, ou os dados deste navegador foram limpos.</p></div>`;
      return false;
    }
    await desenhar();
    return true;
  }

  async function recarregar() { await ler(); await desenhar(); if (OPC.aoMudar) OPC.aoMudar(); }

  function marcaHtml(nome) {
    if (OPC.marcaHtml) return OPC.marcaHtml(nome, 52);
    return `<span class="t-marca" style="background:var(--bg-soft,#F1ECE3);color:var(--ink-3,#66717F);">${esc((nome || "?").trim().slice(0, 2).toUpperCase())}</span>`;
  }

  /* ══════════════════════════════════════════════════════════
     DESENHO
     ══════════════════════════════════════════════════════════ */

  async function desenhar() {
    const resumo = await resumoDoPeriodo(periodoNaTela());
    const moeda = T.moeda || "BRL";
    const meus = BLOCOS.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const diaPer = UI.diaDoPeriodo(T);

    CAIXA.innerHTML = `
      <div class="t-cab" style="--cor:${esc(T.cor || "#2C6BB5")}">
        ${marcaHtml(T.empresa)}
        <div style="min-width:0;">
          <h1>${esc(T.projeto || T.empresa)}</h1>
          <div class="t-sub">${esc(T.empresa)}${
            T.plataforma && Dados.normalizar(T.plataforma) !== Dados.normalizar(T.empresa)
              ? " · " + esc(T.plataforma) : ""}</div>
          <div class="t-etiqs">
            <span class="t-etiq viva">${esc(UI.rotuloPagamento(T))}</span>
            <span class="t-etiq">${esc(UI.CICLOS[T.ciclo] || "")}</span>
            ${diaPer !== 1 ? `<span class="t-etiq">Período começa no dia ${diaPer}</span>` : ""}
            ${T.inicio ? `<span class="t-etiq">Desde ${esc(Dados.dataBonita(T.inicio))}</span>` : ""}
            ${T.estado !== "ativo" ? `<span class="t-etiq">${esc(T.estado === "pausado" ? "Pausado" : "Encerrado")}</span>` : ""}
          </div>
        </div>
        <div class="t-cab-bts">
          <button class="t-b forte" data-dia>Registrar o dia</button>
          <button class="t-b" data-pagamento>Recebi um pagamento</button>
          <button class="t-b pequeno" data-editar-trab>Editar</button>
        </div>
      </div>

      <div class="t-grade" id="tFixos">${htmlFixos(resumo, moeda)}</div>

      <div class="t-sec-cab">
        <div>
          <h2>Sua página</h2>
          <p>${meus.length ? "Os blocos que você acrescentou. Os do dia se preenchem aqui mesmo."
                           : "Aqui você monta o que este projeto precisa e nenhum outro tem."}</p>
        </div>
        <div class="t-sec-bts">
          <button class="t-b pequeno" data-add hidden>Adicionar bloco</button>
          <button class="t-b pequeno" data-modo>Editar página</button>
        </div>
      </div>
      <div class="t-grade" id="grade">${meus.length ? meus.map(htmlBloco).join("") : htmlSemBlocos()}</div>`;

    montarBlocos();
    ligar();
    document.body.classList.toggle("t-editando", editando);
    const add = CAIXA.querySelector("[data-add]");
    if (add) add.hidden = !editando;
    const modo = CAIXA.querySelector("[data-modo]");
    if (modo) modo.textContent = editando ? "Concluir" : "Editar página";
    if (editando) ligarArrasto();
  }

  /* Os quatro blocos que não se apagam. */
  function htmlFixos(resumo, moeda) {
    const per = periodoNaTela(), dia = UI.diaDoPeriodo(T), atual = ehOAtual(per);
    const brutoMoeda = resumo.previstoPorMoeda[moeda] || 0;
    const hoje = REGISTROS.find(r => r.data === Dados.hoje());

    // O cartão de hoje fala em tarefas quando o trabalho é pago por tarefa.
    const porTarefa = T.pagamento === "tarefa";
    const qtdHoje = hoje ? UI.qtdTarefas(hoje) : 0;
    const feitoHoje = !!(hoje && (hoje.horas || (porTarefa && UI.diaFeito(hoje))));
    let marcaHoje = porTarefa ? "Ainda sem tarefas hoje" : "Ainda sem horas hoje";
    if (feitoHoje && porTarefa) {
      marcaHoje = "✓ " + [
        qtdHoje ? UI.escreverTarefas(qtdHoje) : "",
        hoje.horas ? Dados.escreverHoras(hoje.horas) : "",
      ].filter(Boolean).join(" em ");
      if (!qtdHoje && !hoje.horas) marcaHoje = "✓ Dia registrado";
    } else if (feitoHoje) {
      marcaHoje = "✓ " + Dados.escreverHoras(hoje.horas) + " registradas";
    }
    const ganhoHoje = porTarefa && hoje ? UI.ganhoBruto(hoje, T) : 0;

    return `
      <div class="t-cartao">
        <h2>Hoje</h2>
        <div class="t-corpo t-hoje">
          <span class="t-hoje-marca${feitoHoje ? " feito" : ""}">${esc(marcaHoje)}</span>
          ${ganhoHoje ? `<p class="t-menor">Ganho de hoje: <b style="color:var(--ink,#10203A);font-weight:600;">${esc(Dados.escreverDinheiro(ganhoHoje, moeda))}</b></p>` : ""}
          ${hoje && hoje.observacoes ? `<p class="t-menor" style="line-height:1.55;">${esc(hoje.observacoes)}</p>` : ""}
          <button class="t-b pequeno${feitoHoje ? "" : " forte"}" data-dia style="align-self:flex-start;">
            ${porTarefa ? (feitoHoje ? "Editar o dia" : "Lançar as tarefas")
                        : (feitoHoje ? "Editar as horas" : "Lançar as horas")}</button>
          ${buracos()}
        </div>
      </div>

      <div class="t-cartao t-l2">
        <div class="t-per">
          <button class="t-per-seta" data-per="-1" title="Período anterior" aria-label="Período anterior">‹</button>
          <div class="t-per-meio">
            <h2>${esc(UI.nomeDoPeriodo(per, dia))}</h2>
            <span>${atual ? "Período atual" : "Período encerrado"} · ${esc(Dados.dataBonita(per.de))} a ${esc(Dados.dataBonita(per.ate))}</span>
          </div>
          <button class="t-per-seta" data-per="1" title="Próximo período" aria-label="Próximo período"${atual ? " disabled" : ""}>›</button>
          ${atual ? "" : `<button class="t-b pequeno" data-per-atual>Voltar ao atual</button>`}
        </div>
        <div class="t-corpo t-nums">
          ${porTarefa || resumo.tarefas
            ? `<div><div class="t-num">${esc(UI.escreverQtd(resumo.tarefas))}</div>
                <div class="t-rot">${resumo.tarefas === 1 ? "tarefa" : "tarefas"} em ${resumo.dias} ${resumo.dias === 1 ? "dia" : "dias"}</div>
                ${resumo.horas ? `<div class="t-menor">${esc(Dados.escreverHoras(resumo.horas))} de trabalho</div>` : ""}</div>`
            : `<div><div class="t-num">${esc(Dados.escreverHoras(resumo.horas) || "0h")}</div>
                <div class="t-rot">horas em ${resumo.dias} ${resumo.dias === 1 ? "dia" : "dias"}</div></div>`}
          <div><div class="t-num">${esc(Dados.escreverDinheiro(brutoMoeda, moeda))}</div>
            <div class="t-rot">bruto no período</div>
            ${moeda !== "BRL" ? `<div class="t-menor">${esc(Dados.escreverDinheiro(resumo.previstoBRL, "BRL"))}${resumo.estimado ? " (câmbio estimado)" : ""}</div>` : ""}</div>
          <div><div class="t-num">${esc(Dados.escreverDinheiro(resumo.recebidoBRL, "BRL"))}</div>
            <div class="t-rot">recebido no período</div></div>
          <div><div class="t-num">${resumo.horas || !porTarefa ? esc(Dados.escreverDinheiro(resumo.porHoraBRL, "BRL")) : "—"}</div>
            <div class="t-rot">por hora, na prática</div>
            ${porTarefa && !resumo.horas ? `<div class="t-menor">aparece quando você lança as horas</div>` : ""}</div>
        </div>
      </div>

      <div class="t-cartao t-l2">
        <h2>Dias deste período</h2>
        <div class="t-corpo b-rolagem">${htmlHistorico(per)}</div>
      </div>

      <div class="t-cartao">
        <h2>Pagamentos recebidos</h2>
        <div class="t-corpo">${htmlPagamentos()}</div>
      </div>

      <div class="t-cartao t-l3">
        <h2>Todos os períodos</h2>
        <div class="t-corpo b-rolagem">${htmlPeriodos(per)}</div>
      </div>`;
  }

  /* Uma linha por período em que houve dia registrado ou pagamento, do mais
     novo para o mais antigo. Clicar numa linha abre aquele período. */
  function htmlPeriodos(naTela) {
    const dia = UI.diaDoPeriodo(T);
    const moeda = T.moeda || "BRL";
    const mapa = {};
    const linhaDe = data => {
      const p = UI.periodoDe(data, dia);
      return mapa[p.de] || (mapa[p.de] = { per: p, horas: 0, tarefas: 0, dias: new Set(), bruto: 0, recebido: {}, temRegistro: false });
    };
    REGISTROS.forEach(r => {
      if (!UI.temAlgo(r)) return;
      const l = linhaDe(r.data);
      l.temRegistro = true;
      l.horas += +r.horas || 0;
      l.tarefas += UI.qtdTarefas(r);
      if (UI.diaFeito(r)) l.dias.add(r.data);
      l.bruto += UI.ganhoBruto(r, T);
    });
    PAGAMENTOS.forEach(p => {
      const l = linhaDe(p.data);
      l.recebido[p.moeda || "BRL"] = (l.recebido[p.moeda || "BRL"] || 0) + (+p.valor || 0);
    });
    linhaDe(Dados.hoje());   // o período atual aparece sempre, mesmo vazio

    const linhas = Object.keys(mapa).sort().reverse().map(k => mapa[k]);
    linhas.forEach(l => { if (T.pagamento === "mes" && l.temRegistro) l.bruto += +T.valor || 0; });
    const comTarefas = T.pagamento === "tarefa" || linhas.some(l => l.tarefas);

    return `<table class="t-hist t-pers">
      <thead><tr><th>Período</th>${comTarefas ? "<th>Tarefas</th>" : ""}<th>Horas</th><th>Dias</th><th>Bruto</th><th>Recebido</th></tr></thead>
      <tbody>${linhas.map(l => `<tr data-abrir-per="${esc(l.per.de)}"${l.per.de === naTela.de ? ' class="t-sel"' : ""}>
        <td class="t-dia">${esc(UI.nomeDoPeriodo(l.per, dia))}${ehOAtual(l.per) ? ' <span class="t-agora">atual</span>' : ""}</td>
        ${comTarefas ? `<td class="t-h">${l.tarefas ? esc(UI.escreverQtd(l.tarefas)) : "—"}</td>` : ""}
        <td class="t-h">${esc(Dados.escreverHoras(l.horas) || "—")}</td>
        <td class="t-h">${l.dias.size || "—"}</td>
        <td class="t-h">${l.bruto ? esc(Dados.escreverDinheiro(l.bruto, moeda)) : "—"}</td>
        <td class="t-h">${Object.keys(l.recebido).length ? esc(UI.escreverPorMoeda(l.recebido)) : "—"}</td>
      </tr>`).join("")}</tbody></table>
      <p class="t-menor" style="padding:11px 10px 0;">Clique em um período para ver os dias e os números dele. "Recebido" conta pela data em que o dinheiro caiu.</p>`;
  }

  /* Dias sem registro na semana, dito sem cobrar nada de ninguém. */
  function buracos() {
    const porTarefa = T.pagamento === "tarefa";
    const de = Dados.segundaDa(Dados.hoje());
    const passados = Dados.diasEntre(de, Dados.hoje()) + 1;
    const feitos = new Set(REGISTROS.filter(r => r.data >= de && r.data <= Dados.hoje() &&
      (r.horas || (porTarefa && UI.diaFeito(r)))).map(r => r.data)).size;
    const faltam = passados - feitos;
    if (faltam <= 0) return `<p class="t-menor">Semana toda registrada até aqui.</p>`;
    return `<p class="t-menor">${faltam} ${faltam === 1 ? "dia desta semana ainda não tem" : "dias desta semana ainda não têm"} ${porTarefa ? "tarefas" : "horas"}.
      Dá para lançar depois, é só escolher a data.</p>`;
  }

  function htmlHistorico(per) {
    const comAlgo = REGISTROS.filter(r => r.data >= per.de && r.data <= per.ate && UI.temAlgo(r));
    if (!comAlgo.length) {
      return `<p class="t-vazio">${REGISTROS.length ? "Nenhum dia registrado neste período." : "Nenhum dia registrado ainda."}</p>`;
    }
    const lista = comAlgo;
    const moeda = T.moeda || "BRL";
    // As colunas de tarefa aparecem pelo que os dias têm, e não só pela forma
    // de pagamento de hoje: o trabalho pode ter mudado de forma no caminho.
    const comTarefas = T.pagamento === "tarefa" || lista.some(r => UI.qtdTarefas(r));
    const comGanho = T.pagamento === "dia" || comTarefas;
    const celulaTarefas = r => {
      const qtd = UI.qtdTarefas(r);
      if (!qtd) return "—";
      const linhas = (r.tarefas || []).filter(l => l && +l.qtd > 0).length;
      return esc(UI.escreverQtd(qtd)) +
        (linhas > 1 ? `<span class="t-det">${esc(UI.detalheTarefas(r, T))}</span>` : "");
    };
    return `<table class="t-hist">
      <thead><tr><th>Dia</th>${comTarefas ? "<th>Tarefas</th>" : ""}<th>Horas</th>${comGanho ? "<th>Ganho</th>" : ""}<th>Observações</th></tr></thead>
      <tbody>${lista.map(r => {
        const ganho = comGanho ? UI.ganhoBruto(r, T) : 0;
        return `<tr data-reg="${esc(r.data)}">
        <td class="t-dia">${esc(Dados.dataBonita(r.data))}</td>
        ${comTarefas ? `<td class="t-h t-tar">${celulaTarefas(r)}</td>` : ""}
        <td class="t-h">${+r.horas ? esc(Dados.escreverHoras(r.horas)) : "—"}</td>
        ${comGanho ? `<td class="t-h">${esc(ganho ? Dados.escreverDinheiro(ganho, moeda) : "—")}</td>` : ""}
        <td class="t-obs">${esc(r.observacoes || "")}</td>
      </tr>`; }).join("")}</tbody></table>`;
  }

  function htmlPagamentos() {
    if (!PAGAMENTOS.length) {
      return `<p class="t-vazio">Nada recebido ainda.<br><span style="font-size:12.5px;">
        Quando o dinheiro cair, registre com o câmbio real da plataforma.</span></p>`;
    }
    return `<ul class="t-pgs">${PAGAMENTOS.slice(0, 8).map(p => `<li>
      <button data-pg="${esc(p.id)}">
        <span class="t-val">${esc(Dados.escreverDinheiro(p.valor, p.moeda))}</span>
        <span class="t-data">${esc(Dados.dataBonita(p.data))}${p.nota ? " · " + esc(p.nota) : ""}${p.taxa ? " · câmbio " + Number(p.taxa).toFixed(4).replace(".", ",") : ""}</span>
      </button></li>`).join("")}</ul>`;
  }

  function htmlSemBlocos() {
    return `<div class="t-vazio-blocos">
      <h3>Nenhum bloco ainda</h3>
      <p>Cada projeto trabalha de um jeito. Acrescente o que faltar: um contador de tarefas,
         os links das plataformas, as regras que você não pode esquecer, uma meta, um gráfico.</p>
      <button class="t-b forte" data-add2>Adicionar o primeiro bloco</button>
    </div>`;
  }

  /* ── um bloco na grade ── */
  function htmlBloco(b) {
    const larg = Math.min(3, Math.max(1, b.largura || 1));
    return `<div class="t-cartao t-meu${larg === 2 ? " t-l2" : larg === 3 ? " t-l3" : ""}" data-bloco-id="${esc(b.id)}">
      <div class="t-cab-bloco">
        <span class="t-alca" title="Arrastar para mudar de lugar" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><circle cx="5" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="5" cy="7" r="1.3"/><circle cx="9" cy="7" r="1.3"/><circle cx="5" cy="11" r="1.3"/><circle cx="9" cy="11" r="1.3"/></svg>
        </span>
        <h2>${esc(b.rotulo)}</h2>
        <button class="t-editar-b" data-editar-bloco="${esc(b.id)}" title="Ajustar bloco" aria-label="Ajustar bloco">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5 11.5 4.5 5 11H3V9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg></button>
        <button class="t-tirar-b" data-tirar-bloco="${esc(b.id)}" title="Remover bloco" aria-label="Remover bloco">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
      </div>
      <div class="t-corpo"></div>
      <div class="t-larguras" role="group" aria-label="Largura do bloco">
        ${[1, 2, 3].map(n => `<button data-larg="${n}" data-para="${esc(b.id)}" aria-pressed="${larg === n}">${n === 1 ? "1 coluna" : n + " colunas"}</button>`).join("")}
      </div>
    </div>`;
  }

  function contexto() {
    return { salvar: salvarBloco, salvarDia, registros: REGISTROS, blocos: BLOCOS, trabalho: T };
  }

  function montarBlocos(pular) {
    const ctx = contexto();
    BLOCOS.forEach(b => {
      if (pular && b.id === pular) return;
      const caixa = CAIXA.querySelector(`[data-bloco-id="${b.id}"] .t-corpo`);
      if (!caixa) return;
      try { Blocos.montar(caixa, b, ctx); }
      catch (e) { console.error("bloco", b.tipo, e); caixa.innerHTML = '<p class="b-erro">Não foi possível exibir este bloco.</p>'; }
    });
  }

  /* ══════════════════════════════════════════════════════════
     GRAVAR

     salvarDia é o que faz o bloco do dia funcionar no clique.
     Ele grava e atualiza só o que depende daquele valor, sem
     redesenhar o bloco que a pessoa está usando: redesenhar
     tiraria o foco e faria a tela piscar a cada clique.
     ══════════════════════════════════════════════════════════ */

  async function salvarBloco(bloco) {
    const salvo = await Dados.salvar("blocos", bloco);
    const i = BLOCOS.findIndex(b => b.id === salvo.id);
    if (i >= 0) BLOCOS[i] = salvo; else BLOCOS.push(salvo);
    return salvo;
  }

  async function salvarDia(blocoId, valor) {
    const hoje = Dados.hoje();
    const atual = REGISTROS.find(r => r.data === hoje);
    const base = atual || { trabalhoId: ID, data: hoje, horas: 0, valor: 0, observacoes: "", blocos: {} };
    const blocos = Object.assign({}, base.blocos || {});
    if (valor === "" || valor === undefined || valor === null) delete blocos[blocoId];
    else blocos[blocoId] = valor;

    const salvo = await Dados.salvar("registros", Object.assign({}, base, { blocos }));
    const i = REGISTROS.findIndex(r => r.id === salvo.id);
    if (i >= 0) REGISTROS[i] = salvo; else REGISTROS.unshift(salvo);
    REGISTROS.sort((a, b) => (a.data < b.data ? 1 : -1));

    await atualizarDependentes(blocoId);
    return salvo;
  }

  /* Redesenha os números do topo e os blocos que leem o histórico
     (meta e gráfico), menos o bloco que a pessoa está mexendo. */
  async function atualizarDependentes(pular) {
    await desenharFixos();

    const ctx = contexto();
    BLOCOS.forEach(b => {
      if (b.id === pular) return;
      if (b.tipo !== "meta" && b.tipo !== "grafico") return;
      const caixa = CAIXA.querySelector(`[data-bloco-id="${b.id}"] .t-corpo`);
      if (caixa) { try { Blocos.montar(caixa, b, ctx); } catch (e) { console.error(e); } }
    });
    if (OPC.aoMudar) OPC.aoMudar();
  }

  /* ══════════════════════════════════════════════════════════
     LIGAÇÕES
     ══════════════════════════════════════════════════════════ */

  /* Redesenha só os cartões de cima, para o período que está na tela. */
  async function desenharFixos() {
    const fixos = CAIXA.querySelector("#tFixos");
    if (!fixos) return;
    const resumo = await resumoDoPeriodo(periodoNaTela());
    fixos.innerHTML = htmlFixos(resumo, T.moeda || "BRL");
    ligarFixos();
  }

  async function irParaPeriodo(per) {
    REF = ehOAtual(per) ? null : per.de;
    await desenharFixos();
  }

  function ligarFixos() {
    CAIXA.querySelectorAll("#tFixos [data-per]").forEach(b => b.addEventListener("click", () =>
      irParaPeriodo(UI.periodoVizinho(periodoNaTela(), UI.diaDoPeriodo(T), +b.dataset.per))));
    const voltar = CAIXA.querySelector("#tFixos [data-per-atual]");
    if (voltar) voltar.addEventListener("click", () => irParaPeriodo(periodoDeHoje()));
    CAIXA.querySelectorAll("#tFixos [data-abrir-per]").forEach(tr => tr.addEventListener("click", async () => {
      await irParaPeriodo(UI.periodoDe(tr.dataset.abrirPer, UI.diaDoPeriodo(T)));
      const topo = CAIXA.querySelector("#tFixos");
      if (topo) topo.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    CAIXA.querySelectorAll("#tFixos [data-dia]").forEach(b => b.addEventListener("click", abrirDia));
    CAIXA.querySelectorAll("[data-pg]").forEach(b => b.addEventListener("click", () =>
      UI.abrirPagamento(T, { pagamento: PAGAMENTOS.find(p => p.id === b.dataset.pg), aoSalvar: recarregar })));
    CAIXA.querySelectorAll("[data-reg]").forEach(tr => tr.addEventListener("click", () =>
      UI.abrirRegistroDia(T, { data: tr.dataset.reg, aoSalvar: recarregar })));
  }

  function abrirDia() { UI.abrirRegistroDia(T, { aoSalvar: recarregar }); }

  function ligar() {
    ligarFixos();
    CAIXA.querySelectorAll(".t-cab-bts [data-dia]").forEach(b => b.addEventListener("click", abrirDia));

    const pg = CAIXA.querySelector("[data-pagamento]");
    if (pg) pg.addEventListener("click", () => UI.abrirPagamento(T, { aoSalvar: recarregar }));

    const et = CAIXA.querySelector("[data-editar-trab]");
    if (et) et.addEventListener("click", editarTrabalho);

    const modo = CAIXA.querySelector("[data-modo]");
    if (modo) modo.addEventListener("click", () => { editando = !editando; desenhar(); });

    [CAIXA.querySelector("[data-add]"), CAIXA.querySelector("[data-add2]")].forEach(b => {
      if (b) b.addEventListener("click", () => { editando = true; abrirCatalogo(); });
    });

    CAIXA.querySelectorAll("[data-editar-bloco]").forEach(b => b.addEventListener("click", () =>
      ajustarBloco(BLOCOS.find(x => x.id === b.dataset.editarBloco))));

    CAIXA.querySelectorAll("[data-tirar-bloco]").forEach(b => b.addEventListener("click", async () => {
      const bloco = BLOCOS.find(x => x.id === b.dataset.tirarBloco);
      const temHistorico = bloco.escopo === "dia" && REGISTROS.some(r => r.blocos && r.blocos[bloco.id] !== undefined);
      const ok = await UI.confirmar({
        titulo: "Remover o bloco " + esc(bloco.rotulo) + "?",
        texto: temHistorico
          ? "Os números que você já lançou nele continuam guardados nos dias, mas não voltam se você criar outro bloco igual."
          : "O bloco sai da página.",
        acaoTexto: "Remover", perigo: true,
      });
      if (!ok) return;
      await Dados.remover("blocos", bloco.id);
      await recarregar();
      UI.aviso("Bloco removido.");
    }));

    CAIXA.querySelectorAll("[data-larg]").forEach(b => b.addEventListener("click", async () => {
      const bloco = BLOCOS.find(x => x.id === b.dataset.para);
      bloco.largura = +b.dataset.larg;
      await Dados.salvar("blocos", bloco);
      await recarregar();
    }));
  }

  /* ══════════════════════════════════════════════════════════
     ARRASTAR PARA REORDENAR
     Eventos de ponteiro, e não a API antiga de arrastar e soltar:
     aquela não funciona no celular e não desenha nada no caminho.
     ══════════════════════════════════════════════════════════ */

  function ligarArrasto() {
    const grade = CAIXA.querySelector("#grade");
    if (!grade) return;

    grade.querySelectorAll(".t-meu").forEach(cartao => {
      const alca = cartao.querySelector(".t-alca");
      if (!alca) return;

      alca.addEventListener("pointerdown", ev => {
        ev.preventDefault();
        const r = cartao.getBoundingClientRect();
        const dx = ev.clientX - r.left, dy = ev.clientY - r.top;

        const lugar = document.createElement("div");
        lugar.className = "t-lugar " + (cartao.className.match(/t-l[23]/) || [""])[0];
        lugar.style.minHeight = r.height + "px";
        cartao.after(lugar);

        cartao.classList.add("t-arrastando");
        Object.assign(cartao.style, {
          position: "fixed", zIndex: 500, width: r.width + "px", height: r.height + "px",
          left: r.left + "px", top: r.top + "px", pointerEvents: "none", margin: "0",
        });

        function mover(e) {
          cartao.style.left = (e.clientX - dx) + "px";
          cartao.style.top = (e.clientY - dy) + "px";
          const outros = [].slice.call(grade.querySelectorAll(".t-meu")).filter(x => x !== cartao);
          let melhor = null, menor = Infinity;
          outros.forEach(o => {
            const b = o.getBoundingClientRect();
            const d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
            if (d < menor) { menor = d; melhor = { el: o, caixa: b }; }
          });
          if (!melhor) return;
          const meio = melhor.caixa.left + melhor.caixa.width / 2;
          if (e.clientX < meio) melhor.el.before(lugar); else melhor.el.after(lugar);
        }

        async function soltar() {
          window.removeEventListener("pointermove", mover);
          window.removeEventListener("pointerup", soltar);
          window.removeEventListener("pointercancel", soltar);

          lugar.replaceWith(cartao);
          cartao.classList.remove("t-arrastando");
          ["position", "zIndex", "width", "height", "left", "top", "pointerEvents", "margin"]
            .forEach(p => cartao.style[p] = "");

          const ordem = [].slice.call(grade.querySelectorAll("[data-bloco-id]")).map(x => x.dataset.blocoId);
          for (let i = 0; i < ordem.length; i++) {
            const b = BLOCOS.find(x => x.id === ordem[i]);
            if (b && b.ordem !== i) { b.ordem = i; await Dados.salvar("blocos", b); }
          }
          BLOCOS.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        }

        window.addEventListener("pointermove", mover);
        window.addEventListener("pointerup", soltar);
        window.addEventListener("pointercancel", soltar);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     CATÁLOGO E AJUSTE DE BLOCO
     ══════════════════════════════════════════════════════════ */

  function abrirCatalogo() {
    const tipos = Blocos.disponiveis();
    const doDia = tipos.filter(k => Blocos.escopoDe(k) === "dia");
    const doTrab = tipos.filter(k => Blocos.escopoDe(k) === "trabalho");

    const cartao = k => {
      const d = Blocos.CATALOGO[k];
      return `<button type="button" data-tipo="${k}">
        <span class="t-cat-cab">${Blocos.ICONES[k] || ""}<b>${esc(d.nome)}</b></span>
        <span>${esc(d.descricao)}</span>
        ${d.exemplo ? `<em>Ex.: ${esc(d.exemplo)}</em>` : ""}
      </button>`;
    };

    const dlg = UI.painel({
      titulo: "Adicionar bloco",
      subtitulo: "Escolha o que este projeto precisa.",
      largo: true,
      acaoTexto: "Fechar",
      corpo: `
        <div class="t-cat-grupo">
          <h3>Você preenche todo dia</h3>
          <p>Aparece aqui na página para clicar, e vira histórico e gráfico.</p>
          <div class="t-cat">${doDia.map(cartao).join("")}</div>
        </div>
        <div class="t-cat-grupo">
          <h3>Informação que fica</h3>
          <p>Um valor só, que vale enquanto durar o projeto.</p>
          <div class="t-cat">${doTrab.map(cartao).join("")}</div>
        </div>`,
      acao: () => true,
    });

    dlg.querySelectorAll("[data-tipo]").forEach(b => b.addEventListener("click", () => {
      dlg.close(); dlg.remove();
      const tipo = b.dataset.tipo;
      ajustarBloco(Blocos.novo(T.id, tipo, BLOCOS.length), true);
    }));
  }

  function ajustarBloco(bloco, novo) {
    const def = Blocos.CATALOGO[bloco.tipo];

    const campos = (def.config || []).map(c => {
      const valor = bloco.config[c.campo];
      if (c.tipo === "linhas") {
        return UI.campo({ nome: "cfg_" + c.campo, rotulo: c.rotulo, tipo: "texto-longo",
          valor: (valor || []).join("\n"), dica: "uma por linha" });
      }
      if (c.tipo === "escolha") {
        return UI.campo({ nome: "cfg_" + c.campo, rotulo: c.rotulo, tipo: "escolha", valor, opcoes: c.opcoes });
      }
      if (c.tipo === "fonte") {
        const numericos = BLOCOS.filter(b => Blocos.ehNumerico(b) && b.id !== bloco.id);
        return UI.campo({ nome: "cfg_" + c.campo, rotulo: c.rotulo, tipo: "escolha", valor,
          opcoes: [{ valor: "horas", nome: "As horas trabalhadas" }]
            .concat(numericos.map(b => ({ valor: b.id, nome: b.rotulo }))),
          ajuda: numericos.length ? "" : "Crie um contador ou uma nota de 1 a 5 e ele aparece aqui também." });
      }
      return UI.campo({ nome: "cfg_" + c.campo, rotulo: c.rotulo, tipo: c.tipo === "numero" ? "number" : "text",
        valor, dica: c.dica, min: c.min, max: c.max });
    }).join("");

    UI.painel({
      titulo: novo ? "Novo bloco: " + def.nome : "Ajustar bloco",
      subtitulo: def.exemplo ? "Ex.: " + def.exemplo : def.descricao,
      acaoTexto: novo ? "Adicionar à página" : "Salvar",
      corpo: `
        ${UI.campo({ nome: "rotulo", rotulo: "Nome do bloco", valor: bloco.rotulo, obrigatorio: true })}
        ${campos}
        <p class="u-ajuda">${bloco.escopo === "dia"
          ? "Este bloco guarda <b>um valor por dia</b>. Você clica nele aqui na página e ele grava no dia de hoje."
          : "Este bloco guarda <b>um valor só</b>, que vale enquanto durar o projeto."}</p>`,
      acao: async (d) => {
        const rotulo = UI.ler(d, "rotulo");
        if (!rotulo) { UI.erroNoPainel(d, "Dê um nome ao bloco."); return false; }
        bloco.rotulo = rotulo;
        (def.config || []).forEach(c => {
          const v = UI.ler(d, "cfg_" + c.campo);
          if (c.tipo === "linhas") bloco.config[c.campo] = v.split("\n").map(x => x.trim()).filter(Boolean);
          else if (c.tipo === "numero") bloco.config[c.campo] = v === "" ? (c.min || 0) : +v;
          else bloco.config[c.campo] = v;
        });
        if (novo) bloco.ordem = BLOCOS.length;
        await salvarBloco(bloco);
        await recarregar();
        UI.aviso(novo ? "Bloco adicionado." : "Bloco ajustado.");
      },
    });
  }

  /* ══════════════════════════════════════════════════════════
     EDITAR O TRABALHO
     ══════════════════════════════════════════════════════════ */

  /* O valor de um tipo de tarefa mudou e já existem dias lançados com o
     valor antigo. A ferramenta pergunta, porque os dois casos existem: o
     projeto passou a pagar outro valor (os dias antigos ficam como estão),
     ou o valor estava errado desde o começo (os dias antigos mudam junto).
     Devolve quantos dias foram corrigidos. */
  async function valorNovoNosDias(antes, depois, moeda) {
    const mudou = [];
    depois.forEach(n => {
      const a = antes.find(x => x.id === n.id);
      if (a && +a.valor !== +n.valor) mudou.push({ id: n.id, nome: n.nome, de: +a.valor || 0, para: +n.valor || 0 });
    });
    if (!mudou.length) return 0;

    const trocaDe = l => l && mudou.find(m => m.id === l.tipoId && (+l.valor || 0) === m.de);
    const afetados = (await Dados.listar("registros", { trabalhoId: ID }))
      .filter(r => (r.tarefas || []).some(l => +((l || {}).qtd) > 0 && trocaDe(l)));
    if (!afetados.length) return 0;

    const ok = await UI.confirmar({
      titulo: "Mudar também os dias já lançados?",
      texto: mudou.map(m => `<b>${esc(m.nome)}</b> passou de ${esc(UI.escreverUnitario(m.de, moeda))} para ${esc(UI.escreverUnitario(m.para, moeda))}.`).join("<br>") +
        `<br><br>${afetados.length === 1 ? "Há 1 dia lançado" : "Há " + afetados.length + " dias lançados"} com o valor antigo.
         Se o projeto mudou o valor agora, deixe os dias como estão.
         Se o valor estava errado desde o começo, corrija os dias também.`,
      acaoTexto: "Corrigir os dias também",
      cancelarTexto: "Deixar como estão",
    });
    if (!ok) return 0;

    for (const r of afetados) {
      const tarefas = r.tarefas.map(l => {
        const m = trocaDe(l);
        return m ? Object.assign({}, l, { valor: m.para }) : l;
      });
      await Dados.salvar("registros", Object.assign({}, r, { tarefas }));
    }
    return afetados.length;
  }

  function editarTrabalho() {
    UI.painel({
      titulo: "Editar trabalho",
      subtitulo: T.projeto || T.empresa,
      acaoTexto: "Salvar",
      extra: `<button type="button" class="u-link u-perigo-txt" data-apagar>Apagar trabalho</button>`,
      corpo: `
        <div class="u-tripla">
          ${UI.campo({ nome: "empresa", rotulo: "Empresa", valor: T.empresa, obrigatorio: true })}
          ${UI.campo({ nome: "projeto", rotulo: "Nome do projeto", valor: T.projeto })}
        </div>
        <div class="u-tripla">
          ${UI.campo({ nome: "plataforma", rotulo: "Plataforma", valor: T.plataforma })}
          ${UI.campo({ nome: "inicio", rotulo: "Começou em", tipo: "date", valor: T.inicio })}
        </div>
        ${UI.campo({ nome: "pagamento", rotulo: "Como paga", tipo: "escolha", valor: T.pagamento,
                     opcoes: Object.keys(UI.PAGAMENTOS).map(k => ({ valor: k, nome: UI.PAGAMENTOS[k].nome })) })}
        <div class="u-ajuda" id="ajudaPag"></div>
        <div class="u-dupla">
          ${UI.campo({ nome: "valor", rotulo: "Valor", tipo: "number", valor: T.valor })}
          ${UI.campo({ nome: "moeda", rotulo: "Moeda", tipo: "escolha", valor: T.moeda,
                       opcoes: Object.keys(Dados.MOEDAS).map(m => ({ valor: m, nome: m })) })}
        </div>
        ${UI.campoTipos(T)}
        <div class="u-tripla">
          ${UI.campo({ nome: "ciclo", rotulo: "Quando paga", tipo: "escolha", valor: T.ciclo,
                       opcoes: Object.keys(UI.CICLOS).map(k => ({ valor: k, nome: UI.CICLOS[k] })) })}
          ${UI.campo({ nome: "estado", rotulo: "Situação", tipo: "escolha", valor: T.estado,
                       opcoes: [{ valor: "ativo", nome: "Ativo" }, { valor: "pausado", nome: "Pausado" }, { valor: "encerrado", nome: "Encerrado" }] })}
        </div>
        ${UI.campo({ nome: "diaPeriodo", rotulo: "Dia em que o período começa", tipo: "number",
                     valor: UI.diaDoPeriodo(T), min: 1, max: 31,
                     ajuda: "Deixe 1 para o mês normal, do dia 1 ao último dia. Se o projeto conta do dia 20 de um mês ao dia 19 do seguinte, escreva 20." })}
        <div class="d-linha">
          <span class="d-rot">Cor de identificação</span>
          <div style="display:flex;gap:7px;flex-wrap:wrap;" id="cores"></div>
          <input type="hidden" name="cor" value="${esc(T.cor || "#2C6BB5")}">
        </div>`,
      acao: async (d) => {
        const empresa = UI.ler(d, "empresa");
        if (!empresa) { UI.erroNoPainel(d, "Escreva o nome da empresa."); return false; }
        const pagamento = UI.ler(d, "pagamento");
        const moeda = UI.ler(d, "moeda");
        const antes = UI.tiposDe(T);
        // Os tipos só são lidos quando a forma é "por tarefa". Em outra forma
        // a lista fica guardada como estava, para voltar inteira se a pessoa
        // trocar de novo.
        let tipos = antes;
        if (pagamento === "tarefa") {
          const lido = UI.lerTipos(d);
          if (lido.erro) { UI.erroNoPainel(d, lido.erro); return false; }
          tipos = lido.tipos;
        }
        await Dados.salvar("trabalhos", Object.assign({}, T, {
          empresa, projeto: UI.ler(d, "projeto") || empresa,
          plataforma: UI.ler(d, "plataforma"),
          pagamento,
          valor: UI.ler(d, "valor") === "" ? 0 : +UI.ler(d, "valor"),
          moeda, ciclo: UI.ler(d, "ciclo"),
          estado: UI.ler(d, "estado"), inicio: UI.ler(d, "inicio"),
          diaPeriodo: UI.diaDoPeriodo({ diaPeriodo: UI.ler(d, "diaPeriodo") }),
          cor: d.querySelector('[name="cor"]').value,
          tipos,
        }));
        const corrigidos = await valorNovoNosDias(antes, tipos, moeda);
        REF = null;   // o dia do período pode ter mudado: volta para o atual
        await recarregar();
        UI.aviso(corrigidos ? "Trabalho salvo. " + corrigidos + (corrigidos === 1 ? " dia corrigido." : " dias corrigidos.")
                            : "Trabalho salvo.");
      },
    });

    const dlg = document.getElementById("ui-painel");
    UI.ligarFormaDePagamento(dlg);
    const caixaCores = dlg.querySelector("#cores");
    const campoCor = dlg.querySelector('[name="cor"]');
    caixaCores.innerHTML = Graficos.CORES.map(c =>
      `<button type="button" data-cor="${c}" aria-label="Cor ${c}" style="width:26px;height:26px;border-radius:8px;cursor:pointer;
        background:${c};border:2px solid ${c === T.cor ? "var(--ink,#10203A)" : "transparent"};"></button>`).join("");
    caixaCores.querySelectorAll("[data-cor]").forEach(b => b.addEventListener("click", () => {
      campoCor.value = b.dataset.cor;
      caixaCores.querySelectorAll("[data-cor]").forEach(x => x.style.borderColor = "transparent");
      b.style.borderColor = "var(--ink,#10203A)";
    }));

    dlg.querySelector("[data-apagar]").addEventListener("click", async () => {
      const regs = REGISTROS.length;
      const ok = await UI.confirmar({
        titulo: "Apagar este trabalho?",
        texto: "Vão junto " + regs + (regs === 1 ? " dia registrado" : " dias registrados") +
               ", os pagamentos e os blocos da página dele. Não dá para desfazer. Se a ideia é só parar, mude a situação para Encerrado.",
        acaoTexto: "Apagar mesmo assim", perigo: true,
      });
      if (!ok) return;
      await Dados.removerTrabalho(T.id);
      dlg.close(); dlg.remove();
      UI.aviso("Trabalho apagado.");
      if (OPC.aoApagar) OPC.aoApagar();
    });
  }

  /* ══════════════════════════════════════════════════════════
     ESTILO
     ══════════════════════════════════════════════════════════ */

  const CSS = `
  .t-cab {
    display:flex; align-items:flex-start; gap:18px; flex-wrap:wrap;
    padding:24px 26px; border-radius:var(--raio,18px); position:relative; overflow:hidden;
    background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9); margin-bottom:18px;
  }
  .t-cab::before { content:''; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--cor,#2C6BB5); }
  .t-marca { width:52px; height:52px; border-radius:13px; display:grid; place-items:center; overflow:hidden;
    font-size:16px; font-weight:600; flex-shrink:0; }
  .t-cab h1 {
    font-family:var(--display,Georgia,serif); font-weight:400; font-size:clamp(24px,3vw,34px);
    line-height:1.1; letter-spacing:-0.018em; color:var(--ink,#10203A); margin:0 0 6px;
  }
  .t-sub { font-size:14px; color:var(--ink-3,#66717F); }
  .t-etiqs { display:flex; gap:7px; flex-wrap:wrap; margin-top:12px; }
  .t-etiq {
    font-size:12px; padding:4px 11px; border-radius:999px; background:var(--bg-soft,#F1ECE3);
    color:var(--ink-2,#54606F); border:1px solid var(--line-soft,#EAE4D9);
  }
  .t-etiq.viva { background:var(--signal-suave,#EAF1F8); color:var(--signal,#1A4893); border-color:#D3E2F1; }
  .t-cab-bts { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start; }

  .t-b {
    display:inline-flex; align-items:center; gap:8px; font:inherit; font-size:14px; font-weight:500;
    cursor:pointer; padding:11px 19px; border-radius:999px; border:1px solid var(--line,#DED7CA);
    background:var(--panel,#fff); color:var(--ink,#10203A); transition:all .16s; white-space:nowrap;
  }
  .t-b:hover { border-color:var(--ink-3,#66717F); }
  .t-b.forte { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
  .t-b.forte:hover { background:#173E7E; border-color:#173E7E; }
  .t-b.pequeno { padding:8px 14px; font-size:13px; }

  .t-grade { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; margin-bottom:18px; }
  .t-l2 { grid-column:span 2; } .t-l3 { grid-column:span 3; }
  /* Os cortes olham a largura da JANELA, mas quem manda é a largura que
     sobra depois da coluna da esquerda: cerca de 250px a menos. Por isso
     as três colunas só valem a partir de 1300px de janela, e não 1180.
     minmax(0,1fr) e não 1fr: com 1fr puro uma tabela larga estica a
     coluna e a página inteira passa a rolar para o lado. */
  @media (max-width:1300px){ .t-grade { grid-template-columns:repeat(2,minmax(0,1fr)); } .t-l3 { grid-column:span 2; } }
  @media (max-width:760px){ .t-grade { grid-template-columns:minmax(0,1fr); } .t-l2, .t-l3 { grid-column:span 1; } }

  .t-cartao {
    background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9);
    border-radius:var(--raio,18px); padding:20px 22px; display:flex; flex-direction:column; min-width:0;
  }
  .t-cartao > h2, .t-cab-bloco h2 {
    font-family:var(--body,'Geist',sans-serif); font-weight:600; font-size:14.5px;
    color:var(--ink,#10203A); margin:0 0 14px; letter-spacing:-0.006em;
  }
  .t-cab-bloco { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
  .t-cab-bloco h2 { margin:0; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .t-corpo { flex:1; min-width:0; }

  .t-nums { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:18px; }
  .t-num { font-size:24px; font-weight:600; color:var(--ink,#10203A); letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1.15; }
  .t-rot { font-size:12px; color:var(--ink-3,#66717F); margin-top:3px; }
  .t-menor { font-size:12px; color:var(--ink-3,#66717F); margin-top:2px; }

  .t-hoje { display:flex; flex-direction:column; gap:12px; }
  .t-hoje-marca {
    display:inline-flex; align-items:center; gap:9px; font-size:13.5px; padding:9px 14px;
    border-radius:12px; background:var(--bg-soft,#F1ECE3); color:var(--ink-2,#54606F);
  }
  .t-hoje-marca.feito { background:#E4F3F0; color:#1F7A6E; }

  .t-hist { width:100%; border-collapse:collapse; font-size:13.5px; }
  .t-hist th {
    text-align:left; font-weight:500; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em;
    color:var(--ink-3,#66717F); padding:0 10px 8px; white-space:nowrap;
  }
  .t-hist td { padding:9px 10px; border-top:1px solid var(--line-soft,#EAE4D9); color:var(--ink-2,#54606F); vertical-align:top; }
  .t-hist tbody tr { cursor:pointer; }
  .t-hist tbody tr:hover td { background:var(--panel-2,#FBF9F5); }
  .t-hist .t-dia { color:var(--ink,#10203A); font-weight:500; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .t-hist .t-h { font-variant-numeric:tabular-nums; white-space:nowrap; }
  .t-hist .t-obs { color:var(--ink-3,#66717F); max-width:340px; }
  .t-hist .t-tar { white-space:normal; }
  .t-hist .t-det { display:block; font-size:11.5px; line-height:1.4; color:var(--ink-3,#66717F); margin-top:1px; max-width:340px; }
  /* ── navegação entre períodos ── */
  .t-per { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  .t-per-meio { flex:1; min-width:150px; }
  .t-per-meio h2 { font-family:var(--body,'Geist',sans-serif); font-weight:600; font-size:16px; color:var(--ink,#10203A); margin:0 0 2px; }
  .t-per-meio span { font-size:12px; color:var(--ink-3,#66717F); }
  .t-per-seta {
    width:34px; height:34px; border-radius:10px; border:1px solid var(--line,#DED7CA); background:var(--panel,#fff);
    color:var(--ink,#10203A); font-size:20px; line-height:1; cursor:pointer; flex-shrink:0;
  }
  .t-per-seta:hover:not([disabled]) { border-color:var(--signal,#1A4893); color:var(--signal,#1A4893); }
  .t-per-seta[disabled] { opacity:.35; cursor:default; }
  .t-pers tr.t-sel td { background:var(--signal-suave,#EAF1F8); }
  .t-agora {
    font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; margin-left:6px;
    padding:2px 7px; border-radius:999px; background:#E4F3F0; color:#1F7A6E;
  }
  .t-vazio { padding:30px 10px; text-align:center; font-size:13.5px; color:var(--ink-3,#66717F); }
  .t-vaziao { text-align:center; padding:60px 24px; }
  .t-vaziao h3 { font-size:17px; font-weight:600; color:var(--ink,#10203A); margin-bottom:7px; }
  .t-vaziao p { font-size:14px; color:var(--ink-3,#66717F); }

  .t-pgs { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px; }
  .t-pgs li { display:flex; align-items:center; gap:11px; padding:9px 0; border-top:1px solid var(--line-soft,#EAE4D9); font-size:13.5px; }
  .t-pgs li:first-child { border-top:0; }
  .t-pgs button { background:none; border:0; padding:0; font:inherit; cursor:pointer; text-align:left; flex:1; min-width:0; color:inherit; }
  .t-pgs .t-val { font-weight:600; color:var(--ink,#10203A); font-variant-numeric:tabular-nums; }
  .t-pgs .t-data { font-size:12px; color:var(--ink-3,#66717F); }

  /* ── modo edição ──
     A página começa em modo de uso. Nada se mexe sem clicar em
     Editar página: arrastar sem querer no meio do expediente
     estraga a página de quem está trabalhando. */
  .t-sec-cab { display:flex; align-items:center; gap:12px; margin:30px 0 15px; flex-wrap:wrap; }
  .t-sec-cab h2 {
    font-family:var(--display,Georgia,serif); font-weight:400; font-size:22px;
    letter-spacing:-0.012em; color:var(--ink,#10203A); margin:0;
  }
  .t-sec-cab p { font-size:13px; color:var(--ink-3,#66717F); margin:0; }
  .t-sec-bts { margin-left:auto; display:flex; gap:8px; }

  .t-alca, .t-editar-b, .t-tirar-b, .t-larguras { display:none; }
  body.t-editando .t-alca { display:grid; }
  body.t-editando .t-editar-b, body.t-editando .t-tirar-b { display:inline-flex; }
  body.t-editando .t-larguras { display:flex; }
  body.t-editando .t-meu { border-style:dashed; border-color:var(--line,#DED7CA); }
  body.t-editando .t-meu .t-corpo { opacity:.5; pointer-events:none; }

  .t-alca {
    place-items:center; width:26px; height:26px; border-radius:8px; cursor:grab;
    color:var(--ink-3,#66717F); background:var(--bg-soft,#F1ECE3); flex-shrink:0; touch-action:none;
  }
  .t-alca:active { cursor:grabbing; }
  .t-editar-b, .t-tirar-b {
    align-items:center; justify-content:center; width:26px; height:26px; border-radius:8px;
    border:0; background:var(--bg-soft,#F1ECE3); color:var(--ink-3,#66717F); cursor:pointer; flex-shrink:0;
  }
  .t-editar-b:hover { background:var(--signal-suave,#EAF1F8); color:var(--signal,#1A4893); }
  .t-tirar-b:hover { background:#FBE9EB; color:#C4384A; }
  .t-larguras { gap:2px; margin-top:12px; padding-top:11px; border-top:1px dashed var(--line,#DED7CA); }
  .t-larguras button {
    font:inherit; font-size:11.5px; cursor:pointer; padding:4px 10px; border-radius:7px;
    border:1px solid var(--line-soft,#EAE4D9); background:var(--bg,#F7F4EF); color:var(--ink-3,#66717F);
  }
  .t-larguras button[aria-pressed="true"] { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }

  .t-arrastando {
    box-shadow:var(--sombra-alta,0 20px 44px -20px rgba(16,32,58,.3)) !important;
    transform:rotate(-.6deg); opacity:.95;
  }
  .t-lugar { border:2px dashed var(--signal-dim,#4E9AC8); border-radius:var(--raio,18px); background:var(--signal-suave,#EAF1F8); }

  /* ── catálogo ── */
  .t-cat-grupo + .t-cat-grupo { margin-top:6px; padding-top:18px; border-top:1px solid var(--line-soft,#EAE4D9); }
  .t-cat-grupo h3 { font-size:14px; font-weight:600; color:var(--ink,#10203A); margin:0 0 3px; }
  .t-cat-grupo > p { font-size:12.5px; color:var(--ink-3,#66717F); margin:0 0 13px; }
  .t-cat { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:11px; }
  .t-cat button {
    display:flex; flex-direction:column; gap:5px; text-align:left; font:inherit; cursor:pointer;
    padding:15px 16px; border-radius:14px; border:1px solid var(--line-soft,#EAE4D9);
    background:var(--panel,#fff); color:var(--ink-2,#54606F); transition:all .15s;
  }
  .t-cat button:hover { border-color:var(--signal,#1A4893); background:var(--signal-suave,#EAF1F8); }
  .t-cat .t-cat-cab { display:flex; align-items:center; gap:9px; color:var(--signal,#1A4893); }
  .t-cat b { font-size:14px; color:var(--ink,#10203A); font-weight:600; }
  .t-cat span { font-size:12.5px; line-height:1.5; }
  .t-cat em { font-style:normal; font-size:11.5px; color:var(--ink-3,#66717F); line-height:1.45; }

  .t-vazio-blocos {
    grid-column:1 / -1; padding:44px 24px; text-align:center; border-radius:var(--raio,18px);
    border:1px dashed var(--line,#DED7CA); background:var(--bg-soft,#F1ECE3);
  }
  .t-vazio-blocos h3 { font-size:16px; font-weight:600; color:var(--ink,#10203A); margin-bottom:7px; }
  .t-vazio-blocos p { font-size:13.5px; color:var(--ink-3,#66717F); max-width:52ch; margin:0 auto 16px; line-height:1.6; }
  `;

  function injetarCss() {
    if (document.getElementById("css-trabalho")) return;
    const s = document.createElement("style");
    s.id = "css-trabalho";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  injetarCss();

  return { montar, recarregar };
})();
