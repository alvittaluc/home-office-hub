/**
 * Pulso do Hub — peça de navegador.
 *
 * Faz três coisas, e nenhuma delas é obrigatória para o site funcionar:
 *   1. desenha a faixa "Em movimento" no topo da lista de vagas;
 *   2. marca com um selo discreto os cartões das vagas com sinal;
 *   3. despacha os eventos do Meu Controle, se a pessoa tiver ligado o Pulso.
 *
 * Regra herdada do Meu Controle: se o pulso.json não existir, se a rede cair ou
 * se o layout.js não vier junto, tudo aqui desiste em silêncio e a página segue
 * exatamente como era antes. Nenhum erro chega ao usuário.
 *
 * Uso na vagas.html
 *   <script src="pulso-site.js"></script>
 * e, onde a faixa deve aparecer:
 *   <div id="pulso"></div>
 *
 * Sem o div, a faixa é inserida sozinha antes do .corpo. Os selos dos cartões
 * são aplicados por observação do DOM, então nada precisa mudar dentro da
 * função que desenha a lista.
 *
 * Documento de escopo: claude/PULSO.md
 */

(function () {
  "use strict";

  // Endereço do Worker. Vazio desliga o envio; a leitura continua funcionando.
  const ENDERECO = "";

  const ARQUIVO = "pulso.json";
  const EVENTOS = ["aplicou", "resposta"];

  const SELOS = {
    alta: { texto: "Em alta", titulo: "Muita gente aplicou nos últimos dias" },
    responde: { texto: "Costuma responder", titulo: "Boa parte de quem aplicou teve retorno" },
  };

  let dados = null;
  let carregando = null;

  /* ───────────────────────────  guarda local  ─────────────────────────── */
  /* Usa o Meu Controle quando ele está na página. Fora dele, guarda os três
     campos do Pulso no localStorage, que é onde este projeto aceita estado
     pequeno de interface. */

  const guarda = {
    async ler(chave) {
      try {
        if (typeof Dados !== "undefined" && Dados.obterConfig) {
          const c = await Dados.obterConfig();
          return c ? c[chave] : null;
        }
      } catch (e) { /* cai para o localStorage */ }
      try {
        const bruto = localStorage.getItem(chave);
        return bruto === null ? null : JSON.parse(bruto);
      } catch (e) { return null; }
    },
    async gravar(chave, valor) {
      try {
        if (typeof Dados !== "undefined" && Dados.obterConfig && Dados.salvarConfig) {
          const c = (await Dados.obterConfig()) || {};
          c[chave] = valor;
          await Dados.salvarConfig(c);
          return;
        }
      } catch (e) { /* cai para o localStorage */ }
      try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { }
    },
  };

  /* ───────────────────────────  leitura  ─────────────────────────── */

  function carregar() {
    if (carregando) return carregando;
    carregando = fetch(ARQUIVO, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        dados = j && j.versao === 1 ? j : null;
        return dados;
      })
      .catch(() => { dados = null; return null; });
    return carregando;
  }

  /* ───────────────────────────  desenho  ─────────────────────────── */

  function estilo() {
    if (document.getElementById("pl-estilo")) return;
    const s = document.createElement("style");
    s.id = "pl-estilo";
    s.textContent = `
      .pl-faixa { margin: 0 0 22px; }
      .pl-cab { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
      .pl-cab h2 { font-family:var(--display,inherit); font-weight:500; font-size:16px; margin:0; }
      .pl-cab p { font-size:12.5px; color:var(--ink-3,#888); margin:0; }
      .pl-grade { display:grid; grid-template-columns:repeat(auto-fill,minmax(248px,1fr)); gap:12px; }
      .pl-cartao {
        display:flex; flex-direction:column; gap:9px; min-width:0;
        background:var(--panel,#fff); border:1px solid var(--line-soft,#e6e6e6);
        border-radius:12px; padding:14px 15px; text-decoration:none; color:inherit;
        position:relative; overflow:hidden; transition:border-color .16s, transform .16s;
      }
      .pl-cartao::before {
        content:''; position:absolute; left:0; top:0; bottom:0; width:2px;
        background:var(--signal,#2C6BB5); opacity:.55;
      }
      .pl-cartao:hover { border-color:var(--line,#ccc); transform:translateY(-2px); }
      .pl-topo { display:flex; align-items:center; gap:9px; min-width:0; }
      .pl-topo img, .pl-topo .pl-sigla { width:26px; height:26px; border-radius:6px; flex-shrink:0; }
      .pl-sigla { display:flex; align-items:center; justify-content:center;
        font-family:var(--mono,monospace); font-size:10px; background:var(--panel-2,#f2f2f2); }
      .pl-emp { font-family:var(--mono,monospace); font-size:11px; color:var(--ink-3,#888);
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .pl-tit { font-family:var(--display,inherit); font-weight:500; font-size:14.5px; line-height:1.3; }
      .pl-selos { display:flex; flex-wrap:wrap; gap:6px; margin-top:auto; padding-top:4px; }
      .pl-selo {
        font-family:var(--mono,monospace); font-size:10px; letter-spacing:.02em;
        padding:3px 7px; border-radius:999px; border:1px solid var(--line-soft,#e6e6e6);
        color:var(--ink-3,#888); white-space:nowrap;
      }
      .pl-selo.alta { border-color:var(--signal-dim,#bcd); color:var(--signal,#2C6BB5); }
      .pl-marca {
        display:inline-flex; align-items:center; gap:4px; font-family:var(--mono,monospace);
        font-size:10px; color:var(--signal,#2C6BB5); white-space:nowrap;
      }
      .pl-marca::before { content:''; width:4px; height:4px; border-radius:50%;
        background:var(--signal,#2C6BB5); }
      @media (max-width:560px) { .pl-grade { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(s);
  }

  function logo(emp) {
    if (typeof logoHtml === "function") {
      try { return logoHtml(emp, 26); } catch (e) { /* segue com a sigla */ }
    }
    const sigla = (emp && emp.sigla) || "•";
    const cor = (emp && emp.cor) || "currentColor";
    return `<span class="pl-sigla" style="color:${cor}">${sigla}</span>`;
  }

  async function faixa(destino) {
    const p = await carregar();
    if (!p || !p.destaques || p.destaques.length < 2) return;

    let vagas = [], empresas = {};
    try {
      const dv = await lerVagas();
      vagas = dv.vagas || [];
      const de = await lerEmpresas();
      (de.empresas || []).forEach((e) => (empresas[e.id] = e));
    } catch (e) { return; }

    const porId = {};
    vagas.forEach((v) => { if (v.id) porId[v.id] = v; });

    const itens = p.destaques
      .map((d) => ({ d, v: porId[d.id] }))
      .filter((x) => x.v);
    if (itens.length < 2) return;

    let alvo = destino || document.getElementById("pulso");
    if (!alvo) {
      const corpo = document.querySelector(".corpo");
      if (!corpo || !corpo.parentNode) return;
      alvo = document.createElement("div");
      corpo.parentNode.insertBefore(alvo, corpo);
    }

    estilo();

    const cartoes = itens.map(({ d, v }) => {
      const emp = empresas[v.empresa];
      const selos = d.selos
        .filter((s) => SELOS[s])
        .map((s) => `<span class="pl-selo ${s}" title="${SELOS[s].titulo}">${SELOS[s].texto}</span>`)
        .join("");
      return `
        <a class="pl-cartao" href="vaga.html?id=${encodeURIComponent(v.id)}">
          <div class="pl-topo">${logo(emp)}<span class="pl-emp">${(emp && emp.nome) || v.empresa || ""}</span></div>
          <div class="pl-tit">${v.titulo || ""}</div>
          <div class="pl-selos">${selos}</div>
        </a>`;
    }).join("");

    alvo.className = "pl-faixa";
    alvo.innerHTML = `
      <div class="pl-cab">
        <h2>Em movimento</h2>
        <p>Onde os alunos do Hub estão aplicando e ouvindo resposta nos últimos ${p.janela_dias} dias.</p>
      </div>
      <div class="pl-grade">${cartoes}</div>`;
  }

  /* ────────────────  selo discreto nos cartões da lista  ──────────────── */

  function marcarUm(elo) {
    if (!dados || !dados.sinais || elo.dataset.plFeito) return;
    const m = (elo.getAttribute("href") || "").match(/[?&]id=([^&]+)/);
    if (!m) return;
    const sinal = dados.sinais[decodeURIComponent(m[1])];
    if (!sinal || !sinal.selos || !sinal.selos.length) return;

    elo.dataset.plFeito = "1";
    const chave = sinal.selos.includes("responde") ? "responde" : "alta";
    const alvo = elo.querySelector(".tags") || elo;
    const s = document.createElement("span");
    s.className = "pl-marca";
    s.title = SELOS[chave].titulo;
    s.textContent = SELOS[chave].texto;
    alvo.appendChild(s);
  }

  async function marcar(raiz) {
    const p = await carregar();
    if (!p || !p.sinais) return;
    estilo();
    (raiz || document).querySelectorAll('a[href*="vaga.html?id="]').forEach(marcarUm);
  }

  function observar() {
    const lista = document.getElementById("lista");
    if (!lista || typeof MutationObserver === "undefined") return;
    let pendente = null;
    new MutationObserver(() => {
      clearTimeout(pendente);
      pendente = setTimeout(() => marcar(lista), 60);
    }).observe(lista, { childList: true, subtree: true });
  }

  /* ───────────────────────────  envio  ─────────────────────────── */

  async function ligado() {
    return (await guarda.ler("pulso_ok")) === true;
  }

  async function ligar() {
    let id = await guarda.ler("pulso_id");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || null;
      if (!id) return false;
      await guarda.gravar("pulso_id", id);
    }
    await guarda.gravar("pulso_ok", true);
    despachar();
    return true;
  }

  async function desligar() {
    await guarda.gravar("pulso_ok", false);
    await guarda.gravar("pulso_fila", []);
  }

  /** Chamado pelo Meu Controle. Nunca lança, nunca segura o clique. */
  async function enviar(vagaId, evento, quando) {
    try {
      if (!ENDERECO || !vagaId || EVENTOS.indexOf(evento) === -1) return;
      if (!(await ligado())) return;
      const quem = await guarda.ler("pulso_id");
      if (!quem) return;

      const fila = (await guarda.ler("pulso_fila")) || [];
      fila.push({
        v: 1, vaga: vagaId, evento, quem,
        quando: (quando || new Date().toISOString()).slice(0, 10),
      });
      await guarda.gravar("pulso_fila", fila.slice(-200));
      despachar();
    } catch (e) { /* silêncio, de propósito */ }
  }

  let despachando = false;

  async function despachar() {
    if (despachando || !ENDERECO) return;
    despachando = true;
    try {
      const fila = (await guarda.ler("pulso_fila")) || [];
      if (!fila.length) return;
      const lote = fila.slice(0, 40);
      const r = await fetch(ENDERECO.replace(/\/$/, "") + "/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lote),
      });
      if (r.ok) await guarda.gravar("pulso_fila", fila.slice(lote.length));
    } catch (e) {
      // fica na fila e tenta na próxima abertura
    } finally {
      despachando = false;
    }
  }

  /* ───────────────────────────  partida  ─────────────────────────── */

  function iniciar() {
    if (document.getElementById("lista") || document.getElementById("pulso")) {
      faixa();
      marcar();
      observar();
    }
    despachar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.Pulso = { faixa, marcar, enviar, ligar, desligar, ligado, carregar };
})();
