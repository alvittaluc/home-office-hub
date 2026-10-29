/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — a candidatura

   1. As etapas de verdade: teste de proficiência, prova específica e, por
      último, a entrevista. Cada candidatura guarda por onde passou
      (passos) e, se a pessoa ajustou, a ordem e as etapas que a vaga
      não tem (ordem). Etapa pulada aparece como "não teve".
   2. Recusado e Sem resposta: etapa, motivo e o que aconteceu, contado
      pela pessoa, ali mesmo na aba "A vaga".
   3. O PDF do currículo enviado, guardado na conta (banco/curriculos.sql)
      e aberto pelo leitor do site.
   ══════════════════════════════════════════════════════════════ */
const Candidatura = (function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ETAPAS = [["antes", "Antes do teste"], ["teste", "No teste de proficiência"], ["prova", "Na prova específica"], ["entrevista", "Na entrevista"]];
  const MOTIVOS = ["Inglês", "Diretrizes", "Tempo do teste", "Comunicação na entrevista", "Outros", "Não sei"];
  // "Outros" abre um campo curto para a pessoa dizer qual foi o motivo
  const outroHtml = (id, ap) => `<input type="text" id="${id}" class="d-campo pc-outro" maxlength="80" placeholder="Qual foi o motivo?" value="${esc(ap.recusaMotivoOutro || "")}"${ap.recusaMotivo === "Outros" ? "" : " hidden"}>`;
  const ligarOutro = (raiz, nome, id) => raiz.querySelectorAll(`input[name="${nome}"]`).forEach(r => r.addEventListener("change", () => {
    const campo = raiz.querySelector("#" + id);
    campo.hidden = r.value !== "Outros";
    if (!campo.hidden) campo.focus();
  }));
  const motivoTxt = ap => ap.recusaMotivo === "Outros" && ap.recusaMotivoOutro ? "Outros: " + ap.recusaMotivoOutro : ap.recusaMotivo;




  /* Recusado e Sem resposta abrem um espaço para a pessoa contar, do jeito dela, o que aconteceu.
     No Recusado vêm antes as duas perguntas rápidas: etapa e motivo. */
  const DICA_RELATO = {
    recusado: "Ex.: fiz o teste de diretrizes e errei as perguntas de classificação. O e-mail disse que a nota ficou abaixo do mínimo.",
    semresposta: "Ex.: fiz o teste no dia 10 e não tive mais resposta. Mandei um e-mail no dia 20 perguntando.",
  };
  const comRelato = est => est === "recusado" || est === "semresposta";

  function recusaHtml(ap) {
    return `<div class="pc-recusa" id="pcRecusa"${comRelato(ap.estado) ? "" : " hidden"}>
      <div data-so-recusado${ap.estado === "recusado" ? "" : " hidden"}>
        <div class="pc-q">Em que etapa você foi recusado?</div>
        <div class="pc-chips">${ETAPAS.map(([k, n]) => `<label class="pc-chip"><input type="radio" name="recEtapa" value="${k}"${ap.recusaEtapa === k ? " checked" : ""}><span>${n}</span></label>`).join("")}</div>
        <div class="pc-q">Sabe o motivo?</div>
        <div class="pc-chips">${MOTIVOS.map(m => `<label class="pc-chip"><input type="radio" name="recMotivo" value="${esc(m)}"${ap.recusaMotivo === m ? " checked" : ""}><span>${m}</span></label>`).join("")}</div>
        ${outroHtml("pcOutro", ap)}
      </div>
      <label class="pc-q pc-q-relato" for="pcRelato">O que aconteceu? Conte com as suas palavras</label>
      <textarea id="pcRelato" name="relato" class="d-campo pc-relato" rows="3" placeholder="${esc(DICA_RELATO[ap.estado] || DICA_RELATO.recusado)}">${esc(ap.relato || "")}</textarea>
      <div class="pc-nota">Opcional. Ajuda você a lembrar e ajuda a equipe a preparar os próximos testes.</div>
    </div>`;
  }

  /* ── o PDF do currículo que a pessoa mandou ──
     O arquivo escolhido fica só no navegador até a pessoa salvar; aí sobe para a
     conta (Conta.enviarPdf) e a candidatura guarda { caminho, nome, tamanho }.
     O mesmo PDF fica ligado ao apelido do currículo, para as próximas candidaturas. */
  let pdf = null, pendente = null, porApelido = {};

  function kb(n) { return n ? (n / 1024 < 1024 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1).replace(".", ",") + " MB") : ""; }

  function pdfHtml(ap, mapa) {
    pdf = ap.curriculoPdf || null; pendente = null; porApelido = mapa || {};
    return `<div class="pc-pdf" id="pcPdf"></div>`;
  }

  function desenharPdf(caixa) {
    const atual = pendente || pdf;
    const semConta = typeof Conta === "undefined" || !Conta.usuario;
    const botao = semConta ? "" : `<label class="ct-b pequeno pc-trocar">${atual ? "Trocar" : "Anexar PDF"}<input type="file" accept="application/pdf,.pdf" data-pc-arq hidden></label>`;
    caixa.innerHTML = atual
      ? `<span class="pc-ic">PDF</span><span class="pc-nm"><b>${esc(atual.nome)}</b><small>${esc(kb(atual.tamanho) || "anexado")}${pendente ? " · é guardado quando você salvar" : ""}</small></span>
         <button type="button" class="ct-b pequeno" data-pc-ver>Ver</button>${botao}`
      : `<span class="pc-ic vazio">PDF</span><span class="pc-nm"><b>Anexe o PDF que você mandou</b><small>${semConta ? "entre na sua conta para anexar" : "até 2 MB. Fica guardado e serve para as próximas candidaturas"}</small></span>${botao}`;
    const arq = caixa.querySelector("[data-pc-arq]");
    if (arq) arq.addEventListener("change", () => {
      const f = arq.files[0];
      if (!f) return;
      if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { UI.aviso("O arquivo precisa ser PDF.", "ruim"); return; }
      if (f.size > 2 * 1024 * 1024) { UI.aviso("O PDF passa de 2 MB. Salve uma versão menor e tente de novo.", "ruim"); return; }
      pendente = { nome: f.name, tamanho: f.size, blob: f };
      desenharPdf(caixa);
    });
    const ver = caixa.querySelector("[data-pc-ver]");
    if (ver) ver.addEventListener("click", () => abrirPdf(pendente || pdf));
  }

  function abrirPdf(p) {
    if (!p || typeof Leitor === "undefined") return;
    Leitor.abrir({ nome: p.nome, tipo: "application/pdf", tamanho: p.tamanho || 0,
      buscar: () => p.blob ? Promise.resolve(p.blob) : Conta.baixarPdf(p.caminho) });
  }

  /* Chamado ao salvar. Devolve a mensagem de erro, ou "" se deu certo. */
  async function subirPdf() {
    if (!pendente) return "";
    try {
      pdf = await Conta.enviarPdf(pendente.blob);
      pendente = null;
      return "";
    } catch (e) { return e.message || "Não deu para guardar o PDF."; }
  }

  function ligar(dlg) {
    const caixa = dlg.querySelector("#pcPdf");
    if (caixa) {
      desenharPdf(caixa);
      // escolheu um apelido que já tem PDF: ele vem junto, se nada foi anexado ainda
      const apelido = dlg.querySelector('[name="curriculo"]');
      if (apelido) apelido.addEventListener("change", () => {
        const achado = porApelido[apelido.value.trim()];
        if (achado && !pdf && !pendente) { pdf = achado; desenharPdf(caixa); }
      });
    }
    const sel = dlg.querySelector('select[name="estado"]');
    const rec = dlg.querySelector("#pcRecusa");
    if (rec) ligarOutro(rec, "recMotivo", "pcOutro");
    if (sel && rec) sel.addEventListener("change", () => {
      rec.hidden = !comRelato(sel.value);
      rec.querySelector("[data-so-recusado]").hidden = sel.value !== "recusado";
      if (DICA_RELATO[sel.value]) rec.querySelector("#pcRelato").placeholder = DICA_RELATO[sel.value];
    });
  }

  /* ── o caminho da candidatura: as etapas que a pessoa marcou de verdade ──
     ap.passos guarda { etapa: data } das etapas por onde ela passou. Nem toda vaga tem
     teste ou entrevista: quem pula uma etapa vê ela como "não teve", e não como feita.
     "?" é etapa que aconteceu, mas sem data (candidatura antiga ou marcada depois). */
  const CAMINHO = ["aplicado", "teste", "prova", "entrevista", "aprovado"];
  /* o meio do caminho muda de ordem em cada candidatura (ap.ordem): tem vaga em que a entrevista vem antes */
  const MEIO = ["teste", "prova", "entrevista"];
  const NOMES = { teste: "Teste de proficiência", prova: "Prova específica", entrevista: "Entrevista" };
  // ap.ordem também guarda as etapas tiradas: a que a vaga não tem simplesmente não está lá
  function caminho(ap) {
    const o = ap && Array.isArray(ap.ordem) && ap.ordem.every(k => MEIO.includes(k)) && new Set(ap.ordem).size === ap.ordem.length ? ap.ordem : MEIO;
    return ["aplicado"].concat(o, ["aprovado"]);
  }
  const ehData = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

  function legado(ap) {
    // antes dos passos: tudo até a etapa de hoje conta como feito, como o Meu Controle mostrava
    const cam = caminho(ap), p = { aplicado: ap.data || "?" }, i = cam.indexOf(ap.estado);
    cam.slice(1, i + 1).forEach(k => { p[k] = "?"; });
    return p;
  }

  function passosAo(ap, novo) {
    const p = Object.assign({}, ap.passos || legado(ap));
    const cam = caminho(ap), i = cam.indexOf(novo);
    if (i >= 0) {
      if (!p[novo] || p[novo] === "?") p[novo] = Dados.hoje();
      cam.slice(i + 1).forEach(k => { delete p[k]; });   // voltou uma etapa: as da frente saem
    }
    if (!p.aplicado) p.aplicado = ap.data || Dados.hoje();
    return { passos: p };
  }

  function classePasso(ap, id, i, iAtual) {
    const atual = ap.estado || "aplicado", p = ap.passos;
    if (id === atual) return " atual";
    if (!p) return iAtual >= 0 && i < iAtual ? " feita" : "";
    if (p[id]) return " feita";
    return caminho(ap).slice(i + 1).some(k => p[k] || k === atual) ? " pulada" : "";
  }

  function notaPasso(ap, id, classe) {
    if (classe === " pulada") return `<small class="cv-nao">não teve</small>`;
    const v = ap.passos && ap.passos[id];
    return ehData(v) ? `<small class="cv-quando">${v.slice(8, 10)}/${v.slice(5, 7)}</small>` : "";
  }

  // na recusa, a etapa já vem marcada pela última etapa por onde a pessoa passou
  function etapaDaRecusa(ap) {
    const p = ap.passos || {};
    return p.entrevista ? "entrevista" : p.prova ? "prova" : p.teste ? "teste" : "antes";
  }

  /* ── "Ajustar etapas": arrastar o teste, a prova e a entrevista para a ordem da vaga,
     e tirar no × a etapa que a vaga não tem. Arrasta com mouse ou dedo (pointer events)
     e com as setas do teclado. */
  function ligarOrdem(caixa, ap, salvar, redesenhar) {
    const tit = caixa.querySelector(".cv-etapas-tit"), ol = caixa.querySelector(".cv-trilho");
    if (!tit || !ol) return;
    const cam = caminho(ap), meioAtual = cam.slice(1, -1);
    ol.style.setProperty("--n", cam.length);
    const ordenando = caixa.dataset.ordenando === "1";
    tit.insertAdjacentHTML("beforeend", `<button type="button" class="cv-ordem-bt${ordenando ? " forte" : ""}" data-ordem>${ordenando ? "Pronto" : "Ajustar etapas"}</button>`);
    tit.querySelector("[data-ordem]").addEventListener("click", () => { caixa.dataset.ordenando = ordenando ? "" : "1"; redesenhar(); });
    if (!ordenando) return;
    const dica = tit.querySelector("span");
    if (dica) dica.textContent = "arraste para mudar a ordem; no × você tira a etapa que esta vaga não tem";
    ol.classList.add("ordenando");
    ol.querySelectorAll(".cv-passo").forEach(li => {
      const id = li.querySelector("button").dataset.estado;
      if (MEIO.includes(id)) li.dataset.meio = id;
    });
    const meios = () => [...ol.querySelectorAll("li[data-meio]")];

    // × nas etapas que ainda não aconteceram; a confirmação e as etapas tiradas aparecem logo embaixo
    meios().forEach(li => {
      if (li.classList.contains("feita") || li.classList.contains("atual")) return;
      li.insertAdjacentHTML("beforeend", `<button type="button" class="cv-tirar" data-tirar-etapa="${li.dataset.meio}" aria-label="Tirar ${NOMES[li.dataset.meio]}">×</button>`);
    });
    const tiradas = MEIO.filter(k => !meioAtual.includes(k));
    ol.insertAdjacentHTML("afterend", `<div class="cv-ajuste" data-ajuste>${tiradas.length ? `<span>Tiradas desta vaga:</span>${tiradas.map(k =>
      `<button type="button" class="cv-volta" data-volta="${k}">+ ${NOMES[k]}</button>`).join("")}` : ""}</div>`);
    const ajuste = caixa.querySelector("[data-ajuste]");
    ol.querySelectorAll("[data-tirar-etapa]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.tirarEtapa, nome = NOMES[k].toLowerCase();
      ajuste.innerHTML = `<div class="cv-confirma"><p><b>Esta vaga não tem ${nome}?</b> A etapa sai do caminho desta candidatura. Se precisar, ela volta por aqui mesmo.</p>
        <div><button type="button" class="ct-b pequeno forte" data-sim>Tirar a etapa</button> <button type="button" class="ct-b pequeno" data-nao>Cancelar</button></div></div>`;
      ajuste.querySelector("[data-nao]").addEventListener("click", redesenhar);
      ajuste.querySelector("[data-sim]").addEventListener("click", async () => {
        await salvar(meioAtual.filter(x => x !== k), NOMES[k] + " tirada desta vaga.");
        redesenhar();
      });
    }));
    ajuste.querySelectorAll("[data-volta]").forEach(b => b.addEventListener("click", async () => {
      await salvar(meioAtual.concat([b.dataset.volta]), NOMES[b.dataset.volta] + " voltou para o caminho desta vaga.");
      redesenhar();
    }));

    const guardar = async () => {
      const ordem = meios().map(m => m.dataset.meio);
      if (ordem.join() !== caminho(ap).slice(1, -1).join()) await salvar(ordem);
      redesenhar();
    };
    meios().forEach(li => {
      const bt = li.querySelector("button");
      bt.setAttribute("aria-label", bt.querySelector("span").textContent + ": use as setas para mudar de lugar");
      li.addEventListener("pointerdown", ev => {
        if (ev.button !== 0 || ev.target.closest("[data-tirar-etapa]")) return;
        ev.preventDefault();
        li.classList.add("arrastando");
        const mover = e => {
          // no celular as etapas quebram em linhas: vale o ponto do dedo nas duas direções
          const alvo = meios().find(m => { const r = m.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 30 && e.clientY <= r.bottom + 30; });
          if (!alvo || alvo === li) return;
          const lista = meios(), ia = lista.indexOf(alvo), il = lista.indexOf(li);
          ol.insertBefore(li, ia > il ? alvo.nextSibling : alvo);
        };
        const soltar = () => {
          ["pointermove", "pointerup", "pointercancel"].forEach((t, k) => document.removeEventListener(t, k ? soltar : mover));
          li.classList.remove("arrastando");
          guardar();
        };
        document.addEventListener("pointermove", mover);
        document.addEventListener("pointerup", soltar);
        document.addEventListener("pointercancel", soltar);
      });
      bt.addEventListener("keydown", async e => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const lista = meios(), i = lista.indexOf(li), j = i + (e.key === "ArrowLeft" ? -1 : 1);
        if (j < 0 || j >= lista.length) return;
        ol.insertBefore(li, e.key === "ArrowLeft" ? lista[j] : lista[j].nextSibling);
        const id = li.dataset.meio;
        await guardar();
        const b = caixa.querySelector(`li[data-meio="${id}"] button`);
        if (b) b.focus();
      });
    });
  }

  /* ── na aba "A vaga": clicou em Recusado ou Sem resposta, o espaço para contar abre ali mesmo ── */
  function ligarVaga(caixa, ap, salvar) {
    if (!caixa) return;
    let editando = false;
    const desenhar = () => {
      if (!comRelato(ap.estado)) { caixa.innerHTML = ""; return; }
      const recusado = ap.estado === "recusado";
      const temAlgo = ap.relato || (recusado && (ap.recusaEtapa || ap.recusaMotivo));
      if (temAlgo && !editando) {
        const etapa = (ETAPAS.find(e => e[0] === ap.recusaEtapa) || [])[1];
        const tags = recusado ? [etapa, motivoTxt(ap)].filter(Boolean) : [];
        caixa.innerHTML = `<div class="pcv pcv-lido">
          <div class="pcv-cab"><span class="pc-q">O que aconteceu</span><button type="button" class="pcv-link" data-pcv-editar>Editar</button></div>
          ${tags.length ? `<div class="pcv-tags">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
          ${ap.relato ? `<p class="pcv-txt">${esc(ap.relato)}</p>` : `<p class="pcv-txt pcv-leve">Você ainda não escreveu o que aconteceu.</p>`}
        </div>`;
        caixa.querySelector("[data-pcv-editar]").addEventListener("click", () => { editando = true; desenhar(); });
        return;
      }
      caixa.innerHTML = `<div class="pcv">
        ${recusado ? `<div class="pc-q">Em que etapa você foi recusado?</div>
          <div class="pc-chips">${ETAPAS.map(([k, n]) => `<label class="pc-chip"><input type="radio" name="vRecEtapa" value="${k}"${(ap.recusaEtapa || etapaDaRecusa(ap)) === k ? " checked" : ""}><span>${n}</span></label>`).join("")}</div>
          <div class="pc-q">Sabe o motivo?</div>
          <div class="pc-chips">${MOTIVOS.map(m => `<label class="pc-chip"><input type="radio" name="vRecMotivo" value="${esc(m)}"${ap.recusaMotivo === m ? " checked" : ""}><span>${m}</span></label>`).join("")}</div>
          ${outroHtml("pcvOutro", ap)}` : ""}
        <label class="pc-q pcv-q-relato" for="pcvRelato">O que aconteceu? Conte com as suas palavras</label>
        <textarea id="pcvRelato" class="d-campo pc-relato" rows="3" placeholder="${esc(DICA_RELATO[ap.estado])}">${esc(ap.relato || "")}</textarea>
        <div class="pcv-pe"><span class="pc-nota" style="margin:0">Opcional. Ajuda você a lembrar e ajuda a equipe a preparar os próximos testes.</span>
          <button type="button" class="ct-b pequeno forte" data-pcv-salvar>Salvar</button></div>
      </div>`;
      ligarOutro(caixa, "vRecMotivo", "pcvOutro");
      caixa.querySelector("[data-pcv-salvar]").addEventListener("click", async () => {
        const v = n => { const x = caixa.querySelector(`input[name="${n}"]:checked`); return x ? x.value : ""; };
        const campos = { relato: caixa.querySelector("#pcvRelato").value.trim() };
        if (recusado) {
          campos.recusaEtapa = v("vRecEtapa"); campos.recusaMotivo = v("vRecMotivo");
          campos.recusaMotivoOutro = campos.recusaMotivo === "Outros" ? caixa.querySelector("#pcvOutro").value.trim() : "";
        }
        await salvar(campos);
        editando = false; desenhar();
      });
    };
    desenhar();
  }

  function campos(d) {
    // candidatura já registrada: etapa, recusa e o que aconteceu mudam na aba "A vaga", não aqui
    const comPdf = d.querySelector("#pcPdf") ? { curriculoPdf: pdf } : {};
    if (!d.querySelector("#pcRecusa")) return comPdf;
    const v = n => { const x = d.querySelector(`input[name="${n}"]:checked`); return x ? x.value : ""; };
    const est = (d.querySelector('select[name="estado"]') || {}).value, recusado = est === "recusado";
    const relato = d.querySelector("#pcRelato");
    // candidatura nova: as etapas antes da escolhida contam como feitas, sem data
    const enviada = (d.querySelector('[name="data"]') || {}).value || Dados.hoje(), i = CAMINHO.indexOf(est);
    const passos = { aplicado: enviada };
    CAMINHO.slice(1, i + 1).forEach(k => { passos[k] = k === est ? Dados.hoje() : "?"; });
    const outro = d.querySelector("#pcOutro");
    return { ...comPdf, recusaEtapa: recusado ? v("recEtapa") : "", recusaMotivo: recusado ? v("recMotivo") : "",
             recusaMotivoOutro: recusado && v("recMotivo") === "Outros" && outro ? outro.value.trim() : "",
             relato: comRelato(est) && relato ? relato.value.trim() : "", passos };
  }

  const st = document.createElement("style");
  st.textContent = `
    .pc-pdf { display:flex; align-items:center; gap:12px; margin:-4px 0 16px; padding:11px 14px; border-radius:12px;
      border:1.5px dashed #9DB8DE; background:var(--signal-suave,#EAF1F8); }
    .pc-ic { width:34px; height:42px; border-radius:5px; background:#fff; border:1px solid #D3E2F1; display:grid; place-items:center;
      font-size:10px; font-weight:700; color:#8E2233; flex-shrink:0; }
    .pc-ic.vazio { color:var(--ink-3,#66717F); }
    .pc-nm { flex:1; min-width:0; } .pc-nm b { display:block; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pc-nm small { display:block; font-size:12px; color:var(--ink-3,#66717F); }
    .pc-trocar { cursor:pointer; }
    .pc-recusa { border:2px solid var(--signal,#1A4893); background:var(--signal-suave,#EAF1F8); border-radius:14px; padding:14px 16px; margin:-4px 0 16px; }
    .pc-recusa[hidden] { display:none; }
    .pc-q { font-size:13.5px; font-weight:600; margin:2px 0 8px; } .pc-q + .pc-chips + .pc-q { margin-top:12px; }
    .pc-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .pc-chip input { position:absolute; opacity:0; pointer-events:none; }
    .pc-chip span { display:inline-block; font-size:13px; padding:6px 12px; border-radius:999px; border:1px solid var(--line,#DED7CA); background:#fff; cursor:pointer; }
    .pc-chip input:checked + span { background:var(--signal,#1A4893); color:#fff; border-color:var(--signal,#1A4893); }
    .pc-chip input:focus-visible + span { outline:3px solid #7FB2DA; }
    .pc-nota { font-size:12px; color:var(--ink-3,#66717F); margin-top:10px; }
    .pc-outro { width:100%; margin-top:8px; background:#fff; }
    .pc-outro[hidden] { display:none; }
    .pc-recusa [hidden] { display:none; }
    [data-so-recusado]:not([hidden]) + .pc-q-relato { margin-top:14px; }
    .pc-q-relato { display:block; }
    .pc-relato { width:100%; background:#fff; line-height:1.5; resize:vertical; }
    .pcv { margin-top:14px; padding:14px 16px; border-radius:12px; background:var(--signal-suave,#EAF1F8); border:1px solid #D3E2F1; }
    .pcv .pc-chips + .pc-q { margin-top:12px; }
    .pcv-q-relato { display:block; margin-top:14px; }
    .pcv:not(:has(.pc-chips)) .pcv-q-relato { margin-top:2px; }
    .pcv-pe { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:10px; flex-wrap:wrap; }
    .pcv-lido { background:var(--panel-2,#FBF9F5); border-color:var(--line-soft,#EAE4D9); }
    .pcv-cab { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .pcv-cab .pc-q { margin:0; }
    .pcv-link { font:inherit; font-size:13px; font-weight:600; color:var(--signal,#1A4893); background:none; border:0; padding:0; cursor:pointer; }
    .pcv-tags { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
    .pcv-tags span { font-size:12px; color:#8E2233; background:#FBE9EB; border-radius:6px; padding:2px 8px; }
    .pcv-txt { font-size:14px; line-height:1.55; color:var(--ink,#10203A); margin:8px 0 0; }
    .pcv-leve { color:var(--ink-3,#66717F); }
    .cv-passo button small { font-size:11px; font-weight:400; color:var(--ink-3,#66717F); margin-top:-4px; }
    .cv-passo.pulada button i { border-style:dashed; border-color:#B9B1A3; background:var(--bg-soft,#F1ECE3); }
    .cv-passo.pulada button span { color:var(--ink-3,#66717F); }
    .cv-passo.pulada button:hover i { border-style:solid; }
    .cv-passo.pulada::before, .cv-passo.pulada + .cv-passo.feita::before, .cv-passo.pulada + .cv-passo.atual::before {
      background:repeating-linear-gradient(90deg, var(--signal,#1A4893) 0 6px, transparent 6px 11px); }
    .cv-nao { color:#A85D24 !important; font-weight:500 !important; }
    .cv-ordem-bt { float:right; font:inherit; font-size:12px; font-weight:600; letter-spacing:0; text-transform:none; color:var(--signal,#1A4893);
      background:var(--panel,#fff); border:1px solid #D3E2F1; border-radius:99px; padding:3px 11px; margin-top:-4px; cursor:pointer; }
    .cv-ordem-bt.forte { background:var(--signal,#1A4893); border-color:var(--signal,#1A4893); color:#fff; }
    .cv-trilho.ordenando li[data-meio] { touch-action:none; user-select:none; }
    .cv-trilho.ordenando li[data-meio] button { cursor:grab; border-radius:12px; outline:1.5px dashed #9DB8DE; outline-offset:3px; background:var(--signal-suave,#EAF1F8); }
    .cv-trilho.ordenando li.arrastando button { cursor:grabbing; opacity:.6; outline-style:solid; }
    .cv-trilho.ordenando li[data-meio] button.cv-tirar { position:absolute; top:-12px; right:2px; z-index:3; width:26px; height:26px; padding:0; display:grid; place-items:center;
      border-radius:50%; border:1px solid #F1CDD2; outline:none; background:#fff; color:#8E2233; font-size:16px; font-weight:600; line-height:1; cursor:pointer;
      box-shadow:0 2px 6px rgba(16,32,58,.14); }
    .cv-trilho.ordenando li[data-meio] button.cv-tirar:hover { background:#FBE9EB; }
    .cv-ajuste:not(:empty) { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:16px; font-size:12.5px; color:var(--ink-3,#66717F); }
    .cv-volta { font:inherit; font-size:12.5px; font-weight:600; color:var(--signal,#1A4893); background:var(--panel,#fff); border:1px dashed #9DB8DE; border-radius:99px; padding:4px 11px; cursor:pointer; }
    .cv-confirma { flex:1; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 16px; padding:11px 14px; border-radius:12px;
      background:#FBE9EB; border:1px solid #F1CDD2; color:#5E1A26; font-size:13.5px; line-height:1.5; }
    .cv-confirma p { margin:0; flex:1; min-width:240px; } .cv-confirma b { color:#8E2233; }
    /* cinco etapas: currículo, teste de proficiência, prova específica, entrevista e aprovado */
    .cv-trilho { grid-template-columns:repeat(var(--n, 5), 1fr); }
    @media (max-width:560px) { .cv-trilho { grid-template-columns:repeat(2, 1fr); } .cv-passo:nth-child(5)::before { display:none; } }
  `;
  document.head.appendChild(st);

  return { pdfHtml, subirPdf, abrirPdf, recusaHtml, ligar, ligarVaga, ligarOrdem, caminho, campos, passosAo, classePasso, notaPasso };
})();
