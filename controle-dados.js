/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — camada de dados

   Este é o ÚNICO arquivo que sabe onde as coisas ficam guardadas.
   Nenhuma tela toca no banco direto: todas falam com o objeto Dados.
   No dia em que isso virar nuvem, só este arquivo muda.

   Guarda em IndexedDB, dentro do navegador do próprio usuário.
   Nada sai do computador. Se o IndexedDB não estiver disponível
   (janela anônima, arquivo aberto solto pelo Windows), cai sozinho
   para localStorage e avisa na tela.
   ══════════════════════════════════════════════════════════════ */

const Dados = (function () {
  "use strict";

  const DB_NOME   = "hub-controle";
  const DB_VERSAO = 1;
  const ESQUEMA   = 1;   // versão do FORMATO dos dados, não do banco

  const COLECOES = {
    aplicacoes: { indices: ["estado", "empresa"] },
    trabalhos:  { indices: ["estado"] },
    registros:  { indices: ["trabalhoId", "data"] },
    pagamentos: { indices: ["trabalhoId", "data"] },
    blocos:     { indices: ["trabalhoId"] },
    cotacoes:   { indices: [] },
    config:     { indices: [] },
  };

  let db = null;          // conexão do IndexedDB
  let motor = null;       // "indexeddb" ou "localStorage"
  let avisoMotor = "";    // texto do problema, para a tela mostrar

  /* ══════════════════════════════════════════════════════════
     MOTOR 1: IndexedDB
     ══════════════════════════════════════════════════════════ */

  function pedido(req) {
    return new Promise((ok, erro) => {
      req.onsuccess = () => ok(req.result);
      req.onerror   = () => erro(req.error);
    });
  }

  function abrirIndexedDB() {
    return new Promise((ok, erro) => {
      if (!window.indexedDB) { erro(new Error("sem indexedDB")); return; }
      let req;
      try { req = indexedDB.open(DB_NOME, DB_VERSAO); }
      catch (e) { erro(e); return; }

      // Trava de segurança: em janela anônima o open às vezes nunca responde,
      // nem com sucesso nem com erro. Sem isto a página ficaria carregando para sempre.
      const relogio = setTimeout(() => erro(new Error("indexedDB não respondeu")), 4000);

      req.onupgradeneeded = (ev) => {
        const banco = ev.target.result;
        Object.keys(COLECOES).forEach(nome => {
          if (banco.objectStoreNames.contains(nome)) return;
          const loja = banco.createObjectStore(nome, { keyPath: "id" });
          COLECOES[nome].indices.forEach(campo => loja.createIndex(campo, campo, { unique: false }));
        });
      };
      req.onsuccess = () => { clearTimeout(relogio); ok(req.result); };
      req.onerror   = () => { clearTimeout(relogio); erro(req.error); };
      req.onblocked = () => { clearTimeout(relogio); erro(new Error("banco travado por outra aba")); };
    });
  }

  const motorIDB = {
    async todos(colecao) {
      const t = db.transaction(colecao, "readonly");
      return await pedido(t.objectStore(colecao).getAll());
    },
    async um(colecao, id) {
      const t = db.transaction(colecao, "readonly");
      return (await pedido(t.objectStore(colecao).get(id))) || null;
    },
    async por(colecao, objeto) {
      const t = db.transaction(colecao, "readwrite");
      await pedido(t.objectStore(colecao).put(objeto));
      return objeto;
    },
    async tira(colecao, id) {
      const t = db.transaction(colecao, "readwrite");
      await pedido(t.objectStore(colecao).delete(id));
    },
    async limpa(colecao) {
      const t = db.transaction(colecao, "readwrite");
      await pedido(t.objectStore(colecao).clear());
    },
  };

  /* ══════════════════════════════════════════════════════════
     MOTOR 2: localStorage, só como reserva

     Mais limitado (cerca de 5 MB e tudo em texto), mas melhor do que
     a página não abrir. Guarda uma chave por coleção.
     ══════════════════════════════════════════════════════════ */

  const PREFIXO = "hub-controle:";

  function lerLS(colecao) {
    try { return JSON.parse(localStorage.getItem(PREFIXO + colecao) || "[]"); }
    catch (e) { return []; }
  }
  function gravarLS(colecao, lista) {
    try { localStorage.setItem(PREFIXO + colecao, JSON.stringify(lista)); }
    catch (e) { throw new Error("O espaço de armazenamento do navegador encheu. Exporte o backup e limpe registros antigos."); }
  }

  const motorLS = {
    async todos(colecao) { return lerLS(colecao); },
    async um(colecao, id) { return lerLS(colecao).find(x => x.id === id) || null; },
    async por(colecao, objeto) {
      const lista = lerLS(colecao);
      const i = lista.findIndex(x => x.id === objeto.id);
      if (i >= 0) lista[i] = objeto; else lista.push(objeto);
      gravarLS(colecao, lista);
      return objeto;
    },
    async tira(colecao, id) { gravarLS(colecao, lerLS(colecao).filter(x => x.id !== id)); },
    async limpa(colecao) { gravarLS(colecao, []); },
  };

  let mot = motorLS;   // trocado por motorIDB quando o IndexedDB abrir

  /* ══════════════════════════════════════════════════════════
     ABERTURA
     ══════════════════════════════════════════════════════════ */

  let promessaAbrir = null;

  function abrir() {
    if (promessaAbrir) return promessaAbrir;
    promessaAbrir = (async () => {
      try {
        db = await abrirIndexedDB();
        mot = motorIDB;
        motor = "indexeddb";
      } catch (e) {
        mot = motorLS;
        motor = "localStorage";
        avisoMotor = "Este navegador não liberou o armazenamento completo, então os dados estão indo para um espaço menor. " +
                     "Costuma acontecer em janela anônima ou quando o arquivo é aberto solto, fora do site. Exporte o backup com frequência.";
        console.warn("Meu Controle: caiu para localStorage.", e);
      }
      await migrar();
      return mot;
    })();
    return promessaAbrir;
  }

  /* ══════════════════════════════════════════════════════════
     MIGRAÇÃO DE ESQUEMA

     Quando um campo mudar de forma no futuro, a conversão entra aqui
     e roda uma vez na abertura. Sem isto, uma mudança futura estragaria
     os dados de quem já usava a ferramenta.
     ══════════════════════════════════════════════════════════ */

  async function migrar() {
    // Usa as versões internas, sem await abrir(): esta função roda DENTRO
    // da abertura, e chamar abrir() daqui deixaria um esperando o outro
    // para sempre, com a página parada no "Abrindo os seus dados".
    const cfg = await lerConfig();
    const de = cfg.esquema || 0;
    if (de >= ESQUEMA) return;

    // if (de < 2) { ...converter aqui quando existir a versão 2... }

    cfg.esquema = ESQUEMA;
    await gravarConfig(cfg);
  }

  /* ══════════════════════════════════════════════════════════
     AS FUNÇÕES QUE AS TELAS USAM
     ══════════════════════════════════════════════════════════ */

  function agora() { return new Date().toISOString(); }

  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  /* filtro aceita objeto de igualdade ({estado:"ativo"}) ou função. */
  async function listar(colecao, filtro) {
    await abrir();
    let lista = await mot.todos(colecao);
    if (typeof filtro === "function") lista = lista.filter(filtro);
    else if (filtro) {
      lista = lista.filter(x => Object.keys(filtro).every(k => x[k] === filtro[k]));
    }
    return lista;
  }

  async function obter(colecao, id) {
    await abrir();
    return await mot.um(colecao, id);
  }

  async function salvar(colecao, objeto) {
    await abrir();
    const copia = Object.assign({}, objeto);
    if (!copia.id) copia.id = novoId();
    if (!copia.criadoEm) copia.criadoEm = agora();
    copia.atualizadoEm = agora();   // é este campo que torna a nuvem possível depois
    copia.esquema = ESQUEMA;
    return await mot.por(colecao, copia);
  }

  async function remover(colecao, id) {
    await abrir();
    await mot.tira(colecao, id);
  }

  /* Apagar um trabalho apaga junto tudo o que pendurava nele. */
  async function removerTrabalho(id) {
    await abrir();
    for (const col of ["registros", "pagamentos", "blocos"]) {
      const filhos = await listar(col, { trabalhoId: id });
      for (const f of filhos) await mot.tira(col, f.id);
    }
    await mot.tira("trabalhos", id);
  }

  /* ── configuração: uma linha só, com id fixo ── */

  const CONFIG_PADRAO = {
    id: "config",
    moedaPrincipal: "BRL",
    metaHorasSemana: null,
    metaGanhoMes: null,
    curriculos: [],
    ultimoBackup: null,
    avisoBackupEm: null,
    esquema: 0,
  };

  /* Versões internas, sem abrir(). Só a migração usa estas. */
  async function lerConfig() {
    const c = await mot.um("config", "config");
    return Object.assign({}, CONFIG_PADRAO, c || {});
  }
  async function gravarConfig(cfg) {
    const copia = Object.assign({}, CONFIG_PADRAO, cfg, { id: "config", atualizadoEm: agora() });
    return await mot.por("config", copia);
  }

  async function obterConfig() { await abrir(); return await lerConfig(); }
  async function salvarConfig(cfg) { await abrir(); return await gravarConfig(cfg); }

  /* ══════════════════════════════════════════════════════════
     EXPORTAR E IMPORTAR
     ══════════════════════════════════════════════════════════ */

  async function exportarTudo() {
    await abrir();
    const pacote = {
      arquivo: "Home Office Hub — Meu Controle",
      esquema: ESQUEMA,
      exportadoEm: agora(),
      dados: {},
    };
    for (const col of Object.keys(COLECOES)) pacote.dados[col] = await mot.todos(col);
    return pacote;
  }

  async function baixarBackup() {
    const pacote = await exportarTudo();
    const hoje = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(pacote, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meu-controle-" + hoje + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);

    const cfg = await obterConfig();
    cfg.ultimoBackup = agora();
    await salvarConfig(cfg);
    return pacote;
  }

  /* Lê o arquivo e devolve o conteúdo mais uma prévia, SEM gravar nada.
     A tela mostra a prévia, o usuário confirma, e só então vem o importarTudo. */
  async function lerArquivoBackup(arquivo) {
    const texto = await arquivo.text();
    let pacote;
    try { pacote = JSON.parse(texto); }
    catch (e) { throw new Error("Este arquivo não é um backup válido do Meu Controle."); }
    if (!pacote || !pacote.dados || typeof pacote.dados !== "object") {
      throw new Error("Este arquivo não tem o formato de um backup do Meu Controle.");
    }
    if (pacote.esquema > ESQUEMA) {
      throw new Error("Este backup veio de uma versão mais nova da ferramenta. Atualize a página e tente de novo.");
    }
    const previa = {};
    for (const col of Object.keys(COLECOES)) previa[col] = (pacote.dados[col] || []).length;
    previa.atual = await estadoDoBanco();
    return { pacote, previa };
  }

  /* modo: "juntar" acrescenta o que falta, "substituir" apaga tudo antes. */
  async function importarTudo(pacote, modo) {
    await abrir();
    if (modo !== "juntar" && modo !== "substituir") throw new Error("Modo de importação inválido.");

    if (modo === "substituir") {
      for (const col of Object.keys(COLECOES)) await mot.limpa(col);
    }

    let gravados = 0, pulados = 0;
    for (const col of Object.keys(COLECOES)) {
      const linhas = pacote.dados[col] || [];
      for (const linha of linhas) {
        if (!linha || !linha.id) continue;
        if (modo === "juntar") {
          const jaTem = await mot.um(col, linha.id);
          // Empate de id: fica com o carimbo mais novo. É a mesma regra que
          // a sincronização em nuvem vai usar quando existir.
          if (jaTem && (jaTem.atualizadoEm || "") >= (linha.atualizadoEm || "")) { pulados++; continue; }
        }
        await mot.por(col, linha);
        gravados++;
      }
    }
    await migrar();
    return { gravados, pulados };
  }

  async function estadoDoBanco() {
    await abrir();
    const conta = {};
    for (const col of Object.keys(COLECOES)) conta[col] = (await mot.todos(col)).length;
    return conta;
  }

  async function apagarTudo() {
    await abrir();
    for (const col of Object.keys(COLECOES)) await mot.limpa(col);
  }

  /* ══════════════════════════════════════════════════════════
     CÂMBIO

     Fonte: api.frankfurter.dev, do Banco Central Europeu.
     Gratuita, sem chave, sem cadastro, e responde direto do navegador.

     Regras:
     - o valor guardado é SEMPRE na moeda original; a conversão é só vista
     - a cotação de cada dia é buscada uma vez e fica guardada
     - o BCE só publica em dia útil, então fim de semana devolve a sexta,
       e a resposta traz a data que valeu de verdade
     - sem internet, usa a última cotação conhecida e marca como estimada
     ══════════════════════════════════════════════════════════ */

  const MOEDAS = {
    BRL: { nome: "Real",  simbolo: "R$" },
    USD: { nome: "Dólar", simbolo: "US$" },
    EUR: { nome: "Euro",  simbolo: "€" },
  };

  // Rede de segurança para quem nunca conseguiu conectar. Números redondos
  // de propósito, e a tela sempre marca o valor como estimado quando usa isto.
  const COTACAO_RESERVA = { USD: 5.4, EUR: 6.2, BRL: 1 };

  function hojeISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  const buscasEmAndamento = {};

  /* Quando a busca de câmbio falha, o resto da sessão para de tentar aquela
     moeda. Sem isto, offline, o painel esperava uma falha de rede por mês,
     e a página levava segundos para desenhar. */
  const semRede = {};

  /* Devolve { taxa, data, estimada } para converter 1 unidade da moeda em reais. */
  async function cotacao(moeda, data) {
    if (!moeda || moeda === "BRL") return { taxa: 1, data: data || hojeISO(), estimada: false };
    await abrir();

    const hoje = hojeISO();
    let dia = (data || hoje).slice(0, 10);
    if (dia > hoje) dia = hoje;

    const chave = moeda + "-" + dia;
    const guardada = await mot.um("cotacoes", chave);
    if (guardada) return { taxa: guardada.taxa, data: guardada.dataReal || dia, estimada: !!guardada.estimada };

    if (buscasEmAndamento[chave]) return await buscasEmAndamento[chave];

    if (semRede[moeda]) return await ultimaConhecida(moeda, dia);

    buscasEmAndamento[chave] = (async () => {
      const alvo = (dia === hoje ? "latest" : dia);
      try {
        const resp = await fetch("https://api.frankfurter.dev/v1/" + alvo + "?base=" + moeda + "&symbols=BRL");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const j = await resp.json();
        const taxa = j && j.rates && j.rates.BRL;
        if (!taxa) throw new Error("resposta sem BRL");
        await mot.por("cotacoes", { id: chave, moeda, data: dia, dataReal: j.date || dia, taxa, estimada: false, criadoEm: agora() });
        return { taxa, data: j.date || dia, estimada: false };
      } catch (e) {
        // Sem internet ou API fora do ar: pega a cotação mais recente que já temos.
        semRede[moeda] = true;
        return await ultimaConhecida(moeda, dia);
      } finally {
        delete buscasEmAndamento[chave];
      }
    })();

    return await buscasEmAndamento[chave];
  }

  /* A cotação mais recente que já está guardada, ou o número de reserva.
     Sempre marcada como estimada, para a tela poder dizer isso. */
  async function ultimaConhecida(moeda, dia) {
    const todas = (await mot.todos("cotacoes"))
      .filter(c => c.moeda === moeda)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
    if (todas.length) return { taxa: todas[0].taxa, data: todas[0].data, estimada: true };
    return { taxa: COTACAO_RESERVA[moeda] || 1, data: dia, estimada: true };
  }

  /* Converte para reais. Aceita cotação digitada à mão, que sempre ganha da automática. */
  async function emReais(valor, moeda, data, taxaManual) {
    if (!valor) return { valor: 0, estimada: false };
    if (taxaManual) return { valor: valor * taxaManual, estimada: false, taxa: taxaManual };
    const c = await cotacao(moeda, data);
    return { valor: valor * c.taxa, estimada: c.estimada, taxa: c.taxa, dataTaxa: c.data };
  }

  /* ══════════════════════════════════════════════════════════
     AJUDANTES DE FORMATO
     São daqui porque tela nenhuma deveria reinventar isto.
     ══════════════════════════════════════════════════════════ */

  /* Aceita "3h20", "3:20", "3,5", "3.5", "3h", "90min", "3" e devolve horas decimais.
     Devolve null quando não entende, para a tela poder avisar em vez de gravar errado. */
  function lerHoras(texto) {
    if (texto === null || texto === undefined) return null;
    let s = String(texto).trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return null;

    let m = s.match(/^(\d+)(?:h|:)(\d{1,2})m?(?:in)?$/);          // 3h20 · 3:20
    if (m) { const min = +m[2]; if (min > 59) return null; return +m[1] + min / 60; }

    m = s.match(/^(\d+)h$/);                                       // 3h
    if (m) return +m[1];

    m = s.match(/^(\d+)(?:min|m)$/);                               // 90min
    if (m) return +m[1] / 60;

    m = s.match(/^(\d+)[.,](\d+)$/);                               // 3,5 · 3.5
    if (m) return +(m[1] + "." + m[2]);

    m = s.match(/^(\d+)$/);                                        // 3
    if (m) return +m[1];

    return null;
  }

  function escreverHoras(horas) {
    if (!horas && horas !== 0) return "";
    const total = Math.round(horas * 60);
    const h = Math.floor(total / 60), m = total % 60;
    if (!m) return h + "h";
    return h + "h" + String(m).padStart(2, "0");
  }

  function escreverDinheiro(valor, moeda) {
    const m = MOEDAS[moeda] ? moeda : "BRL";
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: m }).format(valor || 0);
    } catch (e) {
      return (MOEDAS[m].simbolo) + " " + (valor || 0).toFixed(2);
    }
  }

  /* Tira acento, minúsculas, e o enfeite que vem no título das vagas.
     É o que faz o aviso de vaga repetida funcionar de verdade. */
  function normalizar(texto) {
    return String(texto || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\(.*?\)|\[.*?\]/g, " ")
      .replace(/\b(sr|jr|senior|junior|pleno|remote|remoto|freelance|freelancer|part[- ]?time|full[- ]?time|contract|contractor|brazil|brasil|portuguese|pt[- ]?br)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /* Procura se a pessoa já aplicou para uma vaga.
     Primeiro pelo id da vaga do site, que é exato. Se não achar, compara
     empresa e título já normalizados, que é o que pega a mesma vaga
     anunciada com título ligeiramente diferente.
     É a função que responde "já apliquei para essa vaga?". */
  async function procurarAplicacao({ vagaId, empresa, titulo }) {
    const todas = await listar("aplicacoes");
    if (vagaId) {
      const porId = todas.find(a => a.vagaId && a.vagaId === vagaId);
      if (porId) return porId;
    }
    if (!empresa && !titulo) return null;
    const chave = normalizar(empresa) + "|" + normalizar(titulo);
    return todas.find(a => normalizar(a.empresa) + "|" + normalizar(a.titulo) === chave) || null;
  }

  /* Data de hoje no formato do <input type="date">. */
  function hoje() { return hojeISO(); }

  /* "2026-08-31" vira "31/08/2026". */
  function dataBonita(iso) {
    if (!iso) return "";
    const p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function diasEntre(isoA, isoB) {
    const a = new Date(isoA + "T12:00:00"), b = new Date((isoB || hojeISO()) + "T12:00:00");
    return Math.round((b - a) / 86400000);
  }

  /* Segunda-feira da semana de uma data. A semana aqui é de segunda a domingo. */
  function segundaDa(iso) {
    const d = new Date((iso || hojeISO()) + "T12:00:00");
    const dia = (d.getDay() + 6) % 7;     // 0 = segunda
    d.setDate(d.getDate() - dia);
    return d.toISOString().slice(0, 10);
  }

  return {
    // banco
    abrir, listar, obter, salvar, remover, removerTrabalho,
    obterConfig, salvarConfig, estadoDoBanco, apagarTudo, procurarAplicacao,
    exportarTudo, importarTudo, baixarBackup, lerArquivoBackup,
    // câmbio
    cotacao, emReais, MOEDAS,
    // formato
    lerHoras, escreverHoras, escreverDinheiro, normalizar,
    hoje, dataBonita, diasEntre, segundaDa, novoId,
    // diagnóstico
    get motor() { return motor; },
    get aviso() { return avisoMotor; },
    ESQUEMA,
  };
})();
