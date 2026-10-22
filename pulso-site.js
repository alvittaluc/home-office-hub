/**
 * Pulso do Hub — peça de navegador.
 *
 * Faz três coisas, e nenhuma delas é obrigatória para o site funcionar:
 *   1. diz quais vagas estão em destaque e o que a equipe anotou sobre elas
 *      (em que etapa a empresa está chamando), para a lista montar o grupo
 *      "Em alta" e o selo verde de cada uma;
 *   2. põe o selo discreto nos cartões dessas vagas;
 *   3. despacha os eventos do Meu Controle, se a pessoa tiver ligado o Pulso.
 *
 * Regra herdada do Meu Controle: se o pulso.json não existir, se a rede cair ou
 * se a pessoa não tiver ligado nada, tudo aqui desiste em silêncio e a página
 * fica exatamente como era. Nenhum erro chega ao usuário.
 *
 * Desenho e CSS não moram aqui de propósito. O grupo de destaque é montado pela
 * própria vagas.html, com a mesma função linha() das outras vagas, para o site
 * não ganhar um segundo estilo de cartão.
 *
 * Documento de escopo: claude/PULSO.md
 */

(function () {
  "use strict";

  /* Endereço do Worker. Vazio desliga o envio; a leitura continua funcionando.
     Preencher quando o Worker estiver no ar:
     const ENDERECO = "https://pulso.SEU-SUBDOMINIO.workers.dev"; */
  const ENDERECO = "";

  const ARQUIVO = "pulso.json";
  const EVENTOS = ["aplicou", "resposta"];
  const RESPOSTA = ["teste", "entrevista", "aprovado"];

  const SELOS = {
    alta: { texto: "em alta", titulo: "Muita gente do Hub se candidatou nos últimos dias" },
    responde: { texto: "costuma responder", titulo: "Boa parte de quem se candidatou teve retorno" },
  };

  let dados = null;
  let carregando = null;

  /* ═══════════════════════  leitura do pulso.json  ═══════════════════════ */

  function carregar() {
    if (carregando) return carregando;
    /* Quem não tem conta não recebe a lista. A página de vagas mostra para
       essas pessoas um bloco de demonstração, com cartões de mentira, e sem a
       lista carregada não há o que descobrir pelas ferramentas do navegador.
       (O pulso.json continua sendo um arquivo público do site: isto fecha o
       caminho fácil, não é um cofre. Cofre de verdade é a lista morar no
       banco e só ser entregue a quem está logado.) */
    if (typeof Acesso !== "undefined" && Acesso.trancado()) {
      carregando = Promise.resolve(null);
      return carregando;
    }
    carregando = fetch(ARQUIVO, { cache: "no-cache" })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { dados = (j && j.versao === 1) ? j : null; return dados; })
      .catch(() => { dados = null; return null; });
    return carregando;
  }

  /** Ids em destaque, na ordem. Vazio se não houver arquivo ou faltar gente. */
  function destaques() {
    if (!dados || !Array.isArray(dados.destaques)) return [];
    if (dados.destaques.length < 2) return [];
    return dados.destaques.map(d => d.id).filter(Boolean);
  }

  /** Verdadeiro quando a lista foi escolhida à mão pela equipe ("manual": true
      no pulso.json), e não calculada pelas candidaturas. A página usa isto para
      não dizer que há movimento medido onde só há escolha da equipe. */
  function manual() { return !!(dados && dados.manual === true); }

  /** O que a equipe anotou sobre uma vaga do destaque, ou null.
      Campos opcionais de cada item de "destaques" no pulso.json:
        chamando       "teste", "entrevista" ou "contratando": a etapa em que
                       a empresa está chamando
        confirmado_em  "AAAA-MM-DD": quando a equipe confirmou as chamadas
        nota           recado curto da equipe, uma frase */
  function detalhe(id) {
    if (!dados || !Array.isArray(dados.destaques)) return null;
    return dados.destaques.find(d => d && d.id === id) || null;
  }

  const ETAPAS = {
    teste: "Chamando para o teste",
    entrevista: "Chamando para entrevista",
    contratando: "Contratando agora",
  };
  /** "Chamando para o teste", ou "Chamando agora" quando a etapa não foi anotada. */
  function etapa(d) { return (d && ETAPAS[d.chamando]) || "Chamando agora"; }

  /** "Confirmado hoje", "Confirmado há 3 dias"... Sem data, usa a de entrada no destaque. */
  function confirmado(d) {
    const quando = d && (d.confirmado_em || d.desde);
    if (!quando || !/^\d{4}-\d{2}-\d{2}$/.test(quando)) return "";
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    const dias = Math.round((hoje - new Date(quando + "T12:00:00")) / 86400000);
    if (dias <= 0) return "Confirmado hoje";
    if (dias === 1) return "Confirmado ontem";
    if (dias <= 13) return "Confirmado há " + dias + " dias";
    return "Confirmado em " + quando.slice(8, 10) + "/" + quando.slice(5, 7);
  }

  /** Selos de uma vaga, inclusive das que não couberam no destaque. */
  function selos(id) {
    if (!dados || !dados.sinais || !dados.sinais[id]) return [];
    return dados.sinais[id].selos || [];
  }

  /** Põe o selo nos cartões .vaga[data-vid] que já estiverem na tela. */
  function marcar(raiz) {
    if (!dados) return;
    (raiz || document).querySelectorAll(".vaga[data-vid]").forEach(el => {
      const onde = el.querySelector(".v-emp");
      if (!onde || onde.querySelector(".selo-pulso, .selo-chamando")) return;

      /* Lista feita à mão: a equipe confirmou que a empresa está chamando.
         A linha ganha o fundo verde e o selo que pulsa, onde quer que apareça. */
      const d = manual() ? detalhe(el.dataset.vid) : null;
      if (d) {
        el.classList.add("chamando");
        const s = document.createElement("span");
        s.className = "selo-chamando";
        s.title = [confirmado(d) + " pela equipe do Hub", d.nota].filter(Boolean).join(". ");
        s.innerHTML = '<i class="ch-pulso" aria-hidden="true"></i>';
        s.appendChild(document.createTextNode(etapa(d)));
        onde.appendChild(s);
        const quando = confirmado(d);
        if (quando) {
          const q = document.createElement("span");
          q.className = "ch-quando";
          q.textContent = quando.charAt(0).toLowerCase() + quando.slice(1);
          onde.appendChild(q);
        }
        return;
      }

      const lista = selos(el.dataset.vid);
      if (!lista.length) return;
      const chave = lista.indexOf("responde") >= 0 ? "responde" : "alta";
      const s = document.createElement("span");
      s.className = "selo-pulso " + chave;
      s.title = SELOS[chave].titulo;
      s.textContent = SELOS[chave].texto;
      onde.appendChild(s);
    });
  }

  /* ═══════════════════════  guarda do consentimento  ═══════════════════════

     Mora na config do Meu Controle, junto do resto. Fora dele, cai no
     localStorage, que é o único estado que este site aceita guardar solto.
     São três campos: pulso_ok, pulso_id e pulso_fila.                        */

  async function ler(chave) {
    try {
      if (typeof Dados !== "undefined" && Dados.obterConfig) {
        const c = await Dados.obterConfig();
        return (c && c[chave] !== undefined) ? c[chave] : null;
      }
    } catch (e) { /* cai para o localStorage */ }
    try {
      const bruto = localStorage.getItem(chave);
      return bruto === null ? null : JSON.parse(bruto);
    } catch (e) { return null; }
  }

  async function gravar(chave, valor) {
    try {
      if (typeof Dados !== "undefined" && Dados.obterConfig && Dados.salvarConfig) {
        const c = (await Dados.obterConfig()) || {};
        c[chave] = valor;
        await Dados.salvarConfig(c);
        return;
      }
    } catch (e) { /* cai para o localStorage */ }
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { }
  }

  async function ligado() { return (await ler("pulso_ok")) === true; }

  /** Falso enquanto a pessoa ainda não respondeu o convite. */
  async function respondeu() { return (await ler("pulso_ok")) !== null; }

  async function ligar() {
    let id = await ler("pulso_id");
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
      if (!id) return false;
      await gravar("pulso_id", id);
    }
    await gravar("pulso_ok", true);
    despachar();
    return true;
  }

  async function desligar() {
    await gravar("pulso_ok", false);
    await gravar("pulso_fila", []);
  }

  /* ═══════════════════════  envio  ═══════════════════════ */

  /** Chamado pelo Meu Controle. Nunca lança, nunca segura o clique. */
  async function enviar(vagaId, evento, quando) {
    try {
      if (!ENDERECO || !vagaId || EVENTOS.indexOf(evento) < 0) return;
      if (!(await ligado())) return;
      const quem = await ler("pulso_id");
      if (!quem) return;

      const fila = (await ler("pulso_fila")) || [];
      fila.push({
        v: 1, vaga: vagaId, evento, quem,
        quando: (quando || new Date().toISOString()).slice(0, 10),
      });
      await gravar("pulso_fila", fila.slice(-200));
      despachar();
    } catch (e) { /* silêncio, de propósito */ }
  }

  /** Atalho do formulário de aplicação: decide o evento pelo estado. */
  function porEstado(vagaId, estadoNovo, estadoAntigo) {
    if (!vagaId) return;
    if (!estadoAntigo) enviar(vagaId, "aplicou");
    const virou = RESPOSTA.indexOf(estadoNovo) >= 0;
    const era = RESPOSTA.indexOf(estadoAntigo) >= 0;
    if (virou && !era) enviar(vagaId, "resposta");
  }

  /** Manda de uma vez as aplicações já registradas que vieram do Hub. */
  async function enviarHistorico() {
    try {
      if (typeof Dados === "undefined" || !(await ligado())) return 0;
      const todas = await Dados.listar("aplicacoes");
      let n = 0;
      for (const a of todas) {
        if (!a.vagaId) continue;
        await enviar(a.vagaId, "aplicou", a.data);
        n++;
        if (RESPOSTA.indexOf(a.estado) >= 0) await enviar(a.vagaId, "resposta", a.data);
      }
      return n;
    } catch (e) { return 0; }
  }

  /** Quantas aplicações a carga inicial mandaria. Serve para a pergunta. */
  async function tamanhoDoHistorico() {
    try {
      if (typeof Dados === "undefined") return 0;
      const todas = await Dados.listar("aplicacoes");
      return todas.filter(a => a.vagaId).length;
    } catch (e) { return 0; }
  }

  let despachando = false;

  async function despachar() {
    if (despachando || !ENDERECO) return;
    despachando = true;
    try {
      const fila = (await ler("pulso_fila")) || [];
      if (!fila.length) return;
      const lote = fila.slice(0, 40);
      const r = await fetch(ENDERECO.replace(/\/$/, "") + "/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lote),
      });
      if (r.ok) await gravar("pulso_fila", fila.slice(lote.length));
    } catch (e) {
      /* fica na fila e tenta na próxima abertura */
    } finally {
      despachando = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => despachar());
  } else {
    despachar();
  }

  window.Pulso = {
    carregar, destaques, detalhe, etapa, confirmado, selos, marcar, manual,
    enviar, porEstado, enviarHistorico, tamanhoDoHistorico,
    ligar, desligar, ligado, respondeu,
  };
})();
