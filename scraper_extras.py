#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  SCRAPERS EXTRAS — Meridial, TELUS, micro1 e Alignerr (agosto 2026)
═══════════════════════════════════════════════════════════════════
  Quatro fontes novas, todas descobertas pela aba Network do Chrome.
  Nenhuma delas exige login, chave de API ou navegador. São chamadas
  de rede comuns, então o robô do GitHub consegue ler sem problema.

  ── MERIDIAL (marca também usada como "Invisible") ──
  O site meridial.ai é só uma vitrine. Por baixo ele usa o Greenhouse,
  que tem API pública:

      GET https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true

  Traz mais de 800 vagas do mundo inteiro, com local, data de
  publicação e descrição completa em HTML.

  ── TELUS ──
  O site foi refeito e NÃO bloqueia mais robôs. A API é:

      POST https://api.telusinternational.ai/apapi/v1/list-job-posts
      corpo: {"page": 1, "limit": 100}

  O campo hiring_language traz o idioma exato, tipo
  "Portuguese (Brazil)". É o filtro mais limpo de todas as fontes,
  porque não depende de adivinhar pelo texto.

  ── MICRO1 ──
      POST https://prod-api.micro1.ai/api/v1/job/portal?page=1&limit=100&keyword=X
      corpo: {"action": "get_all_jobs", "filters": {"type": ["EXPERT"]}}

  Atenção: é POST mesmo tendo parâmetros na URL. Com GET devolve 404.
  A listagem não traz descrição, então abrimos a página de cada vaga
  em jobs.micro1.ai para pegar o texto.

  ── ALIGNERR (Labelbox) ──
      GET https://www.alignerr.com/api/jobs?limit=100&offset=0&search=portuguese

  A listagem diz "Remote" para tudo. O país verdadeiro só aparece na
  página individual, dentro do __NEXT_DATA__. A Alignerr também repete
  muito a mesma vaga, então deduplicamos pelo nome e ficamos com a de
  data de publicação mais recente.

  Importado pelo coletor.py.
