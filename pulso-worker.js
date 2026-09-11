/**
 * Pulso do Hub — Worker de coleta anônima.
 *
 * Recebe dois eventos do Meu Controle ("aplicou" e "resposta") e devolve, para a
 * rotina diária do GitHub, um agregado que NÃO contém nenhum identificador.
 *
 * Endereços
 *   GET  /            diz que está no ar
 *   POST /evento      grava um evento ou um lote de até 40
 *   GET  /agregado    devolve as contagens, exige o cabeçalho x-pulso-chave
 *
 * Configuração no painel da Cloudflare
 *   Binding KV   PULSO           o namespace onde os eventos ficam
 *   Secret       CHAVE_LEITURA   protege o /agregado
 *   Secret       SAL_IP          usado para nunca guardar IP em claro
 *   Variable     ORIGENS         origens liberadas, separadas por vírgula
 *
 * Formato da chave no KV
 *   p:<vaga>:<evento>:<data>:<quem>
 * A chave carrega tudo que o agregado precisa, então listar basta e nunca é
 * preciso ler valor por valor. Reenviar o mesmo evento reescreve a mesma chave,
 * então retentativa não infla contagem.
 *
 * Documento de escopo: claude/PULSO.md
 */

const VIDA_DO_EVENTO = 100 * 24 * 60 * 60; // 100 dias, em segundos
const LOTE_MAXIMO = 40;
const CORPO_MAXIMO = 4096; // bytes
const GRAVACOES_POR_HORA = 60;
const EVENTOS = ["aplicou", "resposta"];

const RE_VAGA = /^[a-f0-9]{6,40}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(pedido, env) {
    const url = new URL(pedido.url);
    const origem = pedido.headers.get("Origin") || "";
    const liberada = origemLiberada(origem, env);

    if (pedido.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cabecalhos(liberada) });
    }

    if (url.pathname === "/" && pedido.method === "GET") {
      return responder({ ok: true, servico: "pulso" }, 200, liberada);
    }

    if (url.pathname === "/evento" && pedido.method === "POST") {
      if (origem && !liberada) return responder({ erro: "origem" }, 403, null);
      return await gravar(pedido, env, liberada);
    }

    if (url.pathname === "/agregado" && pedido.method === "GET") {
      return await agregar(pedido, env);
    }

    return responder({ erro: "nao_encontrado" }, 404, liberada);
  },
};

/* ─────────────────────────  gravação  ───────────────────────── */

async function gravar(pedido, env, liberada) {
  const bruto = await pedido.text();
  if (bruto.length > CORPO_MAXIMO) {
    return responder({ erro: "corpo_grande" }, 413, liberada);
  }

  let corpo;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return responder({ erro: "json_invalido" }, 400, liberada);
  }

  const lista = Array.isArray(corpo) ? corpo : [corpo];
  if (lista.length === 0 || lista.length > LOTE_MAXIMO) {
    return responder({ erro: "lote_invalido" }, 400, liberada);
  }

  const validos = lista.filter(valido);
  if (validos.length === 0) {
    return responder({ erro: "nenhum_evento_valido" }, 400, liberada);
  }

  const passou = await dentroDoLimite(pedido, env, validos.length);
  if (!passou) {
    return responder({ erro: "limite_por_hora" }, 429, liberada);
  }

  await Promise.all(
    validos.map((e) =>
      env.PULSO.put(
        `p:${e.vaga}:${e.evento}:${e.quando}:${e.quem.toLowerCase()}`,
        "1",
        { expirationTtl: VIDA_DO_EVENTO }
      )
    )
  );

  return responder({ ok: true, gravados: validos.length }, 200, liberada);
}

function valido(e) {
  if (!e || typeof e !== "object") return false;
  if (typeof e.vaga !== "string" || !RE_VAGA.test(e.vaga)) return false;
  if (!EVENTOS.includes(e.evento)) return false;
  if (typeof e.quem !== "string" || !RE_UUID.test(e.quem)) return false;
  if (typeof e.quando !== "string" || !RE_DATA.test(e.quando)) return false;

  // data precisa ser real, não pode ser do futuro nem mais velha que a retenção
  const dia = Date.parse(e.quando + "T12:00:00Z");
  if (isNaN(dia)) return false;
  const agora = Date.now();
  if (dia > agora + 86400000) return false;
  if (agora - dia > VIDA_DO_EVENTO * 1000) return false;

  return true;
}

/* ─────────────────────  teto por hora, sem guardar IP  ───────────────────── */

async function dentroDoLimite(pedido, env, quantos) {
  const sal = env.SAL_IP;
  if (!sal) return true; // sem sal configurado, não inventa hash fraco

  const ip = pedido.headers.get("CF-Connecting-IP") || "";
  if (!ip) return true;

  const marca = await digerir(sal + "|" + ip);
  const hora = Math.floor(Date.now() / 3600000);
  const chave = `rl:${marca}:${hora}`;

  const atual = parseInt((await env.PULSO.get(chave)) || "0", 10);
  if (atual + quantos > GRAVACOES_POR_HORA) return false;

  await env.PULSO.put(chave, String(atual + quantos), { expirationTtl: 3600 });
  return true;
}

async function digerir(texto) {
  const dados = new TextEncoder().encode(texto);
  const buf = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ─────────────────────────  agregado  ───────────────────────── */

async function agregar(pedido, env) {
  const chave = pedido.headers.get("x-pulso-chave") || "";
  if (!env.CHAVE_LEITURA || chave !== env.CHAVE_LEITURA) {
    return responder({ erro: "nao_autorizado" }, 401, null);
  }

  // primeiro monta quem => data mais antiga, para contar pessoa e não evento
  const porPessoa = new Map(); // "vaga|evento" => Map(quem => data)
  let cursor;

  do {
    const pagina = await env.PULSO.list({ prefix: "p:", cursor, limit: 1000 });
    for (const item of pagina.keys) {
      const partes = item.name.split(":");
      if (partes.length !== 5) continue;
      const [, vaga, evento, data, quem] = partes;
      const grupo = vaga + "|" + evento;
      if (!porPessoa.has(grupo)) porPessoa.set(grupo, new Map());
      const mapa = porPessoa.get(grupo);
      const anterior = mapa.get(quem);
      if (!anterior || data < anterior) mapa.set(quem, data);
    }
    cursor = pagina.list_complete ? null : pagina.cursor;
  } while (cursor);

  // depois joga os identificadores fora e devolve só as datas
  const vagas = {};
  for (const [grupo, mapa] of porPessoa) {
    const [vaga, evento] = grupo.split("|");
    if (!vagas[vaga]) vagas[vaga] = {};
    vagas[vaga][evento] = [...mapa.values()].sort();
  }

  return responder(
    { gerado_em: new Date().toISOString(), vagas },
    200,
    null
  );
}

/* ─────────────────────────  utilidades  ───────────────────────── */

function origemLiberada(origem, env) {
  if (!origem) return null;
  const lista = (env.ORIGENS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return lista.includes(origem) ? origem : null;
}

function cabecalhos(liberada) {
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (liberada) {
    h["Access-Control-Allow-Origin"] = liberada;
    h["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
    h["Vary"] = "Origin";
  }
  return h;
}

function responder(corpo, status, liberada) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: cabecalhos(liberada),
  });
}
