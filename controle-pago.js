/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — o valor que a empresa pagou de verdade

   O bruto sai dos dias registrados: é o que a pessoa acha que vai
   receber. Quando o dinheiro cai, ela informa quanto a empresa pagou
   naquele período. O mesmo registro aparece na tela do trabalho e na
   tela Imposto: editou num lugar, muda no outro.

   Guardado na lista "pagamentos" que o Meu Controle já tem, com um
   campo a mais: periodo, o primeiro dia do período a que o valor se
   refere.
   ══════════════════════════════════════════════════════════════ */
const Pago = (function () {
  "use strict";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dinheiro = (v, m) => Dados.escreverDinheiro(v, m || "BRL");

  function doPeriodo(pagamentos, trabalhoId, perDe) {
    return pagamentos.find(p => p.trabalhoId === trabalhoId && p.periodo === perDe) || null;
  }

  /* Cada período do trabalho com dia registrado ou valor pago, com o bruto e o pago. */
  function periodos(t, registros, pagamentos) {
    const dia = UI.diaDoPeriodo(t), mapa = {};
    const linha = per => mapa[per.de] || (mapa[per.de] = { per, bruto: 0, temDia: false, pago: null });
    registros.filter(r => r.trabalhoId === t.id && UI.temAlgo(r)).forEach(r => {
      const l = linha(UI.periodoDe(r.data, dia));
      l.bruto += UI.ganhoBruto(r, t);
      l.temDia = true;
    });
    pagamentos.filter(p => p.trabalhoId === t.id && p.periodo).forEach(p => { linha(UI.periodoDe(p.periodo, dia)).pago = p; });
    return Object.keys(mapa).sort().map(k => {
      const l = mapa[k];
      if (t.pagamento === "mes" && l.temDia) l.bruto += +t.valor || 0;
      return l;
    });
  }

  /* "US$ 70,00 a menos que o bruto" */
  function diferenca(pago, bruto, moeda) {
    const d = Math.round(((+pago.valor || 0) - bruto) * 100) / 100;
    if (!bruto || (pago.moeda || moeda) !== moeda) return "";
    if (!d) return "igual ao bruto";
    return dinheiro(Math.abs(d), moeda) + (d < 0 ? " a menos que o bruto" : " a mais que o bruto");
  }

  function abrir(t, per, bruto, pago, aoSalvar) {
    const moeda = t.moeda || "BRL";
    const nomePer = UI.nomeDoPeriodo(per, UI.diaDoPeriodo(t));
    const hoje = Dados.hoje();
    const dlg = UI.painel({
      titulo: "Quanto a empresa pagou",
      subtitulo: (t.projeto || t.empresa) + " · " + nomePer,
      acaoTexto: "Salvar",
      corpo: `
        <div class="pp-bruto"><span>Pelos dias registrados (bruto)</span><b>${esc(dinheiro(bruto, moeda))}</b></div>
        <div class="u-dupla">
          ${UI.campo({ nome: "valor", rotulo: "Valor que a empresa pagou", tipo: "number", valor: pago ? pago.valor : "", obrigatorio: true,
                       dica: bruto ? String(Math.round(bruto * 100) / 100).replace(".", ",") : "0,00" })}
          ${UI.campo({ nome: "moeda", rotulo: "Moeda", tipo: "escolha", valor: pago ? pago.moeda : moeda,
                       opcoes: Object.keys(Dados.MOEDAS).map(m => ({ valor: m, nome: m + " · " + Dados.MOEDAS[m].nome })) })}
        </div>
        ${UI.campo({ nome: "data", rotulo: "Dia em que o dinheiro caiu", tipo: "date", valor: pago ? pago.data : hoje, obrigatorio: true,
                     ajuda: "O imposto conta no mês em que o dinheiro caiu." })}
        ${UI.campo({ nome: "nota", rotulo: "Observação", valor: pago ? pago.nota : "", dica: "Payoneer, horas que não foram aprovadas" })}
        <div class="pp-dif" id="ppDif"></div>`,
      extra: pago ? `<button type="button" class="u-link u-perigo-txt" data-tirar>Tirar o valor pago</button>` : "",
      acao: async d => {
        const valor = +UI.ler(d, "valor");
        if (!valor) { UI.erroNoPainel(d, "Escreva quanto a empresa pagou."); return false; }
        await Dados.salvar("pagamentos", Object.assign({}, pago || {}, {
          trabalhoId: t.id, periodo: per.de, data: UI.ler(d, "data") || hoje,
          valor, moeda: UI.ler(d, "moeda"), taxa: null, nota: UI.ler(d, "nota"),
        }));
        UI.aviso("Valor pago salvo. A tela do trabalho e o Imposto já usam este valor.");
        if (aoSalvar) await aoSalvar();
      },
    });

    const caixa = dlg.querySelector("#ppDif");
    const conta = () => {
      const v = +UI.ler(dlg, "valor");
      caixa.textContent = v ? diferenca({ valor: v, moeda: UI.ler(dlg, "moeda") }, bruto, moeda) : "";
      caixa.className = "pp-dif" + (v && v < bruto ? " menos" : "");
    };
    dlg.querySelectorAll('[name="valor"], [name="moeda"]').forEach(el => el.addEventListener("input", conta));
    conta();

    const tirar = dlg.querySelector("[data-tirar]");
    if (tirar) tirar.addEventListener("click", async () => {
      await Dados.remover("pagamentos", pago.id);
      try { dlg.close(); } catch (e) {}
      dlg.remove();
      UI.aviso("Valor pago tirado. A conta volta a usar o bruto.");
      if (aoSalvar) await aoSalvar();
    });
    return dlg;
  }

  /* O pedaço do cartão do período, na tela do trabalho. */
  function celula(t, per, bruto, pagamentos) {
    const moeda = t.moeda || "BRL", pago = doPeriodo(pagamentos, t.id, per.de);
    if (!pago) return `<div class="pp-cel">
        <div class="t-num pp-vazio">—</div><div class="t-rot">pago pela empresa</div>
        <button class="t-b pequeno pp-bt" data-pago>Informar valor pago</button></div>`;
    const dif = diferenca(pago, bruto, moeda);
    return `<div class="pp-cel">
        <div class="t-num">${esc(dinheiro(pago.valor, pago.moeda || moeda))}</div><div class="t-rot">pago pela empresa</div>
        <div class="t-menor${+pago.valor < bruto ? " pp-menos" : ""}">${esc(dif || "caiu em " + Dados.dataBonita(pago.data))}</div>
        <button class="pp-link" data-pago>Editar valor pago</button></div>`;
  }

  /* Por hora, na prática: com o valor pago informado, a conta usa o que caiu de verdade. */
  function porHora(t, per, resumo, bruto, pagamentos) {
    const pago = doPeriodo(pagamentos, t.id, per.de), moeda = t.moeda || "BRL";
    if (!pago || !resumo.horas || !bruto || (pago.moeda || moeda) !== moeda) return { valor: resumo.porHoraBRL, pago: false };
    return { valor: (+pago.valor || 0) * (resumo.previstoBRL / bruto) / resumo.horas, pago: true };
  }

  const st = document.createElement("style");
  st.textContent = `
    .pp-bruto { display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:12px 14px; margin:0 0 16px;
      border-radius:12px; background:var(--bg-soft,#F1ECE3); font-size:13.5px; color:var(--ink-2,#54606F); }
    .pp-bruto b { font-size:16px; color:var(--ink,#10203A); }
    .pp-dif { font-size:13px; color:var(--ink-3,#66717F); min-height:18px; }
    .pp-dif.menos, .pp-menos { color:#8E2233; }
    .pp-vazio { color:var(--ink-3,#66717F); }
    .pp-bt { margin-top:8px; }
    .pp-link { font:inherit; font-size:12.5px; font-weight:500; color:var(--signal,#1A4893); background:none; border:0; padding:0; margin-top:6px; cursor:pointer; }
    .pp-link:hover { text-decoration:underline; }
  `;
  document.head.appendChild(st);

  return { doPeriodo, periodos, diferenca, abrir, celula, porHora };
})();
