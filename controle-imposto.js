/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — a tela Imposto

   Pessoa física (carnê-leão) ou MEI. Soma o que
   entrou no mês: o que cada trabalho pagou (o bruto dos dias, enquanto
   a pessoa não informa o valor pago) e as outras rendas que ela
   escreve aqui. Tudo é estimativa.

   Regras de 2026 usadas (conferir com um contador antes de ir ao ar):
   - carnê-leão: dólar de compra do Banco Central no último dia útil da
     primeira quinzena do mês anterior; tabela mensal do IR; até R$ 5 mil
     no mês o imposto zera e até R$ 7.350 ele cai aos poucos;
   - MEI de serviços: guia fixa de R$ 86,05 (5% de R$ 1.621 + R$ 5 de ISS),
     vence no dia 20; limite de R$ 81 mil no ano.
   ══════════════════════════════════════════════════════════════ */
const Imposto = (function () {
  "use strict";

  const GUIA_MEI = 86.05, LIMITE_MEI = 81000;
  const TABELA = [[2428.80, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const TIPOS = {
    exterior: "Do exterior",
    pf: "De pessoa física no Brasil",
    salario: "Salário ou empresa no Brasil",
  };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* O jeito de receber e as outras rendas ficam na configuração, que vai para a conta junto com o resto.
     cfg.imposto = { modo: "pf" | "mei", rendas: [{ id, mes, origem, valor, moeda, tipo }] } */
  const doImposto = cfg => Object.assign({ modo: "pf", rendas: [] }, cfg.imposto || {});
  async function guardar(ctx, mudanca) {
    const cfg = await Dados.obterConfig();
    cfg.imposto = Object.assign(doImposto(cfg), mudanca);
    await Dados.salvarConfig(cfg);
    if (ctx.cfg) ctx.cfg.imposto = cfg.imposto;
  }
  const reais = v => Dados.escreverDinheiro(v, "BRL");
  const nomeMes = ym => { const [a, m] = ym.split("-").map(Number); return MESES[m - 1] + " de " + a; };
  const somarMes = (ym, n) => { const [a, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const dataBr = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);

  function impostoMensal(base) {
    const f = TABELA.find(x => base <= x[0]);
    let ir = Math.max(0, base * f[1] - f[2]);
    let reducao = 0;
    if (base <= 5000) reducao = ir;
    else if (base <= 7350) reducao = Math.min(ir, Math.max(0, 978.62 - 0.133145 * base));
    return { bruto: ir, reducao, final: Math.max(0, ir - reducao), aliquota: f[1] };
  }

  function ultimoDiaUtil(ym) {
    const [a, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(a, m, 0, 12));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  let estado = { mes: null };

  async function montar(alvo, ctx) {
    if (!estado.mes) estado.mes = Dados.hoje().slice(0, 7);
    const imp = doImposto(await Dados.obterConfig()), modo = imp.modo === "mei" ? "mei" : "pf";
    const mes = estado.mes;
    const rendas = imp.rendas || [];
    const nomeTrab = id => { const t = ctx.trabalhos.find(x => x.id === id); return t ? (t.projeto ? t.empresa + " · " + t.projeto : t.empresa) : "Trabalho"; };

    // sempre do banco, para pegar o valor pago que acabou de ser editado aqui ou na tela do trabalho
    [ctx.pagamentos, ctx.registros] = await Promise.all([Dados.listar("pagamentos"), Dados.listar("registros")]);

    /* O que entrou no mês. Em cada período de cada trabalho vale o valor que a
       empresa pagou, no mês em que o dinheiro caiu; enquanto a pessoa não informa,
       vale o bruto dos dias registrados, no mês em que o período fecha. */
    const hoje = Dados.hoje();
    const entradasDoMes = m => {
      const lista = [];
      ctx.trabalhos.forEach(t => Pago.periodos(t, ctx.registros, ctx.pagamentos).forEach(p => {
        const base = { origem: nomeTrab(t.id), tipo: "exterior", trab: t, per: p.per, bruto: p.bruto };
        if (p.pago && p.pago.data.slice(0, 7) === m)
          lista.push(Object.assign(base, { valor: +p.pago.valor || 0, moeda: p.pago.moeda || t.moeda || "BRL", data: p.pago.data, taxa: p.pago.taxa, pago: p.pago }));
        else if (!p.pago && p.bruto && p.per.ate.slice(0, 7) === m)
          lista.push(Object.assign(base, { valor: p.bruto, moeda: t.moeda || "BRL", data: p.per.ate < hoje ? p.per.ate : hoje, estimado: true }));
      }));
      // pagamentos de antes, registrados sem período
      ctx.pagamentos.filter(p => !p.periodo && (p.data || "").slice(0, 7) === m).forEach(p =>
        lista.push({ origem: nomeTrab(p.trabalhoId), tipo: "exterior", valor: +p.valor || 0, moeda: p.moeda || "BRL", data: p.data, taxa: p.taxa, antigo: true }));
      return lista.concat(rendas.filter(r => r.mes === m).map(r => ({ origem: r.origem, tipo: r.tipo, valor: +r.valor || 0, moeda: r.moeda, data: m + "-15", id: r.id })));
    };

    alvo.innerHTML = `
      <div class="ct-cab-tela">
        <div><h1>Imposto</h1><p>Uma estimativa para você saber quanto separar. Quem fecha a conta é o contador.</p></div>
      </div>
      <div class="ct-filtros">
        <span class="ct-col-rot" style="margin:0 4px 0 6px;">Como você recebe</span>
        ${[["pf", "Pessoa física (carnê-leão)"], ["mei", "MEI"]].map(([k, n]) =>
          `<button class="ct-chip" data-modo="${k}" aria-pressed="${modo === k}">${n}</button>`).join("")}
      </div>
      <div class="ip-mes">
        <button class="ct-b pequeno" data-mes="-1" aria-label="Mês anterior">‹</button>
        <b>${esc(nomeMes(mes).replace(/^./, c => c.toUpperCase()))}</b>
        <button class="ct-b pequeno" data-mes="1" aria-label="Próximo mês">›</button>
      </div>
      <div id="ipCorpo"><div class="ct-cartao"><p class="ip-leve">Buscando a cotação do Banco Central…</p></div></div>`;

    alvo.querySelectorAll("[data-modo]").forEach(b => b.addEventListener("click", async () => { await guardar(ctx, { modo: b.dataset.modo }); montar(alvo, ctx); }));
    alvo.querySelectorAll("[data-mes]").forEach(b => b.addEventListener("click", () => { estado.mes = somarMes(estado.mes, +b.dataset.mes); montar(alvo, ctx); }));

    const entradas = entradasDoMes(mes);
    const corpo = alvo.querySelector("#ipCorpo");

    // lista do que entrou, igual nos três modos
    async function listaEntradas(conv) {
      const linhas = await Promise.all(entradas.map(async (e, i) => {
        const r = await conv(e);
        let sub = esc(TIPOS[e.tipo] || "") + (e.antigo ? " · pagamento de " + dataBr(e.data) : " · escrita por você");
        if (e.trab) {
          const nomePer = UI.nomeDoPeriodo(e.per, UI.diaDoPeriodo(e.trab)).toLowerCase();
          const dif = e.pago ? Pago.diferenca(e.pago, e.bruto, e.trab.moeda || "BRL") : "";
          sub = e.pago
            ? `${esc(nomePer)} · caiu em ${esc(dataBr(e.data))}${dif && dif !== "igual ao bruto" ? ` · <i class="${+e.pago.valor < e.bruto ? "ip-menos" : "ip-mais"}">${esc(dif)}</i>` : ""}`
            : `${esc(nomePer)} · <i class="ip-est">estimado pelos dias registrados</i>`;
          sub += `<button class="ip-pago" data-pago="${i}">${e.pago ? "Editar valor pago" : "Informar quanto a empresa pagou"}</button>`;
        }
        return `<div class="ip-linha${e.estimado ? " estimado" : ""}">
          <div class="ip-linha-txt"><b>${esc(e.origem)}</b><span>${sub}</span></div>
          <div class="ip-linha-val"><b>${esc(Dados.escreverDinheiro(e.valor, e.moeda))}</b>${e.moeda !== "BRL" && r != null ? `<span>${esc(reais(r))}</span>` : ""}</div>
          ${e.id ? `<button class="ip-tirar" data-tirar="${esc(e.id)}" aria-label="Tirar esta renda">✕</button>` : `<span class="ip-tirar-vazio"></span>`}
        </div>`;
      }));
      const estimados = entradas.filter(e => e.estimado).length;
      return `<div class="ct-cartao ct-larga">
        <div class="ct-cab-cartao"><h2>De onde entrou o dinheiro</h2><p>o que cada trabalho pagou e as outras rendas que você escrever</p></div>
        ${estimados ? `<p class="ip-aviso-est">${estimados === 1 ? "Um valor está" : estimados + " valores estão"} pelo bruto dos dias registrados. Quando o dinheiro cair, informe quanto a empresa pagou: a conta fica certa e o trabalho é atualizado junto.</p>` : ""}
        ${linhas.length ? linhas.join("") : `<p class="ip-leve">Nada entrou neste mês ainda.</p>`}
        <button class="ct-b pequeno" data-nova-renda style="margin-top:14px">+ Adicionar outra renda</button>
      </div>`;
    }

    function ligarLista() {
      corpo.querySelectorAll("[data-pago]").forEach(b => b.addEventListener("click", () => {
        const e = entradas[+b.dataset.pago];
        Pago.abrir(e.trab, e.per, e.bruto, e.pago || null, () => montar(alvo, ctx));
      }));
      corpo.querySelectorAll("[data-tirar]").forEach(b => b.addEventListener("click", async () => {
        await guardar(ctx, { rendas: rendas.filter(r => r.id !== b.dataset.tirar) });
        montar(alvo, ctx);
      }));
      corpo.querySelector("[data-nova-renda]").addEventListener("click", () => novaRenda(alvo, ctx, mes));
    }

    if (modo === "pf") {
      const cot = { USD: await Ptax.daReceita("USD", mes), EUR: await Ptax.daReceita("EUR", mes) };
      const conv = async e => e.moeda === "BRL" ? e.valor : (cot[e.moeda] ? e.valor * cot[e.moeda].compra : null);
      let base = 0, foraDaConta = 0;
      for (const e of entradas) {
        const r = await conv(e) || 0;
        if (e.tipo === "salario") foraDaConta += r; else base += r;
      }
      const ir = impostoMensal(base);
      const prazo = ultimoDiaUtil(somarMes(mes, 1));
      corpo.innerHTML = `
        <div class="ct-grade" style="margin-top:0">
          <div class="ct-cartao">
            <div class="ct-cab-cartao"><h2>Imposto estimado</h2><p>carnê-leão de ${esc(nomeMes(mes))}</p></div>
            <div class="ct-heroi-num">${esc(reais(ir.final))}</div>
            <p class="ip-txt">${ir.final === 0
              ? (base <= 5000 ? "Até R$ 5 mil no mês não há imposto a pagar, pela regra que vale desde janeiro de 2026."
                              : "Com a redução de 2026, o imposto deste mês fica em zero.")
              : `Separe esse valor. O DARF vence em <b>${esc(Dados.dataBonita(prazo))}</b>, último dia útil do mês seguinte.`}</p>
            <p class="ip-txt ip-leve">Mesmo dando zero, lance o mês no Carnê-Leão Web, da Receita: a declaração do ano puxa esses valores.</p>
          </div>
          <div class="ct-cartao">
            <div class="ct-cab-cartao"><h2>Como a conta foi feita</h2></div>
            <table class="ip-tab">
              ${cot.USD ? `<tr><td>Dólar que a Receita manda usar<small>compra do Banco Central em ${esc(dataBr(cot.USD.dia))}</small></td><td>${esc(reais(cot.USD.compra))}</td></tr>` : ""}
              ${cot.EUR ? `<tr><td>Euro, no mesmo dia</td><td>${esc(reais(cot.EUR.compra))}</td></tr>` : ""}
              <tr><td>Total do mês em reais</td><td><b>${esc(reais(base))}</b></td></tr>
              ${ir.bruto ? `<tr><td>Pela tabela (${String(ir.aliquota * 100).replace(".", ",")}%)</td><td>${esc(reais(ir.bruto))}</td></tr>` : ""}
              ${ir.reducao && ir.bruto ? `<tr><td>Redução de 2026</td><td>− ${esc(reais(ir.reducao))}</td></tr>` : ""}
              <tr><td>Imposto estimado</td><td><b>${esc(reais(ir.final))}</b></td></tr>
            </table>
            <p class="ip-txt ip-leve">Sem deduções como INSS e dependentes. ${foraDaConta ? `Salário no Brasil (${esc(reais(foraDaConta))}) já desconta na fonte e fica para a declaração do ano.` : ""}</p>
          </div>
          ${await listaEntradas(conv)}
        </div>`;
      ligarLista();
      return;
    }

    // MEI: cada entrada vale pela cotação do dia em que caiu
    const convDia = async e => {
      if (e.moeda === "BRL") return e.valor;
      if (e.taxa) return e.valor * e.taxa;
      const f = await Ptax.fechamento(e.moeda, e.data);
      return f ? e.valor * f.compra : null;
    };
    let receitaMes = 0;
    for (const e of entradas) if (e.tipo !== "salario") receitaMes += await convDia(e) || 0;

    if (modo === "mei") {
      const ano = mes.slice(0, 4);
      let doAno = 0, primeiro = 0;
      for (let m = 1; m <= +mes.slice(5, 7); m++) {
        for (const e of entradasDoMes(ano + "-" + String(m).padStart(2, "0"))) {
          if (e.tipo === "salario") continue;
          doAno += await convDia(e) || 0;
          if (!primeiro) primeiro = m;
        }
      }
      // o ritmo conta a partir do primeiro mês com dinheiro entrando, e não de janeiro
      const mesesPassados = Math.max(1, +mes.slice(5, 7) - (primeiro || 1) + 1);
      const ritmo = doAno / mesesPassados * 12;
      const pct = Math.min(100, doAno / LIMITE_MEI * 100);
      corpo.innerHTML = `
        <div class="ct-grade" style="margin-top:0">
          <div class="ct-cartao">
            <div class="ct-cab-cartao"><h2>Guia do MEI (DAS)</h2><p>de ${esc(nomeMes(mes))}</p></div>
            <div class="ct-heroi-num">${esc(reais(GUIA_MEI))}</div>
            <p class="ip-txt">Valor fixo, vence no dia 20 do mês seguinte. O MEI paga o mesmo valor todo mês, ganhe muito ou pouco, e não tem carnê-leão.</p>
            <p class="ip-txt ip-leve">Entrou em ${esc(nomeMes(mes))}: <b>${esc(reais(receitaMes))}</b>, pela cotação do dia em que cada valor caiu.</p>
          </div>
          <div class="ct-cartao">
            <div class="ct-cab-cartao"><h2>Limite do ano</h2><p>${esc(ano)}, até ${esc(nomeMes(mes))}</p></div>
            <div class="ip-lim"><b>${esc(reais(doAno))}</b> <span>de ${esc(reais(LIMITE_MEI))}</span></div>
            <div class="ip-barra"><i style="width:${pct.toFixed(1)}%;${pct > 80 ? "background:#A85D24" : ""}"></i></div>
            <p class="ip-txt">${ritmo > LIMITE_MEI
              ? `No ritmo de agora, você fecha o ano perto de <b>${esc(reais(ritmo))}</b>, acima do limite. Converse com um contador antes de passar dele.`
              : `No ritmo de agora, você fecha o ano perto de <b>${esc(reais(ritmo))}</b>, dentro do limite.`}</p>
            <p class="ip-txt ip-leve">O que vem de fora conta no limite. Nem toda atividade pode ser MEI: confira com um contador.</p>
          </div>
          ${await listaEntradas(convDia)}
        </div>`;
      ligarLista();
      return;
    }

  }

  function novaRenda(alvo, ctx, mes) {
    UI.painel({
      titulo: "Outra renda",
      subtitulo: "entra na conta de " + nomeMes(mes),
      acaoTexto: "Adicionar",
      corpo: `
        ${UI.campo({ nome: "origem", rotulo: "De onde veio", valor: "", obrigatorio: true, dica: "Tradução para um cliente de fora" })}
        <div class="u-dupla">
          ${UI.campo({ nome: "valor", rotulo: "Valor", tipo: "number", valor: "", obrigatorio: true, dica: "0,00" })}
          ${UI.campo({ nome: "moeda", rotulo: "Moeda", tipo: "escolha", valor: "BRL",
                       opcoes: [{ valor: "BRL", nome: "BRL · Real" }, { valor: "USD", nome: "USD · Dólar" }, { valor: "EUR", nome: "EUR · Euro" }] })}
        </div>
        ${UI.campo({ nome: "tipo", rotulo: "Quem pagou", tipo: "escolha", valor: "exterior",
                     opcoes: Object.keys(TIPOS).map(k => ({ valor: k, nome: TIPOS[k] })),
                     ajuda: "Do exterior e de pessoa física entram no carnê-leão. Salário e pagamento de empresa no Brasil já descontam na fonte." })}`,
      acao: async d => {
        const origem = UI.ler(d, "origem"), valor = +UI.ler(d, "valor");
        if (!origem || !valor) { UI.erroNoPainel(d, "Escreva de onde veio e o valor."); return false; }
        const lista = (doImposto(await Dados.obterConfig()).rendas || []).slice();
        lista.push({ id: "r" + Date.now(), mes, origem, valor, moeda: UI.ler(d, "moeda"), tipo: UI.ler(d, "tipo") });
        await guardar(ctx, { rendas: lista });
        UI.aviso("Renda adicionada.");
        await montar(alvo, ctx);
      },
    });
  }

  // estilo da tela
  const st = document.createElement("style");
  st.textContent = `
    .ip-mes { display:flex; align-items:center; gap:12px; margin:0 0 16px 4px; }
    .ip-mes b { font-size:16px; min-width:170px; text-align:center; }
    .ip-txt { font-size:14px; color:var(--ink-2,#54606F); line-height:1.6; margin:12px 0 0; }
    .ip-leve { color:var(--ink-3,#66717F); font-size:13px; }
    .ip-tab { width:100%; border-collapse:collapse; font-size:14px; }
    .ip-tab td { padding:10px 0; border-bottom:1px solid var(--line-soft,#EAE4D9); color:var(--ink-2,#54606F); }
    .ip-tab td:last-child { text-align:right; color:var(--ink,#10203A); white-space:nowrap; }
    .ip-tab small { display:block; font-size:12px; color:var(--ink-3,#66717F); }
    .ip-linha { display:flex; align-items:center; gap:14px; padding:12px 0; border-top:1px solid var(--line-soft,#EAE4D9); }
    .ip-linha-txt { flex:1; min-width:0; }
    .ip-linha-txt b, .ip-linha-val b { display:block; font-size:14px; color:var(--ink,#10203A); font-weight:600; }
    .ip-linha-txt span, .ip-linha-val span { display:block; font-size:12.5px; color:var(--ink-3,#66717F); }
    .ip-linha-val { text-align:right; }
    .ip-tirar { border:0; background:none; color:var(--ink-3,#66717F); cursor:pointer; font-size:14px; width:28px; height:28px; border-radius:8px; }
    .ip-tirar:hover { background:var(--bg-soft,#F1ECE3); color:#8E2233; }
    .ip-tirar-vazio { width:28px; }
    .ip-linha.estimado .ip-linha-val b { color:var(--ink-3,#66717F); font-weight:500; }
    .ip-est { font-style:normal; color:#A85D24; } .ip-menos { font-style:normal; color:#8E2233; } .ip-mais { font-style:normal; }
    .ip-pago { display:block; font:inherit; font-size:12.5px; font-weight:600; color:var(--signal,#1A4893); background:none; border:0; padding:0; margin-top:5px; cursor:pointer; }
    .ip-pago:hover { text-decoration:underline; }
    .ip-aviso-est { font-size:13px; line-height:1.55; color:#7A4318; background:#FBF0E4; border:1px solid #F0DCC6; border-radius:12px; padding:10px 14px; margin:0 0 6px; }
    .ip-lim b { font-size:28px; font-weight:600; color:var(--ink,#10203A); } .ip-lim span { color:var(--ink-3,#66717F); }
    .ip-barra { height:12px; border-radius:99px; background:var(--bg-soft,#F1ECE3); overflow:hidden; margin:12px 0 4px; }
    .ip-barra i { display:block; height:100%; background:var(--signal,#1A4893); border-radius:99px; }
  `;
  document.head.appendChild(st);

  return { montar };
})();
