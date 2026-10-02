/* ══════════════════════════════════════════════════════════════
   HOME OFFICE HUB — cabeçalho e rodapé compartilhados
   Cada página chama montarLayout("inicio" | "vagas" | "empresas" | "guia").
   Mexer aqui muda a navegação de todas as páginas ao mesmo tempo.
   ══════════════════════════════════════════════════════════════ */

const ABAS = [
  { id: "inicio",   nome: "Início",        href: "index.html" },
  { id: "vagas",    nome: "Vagas",         href: "vagas.html" },
  { id: "empresas", nome: "Empresas",      href: "empresas.html" },
  { id: "ferramentas", nome: "Ferramentas", href: "ferramentas.html" },
  { id: "guia",     nome: "Como funciona", href: "como-funciona.html" },
  { id: "cursos", nome: "Cursos", href: "cursos.html" },
];

/* ══════════════════════════════════════════════════════════════
   ACESSO — o que é aberto e o que pede conta

   O site é aberto. A conta vale para o que tem mais valor:
     · as ferramentas (Meu Controle e Transcrição ao vivo)
     · os cursos, da segunda aula em diante (a primeira é aberta)
     · o grupo "Em movimento" da aba Vagas, que aparece borrado

   Tudo é decidido aqui, em um lugar só. As páginas não sabem de nada:
   este arquivo olha o nome da página e aplica a regra dela.

   IMPORTANTE: isto é uma cortina, não um cofre. O site é feito de
   arquivos públicos, então quem entende de programação consegue ler o
   texto de um curso por fora. Serve para dar motivo para a pessoa criar
   a conta, e para isso basta. O que é realmente protegido são os dados
   de cada conta, que ficam no banco (ver controle-conta.js).
   ══════════════════════════════════════════════════════════════ */
