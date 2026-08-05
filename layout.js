/* ══════════════════════════════════════════════════════════════
   HOME OFFICE HUB — cabeçalho e rodapé compartilhados
   Cada página chama montarLayout("inicio" | "vagas" | "empresas" | "guia").
   Mexer aqui muda a navegação de todas as páginas ao mesmo tempo.
   ══════════════════════════════════════════════════════════════ */

const ABAS = [
  { id: "inicio",   nome: "Início",        href: "index.html" },
  { id: "vagas",    nome: "Vagas",         href: "vagas.html" },
  { id: "empresas", nome: "Empresas",      href: "empresas.html" },
  { id: "guia",     nome: "Como funciona", href: "como-funciona.html" },
];

/* A marca é o arquivo logo.png, que precisa estar na mesma pasta dos HTML.
   Para trocar a logo no futuro, basta substituir esse arquivo. */
function marca(tam) {
  return `<img src="logo.png" alt="Home Office Hub" width="${tam}" height="${tam}"
    style="width:${tam}px;height:${tam}px;display:block;object-fit:contain;">`;
}

function montarLayout(ativa) {
  // ── ícone da aba do navegador ──
  const ico = document.createElement("link");
  ico.rel = "icon";
  ico.href = "logo.png";
  document.head.appendChild(ico);

  // ── cabeçalho ──
  const header = document.createElement("header");
  header.className = "site";
  header.innerHTML = `
    <div class="hd">
      <a href="index.html" class="brand" aria-label="Home Office Hub, página inicial">
        <span class="brand-mark">${marca(38)}</span>
        <span class="brand-name">Home Office Hub<small>Vagas de IA · Brasil</small></span>
      </a>
      <button class="hd-toggle" id="hdToggle" aria-label="Abrir menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="tabs" id="hdTabs">
        ${ABAS.map(a => `<a href="${a.href}"${a.id === ativa ? ' class="on" aria-current="page"' : ""}>${a.nome}</a>`).join("")}
      </nav>
      <div class="hd-spacer"></div>
      <div class="hd-status">
        <span class="dot"></span>
        <span id="updateBadge">sincronizando…</span>
      </div>
    </div>`;
  document.body.prepend(header);

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
        <div class="ft-brand"><span class="brand-mark" style="width:34px;height:34px;">${marca(34)}</span>Home Office Hub</div>
        <p class="ft-desc">Vagas remotas internacionais de inteligência artificial, dados e tradução que aceitam quem mora no Brasil. Curadoria diária e automática.</p>
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
      <span>Home Office Hub · curadoria independente</span>
      <span id="ftUpdate">atualizado diariamente</span>
    </div>`;
  document.body.appendChild(footer);
}

/* Lê o vagas.json uma vez e devolve os dados.
   Usado pelo selo de atualização do cabeçalho e pelas contagens ao vivo. */
let _cacheVagas = null;
async function lerVagas() {
  if (_cacheVagas) return _cacheVagas;
  const resp = await fetch("vagas.json?v=" + Date.now());
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  _cacheVagas = await resp.json();
  return _cacheVagas;
}

async function lerEmpresas() {
  const resp = await fetch("empresas.json?v=" + Date.now());
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  return await resp.json();
}

function selo(dados) {
  const b = document.getElementById("updateBadge");
  if (b) b.textContent = "atualizado " + (dados.atualizado_br || "hoje");
  const f = document.getElementById("ftUpdate");
  if (f && dados.atualizado_br) f.textContent = "última coleta: " + dados.atualizado_br;
}

function esc(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Logo da empresa: tenta o favicon real, cai para a sigla se falhar. */
function logoHtml(e, tam) {
  const px = tam >= 40 ? 64 : 32;
  const dentro = Math.round(tam * 0.6);
  if (e.dom) {
    return `<img src="https://www.google.com/s2/favicons?domain=${e.dom}&sz=${px}" alt="${esc(e.nome)}" loading="lazy"
      style="width:${dentro}px;height:${dentro}px;"
      onerror="var p=this.parentNode; if(p){ p.textContent='${e.sigla || "?"}'; p.style.color='${e.cor || "#9BA3B4"}'; }">`;
  }
  return e.sigla || "";
}
