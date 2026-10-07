/* ══════════════════════════════════════════════════════════════
   LEITOR — abre PDF e imagem dentro do site

   Usado pelo mural das mentorias: a pessoa clica no arquivo e lê
   ali mesmo, numa janela por cima da página, sem ter de baixar.
   O botão Baixar fica à mão para quem quiser guardar.

   Uso:
     Leitor.abrir({
       nome:    "Resumo.pdf",
       tipo:    "application/pdf",        // ou image/png, image/jpeg, image/webp, image/gif
       tamanho: 482133,                   // em bytes, só para mostrar
       buscar:  () => Promise<Blob>,      // quem traz o arquivo (já conferida a permissão)
     });

   PDF: desenhado pelo PDF.js, da Mozilla, página por página. Ele não
   executa nada que venha dentro do arquivo, e funciona igual no
   computador e no celular (o leitor embutido dos navegadores não
   abre PDF dentro da página em vários celulares). A biblioteca só é
   carregada na primeira vez que alguém abre um PDF, e o navegador
   confere a assinatura dela antes de usar: se o arquivo servido
   mudar, ele não roda.

   Imagem: mostrada como imagem, e só os formatos de foto. Nada de
   SVG nem HTML, que podem carregar código.
   ══════════════════════════════════════════════════════════════ */