const Acesso = (function () {
  /* false: nada é trancado ainda, e só o botão Entrar aparece no topo.
            Para ver como fica, abra qualquer página com ?previa=1 no fim
            do endereço (e ?previa=0 para voltar ao normal).
     true:  as portas valem para todo mundo. */
  const PORTAS_LIGADAS = true;

  const PROJETO = "zrqucjktympnwilbvisw";   // o mesmo do controle-conta.js

  /* O que cada página tranca para quem não tem conta. */
  const REGRAS = [
    { pagina: /^transcricao\.html$/, tudo: true,
      titulo: "A Transcrição ao vivo é para quem tem conta",
      texto: "Entre na sua conta para usar a ferramenta." },
    { pagina: /^curso-[a-z-]+\.html$/, secoes: ["aula2", "aula3", "aula4", "quiz"],
      titulo: "Continue o curso com a sua conta",
      texto: "A primeira aula é aberta. As outras aulas e o quiz são para quem tem conta no Hub." },
  ];

  /* O login guarda a sessão no navegador. Ler direto de lá é instantâneo e
     não precisa carregar a biblioteca do Supabase em toda página. */
  function sessao() {
    try {
      const t = JSON.parse(localStorage.getItem("sb-" + PROJETO + "-auth-token") || "null");
      return t && (t.refresh_token || t.access_token) ? t : null;
    } catch (e) { return null; }
  }
  function logado() { return !!sessao(); }
  function email() { const s = sessao(); return (s && s.user && s.user.email) || ""; }

  function previa() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has("previa")) sessionStorage.setItem("hub-previa", q.get("previa") === "0" ? "" : "1");
      return sessionStorage.getItem("hub-previa") === "1";
    } catch (e) { return false; }
  }
  function portasLigadas() { return PORTAS_LIGADAS || previa(); }
  function trancado() { return portasLigadas() && !logado(); }

  function paginaAtual() { return location.pathname.split("/").pop() || "index.html"; }
  function linkEntrar() {
    return "entrar.html?voltar=" + encodeURIComponent(paginaAtual() + location.hash);
  }

  const CSS = `
  .hd-conta { margin-left:10px; white-space:nowrap; font-size:13.5px; font-weight:600; text-decoration:none;
    padding:9px 16px; border-radius:999px; background:var(--signal,#1A4893); color:#fff; border:1px solid var(--signal,#1A4893); }
  .hd-conta:hover { filter:brightness(1.08); }
  .hd-conta.dentro { background:var(--panel,#fff); color:var(--ink,#10203A); border-color:var(--line,#DED7CA); }
  @media (max-width:900px){ .hd-conta { order:2; margin-left:auto; padding:8px 13px; }
    .hd-toggle { order:3; margin-left:8px !important; } .hd-spacer { display:none; } }

  .ac-aviso { max-width:520px; margin:44px auto; padding:30px 28px; text-align:center; background:var(--panel,#fff);
    border:1px solid var(--line-soft,#EAE4D9); border-radius:var(--raio,18px); box-shadow:var(--sombra,none); }
  .ac-aviso .ac-cadeado { width:44px; height:44px; margin:0 auto 14px; border-radius:13px; display:grid; place-items:center;
    background:var(--signal-suave,#EAF1F8); color:var(--signal,#1A4893); }
  .ac-aviso h2 { font-family:var(--display,Georgia,serif); font-weight:400; font-size:23px; line-height:1.2; color:var(--ink,#10203A); margin:0 0 8px; }
  .ac-aviso p { font-size:14.5px; line-height:1.55; color:var(--ink-2,#54606F); margin:0 0 18px; }
  /* !important: as páginas de curso pintam todo link do texto de azul, e o
     botão ficaria azul sobre azul */
  .ac-aviso a.ac-bt { display:inline-block; font-weight:600; font-size:14.5px; text-decoration:none !important; color:#fff !important;
    background:var(--signal,#1A4893); padding:12px 22px; border-radius:12px; }
  .ac-aviso .ac-nota { font-size:12.5px; color:var(--ink-3,#8A94A1); margin:14px 0 0; }
  .ac-aviso .ac-nota a { color:var(--signal,#1A4893) !important; text-decoration:underline; }

  .ac-trancada > *:not(.ac-aviso) { display:none !important; }
  main.ac-pagina-trancada > *:not(.ac-aviso) { display:none !important; }

  .ac-cortina { position:relative; }
  .ac-cortina > .ac-borrado { filter:blur(7px); opacity:.75; pointer-events:none; user-select:none; }
  .ac-cortina > .ac-por-cima { position:absolute; inset:0; display:grid; place-items:center; padding:12px; }
  .ac-cortina .ac-aviso { margin:0; padding:20px 22px; max-width:420px; }
  .ac-cortina .ac-aviso h2 { font-size:19px; } .ac-cortina .ac-aviso p { margin-bottom:14px; }
  `;

  let cssPosto = false;
  function porCss() {
    if (cssPosto) return;
    cssPosto = true;
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const CADEADO = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="9" width="12" height="8.5" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  function htmlAviso(titulo, texto) {
    porCss();
    return `<div class="ac-aviso">
      <div class="ac-cadeado">${CADEADO}</div>
      <h2>${titulo}</h2>
      <p>${texto}</p>
      <a class="ac-bt" href="${linkEntrar()}">Entrar na conta</a>
      <p class="ac-nota">Ainda não tem conta? <a href="${linkEntrar().replace("entrar.html?", "entrar.html?criar=1&")}">Crie a sua, é grátis</a>.</p>
    </div>`;
  }

  /* Usado pela aba Vagas: devolve o bloco borrado, com o aviso por cima. */
  function cortina(htmlDeDentro, titulo, texto) {
    porCss();
    return `<div class="ac-cortina">
      <div class="ac-borrado" aria-hidden="true">${htmlDeDentro}</div>
      <div class="ac-por-cima">${htmlAviso(titulo, texto)}</div>
    </div>`;
  }

  function botaoNoCabecalho(hd) {
    if (!hd) return;
    porCss();
    const a = document.createElement("a");
    if (logado()) {
      a.className = "hd-conta dentro";
      a.href = "controle.html#dados";
      a.textContent = "Minha conta";
      a.title = email();
    } else {
      a.className = "hd-conta";
      a.href = paginaAtual() === "entrar.html" ? "entrar.html" : linkEntrar();
      a.textContent = "Entrar";
    }
    hd.appendChild(a);
  }

  function aplicarRegras() {
    if (!trancado()) return;
    const regra = REGRAS.find(r => r.pagina.test(paginaAtual()));
    if (!regra) return;
    porCss();

    if (regra.tudo) {
      const main = document.querySelector("main") || document.body;
      main.classList.add("ac-pagina-trancada");
      main.insertAdjacentHTML("afterbegin", htmlAviso(regra.titulo, regra.texto));
      return;
    }
    (regra.secoes || []).forEach(id => {
      const sec = document.getElementById(id);
      if (!sec || sec.classList.contains("ac-trancada")) return;
      sec.classList.add("ac-trancada");
      sec.insertAdjacentHTML("afterbegin", htmlAviso(regra.titulo, regra.texto));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplicarRegras);
  else aplicarRegras();

  return {
    logado, email, trancado, linkEntrar, cortina, htmlAviso, botaoNoCabecalho, aplicarRegras,
    get portasLigadas() { return portasLigadas(); },
  };
})();

/* A marca é o arquivo logo.svg, que precisa estar na mesma pasta dos HTML.
   É um desenho em vetor, então fica nítido em qualquer tamanho. As cópias em
   imagem (logo.png, favicon e apple-touch-icon) são o mesmo desenho. */
function marca(tam) {
  return `<img src="logo.svg" alt="Home Office Hub" width="${tam}" height="${tam}"
    style="width:${tam}px;height:${tam}px;display:block;object-fit:contain;">`;
}

function montarLayout(ativa) {
  /* O ícone da aba agora vem das tags <link rel="icon"> no head de cada
     página, que apontam para favicon.ico e favicon-32.png. Não injetamos
     mais nada aqui, senão o logo.png sobrescreveria o ícone bom. */

  // ── cabeçalho ──
  const header = document.createElement("header");
  header.className = "site";
  header.innerHTML = `
    <div class="hd">
      <a href="index.html" class="brand" aria-label="Home Office Hub, página inicial">
        <span class="brand-mark">${marca(30)}</span>
        <span class="brand-name">Home Office Hub</span>
      </a>
      <button class="hd-toggle" id="hdToggle" aria-label="Abrir menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="tabs" id="hdTabs">
        ${ABAS.map(a => `<a href="${a.href}"${a.id === ativa ? ' class="on" aria-current="page"' : ""}>${a.nome}</a>`).join("")}
      </nav>
      <div class="hd-spacer"></div>
    </div>`;
  document.body.prepend(header);

  // botão Entrar / Minha conta, no canto direito
  try { Acesso.botaoNoCabecalho(header.querySelector(".hd")); } catch (e) { console.warn(e); }

  const btn = document.getElementById("hdToggle");
  const tabs = document.getElementById("hdTabs");
  btn.addEventListener("click", () => {
    const aberto = tabs.classList.toggle("aberto");
    btn.setAttribute("aria-expanded", aberto ? "true" : "false");
  });

  // ── rodapé ──
  const footer = document.createElement("footer");
  footer.className = "site";
  footer.innerHTML = `
    <div class="ft">
      <div>
        <div class="ft-brand"><span class="brand-mark" style="width:32px;height:32px;">${marca(32)}</span>Home Office Hub</div>
        <p class="ft-desc">Trabalho remoto com inteligência artificial, dados e tradução, para quem mora no Brasil.</p>
      </div>
      <div>
        <h4>Navegar</h4>
        <ul>${ABAS.map(a => `<li><a href="${a.href}">${a.nome}</a></li>`).join("")}</ul>
      </div>
      <div>
        <h4>Áreas</h4>
        <ul>
          <li><a href="vagas.html?cat=ai">IA e dados</a></li>
          <li><a href="vagas.html?cat=transl">Tradução</a></li>
          <li><a href="vagas.html?cat=qa">QA e validação</a></li>
          <li><a href="vagas.html?cat=sme">Especialistas</a></li>
        </ul>
      </div>
      <div>
        <h4>Guia</h4>
        <ul>
          <li><a href="como-funciona.html#areas">Tipos de projeto</a></li>
          <li><a href="como-funciona.html#processo">Teste de entrada</a></li>
          <li><a href="como-funciona.html#pagamento">Como receber</a></li>
          <li><a href="como-funciona.html#golpe">Evitar golpes</a></li>
        </ul>
      </div>
    </div>
    <div class="ft-bottom">
      <span>Home Office Hub</span>
    </div>`;
  document.body.appendChild(footer);
}

/* Lê o vagas.json uma vez e devolve os dados. */
let _cacheVagas = null;
async function lerVagas() {
  if (_cacheVagas) return _cacheVagas;
  const resp = await fetch("vagas.json?v=" + Date.now());
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  _cacheVagas = await resp.json();
  return _cacheVagas;
}

/* Usada SÓ pela página individual da vaga. Junta as vagas visíveis com as
   escondidas por área, para que um link direto continue abrindo. A aba Vagas
   nunca chama esta função: ela segue com lerVagas(). */
let _cacheEsp = null;
async function lerEspecificas() {
  if (_cacheEsp) return _cacheEsp;
  try {
    const resp = await fetch("vagas-especificas.json?v=" + Date.now());
    if (!resp.ok) throw new Error("sem arquivo");
    const d = await resp.json();
    _cacheEsp = { vagas: d.vagas || [], areas: d.areas || [] };
  } catch (e) {
    _cacheEsp = { vagas: [], areas: [] };
  }
  return _cacheEsp;
}

let _cacheTodas = null;
async function lerVagasComEscondidas() {
  if (_cacheTodas) return _cacheTodas;
  const dados = await lerVagas();
  const esp = await lerEspecificas();
  _cacheTodas = { ...dados, vagas: (dados.vagas || []).concat(esp.vagas) };
  return _cacheTodas;
}

async function lerEmpresas() {
  const resp = await fetch("empresas.json?v=" + Date.now());
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  return await resp.json();
}

/* Mantida vazia de propósito: as páginas ainda chamam selo(), mas o site
   não exibe mais data de atualização em lugar nenhum. */
function selo() {}

function esc(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Logo da empresa: tenta o favicon real, cai para a sigla se falhar.

   O logo ocupa o quadrado inteiro, com uma folga proporcional. Antes ele
   ficava pequeno no meio de um quadrado colorido e sobrava um contorno
   em volta. O quadrado vira branco pela regra .marca:has(img) do
   estilo.css; se o logo não carregar, a sigla volta e o quadrado
   colorido volta junto, sozinho. */
function logoHtml(e, tam) {
  const px = tam >= 40 ? 64 : 32;
  const folga = Math.max(2, Math.round(tam * 0.12));
  if (e.dom) {
    return `<img src="https://www.google.com/s2/favicons?domain=${e.dom}&sz=${px}" alt="${esc(e.nome)}" loading="lazy"
      style="width:100%;height:100%;object-fit:contain;padding:${folga}px;box-sizing:border-box;"
      onerror="var p=this.parentNode; if(p){ p.textContent='${e.sigla || "?"}'; p.style.color='${e.cor || "#9BA3B4"}'; }">`;
  }
  return e.sigla || "";
}

/* ══════════════════════════════════════════════════════════════
   REVELAÇÃO SUAVE AO ROLAR
   Cada bloco entra com um deslize curto quando aparece na tela.
   Roda uma vez por elemento e respeita quem pediu menos animação
   no sistema. Se o navegador for antigo, simplesmente não faz nada
   e a página continua normal.
   ══════════════════════════════════════════════════════════════ */
function revelarAoRolar(seletores) {
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (quieto || !("IntersectionObserver" in window)) return;

  const alvos = document.querySelectorAll(seletores);
  if (!alvos.length) return;

  /* Seguro contra página em branco.
     O efeito abaixo esconde os blocos e devolve quando eles entram na tela.
     Se isso não acontecer (impressão, salvar em PDF, navegador estranho,
     aba aberta em segundo plano), a página ficaria vazia. Estas três linhas
     garantem que o conteúdo sempre aparece. */
  function mostrarTudo() {
    alvos.forEach(el => {
      el.style.opacity = "1";
      el.style.transform = "none";
      el.style.willChange = "auto";
    });
  }
  setTimeout(mostrarTudo, 3000);
  window.addEventListener("beforeprint", mostrarTudo);

  alvos.forEach(el => {
    el.style.opacity = "0";
    el.style.transform = "translateY(16px)";
    el.style.transition = "opacity .65s cubic-bezier(.22,.61,.36,1), transform .65s cubic-bezier(.22,.61,.36,1)";
    el.style.willChange = "opacity, transform";
  });

  const obs = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.style.opacity = "1";
      e.target.style.transform = "none";
      e.target.style.willChange = "auto";
      obs.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });

  alvos.forEach(el => obs.observe(el));
}

/* ══════════════════════════════════════════════════════════════
   MEDIÇÃO DE VISITAS
   Conta quantas pessoas abrem cada página. Não usa cookie, não
   guarda nada sobre quem visitou, e por isso não exige aviso de
   cookies no site.

   PARA LIGAR:
   1. Entre em dash.cloudflare.com, menu "Analytics & Logs",
      depois "Web Analytics", e clique em "Add a site".
   2. Informe o endereço:  alvittaluc.github.io/home-office-hub
   3. A Cloudflare mostra um trecho de código com um token, que é
      um monte de letras e números entre aspas.
   4. Copie SÓ esse token e cole na linha abaixo, no lugar de
      COLE-O-TOKEN-AQUI, mantendo as aspas.

   Enquanto o token não estiver preenchido, nada é carregado e o
   site funciona normalmente.
   ══════════════════════════════════════════════════════════════ */
const TOKEN_MEDICAO = "COLE-O-TOKEN-AQUI";

(function medicao() {
  if (!TOKEN_MEDICAO || TOKEN_MEDICAO === "COLE-O-TOKEN-AQUI") return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN_MEDICAO }));
  document.head.appendChild(s);
})();
