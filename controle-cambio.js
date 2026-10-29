/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — cotação do Banco Central do Brasil (PTAX)

   A consulta aberta do Banco Central aceita pedidos do site. Aqui ela
   serve a tela Hoje (câmbio do dia) e a tela Imposto (o dólar que a
   Receita manda usar). Cada pedido fica guardado na memória da página.
   ══════════════════════════════════════════════════════════════ */
const Ptax = (function () {
  "use strict";

  const BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/";
  const cache = {};

  function mdY(iso) { const [a, m, d] = iso.split("-"); return `${m}-${d}-${a}`; }
  function somar(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  /* Boletins de uma moeda entre duas datas, do mais antigo para o mais novo. */
  async function boletins(moeda, de, ate) {
    const chave = moeda + de + ate;
    if (!cache[chave]) {
      const url = BASE + "CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
        `?@moeda='${moeda}'&@dataInicial='${mdY(de)}'&@dataFinalCotacao='${mdY(ate)}'&$format=json&$select=cotacaoCompra,dataHoraCotacao,tipoBoletim`;
      cache[chave] = fetch(url).then(r => r.json()).then(j => (j.value || []).map(b => ({
        compra: b.cotacaoCompra, quando: b.dataHoraCotacao, dia: b.dataHoraCotacao.slice(0, 10), tipo: b.tipoBoletim,
      })));
    }
    return cache[chave];
  }

  /* A cotação de fechamento do dia ou, se o dia não teve pregão, a do último dia útil antes dele. */
  async function fechamento(moeda, iso) {
    const lista = (await boletins(moeda, somar(iso, -10), iso)).filter(b => b.tipo.indexOf("Fechamento") === 0);
    return lista.length ? lista[lista.length - 1] : null;
  }

  /* Agora: o boletim mais recente (de hoje, se já saiu algum) e o fechamento do último dia útil anterior. */
  async function agora(moeda, hojeIso) {
    const lista = await boletins(moeda, somar(hojeIso, -10), hojeIso);
    if (!lista.length) return null;
    const ultimo = lista[lista.length - 1];
    const antes = lista.filter(b => b.tipo.indexOf("Fechamento") === 0 && b.dia < ultimo.dia);
    const anterior = antes.length ? antes[antes.length - 1] : null;
    return { atual: ultimo, anterior, variacao: anterior ? (ultimo.compra / anterior.compra - 1) : null };
  }

  /* O dólar que a Receita manda usar no carnê-leão: compra do último dia útil
     da primeira quinzena do mês anterior ao do recebimento. */
  async function daReceita(moeda, mesIso) {
    const [a, m] = mesIso.split("-").map(Number);
    const ant = new Date(Date.UTC(a, m - 2, 15, 12)).toISOString().slice(0, 10);
    return fechamento(moeda, ant);
  }

  function nomeDia(iso) {
    const d = new Date(iso + "T12:00:00Z");
    return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getUTCDay()];
  }

  return { boletins, fechamento, agora, daReceita, nomeDia, somar };
})();