const Leitor = (function () {
  "use strict";

  const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/";
  const ASSINATURA = {
    "pdf.min.mjs":        "sha384-z/XbAtvhBXJoK+yvYimnFuTCF6/2wTCDSIFD09/HtIfwFtvDKOMdAe5Z3wOChkmW",
    "pdf.worker.min.mjs": "sha384-vbNBYP03jHFPlgtK4qSXtazEmGfmpTWlSsfq9OiU20MroW/Q9TbaEXiM7PpeWg+6",
  };
  const IMAGENS = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const MAX_PIXELS = 8e6;          // teto por página, para o celular não ficar sem memória
  const MAX_PAGINAS_PRONTAS = 14;  // páginas desenhadas ao mesmo tempo; as mais distantes são soltas

  const esc = s => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function tamanhoBonito(b) {
    if (!b && b !== 0) return "";
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + " KB";
    return (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
  }

  const IC = {
    fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
    baixar: '<path d="M12 4v11M7.5 10.8L12 15.3l4.5-4.5M5 19.5h14"/>',
    mais:   '<path d="M12 5.5v13M5.5 12h13"/>',
    menos:  '<path d="M5.5 12h13"/>',
    pdf:    '<path d="M14 3.5H7.2a2 2 0 00-2 2v13a2 2 0 002 2h9.6a2 2 0 002-2V8.3L14 3.5z"/><path d="M13.8 3.6v4.8h4.8M8.8 13h6.4M8.8 16.4h4.2"/>',
    imagem: '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.2"/><circle cx="9" cy="10" r="1.7"/><path d="M4.4 17.6l4.9-4.6 3.5 3.2 2.6-2.3 4.2 3.7"/>',
  };
  const ic = (nome, tam) => `<svg width="${tam || 18}" height="${tam || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[nome] || ""}</svg>`;

  const CSS = `
  .lt { position:fixed; inset:0; z-index:220; display:flex; flex-direction:column; background:rgba(10,18,32,.94); color:#F2EFE9;
    font-family:var(--body,'Geist',system-ui,sans-serif); }
  .lt-topo { display:flex; align-items:center; gap:12px; padding:10px 14px; background:#0F1D33; border-bottom:1px solid #26374F; flex-shrink:0; }
  .lt-arq { display:flex; align-items:center; gap:10px; min-width:0; flex:1; }
  .lt-arq svg { flex-shrink:0; color:#7FB2DA; }
  .lt-arq b { display:block; font-size:14.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lt-arq small { display:block; font-size:12px; color:#A9B6C6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lt-bts { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .lt-bt { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:36px; min-width:36px; padding:0 9px; border-radius:10px;
    font:inherit; font-size:13.5px; font-weight:500; color:#F2EFE9; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14);
    cursor:pointer; text-decoration:none; }
  .lt-bt:hover { background:rgba(255,255,255,.15); border-color:rgba(255,255,255,.3); }
  .lt-bt:focus-visible { outline:2px solid #7FB2DA; outline-offset:2px; }
  .lt-bt[disabled] { opacity:.4; cursor:default; }
  .lt-bt.forte { background:#1A4893; border-color:#1A4893; padding:0 14px; }
  .lt-bt.forte:hover { background:#173E7E; }
  .lt-zoom { min-width:48px; text-align:center; font-size:12.5px; color:#A9B6C6; font-variant-numeric:tabular-nums; }
  .lt-corpo { flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:18px 14px 40px; }
  .lt-corpo:focus { outline:none; }
  .lt-paginas { display:flex; flex-direction:column; align-items:center; gap:14px; width:max-content; min-width:100%; }
  .lt-pagina { position:relative; background:#fff; box-shadow:0 8px 30px -12px rgba(0,0,0,.7); border-radius:3px; flex-shrink:0; }
  .lt-pagina canvas { display:block; width:100%; height:100%; border-radius:3px; }
  .lt-imagem { display:grid; place-items:center; min-height:100%; width:max-content; min-width:100%; }
  .lt-imagem img { display:block; max-width:none; background:#fff; border-radius:4px; box-shadow:0 8px 30px -12px rgba(0,0,0,.7); }
  .lt-estado { display:grid; place-items:center; min-height:100%; text-align:center; padding:20px; }
  .lt-estado div { max-width:400px; }
  .lt-estado p { font-size:15px; line-height:1.55; color:#A9B6C6; margin:0 0 16px; }
  .lt-estado p b { display:block; font-size:17px; font-weight:600; color:#F2EFE9; margin-bottom:6px; }
  .lt-gira { width:30px; height:30px; margin:0 auto 14px; border-radius:50%; border:3px solid rgba(255,255,255,.18); border-top-color:#7FB2DA;
    animation:lt-gira .8s linear infinite; }
  @keyframes lt-gira { to { transform:rotate(360deg); } }
  @media (prefers-reduced-motion:reduce){ .lt-gira { animation-duration:2.4s; } }
  @media (max-width:620px){
    .lt-topo { padding:8px 10px; gap:8px; }
    .lt-bt.forte span { display:none; } .lt-bt.forte { padding:0 9px; }
    .lt-zoom { display:none; }
    .lt-corpo { padding:12px 8px 30px; }
  }
  `;
  let cssPosto = false;
  function porCss() {
    if (cssPosto) return; cssPosto = true;
    const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
  }

  /* ── PDF.js, carregado só quando alguém abre um PDF ── */
  let pdfjs = null;
  async function carregarPdfJs() {
    if (pdfjs) return pdfjs;
    const pegar = async arquivo => {
      // o navegador recusa o arquivo se a assinatura não bater
      const r = await fetch(PDFJS + arquivo, { integrity: ASSINATURA[arquivo], mode: "cors", credentials: "omit" });
      if (!r.ok) throw new Error("leitor");
      return URL.createObjectURL(new Blob([await r.text()], { type: "text/javascript" }));
    };
    const partes = await Promise.all([pegar("pdf.min.mjs"), pegar("pdf.worker.min.mjs")]);
    const modulo = await import(partes[0]);
    modulo.GlobalWorkerOptions.workerSrc = partes[1];
    pdfjs = modulo;
    return pdfjs;
  }

  let aberto = null;   // só um leitor por vez

  function abrir(o) {
    porCss();
    if (aberto) aberto.fechar();

    const ehPdf = o.tipo === "application/pdf";
    const ehImagem = IMAGENS.indexOf(o.tipo) >= 0;
    const antes = document.activeElement;
    const aoFechar = [];          // o que precisa ser solto quando a janela fecha
    let fechado = false, doc = null, olho = null, zoom = 2, redesenhar = null;

    const cx = document.createElement("div");
    cx.className = "lt";
    cx.setAttribute("role", "dialog");
    cx.setAttribute("aria-modal", "true");
    cx.setAttribute("aria-label", "Arquivo: " + (o.nome || ""));
    cx.innerHTML = `
      <div class="lt-topo">
        <div class="lt-arq">${ic(ehPdf ? "pdf" : "imagem", 22)}
          <div style="min-width:0"><b>${esc(o.nome || "Arquivo")}</b><small data-info>${esc(tamanhoBonito(o.tamanho))}</small></div></div>
        <div class="lt-bts">
          <button type="button" class="lt-bt" data-menos aria-label="Diminuir" title="Diminuir" disabled>${ic("menos", 17)}</button>
          <span class="lt-zoom" data-zoom aria-live="polite">100%</span>
          <button type="button" class="lt-bt" data-mais aria-label="Aumentar" title="Aumentar" disabled>${ic("mais", 17)}</button>
          <a class="lt-bt forte" data-baixar aria-disabled="true" hidden>${ic("baixar", 17)}<span>Baixar</span></a>
          <button type="button" class="lt-bt" data-fechar aria-label="Fechar" title="Fechar (Esc)">${ic("fechar", 18)}</button>
        </div>
      </div>
      <div class="lt-corpo" tabindex="0">
        <div class="lt-estado"><div><div class="lt-gira"></div><p>Abrindo o arquivo…</p></div></div>
      </div>`;

    const corpo = cx.querySelector(".lt-corpo");
    const info = cx.querySelector("[data-info]");
    const btMenos = cx.querySelector("[data-menos]"), btMais = cx.querySelector("[data-mais]");
    const rotZoom = cx.querySelector("[data-zoom]"), btBaixar = cx.querySelector("[data-baixar]");

    function fechar() {
      if (fechado) return;
      fechado = true; aberto = null;
      document.removeEventListener("keydown", tecla, true);
      if (olho) olho.disconnect();
      if (doc) { try { doc.destroy(); } catch (e) {} }
      aoFechar.forEach(f => { try { f(); } catch (e) {} });
      cx.remove();
      document.documentElement.style.overflow = "";
      if (antes && antes.focus && document.contains(antes)) antes.focus();
    }
    function tecla(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); fechar(); return; }
      if (ev.key !== "Tab") return;
      // o foco não sai da janela
      const f = Array.from(cx.querySelectorAll("button:not([disabled]), a[href], .lt-corpo"));
      const i = f.indexOf(document.activeElement);
      ev.preventDefault();
      f[(i + (ev.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    function falhou(titulo, texto, comBaixar) {
      if (fechado) return;
      corpo.innerHTML = `<div class="lt-estado"><div><p><b>${esc(titulo)}</b>${esc(texto)}</p>${
        comBaixar && btBaixar.href ? `<a class="lt-bt forte" href="${esc(btBaixar.href)}" download="${esc(o.nome || "arquivo")}">${ic("baixar", 17)}<span style="display:inline">Baixar o arquivo</span></a>` : ""}</div></div>`;
    }
    function porZoom() {
      rotZoom.textContent = Math.round(ZOOMS[zoom] * 100) + "%";
      btMenos.disabled = zoom <= 0; btMais.disabled = zoom >= ZOOMS.length - 1;
    }

    cx.addEventListener("click", ev => {
      if (ev.target.closest("[data-fechar]")) { fechar(); return; }
      const mais = ev.target.closest("[data-mais]"), menos = ev.target.closest("[data-menos]");
      if ((mais || menos) && redesenhar) {
        zoom = Math.max(0, Math.min(ZOOMS.length - 1, zoom + (mais ? 1 : -1)));
        porZoom(); redesenhar();
      }
    });
    document.addEventListener("keydown", tecla, true);
    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(cx);
    cx.querySelector("[data-fechar]").focus();
    aberto = { fechar };

    /* ── imagem ── */
    function mostrarImagem(url) {
      const img = new Image();
      img.alt = o.nome || "";
      img.onload = () => {
        if (fechado) return;
        const mold = document.createElement("div");
        mold.className = "lt-imagem";
        mold.appendChild(img);
        corpo.innerHTML = ""; corpo.appendChild(mold);
        info.textContent = [img.naturalWidth + " × " + img.naturalHeight, tamanhoBonito(o.tamanho)].filter(Boolean).join(" · ");
        redesenhar = () => {
          // 100% = a imagem inteira cabendo na janela, sem ampliar além do tamanho real
          const cabeL = corpo.clientWidth - 28, cabeA = corpo.clientHeight - 58;
          const base = Math.min(1, cabeL / img.naturalWidth, cabeA / img.naturalHeight);
          img.style.width = Math.max(40, Math.round(img.naturalWidth * base * ZOOMS[zoom])) + "px";
        };
        porZoom(); redesenhar();
      };
      img.onerror = () => falhou("Não deu para abrir esta imagem aqui.", "Você ainda pode baixar o arquivo.", true);
      img.src = url;
    }

    /* ── PDF ── */
    async function mostrarPdf(blob) {
      let lib;
      try { lib = await carregarPdfJs(); }
      catch (e) { console.warn(e); falhou("O leitor de PDF não carregou neste navegador.", "Você ainda pode baixar o arquivo e abrir no seu aparelho.", true); return; }
      if (fechado) return;
      try {
        doc = await lib.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
          isEvalSupported: false,      // nada do arquivo vira código
          enableXfa: false,
          disableAutoFetch: true, disableStream: true,
        }).promise;
      } catch (e) {
        console.warn(e);
        falhou("Não deu para abrir este PDF aqui.", "O arquivo pode estar protegido por senha ou com defeito. Você ainda pode baixar.", true);
        return;
      }
      if (fechado) { try { doc.destroy(); } catch (e) {} return; }

      const total = doc.numPages;
      const primeira = await doc.getPage(1);
      const medida = primeira.getViewport({ scale: 1 });
      const lista = document.createElement("div");
      lista.className = "lt-paginas";
      const molduras = [];
      for (let n = 1; n <= total; n++) {
        const m = document.createElement("div");
        m.className = "lt-pagina"; m.dataset.n = n;
        m.setAttribute("aria-label", "Página " + n + " de " + total);
        lista.appendChild(m); molduras.push(m);
      }
      corpo.innerHTML = ""; corpo.appendChild(lista);

      const prontas = new Map();   // número da página -> escala em que foi desenhada
      let fila = Promise.resolve(), geracao = 0;
      const dizerPagina = n => { info.textContent = ["Página " + n + " de " + total, tamanhoBonito(o.tamanho)].filter(Boolean).join(" · "); };
      dizerPagina(1);

      function escalaAtual() {
        // 100% = a página ocupando a largura da janela, com um teto para não ficar gigante no monitor
        const cabe = Math.min(corpo.clientWidth - 28, 980);
        return Math.max(0.2, cabe / medida.width) * ZOOMS[zoom];
      }
      function arrumarTamanhos() {
        const s = escalaAtual();
        molduras.forEach(m => {
          m.style.width = Math.round(medida.width * s) + "px";
          m.style.height = Math.round(medida.height * s) + "px";
        });
      }
      function soltar(n) {
        const m = molduras[n - 1];
        if (m) m.innerHTML = "";
        prontas.delete(n);
      }
      function desenhar(n) {
        const minha = geracao;
        fila = fila.then(async () => {
          if (fechado || minha !== geracao || prontas.has(n)) return;
          const pagina = n === 1 ? primeira : await doc.getPage(n);
          const s = escalaAtual();
          let dpr = Math.min(window.devicePixelRatio || 1, 2);
          const vp0 = pagina.getViewport({ scale: s });
          if (vp0.width * vp0.height * dpr * dpr > MAX_PIXELS) dpr = Math.max(0.5, Math.sqrt(MAX_PIXELS / (vp0.width * vp0.height)));
          const vp = pagina.getViewport({ scale: s * dpr });
          const tela = document.createElement("canvas");
          tela.width = Math.floor(vp.width); tela.height = Math.floor(vp.height);
          const m = molduras[n - 1];
          // cada página pode ter o seu tamanho: a moldura acompanha
          m.style.width = Math.round(vp0.width) + "px"; m.style.height = Math.round(vp0.height) + "px";
          await pagina.render({ canvasContext: tela.getContext("2d", { alpha: false }), viewport: vp }).promise;
          if (fechado || minha !== geracao) return;
          m.innerHTML = ""; m.appendChild(tela);
          prontas.set(n, s);
          // solta as páginas desenhadas que ficaram mais longe desta
          if (prontas.size > MAX_PAGINAS_PRONTAS) {
            const longe = Array.from(prontas.keys()).sort((a, b) => Math.abs(b - n) - Math.abs(a - n));
            longe.slice(0, prontas.size - MAX_PAGINAS_PRONTAS).forEach(soltar);
          }
        }).catch(e => console.warn("página " + n, e));
      }

      const naTela = new Set();
      olho = new IntersectionObserver(ent => {
        ent.forEach(x => {
          const n = +x.target.dataset.n;
          if (x.isIntersecting) { naTela.add(n); if (!prontas.has(n)) desenhar(n); }
          else naTela.delete(n);
        });
        if (naTela.size) {
          // a página "atual" é a que está mais perto do alto da janela
          const topo = corpo.getBoundingClientRect().top + 60;
          let atual = null, menor = Infinity;
          naTela.forEach(n => {
            const r = molduras[n - 1].getBoundingClientRect();
            const d = r.bottom < topo ? Infinity : Math.abs(r.top - topo);
            if (d < menor) { menor = d; atual = n; }
          });
          if (atual) dizerPagina(atual);
        }
      }, { root: corpo, rootMargin: "500px 0px 700px 0px", threshold: [0, 0.2, 0.6] });

      redesenhar = () => {
        geracao++;
        // a leitura continua no mesmo ponto do documento depois de mudar o tamanho
        const ponto = corpo.scrollHeight ? corpo.scrollTop / corpo.scrollHeight : 0;
        Array.from(prontas.keys()).forEach(soltar);
        arrumarTamanhos();
        corpo.scrollTop = ponto * corpo.scrollHeight;
        naTela.forEach(desenhar);
      };
      arrumarTamanhos();
      porZoom();
      molduras.forEach(m => olho.observe(m));
      // sem isto, uma página escondida (aba em segundo plano) pode demorar a avisar que apareceu
      desenhar(1);

      let espera = null;
      const aoMudarJanela = () => { clearTimeout(espera); espera = setTimeout(() => { if (!fechado && redesenhar) redesenhar(); }, 250); };
      window.addEventListener("resize", aoMudarJanela);
      aoFechar.push(() => { clearTimeout(espera); window.removeEventListener("resize", aoMudarJanela); });
    }

    /* ── traz o arquivo e decide como mostrar ── */
    (async function () {
      let blob;
      try { blob = await o.buscar(); }
      catch (e) { falhou("Não deu para trazer o arquivo.", (e && e.message) || "Confira a internet e tente de novo.", false); return; }
      if (fechado) return;
      if (!blob || !blob.size) { falhou("O arquivo veio vazio.", "Peça ao mentor para anexar de novo.", false); return; }
      // o tipo vem da lista do mural, não do que o arquivo diz de si mesmo
      const seguro = new Blob([blob], { type: ehPdf ? "application/pdf" : ehImagem ? o.tipo : "application/octet-stream" });
      const url = URL.createObjectURL(seguro);
      aoFechar.push(() => URL.revokeObjectURL(url));
      btBaixar.href = url; btBaixar.setAttribute("download", o.nome || "arquivo");
      btBaixar.removeAttribute("aria-disabled"); btBaixar.hidden = false;
      if (ehImagem) mostrarImagem(url);
      else if (ehPdf) mostrarPdf(seguro);
      else falhou("Este tipo de arquivo não abre dentro do site.", "Você pode baixar e abrir no seu aparelho.", true);
    })();

    return { fechar };
  }

  return { abrir, tamanhoBonito };
})();
