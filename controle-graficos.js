/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — gráficos

   Tudo desenhado em SVG na mão. O site inteiro não tem uma
   biblioteca externa e não vai ganhar uma agora.

   Cada gráfico desenha três coisas juntas:
     1. o desenho
     2. a legenda, sempre que houver duas séries ou mais
     3. uma tabela com os mesmos números, dentro de um "Ver os números"

   A tabela não é enfeite de acessibilidade: é o que garante que
   ninguém dependa só da cor para ler o gráfico.
   ══════════════════════════════════════════════════════════════ */

const Graficos = (function () {
  "use strict";

  /* ── Paleta categórica ────────────────────────────────────────
     Seis cores em ordem fixa, nunca sorteadas e nunca recicladas.
     Foram conferidas por script contra fundo branco: faixa de
     luminosidade, saturação mínima, separação para daltonismo
     (deutan, protan, tritan) e contraste. As seis passam limpo.

     Da sétima em diante a separação para daltonismo cai um pouco,
     e por isso todo gráfico daqui traz legenda e tabela: a cor
     nunca é o único caminho para saber quem é quem.
     ─────────────────────────────────────────────────────────── */
  const CORES = [
    "#2C6BB5", // azul
    "#C1701F", // âmbar
    "#5B4B9E", // violeta
    "#2AA198", // verde-água
    "#C4384A", // vermelho
    "#7B9E3F", // oliva
    "#B0577F", // rosa
    "#0F7D9E", // azul-petróleo
  ];

  /* Rampa sequencial: uma cor só, do claro ao escuro.
     Usada no calendário, onde a cor significa quantidade. */
  const RAMPA = ["#EFEAE1", "#D3E2F1", "#A9C6E5", "#7AA5D4", "#4A7BBE", "#1A4893"];

  const TINTA    = "#54606F";   // texto de apoio
  const TINTA_3  = "#8A94A1";   // rótulos de eixo
  const GRADE    = "#EAE4D9";   // linha de grade, um passo fora do fundo
  const SUPERF   = "#FFFFFF";   // fundo do cartão, usado nos vãos e anéis

  function corDe(i) { return CORES[i % CORES.length]; }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ══════════════════════════════════════════════════════════
     PEÇAS COMPARTILHADAS
     ══════════════════════════════════════════════════════════ */

  /* Barra com o topo arredondado em 4px e a base reta, presa na linha zero. */
  function caminhoBarra(x, y, larg, alt, raio) {
    if (alt <= 0.5) return "";
    const r = Math.max(0, Math.min(raio, larg / 2, alt));
    return `M${x},${y + alt} L${x},${y + r} Q${x},${y} ${x + r},${y} ` +
           `L${x + larg - r},${y} Q${x + larg},${y} ${x + larg},${y + r} L${x + larg},${y + alt} Z`;
  }

  /* Escolhe marcas de eixo em números redondos. */
  function escala(maximo, quantas) {
    if (!maximo || maximo <= 0) return { topo: 1, marcas: [0, 1] };
    const bruto = maximo / (quantas || 4);
    const ordem = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map(p => p * ordem).find(p => p >= bruto) || ordem * 10;
    const topo = Math.ceil(maximo / passo) * passo;
    const marcas = [];
    for (let v = 0; v <= topo + 1e-9; v += passo) marcas.push(+v.toFixed(10));
    return { topo, marcas };
  }

  function numeroCurto(v) {
    const n = Math.abs(v);
    if (n >= 1000000) return (v / 1000000).toFixed(1).replace(".0", "") + "M";
    if (n >= 1000)    return (v / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "") + "k";
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1).replace(".", ",");
  }

  /* A caixinha que segue o mouse. Uma por página, reaproveitada. */
  let dica = null;
  function caixaDica() {
    if (dica && document.body.contains(dica)) return dica;
    dica = document.createElement("div");
    dica.className = "g-dica";
    dica.setAttribute("role", "status");
    dica.hidden = true;
    document.body.appendChild(dica);
    return dica;
  }
  function mostrarDica(html, ev) {
    const d = caixaDica();
    d.innerHTML = html;
    d.hidden = false;
    const larg = d.offsetWidth, alt = d.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY - alt - 12;
    if (x + larg > window.innerWidth - 8) x = ev.clientX - larg - 14;
    if (y < 8) y = ev.clientY + 18;
    d.style.left = x + "px";
    d.style.top  = y + "px";
  }
  function esconderDica() { if (dica) dica.hidden = true; }

  /* Legenda em HTML, com bolinha da cor ao lado do nome.
     O texto nunca recebe a cor da série: quem carrega a identidade é a bolinha. */
  function legenda(series, meta) {
    const varias = series && series.length >= 2;
    if (!varias && !meta) return "";
    const itens = (varias ? series : []).map(s =>
      `<span class="g-item"><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`);
    if (meta) itens.push(
      `<span class="g-item"><i class="g-tracinho"></i>${esc(meta.rotulo)}${meta.valor ? " · " + esc(meta.valor) : ""}</span>`);
    return `<div class="g-legenda">` + itens.join("") + `</div>`;
  }

  /* Os mesmos números em tabela, para quem não enxerga o desenho
     e para quem quer conferir o valor exato. */
  function tabela(categorias, series, formatar) {
    const f = formatar || (v => numeroCurto(v));
    const cab = `<tr><th scope="col">Período</th>${series.map(s => `<th scope="col">${esc(s.nome)}</th>`).join("")}</tr>`;
    const linhas = categorias.map((c, i) =>
      `<tr><th scope="row">${esc(c)}</th>${series.map(s => `<td>${esc(f(s.valores[i] || 0))}</td>`).join("")}</tr>`).join("");
    return `<details class="g-tabela"><summary>Ver os números</summary>
      <div class="g-rolagem"><table><thead>${cab}</thead><tbody>${linhas}</tbody></table></div></details>`;
  }

  /* Todo gráfico redesenha quando o cartão muda de largura. */
  function aoRedimensionar(el, desenhar) {
    let largura = 0, pendente = null;
    function tentar() {
      const l = el.clientWidth;
      if (!l || Math.abs(l - largura) < 8) return;
      largura = l;
      desenhar(l);
    }
    tentar();
    if (window.ResizeObserver) {
      const obs = new ResizeObserver(() => {
        clearTimeout(pendente);
        pendente = setTimeout(tentar, 80);
      });
      obs.observe(el);
    } else {
      window.addEventListener("resize", () => { clearTimeout(pendente); pendente = setTimeout(tentar, 120); });
    }
    // Fontes chegam depois e mudam a medida do texto.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { largura = 0; tentar(); });
  }

  function vazio(el, texto) {
    el.innerHTML = `<div class="g-vazio">${esc(texto || "Ainda sem dados para desenhar.")}</div>`;
  }

  /* ══════════════════════════════════════════════════════════
     COLUNAS
     Serve para ganhos por mês (empilhado por empresa) e para
     horas por dia da semana (uma série só).
     ══════════════════════════════════════════════════════════ */

  function colunas(el, op) {
    const categorias = op.categorias || [];
    const series = (op.series || []).map((s, i) => Object.assign({ cor: corDe(i) }, s));
    const f = op.formatar || numeroCurto;
    const fEixo = op.formatarEixo || numeroCurto;
    const empilhado = !!op.empilhado;

    const temAlgo = series.some(s => (s.valores || []).some(v => v));
    if (!categorias.length || !temAlgo) { vazio(el, op.vazio); return; }

    aoRedimensionar(el, (larg) => {
      const alt = op.altura || 240;
      // mT sobra para o valor escrito no topo da coluna mais alta caber inteiro
      const mE = 48, mD = 12, mT = 22, mB = 30;   // margens
      const areaL = Math.max(60, larg - mE - mD);
      const areaA = alt - mT - mB;

      const totais = categorias.map((_, i) =>
        empilhado ? series.reduce((s, se) => s + (se.valores[i] || 0), 0)
                  : Math.max(...series.map(se => se.valores[i] || 0)));
      const { topo, marcas } = escala(Math.max(...totais), 4);

      const passo = areaL / categorias.length;
      const grupo = Math.min(passo * 0.62, 24 * (empilhado ? 1 : series.length));
      const larguraBarra = Math.min(24, empilhado ? grupo : grupo / series.length);
      const y = v => mT + areaA - (v / topo) * areaA;

      let svg = "";

      // grade e marcas do eixo
      marcas.forEach(m => {
        svg += `<line x1="${mE}" y1="${y(m).toFixed(1)}" x2="${(mE + areaL).toFixed(1)}" y2="${y(m).toFixed(1)}" stroke="${GRADE}" stroke-width="1"/>`;
        svg += `<text x="${mE - 8}" y="${(y(m) + 4).toFixed(1)}" text-anchor="end" class="g-tick">${esc(fEixo(m))}</text>`;
      });

      // Linha de meta. O nome dela vai na LEGENDA, não dentro do desenho:
      // escrito dentro, ele encosta no valor da coluna mais alta de um lado
      // ou por cima de uma coluna do outro, e a caixa branca atrás do texto
      // ainda abria um buraco na barra. Fora do desenho, nunca colide.
      const temMeta = op.meta && op.meta > 0 && op.meta <= topo;
      if (temMeta) {
        const yM = y(op.meta);
        svg += `<line x1="${mE}" y1="${yM.toFixed(1)}" x2="${(mE + areaL).toFixed(1)}" y2="${yM.toFixed(1)}"
                 stroke="${TINTA_3}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
      }

      categorias.forEach((cat, i) => {
        const centro = mE + passo * i + passo / 2;

        if (empilhado) {
          let base = 0;
          series.forEach(s => {
            const v = s.valores[i] || 0;
            if (!v) return;
            const yTopo = y(base + v), yBase = y(base);
            // 2px de vão na cor do fundo separam um pedaço do outro
            const altura = Math.max(0, yBase - yTopo - (base > 0 ? 2 : 0));
            const x = centro - larguraBarra / 2;
            const arredondar = Math.abs(base + v - totais[i]) < 1e-9 ? 4 : 0;
            svg += `<path d="${caminhoBarra(x, yTopo, larguraBarra, altura, arredondar)}" fill="${s.cor}"
                     class="g-marca" data-cat="${i}" data-serie="${esc(s.nome)}" data-valor="${v}"/>`;
            base += v;
          });
        } else {
          const total = larguraBarra * series.length + 2 * (series.length - 1);
          series.forEach((s, j) => {
            const v = s.valores[i] || 0;
            if (!v) return;
            const x = centro - total / 2 + j * (larguraBarra + 2);
            const yT = y(v);
            svg += `<path d="${caminhoBarra(x, yT, larguraBarra, mT + areaA - yT, 4)}" fill="${s.cor}"
                     class="g-marca" data-cat="${i}" data-serie="${esc(s.nome)}" data-valor="${v}"/>`;
          });
        }

        // Rótulo do eixo de baixo, pulando alguns quando não cabe.
        // 38px é a largura de um "06/08" com folga: abaixo disso os rótulos
        // encostam um no outro e viram uma tira ilegível.
        const cadaQuantos = passo < 38 ? Math.ceil(38 / passo) : 1;
        if (i % cadaQuantos === 0) {
          svg += `<text x="${centro.toFixed(1)}" y="${alt - 10}" text-anchor="middle" class="g-tick">${esc(cat)}</text>`;
        }
      });

      // valor escrito só no topo da coluna mais alta, nunca em todas
      if (op.rotularMaior !== false) {
        const iMaior = totais.indexOf(Math.max(...totais));
        if (iMaior >= 0 && totais[iMaior] > 0) {
          const centro = mE + passo * iMaior + passo / 2;
          svg += `<text x="${centro.toFixed(1)}" y="${(y(totais[iMaior]) - 7).toFixed(1)}" text-anchor="middle" class="g-valor">${esc(f(totais[iMaior]))}</text>`;
        }
      }

      el.innerHTML =
        `<div class="g-tela"><svg viewBox="0 0 ${larg} ${alt}" width="${larg}" height="${alt}" role="img"
           aria-label="${esc(op.titulo || "Gráfico de colunas")}">${svg}</svg></div>` +
        legenda(series, temMeta ? { rotulo: op.metaRotulo || "meta", valor: f(op.meta) } : null) +
        tabela(categorias, series, f);

      ligarDicas(el, categorias, f, op.sufixoDica);
    });
  }

  /* ══════════════════════════════════════════════════════════
     LINHAS
     Usado no previsto contra recebido.
     ══════════════════════════════════════════════════════════ */

  function linhas(el, op) {
    const categorias = op.categorias || [];
    const series = (op.series || []).map((s, i) => Object.assign({ cor: corDe(i) }, s));
    const f = op.formatar || numeroCurto;
    const fEixo = op.formatarEixo || numeroCurto;

    const temAlgo = series.some(s => (s.valores || []).some(v => v));
    if (categorias.length < 2 || !temAlgo) { vazio(el, op.vazio); return; }

    aoRedimensionar(el, (larg) => {
      const alt = op.altura || 240;
      const mE = 52, mD = 16, mT = 16, mB = 30;
      const areaL = Math.max(60, larg - mE - mD);
      const areaA = alt - mT - mB;

      const maximo = Math.max(...series.flatMap(s => s.valores.map(v => v || 0)));
      const { topo, marcas } = escala(maximo, 4);
      const x = i => mE + (categorias.length === 1 ? areaL / 2 : (areaL * i) / (categorias.length - 1));
      const y = v => mT + areaA - (v / topo) * areaA;

      let svg = "";
      marcas.forEach(m => {
        svg += `<line x1="${mE}" y1="${y(m).toFixed(1)}" x2="${(mE + areaL).toFixed(1)}" y2="${y(m).toFixed(1)}" stroke="${GRADE}" stroke-width="1"/>`;
        svg += `<text x="${mE - 8}" y="${(y(m) + 4).toFixed(1)}" text-anchor="end" class="g-tick">${esc(fEixo(m))}</text>`;
      });

      series.forEach(s => {
        const pontos = s.valores.map((v, i) => `${x(i).toFixed(1)},${y(v || 0).toFixed(1)}`).join(" ");
        svg += `<polyline points="${pontos}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        // ponto do fim com anel na cor do fundo, para não sumir onde as linhas se cruzam
        const iFim = s.valores.length - 1;
        svg += `<circle cx="${x(iFim).toFixed(1)}" cy="${y(s.valores[iFim] || 0).toFixed(1)}" r="4.5" fill="${s.cor}" stroke="${SUPERF}" stroke-width="2"/>`;
      });

      // faixas invisíveis de captura, uma por período, bem maiores que o ponto
      categorias.forEach((cat, i) => {
        const meia = areaL / Math.max(1, categorias.length - 1) / 2;
        svg += `<rect x="${(x(i) - meia).toFixed(1)}" y="${mT}" width="${(meia * 2).toFixed(1)}" height="${areaA}"
                 fill="transparent" class="g-marca" data-cat="${i}" data-todas="1"/>`;
        const cadaQuantos = (areaL / categorias.length) < 34 ? Math.ceil(34 / (areaL / categorias.length)) : 1;
        if (i % cadaQuantos === 0) {
          svg += `<text x="${x(i).toFixed(1)}" y="${alt - 10}" text-anchor="middle" class="g-tick">${esc(cat)}</text>`;
        }
      });

      el.innerHTML =
        `<div class="g-tela"><svg viewBox="0 0 ${larg} ${alt}" width="${larg}" height="${alt}" role="img"
           aria-label="${esc(op.titulo || "Gráfico de linhas")}">${svg}</svg></div>` +
        legenda(series) + tabela(categorias, series, f);

      ligarDicas(el, categorias, f, op.sufixoDica, series);
    });
  }

  /* ══════════════════════════════════════════════════════════
     ROSCA
     Divisão por empresa. Vira lista quando são muitas fatias.
     ══════════════════════════════════════════════════════════ */

  function rosca(el, op) {
    const fatias = (op.fatias || []).filter(f => f.valor > 0).map((f, i) => Object.assign({ cor: corDe(i) }, f));
    const f = op.formatar || numeroCurto;
    if (!fatias.length) { vazio(el, op.vazio); return; }

    aoRedimensionar(el, (larg) => {
      const lado = Math.min(larg, 210);
      const raio = lado / 2 - 6, furo = raio * 0.6, cx = lado / 2, cy = lado / 2;
      const total = fatias.reduce((s, x) => s + x.valor, 0);

      let angulo = -Math.PI / 2, svg = "";
      fatias.forEach(fa => {
        const parte = fa.valor / total;
        // 2px de vão entre as fatias, no fundo do cartão
        const vao = fatias.length > 1 ? 0.018 : 0;
        const a1 = angulo + vao / 2, a2 = angulo + parte * 2 * Math.PI - vao / 2;
        angulo += parte * 2 * Math.PI;
        if (a2 <= a1) return;
        const grande = (a2 - a1) > Math.PI ? 1 : 0;
        const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
        svg += `<path d="M${p(raio, a1)} A${raio},${raio} 0 ${grande} 1 ${p(raio, a2)}
                 L${p(furo, a2)} A${furo},${furo} 0 ${grande} 0 ${p(furo, a1)} Z"
                 fill="${fa.cor}" class="g-marca" data-nome="${esc(fa.nome)}" data-valor="${fa.valor}"
                 data-parte="${Math.round(parte * 100)}"/>`;
      });

      // número no miolo, que é a leitura principal
      svg += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="g-centro">${esc(f(total))}</text>`;
      svg += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" class="g-tick">${esc(op.rotuloCentro || "no período")}</text>`;

      const lista = fatias.map(fa =>
        `<li><i style="background:${fa.cor}"></i><span class="g-nome">${esc(fa.nome)}</span>
         <span class="g-num num">${esc(f(fa.valor))}</span>
         <span class="g-pct num">${Math.round((fa.valor / total) * 100)}%</span></li>`).join("");

      el.innerHTML =
        `<div class="g-rosca">
           <div class="g-tela"><svg viewBox="0 0 ${lado} ${lado}" width="${lado}" height="${lado}" role="img"
             aria-label="${esc(op.titulo || "Divisão por trabalho")}">${svg}</svg></div>
           <ul class="g-lista">${lista}</ul>
         </div>`;

      el.querySelectorAll(".g-marca").forEach(m => {
        m.addEventListener("mousemove", ev => mostrarDica(
          `<b>${esc(m.dataset.nome)}</b><br>${esc(f(+m.dataset.valor))} · ${m.dataset.parte}%`, ev));
        m.addEventListener("mouseleave", esconderDica);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     CALENDÁRIO
     Um quadradinho por dia do ano, mais escuro quanto mais horas.
     É o gráfico que mostra constância, e é o que motiva.
     ══════════════════════════════════════════════════════════ */

  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

  function calendario(el, op) {
    const valores = op.valores || {};             // { "2026-08-31": 6.5 }
    const ano = op.ano || new Date().getFullYear();
    const f = op.formatar || (v => Dados.escreverHoras(v));

    const chaves = Object.keys(valores).filter(d => d.startsWith(ano + "-"));
    if (!chaves.length) { vazio(el, op.vazio || "Sem dias registrados neste ano ainda."); return; }
    const maximo = Math.max(...chaves.map(k => valores[k]));

    function faixa(v) {
      if (!v) return 0;
      const p = v / maximo;
      if (p <= 0.2) return 1;
      if (p <= 0.4) return 2;
      if (p <= 0.6) return 3;
      if (p <= 0.8) return 4;
      return 5;
    }

    aoRedimensionar(el, (larg) => {
      const inicio = new Date(Date.UTC(ano, 0, 1));
      const fim = new Date(Date.UTC(ano, 11, 31));
      const desloca = (inicio.getUTCDay() + 6) % 7;              // 0 = segunda
      const totalDias = Math.round((fim - inicio) / 86400000) + 1;
      const semanas = Math.ceil((totalDias + desloca) / 7);

      const rotuloL = 26;
      const disponivel = Math.max(120, larg - rotuloL - 4);
      const celula = Math.max(7, Math.min(14, Math.floor(disponivel / semanas) - 2));
      const passo = celula + 2;
      const alt = 18 + passo * 7;

      let svg = "";
      DIAS.forEach((d, i) => {
        if (i % 2) return;   // só seg, qua, sex e um a mais, para não empilhar texto
        svg += `<text x="0" y="${(18 + i * passo + celula * 0.8).toFixed(1)}" class="g-tick">${d}</text>`;
      });

      let mesAnterior = -1;
      for (let n = 0; n < totalDias; n++) {
        const d = new Date(inicio.getTime() + n * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const pos = n + desloca;
        const semana = Math.floor(pos / 7), linha = pos % 7;
        const x = rotuloL + semana * passo, y = 18 + linha * passo;
        const v = valores[iso] || 0;
        const nivel = faixa(v);
        svg += `<rect x="${x}" y="${y}" width="${celula}" height="${celula}" rx="2.5"
                 fill="${RAMPA[nivel]}" class="g-marca g-dia" data-dia="${iso}" data-valor="${v}"/>`;

        if (d.getUTCMonth() !== mesAnterior && linha <= 2) {
          mesAnterior = d.getUTCMonth();
          svg += `<text x="${x}" y="12" class="g-tick">${MESES[mesAnterior]}</text>`;
        }
      }

      const escadinha = RAMPA.map((c, i) =>
        `<span class="g-passo" style="background:${c}" title="${i === 0 ? "sem registro" : "nível " + i}"></span>`).join("");

      el.innerHTML =
        `<div class="g-tela g-rolagem"><svg viewBox="0 0 ${rotuloL + semanas * passo} ${alt}"
           width="${rotuloL + semanas * passo}" height="${alt}" role="img"
           aria-label="${esc(op.titulo || "Dias trabalhados no ano")}">${svg}</svg></div>
         <div class="g-escala"><span>menos</span>${escadinha}<span>mais</span></div>`;

      el.querySelectorAll(".g-dia").forEach(m => {
        m.addEventListener("mousemove", ev => {
          const v = +m.dataset.valor;
          mostrarDica(`<b>${esc(Dados.dataBonita(m.dataset.dia))}</b><br>${v ? esc(f(v)) : "sem registro"}`, ev);
        });
        m.addEventListener("mouseleave", esconderDica);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     MINIATURA
     Linha pequena, sem eixo, para dentro de um bloco.
     ══════════════════════════════════════════════════════════ */

  function miniatura(el, op) {
    const valores = op.valores || [];
    if (valores.length < 2) { vazio(el, op.vazio || "Poucos dias para desenhar."); return; }

    aoRedimensionar(el, (larg) => {
      const alt = op.altura || 54, m = 5;
      const maximo = Math.max(...valores, 1), minimo = Math.min(...valores, 0);
      const faixa = (maximo - minimo) || 1;
      const x = i => m + ((larg - m * 2) * i) / (valores.length - 1);
      const y = v => alt - m - ((v - minimo) / faixa) * (alt - m * 2);
      const cor = op.cor || CORES[0];

      const pontos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const area = `M${x(0).toFixed(1)},${alt} L` + pontos.replace(/ /g, " L") + ` L${x(valores.length - 1).toFixed(1)},${alt} Z`;

      el.innerHTML = `<div class="g-tela"><svg viewBox="0 0 ${larg} ${alt}" width="${larg}" height="${alt}" aria-hidden="true">
        <path d="${area}" fill="${cor}" opacity="0.1"/>
        <polyline points="${pontos}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(valores.length - 1).toFixed(1)}" cy="${y(valores[valores.length - 1]).toFixed(1)}" r="4"
          fill="${cor}" stroke="${SUPERF}" stroke-width="2"/></svg></div>`;
    });
  }

  /* ── liga a caixinha de valor nas marcas de colunas e linhas ── */
  function ligarDicas(el, categorias, f, sufixo, series) {
    el.querySelectorAll(".g-marca").forEach(m => {
      m.addEventListener("mousemove", ev => {
        const i = +m.dataset.cat;
        let corpo;
        if (m.dataset.todas && series) {
          corpo = series.map(s =>
            `<span class="g-dl"><i style="background:${s.cor}"></i>${esc(s.nome)}: ${esc(f(s.valores[i] || 0))}</span>`).join("");
        } else {
          corpo = esc(m.dataset.serie) + ": " + esc(f(+m.dataset.valor));
        }
        mostrarDica(`<b>${esc(categorias[i])}</b><br>${corpo}${sufixo ? "<br><small>" + esc(sufixo) + "</small>" : ""}`, ev);
      });
      m.addEventListener("mouseleave", esconderDica);
    });
  }

  /* ══════════════════════════════════════════════════════════
     O ESTILO DOS GRÁFICOS MORA AQUI

     Duas páginas usam gráficos. Se o CSS ficasse no <style> de cada
     uma, elas iam sair do ar uma da outra na primeira mudança.
     ══════════════════════════════════════════════════════════ */

  const CSS = `
  .g-tela { width:100%; }
  .g-tela svg { display:block; max-width:100%; }
  .g-tick  { font:11.5px var(--body,'Geist',system-ui,sans-serif); fill:${TINTA_3}; }
  .g-valor { font:600 12px var(--body,'Geist',system-ui,sans-serif); fill:${TINTA}; }
  .g-meta-rot { font:11px var(--body,'Geist',system-ui,sans-serif); fill:${TINTA_3}; }
  .g-centro{ font:600 19px var(--body,'Geist',system-ui,sans-serif); fill:var(--ink,#10203A); }
  .g-marca { cursor:default; transition:opacity .12s; }
  .g-marca:hover { opacity:.82; }

  .g-legenda { display:flex; flex-wrap:wrap; gap:6px 16px; margin-top:12px; }
  .g-item { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--ink-2,#54606F); }
  .g-item i, .g-lista i { width:9px; height:9px; border-radius:3px; flex-shrink:0; }
  .g-item i.g-tracinho {
    width:16px; height:0; border-radius:0; border-top:2px dashed ${TINTA_3};
  }

  .g-rosca { display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
  .g-lista { list-style:none; margin:0; padding:0; flex:1; min-width:190px; display:flex; flex-direction:column; gap:9px; }
  .g-lista li { display:flex; align-items:center; gap:9px; font-size:13px; color:var(--ink-2,#54606F); }
  .g-lista .g-nome { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .g-lista .g-num { font-weight:600; color:var(--ink,#10203A); font-variant-numeric:tabular-nums; }
  .g-lista .g-pct { color:var(--ink-3,#8A94A1); font-variant-numeric:tabular-nums; width:36px; text-align:right; }

  .g-escala { display:flex; align-items:center; gap:4px; margin-top:11px; font-size:11.5px; color:var(--ink-3,#8A94A1); }
  .g-passo { width:11px; height:11px; border-radius:2.5px; display:inline-block; }

  .g-vazio { padding:34px 14px; text-align:center; font-size:13.5px; color:var(--ink-3,#8A94A1); }

  .g-tabela { margin-top:12px; }
  .g-tabela summary {
    cursor:pointer; font-size:12.5px; color:var(--ink-3,#8A94A1);
    list-style:none; display:inline-flex; align-items:center; gap:6px; padding:3px 0;
  }
  .g-tabela summary::-webkit-details-marker { display:none; }
  .g-tabela summary::before { content:'▸'; font-size:10px; transition:transform .15s; }
  .g-tabela[open] summary::before { transform:rotate(90deg); }
  .g-tabela summary:hover { color:var(--signal,#1A4893); }
  .g-tabela table { border-collapse:collapse; width:100%; margin-top:9px; font-size:12.5px; }
  .g-tabela th, .g-tabela td {
    text-align:right; padding:6px 10px; border-bottom:1px solid var(--line-soft,#EAE4D9);
    font-variant-numeric:tabular-nums; color:var(--ink-2,#54606F); white-space:nowrap;
  }
  .g-tabela th[scope=row] { text-align:left; font-weight:500; color:var(--ink,#10203A); }
  .g-tabela thead th { color:var(--ink-3,#8A94A1); font-weight:500; }
  .g-rolagem { overflow-x:auto; }

  .g-dica {
    position:fixed; z-index:900; pointer-events:none;
    background:var(--escuro,#0F1D33); color:var(--ink-claro,#F2EFE9);
    padding:8px 11px; border-radius:10px; font-size:12.5px; line-height:1.45;
    box-shadow:0 8px 24px -8px rgba(16,32,58,.45); max-width:250px;
  }
  .g-dica b { color:#fff; font-weight:600; }
  .g-dica small { color:var(--ink-claro-2,#A9B6C6); }
  .g-dica .g-dl { display:flex; align-items:center; gap:6px; }
  .g-dica .g-dl i { width:8px; height:8px; border-radius:2px; }
  `;

  function injetarCss() {
    if (document.getElementById("css-graficos")) return;
    const s = document.createElement("style");
    s.id = "css-graficos";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  injetarCss();

  return { colunas, linhas, rosca, calendario, miniatura, CORES, RAMPA, corDe, numeroCurto, esconderDica };
})();