═══════════════════════════════════════════════════════════════════
"""
import json
import re
import ssl
import time
import urllib.request
import urllib.error
import html as _html

# Correção de SSL no Windows (mesmo padrão dos outros arquivos do projeto)
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

TEMPO_LIMITE = 30


# ═══════════════════════════════════════════════════════════════════
#  FERRAMENTAS COMUNS
# ═══════════════════════════════════════════════════════════════════

def _baixar(url, corpo=None, tipo_json=True, origem=None, tentativas=3):
    """Faz a requisição e devolve o resultado. Se corpo for informado, vira POST.

    Manda cabeçalhos de navegador de verdade. Várias dessas APIs recusam
    requisição "pelada", que é o jeito padrão do Python, e devolvem 403.
    O parâmetro origem preenche Origin e Referer, que alguns servidores exigem.

    Em caso de erro, levanta uma exceção com o motivo REAL (código HTTP e um
    pedaço da resposta), não só "falhou". Sem isso não dá para consertar nada
    olhando o log do GitHub.
    """
    cabecalho = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
    }
    if origem:
        cabecalho["Origin"] = origem
        cabecalho["Referer"] = origem + "/"
    dados = None
    if corpo is not None:
        dados = json.dumps(corpo).encode("utf-8")
        cabecalho["Content-Type"] = "application/json"

    ultimo_erro = None
    for tentativa in range(1, tentativas + 1):
        req = urllib.request.Request(url, data=dados, headers=cabecalho)
        try:
            with urllib.request.urlopen(req, timeout=TEMPO_LIMITE,
                                        context=_SSL_CTX) as r:
                bruto = r.read()
            texto = bruto.decode("utf-8", errors="replace")
            return json.loads(texto) if tipo_json else texto
        except urllib.error.HTTPError as e:
            try:
                corpo_erro = e.read().decode("utf-8", errors="replace")[:160]
            except Exception:
                corpo_erro = ""
            ultimo_erro = RuntimeError(f"HTTP {e.code} — {corpo_erro}")
            # 4xx não melhora tentando de novo (a não ser 429, que é excesso)
            if e.code < 500 and e.code != 429:
                raise ultimo_erro
        except Exception as e:
            ultimo_erro = RuntimeError(f"{type(e).__name__}: {str(e)[:120]}")
        if tentativa < tentativas:
            time.sleep(1.5 * tentativa)
    raise ultimo_erro


def limpar_html(texto):
    """Transforma HTML em texto corrido legível, preservando as quebras."""
    if not texto:
        return ""
    t = _html.unescape(str(texto))
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>", "\n", t)
    t = re.sub(r"(?i)</(p|div|li|h[1-6]|tr)>", "\n", t)
    t = re.sub(r"(?i)<li[^>]*>", "• ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r"\n\s*\n\s*\n+", "\n\n", t)
    return t.strip()


# Palavras que indicam Brasil no local ou no título
_BRASIL = re.compile(r"\b(brazil|brasil|brazilian|pt[\s\-_]?br|português do brasil)\b", re.I)
# Local aberto ao mundo
_MUNDO = re.compile(r"\b(world\s*wide|worldwide|anywhere|global|remote|remoto)\b", re.I)
# Português genérico
_PORTUGUES = re.compile(r"\b(portuguese|português|portugues)\b", re.I)
# Portugal explícito (precisa ser rejeitado)
_PORTUGAL = re.compile(r"\bportugal\b", re.I)

# Português do Brasil ESCRITO POR EXTENSO. Usado só na descrição.
# Precisa ser estreito de propósito: na descrição, um "brazil" solto costuma
# ser conversa fiada ("nossos clientes no Brasil"), e não a língua do projeto.
# Já "Portuguese (Brazil)" numa lista de idiomas é sinal forte de que o
# projeto aceita brasileiro.
_PT_BRASIL = re.compile(
    r"portuguese\s*[\(\-–:]?\s*brazil"
    r"|brazilian\s+portuguese"
    r"|portugu[êe]s\s*[\(\-–:]?\s*brasil"
    r"|pt[\s\-_]?br\b",
    re.I,
)


def aceita_brasil(titulo, local, idioma="", descricao=""):
    """Regra única de curadoria, igual à do coletor.py.

    Entra se:
      1. o local é o Brasil, ou
      2. o título ou o idioma dizem Brasil / brazilian portuguese / pt-br, ou
      3. o local é aberto ao mundo E o título ou o idioma são de português, ou
      4. a DESCRIÇÃO pede português do Brasil por extenso

    E é rejeitada sempre que Portugal aparecer sem o Brasil junto.

    A regra 4 existe por causa das vagas multilíngues. A TELUS, por exemplo,
    tem vagas com título em inglês e idioma "English Global" que trazem uma
    lista de idiomas no corpo do anúncio, com "Portuguese (Brazil)" no meio.
    Elas aceitam brasileiro, mas nada no título entrega isso. Sem essa regra
    o robô achava 1 vaga onde o site mostra 4.

    A descrição precisa vir SEM HTML. Na TELUS existem tags no meio de
    "Portuguese (Brazil)", então testar o HTML cru não encontra nada.
    """
    titulo = titulo or ""
    local = local or ""
    idioma = idioma or ""
    descricao = descricao or ""
    juntos = f"{titulo} {idioma}"

    diz_brasil = bool(_BRASIL.search(juntos))
    local_brasil = bool(_BRASIL.search(local))
    diz_portugal = bool(_PORTUGAL.search(f"{juntos} {local}"))

    # Portugal sem Brasil junto: fora, sempre
    if diz_portugal and not (diz_brasil or local_brasil):
        return False

    if local_brasil or diz_brasil:
        return True

    local_mundo = bool(_MUNDO.search(local)) or not local.strip()
    if local_mundo and _PORTUGUES.search(juntos):
        return True

    # Última chance: o corpo do anúncio pede português do Brasil.
    # Só vale quando o local NÃO é um país estrangeiro específico. Sem essa
    # trava, uma vaga presa aos Estados Unidos entraria só porque cita
    # "Brazilian Portuguese" no meio do texto. É a mesma proteção que o
    # coletor.py já faz com as vagas do Lever.
    if local_mundo and descricao and _PT_BRASIL.search(descricao):
        return True

    return False


def local_em_portugues(local):
    """Deixa o local pronto para aparecer no site, em português.

    O coletor.py já formata, mas ele não traduz "Brazil" nem entende
    "World Wide - Remote". Como o site é em português do Brasil, é melhor
    resolver aqui do que deixar "Remoto · Brazil" no card.
    """
    texto = (local or "").strip()
    if not texto:
        return "Remoto · Brasil"
    if _MUNDO.search(texto) and not _BRASIL.search(texto):
        return "Remoto · Brasil"
    if _BRASIL.search(texto):
        return "Remoto · Brasil"
    return texto


def _mais_recente(a, b):
    """Devolve a maior das duas datas em texto (formato ISO ordena sozinho)."""
    return a if (a or "") >= (b or "") else b


def deduplicar_por_nome(vagas, campo_data="data_post"):
    """Junta vagas com o mesmo título, mantendo a de data mais recente.

    A Alignerr publica a mesma vaga várias vezes, uma por país, e às vezes
    mais de uma vez para o mesmo país. Sem isso o site encheria de repetição.
    """
    melhores = {}
    for v in vagas:
        chave = re.sub(r"\s+", " ", (v.get("titulo") or "").strip().lower())
        atual = melhores.get(chave)
        if atual is None:
            melhores[chave] = v
        elif (v.get(campo_data) or "") > (atual.get(campo_data) or ""):
            melhores[chave] = v
    return list(melhores.values())


# ═══════════════════════════════════════════════════════════════════
#  MERIDIAL / INVISIBLE  (Greenhouse, quadro "agency")
# ═══════════════════════════════════════════════════════════════════

URL_MERIDIAL = "https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true"


def coletar_meridial():
    """Lê o quadro do Greenhouse da Meridial e filtra o que serve ao Brasil."""
    print("  → Meridial (Greenhouse) ...", end=" ")
    try:
        dados = _baixar(URL_MERIDIAL)
    except Exception as e:
        print(f"FALHOU ({str(e)[:45]})")
        return []

    todas = dados.get("jobs") or []
    vagas = []
    for v in todas:
        titulo = (v.get("title") or "").strip()
        local = ((v.get("location") or {}).get("name") or "").strip()
        if not titulo:
            continue
        desc = limpar_html(v.get("content", ""))
        if not aceita_brasil(titulo, local, descricao=desc):
            continue

        vagas.append({
            "titulo": titulo,
            "url": v.get("absolute_url") or "",
            "local": local_em_portugues(local),
            "desc": desc,
            "data_post": (v.get("first_published") or "")[:10],
            "pagamento": "",
            "horario": "",
        })

    print(f"{len(vagas)} vaga(s) BR de {len(todas)} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  TELUS  (site novo, sem Cloudflare)
# ═══════════════════════════════════════════════════════════════════

URL_TELUS = "https://api.telusinternational.ai/apapi/v1/list-job-posts"
URL_TELUS_VAGA = "https://www.telusinternational.ai/cmp/public/jobs/available/{id}"


def coletar_telus(max_paginas=6):
    """Lê a API nova da TELUS. O campo hiring_language dá o idioma exato."""
    print("  → TELUS (API nova) ...", end=" ")
    todas, total = [], None
    try:
        for pagina in range(1, max_paginas + 1):
            resposta = _baixar(URL_TELUS, corpo={"page": pagina, "limit": 100},
                               origem="https://www.telusinternational.ai")
            lote = resposta.get("data") or []
            todas += lote
            pag = resposta.get("pagination") or {}
            total = pag.get("total")
            if pagina >= (pag.get("pages") or 1):
                break
            time.sleep(0.5)
    except Exception as e:
        print(f"FALHOU ({str(e)[:45]})")
        return []

    vagas = []
    for v in todas:
        titulo = (v.get("title") or "").strip()
        idioma = ((v.get("hiring_language") or {}).get("name") or "").strip()
        # a TELUS não informa país, só idioma; o tipo de trabalho diz "remote"
        local = "Remoto" if (v.get("job_type") == "remote") else ""
        if not titulo:
            continue
        # a descrição precisa entrar limpa: a TELUS coloca tags HTML no meio
        # de "Portuguese (Brazil)", então o texto cru não casa com nada
        desc = limpar_html(v.get("description", ""))
        if not aceita_brasil(titulo, local, idioma, descricao=desc):
            continue

        comp = v.get("compensation") or {}
        valor = comp.get("amount")
        unidade = (comp.get("unit") or "").replace("per_", "por ")
        pagamento = (f"{comp.get('currency','USD')} {valor} / {unidade}".strip()
                     if valor else "")

        vagas.append({
            "titulo": titulo,
            "url": URL_TELUS_VAGA.format(id=v.get("id")),
            "local": "Remoto · Brasil",
            "idioma": idioma,
            "desc": desc,
            "data_post": (v.get("ctime") or "")[:10],
            "pagamento": pagamento,
            "horario": (v.get("employment_type") or "").replace("_", " "),
        })

    print(f"{len(vagas)} vaga(s) BR de {total or len(todas)} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  MICRO1
# ═══════════════════════════════════════════════════════════════════

URL_MICRO1 = ("https://prod-api.micro1.ai/api/v1/job/portal"
              "?page=1&limit=100&keyword={termo}")
CORPO_MICRO1 = {"action": "get_all_jobs", "filters": {"type": ["EXPERT"]}}
URL_MICRO1_VAGA = "https://jobs.micro1.ai/post/{id}"

# A micro1 só devolve resultado por palavra buscada, então buscamos por três
TERMOS_MICRO1 = ["brazil", "brasil", "portuguese"]


def _descricao_micro1(url):
    """Abre a página da vaga e tenta extrair a descrição."""
    try:
        pagina = _baixar(url, tipo_json=False,
                         origem="https://jobs.micro1.ai", tentativas=2)
    except Exception:
        return ""
    # o texto costuma vir dentro de um JSON embutido na página
    for chave in ("job_description", "description", "jobDescription"):
        m = re.search(r'"%s"\s*:\s*"((?:[^"\\]|\\.)*)"' % chave, pagina)
        if m:
            try:
                texto = json.loads('"' + m.group(1) + '"')
            except Exception:
                texto = m.group(1)
            texto = limpar_html(texto)
            if len(texto) > 80:
                return texto
    # se não achou o JSON, cai para o corpo da página
    corpo = limpar_html(pagina)
    return corpo if len(corpo) > 200 else ""


def coletar_micro1(pausa=1.0, buscar_descricao=True):
    """Busca na micro1 por três termos e junta os resultados sem repetir."""
    print("  → micro1 ...", end=" ")
    brutas, ids_vistos = [], set()
    houve_resposta = False
    erros = []

    for termo in TERMOS_MICRO1:
        try:
            resposta = _baixar(URL_MICRO1.format(termo=termo),
                               corpo=CORPO_MICRO1,
                               origem="https://www.micro1.ai")
            houve_resposta = True
        except Exception as e:
            erros.append(f"{termo}: {e}")
            continue
        for v in (resposta.get("data") or []):
            jid = v.get("job_id")
            if jid and jid not in ids_vistos:
                ids_vistos.add(jid)
                brutas.append(v)
        time.sleep(0.4)

    if not houve_resposta:
        bloqueio = any("HTTP 403" in m for m in erros)
        if bloqueio:
            # 403 do nginx em TODAS as buscas = bloqueio por endereço de IP.
            # A micro1 checa a localização de quem acessa (a página dela chama
            # ipinfo.io e ipify) e recusa servidor de nuvem. Do PC de casa
            # funciona normalmente. É o mesmo caso que a TELUS já foi.
            print("BLOQUEADA (403)")
            print("      · A micro1 recusa acesso de servidor de nuvem.")
            print("      · Rode o coletor no seu PC para atualizar esta fonte.")
            print("      · As vagas da rodada anterior serão preservadas.")
        else:
            print("FALHOU")
            for msg in erros:
                print(f"      · {msg}")
        return []

    vagas = []
    for v in brutas:
        titulo = (v.get("job_name") or "").strip()
        if not titulo:
            continue
        # a micro1 não tem campo de país; o país vem escrito no título
        if not aceita_brasil(titulo, v.get("location_type") or "remote"):
            continue

        pay = v.get("ideal_hourly_rate") or {}
        pagamento = ""
        if pay.get("min") and pay.get("max"):
            pagamento = f"USD {pay['min']}-{pay['max']} / hora"
        elif pay.get("min"):
            pagamento = f"USD {pay['min']} / hora"

        url = URL_MICRO1_VAGA.format(id=v.get("job_id"))
        habilidades = ", ".join(v.get("skills") or [])

        desc = ""
        if buscar_descricao:
            desc = _descricao_micro1(url)
            time.sleep(pausa)
        if not desc and habilidades:
            desc = f"Habilidades pedidas: {habilidades}."

        vagas.append({
            "titulo": titulo,
            "url": url,
            "local": "Remoto · Brasil",
            "desc": desc,
            "requisitos": habilidades,
            "data_post": (v.get("date_posted") or "")[:10],
            "pagamento": pagamento,
            "horario": (v.get("engagement_type") or "") or "",
        })

    print(f"{len(vagas)} vaga(s) BR de {len(brutas)} encontradas")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  ALIGNERR  (Labelbox)
# ═══════════════════════════════════════════════════════════════════

URL_ALIGNERR = "https://www.alignerr.com/api/jobs?limit=100&offset=0&search={termo}"
URL_ALIGNERR_VAGA = "https://www.alignerr.com/jobs/{id}"

TERMOS_ALIGNERR = ["portuguese", "brazil"]


def _detalhe_alignerr(url):
    """Abre a página da vaga e lê o __NEXT_DATA__, que traz país e datas."""
    try:
        pagina = _baixar(url, tipo_json=False,
                         origem="https://www.alignerr.com", tentativas=2)
    except Exception:
        return {}
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                  pagina, re.S)
    if not m:
        return {}
    try:
        dados = json.loads(m.group(1))
    except Exception:
        return {}
    return ((dados.get("props") or {}).get("pageProps") or {}).get("job") or {}


def coletar_alignerr(pausa=0.6):
    """Busca na Alignerr, confere o país na página de cada vaga e deduplica.

    A listagem diz "Remote" para tudo, então o país só aparece ao abrir a
    vaga. Como a Alignerr repete muito o mesmo anúncio, no fim ficamos com
    uma vaga por título, a de publicação mais recente.
    """
    print("  → Alignerr ...", end=" ")
    brutas, ids_vistos = [], set()
    houve_resposta = False
    erros = []

    for termo in TERMOS_ALIGNERR:
        try:
            resposta = _baixar(URL_ALIGNERR.format(termo=termo),
                               origem="https://www.alignerr.com")
            houve_resposta = True
        except Exception as e:
            erros.append(f"{termo}: {e}")
            continue
        for v in (resposta.get("jobs") or []):
            jid = v.get("id")
            if jid and jid not in ids_vistos:
                ids_vistos.add(jid)
                brutas.append(v)
        time.sleep(0.4)

    if not houve_resposta:
        print("FALHOU")
        for msg in erros:
            print(f"      · {msg}")
        return []

    candidatas = []
    for v in brutas:
        jid = v.get("id")
        url = URL_ALIGNERR_VAGA.format(id=jid)
        det = _detalhe_alignerr(url)
        time.sleep(pausa)

        titulo = (det.get("name") or v.get("title") or "").strip()
        local = (det.get("location") or "").strip()
        if not titulo:
            continue
        desc = limpar_html(det.get("longDescription")
                           or det.get("htmlLongDescription")
                           or v.get("description", ""))
        if not aceita_brasil(titulo, local, descricao=desc):
            continue

        candidatas.append({
            "titulo": titulo,
            "url": url,
            "local": local_em_portugues(local),
            "desc": desc,
            "requisitos": limpar_html(det.get("shortDescription") or ""),
            # firstPostDate é a republicação mais recente; createdAt é antigo
            "data_post": (det.get("firstPostDate")
                          or det.get("createdAt") or "")[:10],
            "pagamento": v.get("pay") or "",
            "horario": det.get("jobType") or "",
        })

    vagas = deduplicar_por_nome(candidatas)
    repetidas = len(candidatas) - len(vagas)
    print(f"{len(vagas)} vaga(s) BR de {len(brutas)} encontradas "
          f"({repetidas} repetida(s) descartada(s))")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  TURING  (work.turing.com)
# ═══════════════════════════════════════════════════════════════════
#
# Descoberta em agosto de 2026. O site é Next.js e não traz nada no HTML:
# as vagas chegam depois, por uma chamada XHR que o F12 só mostra quando
# você mexe na busca. A chamada é:
#
#     POST https://work.turing.com/api/jobs/all
#     Content-Type: application/json
#     corpo: {"searchQuery": "portuguese", "expertise": [], "location": [],
#             "selectedSorting": "priority", "currentPage": 1, "pageSize": 100}
#
# Resposta: {"success": true, "jobs": [...], "totalCount": N, ...}
#
# NÃO EXISTE campo de país. O único campo de local é locationType, que diz
# "remote" em tudo. Os países elegíveis estão dentro da descrição, numa linha
# no formato:
#
#     Location : India, Pakistan, Nigeria, Kenya, Egypt, ..., Brazil, Mexico
#
# É essa linha que decide se a vaga serve ou não. Sem ela, a busca por
# "brazil" traria vagas que só citam o Brasil de passagem.
#
# Link da vaga: https://work.turing.com/jobs?jobId={id}
# (os cards não são links de verdade, o site troca a URL no clique)

URL_TURING = "https://work.turing.com/api/jobs/all"
URL_TURING_VAGA = "https://work.turing.com/jobs?jobId={id}"
ORIGEM_TURING = "https://work.turing.com"

# A busca é por texto livre e olha título + descrição. Três termos cobrem
# tanto as vagas de idioma quanto as multipaís que listam o Brasil.
TERMOS_TURING = ["portuguese", "brazil", "brasil"]

# A linha de países elegíveis dentro da descrição
_LINHA_PAISES = re.compile(
    r"\b(?:location|locations|eligible\s+(?:countries|locations)|countries)\s*:\s*([^\n\r]{3,300})",
    re.I,
)

# Valor por hora escrito na descrição (só o que estiver explícito)
_POR_HORA = re.compile(
    r"(\$\s?\d[\d.,]*(?:\s*(?:-|–|to)\s*\$?\s?\d[\d.,]*)?)"
    r"\s*(?:USD\s*)?(?:per\s+hour|/\s*h(?:ou)?r|an\s+hour|hourly)",
    re.I,
)


def _paises_turing(descricao):
    """Devolve a lista de países elegíveis escrita na descrição, ou ''.

    Só considera a linha se ela parecer mesmo uma lista de lugares: precisa
    ter vírgula ou o nome de um país conhecido. Isso evita capturar frases
    soltas que começam com "Location:" e seguem com outra coisa.
    """
    if not descricao:
        return ""
    for achado in _LINHA_PAISES.findall(descricao):
        linha = achado.strip()
        if "," in linha or re.search(r"\b(brazil|india|remote|worldwide|"
                                     r"united states|global)\b", linha, re.I):
            return linha
    return ""


def coletar_turing():
    """Busca na Turing por três termos e junta os resultados sem repetir."""
    print("  → Turing ...", end=" ")
    brutas, ids_vistos = [], set()
    houve_resposta = False
    erros = []

    for termo in TERMOS_TURING:
        corpo = {
            "searchQuery": termo,
            "expertise": [],
            "location": [],
            "selectedSorting": "priority",
            "currentPage": 1,
            "pageSize": 100,
        }
        try:
            resposta = _baixar(URL_TURING, corpo=corpo, origem=ORIGEM_TURING)
            houve_resposta = True
        except Exception as e:
            erros.append(f"{termo}: {e}")
            continue
        for v in (resposta.get("jobs") or []):
            jid = v.get("id")
            if jid and jid not in ids_vistos:
                ids_vistos.add(jid)
                brutas.append(v)
        time.sleep(0.4)

    if not houve_resposta:
        print("FALHOU")
        for msg in erros:
            print(f"      · {msg}")
        return []

    vagas = []
    for v in brutas:
        titulo = (v.get("title") or "").strip()
        if not titulo:
            continue

        desc = limpar_html(v.get("description") or "")
        paises = _paises_turing(desc)

        # ─── Decisão ───
        # Se a vaga LISTA os países elegíveis, essa lista manda: sem Brasil
        # na lista, a vaga não serve, por mais que o título fale português.
        # É a mesma lição do "Project Perseus" da Welocalize.
        if paises:
            if not _BRASIL.search(paises):
                continue
            local = "Remoto · Brasil"
        else:
            # Sem lista de países: cai na regra geral do projeto. Título de
            # português entra (é remoto e aberto), Portugal explícito não.
            if not aceita_brasil(titulo, "remote", "", desc):
                continue
            local = "Remoto · Mundial"

        um_paga = _POR_HORA.search(desc)
        pagamento = um_paga.group(1).replace(" ", "") + " / hora" if um_paga else ""

        contrato = v.get("contract") or v.get("roleGroup") or ""
        vagas.append({
            "titulo": titulo,
            "url": URL_TURING_VAGA.format(id=v.get("id")),
            "local": local,
            "desc": desc,
            "requisitos": ", ".join(
                s.get("skillName", "") for s in (v.get("skills") or [])
                if s.get("skillName")
            ),
            "data_post": (v.get("createdDate") or "")[:10],
            "pagamento": pagamento,
            "horario": contrato if isinstance(contrato, str) else "",
        })

    print(f"{len(vagas)} vaga(s) BR de {len(brutas)} encontradas")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  IMERIT  (imerit.ai)
# ═══════════════════════════════════════════════════════════════════
#
# A mais simples de todas as fontes do projeto. A página de carreiras é
# WordPress e mostra "Loading open roles...", mas o dado vem de um arquivo
# JSON estático, sem login, sem POST, sem paginação:
#
#     GET https://imerit.ai/jobs.json
#
# Resposta: {"generated_at": "...", "total": N, "jobs": [...]}
#
# Cada vaga já traz país, estado, idioma, tipo de contrato, faixa de
# pagamento e a descrição separada em blocos. É o feed mais limpo que
# encontramos, melhor até que as APIs de verdade.
#
# Situação em agosto de 2026: 24 vagas, nenhuma em português nem no Brasil.
# Os idiomas do filtro do site são chinês, inglês, hebraico, japonês,
# canarês, coreano, malaio, persa, télugo e tailandês. Entra no projeto
# como posto de vigia: no dia em que abrir vaga para o Brasil, ela cai no
# site sozinha.

URL_IMERIT = "https://imerit.ai/jobs.json"
ORIGEM_IMERIT = "https://imerit.ai"


def coletar_imerit():
    """Lê o feed JSON da iMerit e devolve só o que aceita o Brasil."""
    print("  → iMerit ...", end=" ")
    try:
        resposta = _baixar(URL_IMERIT, origem=ORIGEM_IMERIT)
    except Exception as e:
        print(f"FALHOU ({e})")
        return []

    brutas = resposta.get("jobs") or []
    vagas = []
    for v in brutas:
        titulo = (v.get("title") or "").strip()
        if not titulo:
            continue

        pais = (v.get("country") or "").strip()
        estado = (v.get("state") or "").strip()
        local_bruto = ", ".join(p for p in (estado, pais) if p) \
            or (v.get("location") or "")
        idioma = (v.get("language") or "").strip()

        # blocos de texto: a iMerit separa em about/description/etc.
        blocos = [v.get(k) or "" for k in
                  ("description", "about", "responsibilities")]
        desc = limpar_html("\n\n".join(b for b in blocos if b))
        requisitos = limpar_html("\n".join(
            v.get(k) or "" for k in ("requirements", "nice_to_have")))

        if not aceita_brasil(titulo, local_bruto, idioma, desc):
            continue

        # O slug garante uma URL única por vaga, e a URL é o que vira o id
        # do resumo. Sem ela, vaga sem apply_link viraria tudo o mesmo id.
        link = (v.get("apply_link") or "").strip()
        if not link.lower().startswith("http"):
            slug = v.get("slug") or v.get("job_id") or titulo
            link = f"https://imerit.ai/careers-listing/?role={slug}"

        vagas.append({
            "titulo": titulo,
            "url": link,
            "local": local_em_portugues(local_bruto),
            "desc": desc,
            "requisitos": requisitos,
            "data_post": "",          # o feed não traz data de publicação
            "pagamento": (v.get("pay_rate") or "").strip(),
            "horario": (v.get("type") or "").strip(),
        })

    print(f"{len(vagas)} vaga(s) BR de {len(brutas)} encontradas")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  TESTE MANUAL: python3 scraper_extras.py
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    for nome, funcao in [("MERIDIAL", coletar_meridial),
                         ("TELUS", coletar_telus),
                         ("MICRO1", coletar_micro1),
                         ("ALIGNERR", coletar_alignerr),
                         ("TURING", coletar_turing),
                         ("IMERIT", coletar_imerit)]:
        print("\n" + "=" * 60)
        print(f"  {nome}")
        print("=" * 60)
        for v in funcao():
            print(f"\n- {v['titulo']}")
            print(f"  local: {v.get('local')} | data: {v.get('data_post')}")
            print(f"  {v['url']}")
            print(f"  pagamento: {v.get('pagamento')}")
            print(f"  desc ({len(v.get('desc',''))} car.): "
                  f"{(v.get('desc') or '')[:120]}")
