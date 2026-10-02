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
      POST https://prod-api.micro1.ai/api/v1/job/portal?page=1&limit=100&keyword=
      corpo: {"action": "get_all_jobs", "filters": {"type": ["EXPERT"]}}

  Atenção: é POST mesmo tendo parâmetros na URL. Com GET devolve 404.
  Com keyword vazio vem a lista inteira, de 100 em 100. A listagem não
  traz descrição nem país, então abrimos a página de cada vaga em
  jobs.micro1.ai: a linha "Location:" do texto é que diz quem pode.

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
import unicodedata
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
              "?page={pagina}&limit=100&keyword=")
CORPO_MICRO1 = {"action": "get_all_jobs", "filters": {"type": ["EXPERT"]}}
URL_MICRO1_VAGA = "https://jobs.micro1.ai/post/{id}"

# Com a palavra de busca vazia a micro1 devolve a lista inteira, paginada.
# (Até outubro de 2026 a busca era por "brazil", "brasil" e "portuguese", e
# perdia as vagas abertas ao Brasil que não diziam isso no título.)

# ─── Vagas por área (escondidas no site até a pessoa se cadastrar) ───
# Estas buscas NÃO falam de português nem de Brasil: são as vagas que pedem
# formação numa área. Elas não entram na aba Vagas; ficam no arquivo separado.
TERMOS_AREA = [
    "law", "legal", "medical", "physician", "nursing", "mathematics",
    "physics", "chemistry", "biology", "engineering", "software",
    "finance", "accounting", "economics", "psychology", "history",
    "philosophy", "linguistics", "design", "marketing", "phd",
]

# País explícito no título que não seja o Brasil derruba a vaga: mesmo aberta
# a especialistas, ela é reservada a quem mora lá.
_OUTRO_PAIS = re.compile(
    r"\b(india|indian|united states|usa|u\.s\.|canada|canadian|mexico|"
    r"philippines|filipino|nigeria|kenya|egypt|indonesia|vietnam|japan|"
    r"korea|china|germany|france|spain|italy|poland|turkey|argentina|"
    r"colombia|chile|peru|portugal|uk|united kingdom)\b"
    r"|\b(?:us|u\.s\.|usa|uk|eu|india|canada)\s+(?:only|based|residents?)\b",
    re.I)


def pais_estrangeiro(titulo):
    """True se o título prende a vaga a outro país que não o Brasil."""
    if _BRASIL.search(titulo or ""):
        return False
    return bool(_OUTRO_PAIS.search(titulo or ""))


# Idioma estrangeiro no título. Inglês não conta: é o idioma padrão dessas
# plataformas e aparece em vaga aberta a qualquer pessoa.
_OUTRO_IDIOMA = re.compile(
    r"\b(korean|japanese|mandarin|cantonese|chinese|hindi|bengali|gujarati|"
    r"malayalam|tamil|telugu|marathi|punjabi|kannada|odia|assamese|urdu|"
    r"nepali|sinhala|thai|vietnamese|indonesian|malay|tagalog|filipino|"
    r"khmer|lao|burmese|mongolian|kazakh|uzbek|arabic|hebrew|persian|farsi|"
    r"turkish|azerbaijani|georgian|armenian|russian|ukrainian|polish|czech|"
    r"slovak|slovenian|hungarian|romanian|bulgarian|serbian|croatian|greek|"
    r"lithuanian|latvian|estonian|finnish|swedish|norwegian|danish|dutch|"
    r"flemish|german|french|italian|spanish|catalan|basque|swahili|yoruba|"
    r"hausa|igbo|zulu|afrikaans|amharic|somali)\b", re.I)


# Inglês com sotaque de um país: vaga de locução para nativos de lá.
_SOTAQUE_INGLES = re.compile(
    r"\b(irish|australian|south african|british|scottish|welsh|canadian|"
    r"new zealand|indian|nigerian|singaporean)\s+english\b", re.I)


def idioma_estrangeiro(titulo):
    """True se o título pede outro idioma que não português nem inglês."""
    if _BRASIL.search(titulo or ""):
        return False
    return bool(_OUTRO_IDIOMA.search(titulo or "") or _SOTAQUE_INGLES.search(titulo or ""))


# A página da vaga é feita em Next.js: o conteúdo vem em pedaços dentro de
# chamadas self.__next_f.push([1,"..."]). Juntando os pedaços aparece um
# bloco JobPosting (schema.org) com a descrição completa em HTML.
_PEDACO_MICRO1 = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
_INICIO_VAGA_MICRO1 = '{"@context":"https://schema.org/","@type":"JobPosting"'


def _descricao_micro1(url):
    """Abre a página da vaga e devolve a descrição em texto corrido."""
    try:
        pagina = _baixar(url, tipo_json=False,
                         origem="https://jobs.micro1.ai", tentativas=2)
    except Exception:
        return ""
    partes = []
    for m in _PEDACO_MICRO1.finditer(pagina):
        try:
            partes.append(json.loads(m.group(1)))
        except Exception:
            pass
    fluxo = "".join(partes)
    i = fluxo.find(_INICIO_VAGA_MICRO1)
    if i < 0:
        return ""
    try:
        vaga, _ = json.JSONDecoder().raw_decode(fluxo[i:])
    except Exception:
        return ""
    # ATENÇÃO: o campo applicantLocationRequirements desse bloco é uma lista
    # fixa de dezenas de países, igual em todas as vagas. Não serve de filtro.
    # Quem diz onde a pessoa precisa morar é a linha "Location:" do texto.
    return limpar_html(vaga.get("description") or "")


# ─── Onde a pessoa precisa morar, segundo a linha "Location:" da descrição ───
_LOCAL_LINHA = re.compile(r"(?im)^\s*(?:(?:job\s+)?location|localiza[çc][ãa]o)\s*:?[ \t]*(.*)$")
_LATAM = re.compile(r"\b(latin\s+america|latam|south\s+america|am[ée]rica\s+latina)\b", re.I)
_PAISES_LATAM = re.compile(r"\b(argentina|chile|colombia|mexico|peru|uruguay|panama|costa rica)\b", re.I)
_PRESENCIAL = re.compile(r"\b(on[\s-]?site|hybrid|in[\s-]person|presencial)\b", re.I)
_GLOBAL = re.compile(r"\b(global|globally|world\s*wide|worlwide|anywhere|any country)\b", re.I)
# palavras que sobram numa linha que diz só "remoto", sem citar lugar nenhum
_SO_REMOTO = re.compile(r"\b(fully|100%|remote|remoto|work from home|open|to|candidates|position|role|"
                        r"contract|part[\s-]time|full[\s-]time|flexible|hours?|and|the)\b", re.I)
# exigência de morar nos EUA escrita no corpo do anúncio
_SO_EUA = re.compile(
    r"(?:based|located|resid\w+|authorized to work|eligible to work|eligibility to work)"
    r"\s+in\s+(?:the\s+|a\s+)?(?:mainland\s+)?(?:u\.?s\.?(?![a-z])|united states)"
    r"|\bu\.?s\.?\s+(?:citizens?|citizenship|work authorization|residents?\s+only)\b"
    # diploma de faculdade de país de língua inglesa: na prática exclui quem
    # estudou no Brasil, mesmo sem falar de moradia
    r"|institution\s+in\s+the\s+united states", re.I)
# região entre parênteses no título: (US), (U.S), (AUS), "US-based", Austrália
_REGIAO_NO_TITULO = re.compile(
    r"\((?:US|U\.S\.?|USA|AUS|UK|EU)\)|\bU\.?S\.?[\s-]based\b|\baustralia\b|\bnew zealand\b", re.I)


def local_micro1(descricao):
    """Lê a descrição e devolve "brasil", "mundo" ou "fora".

    brasil = cita o Brasil ou a América Latina
    mundo  = remoto sem citar lugar, ou aberto ao mundo por extenso
    fora   = presencial, ou preso a um lugar que não inclui o Brasil
    """
    d = descricao or ""
    m = _LOCAL_LINHA.search(d)
    linha = m.group(1).strip() if m else ""
    # linha que termina em ":" continua na de baixo (a lista de países)
    if m and linha.endswith(":"):
        resto = d[m.end():].lstrip("\n ").split("\n", 1)[0]
        linha = linha + " " + resto

    if _PRESENCIAL.search(linha):
        return "fora"
    if _BRASIL.search(linha):
        return "brasil"
    if _LATAM.search(linha):
        # "América Latina" seguida de uma lista de países sem o Brasil = fora
        return "fora" if _PAISES_LATAM.search(linha) else "brasil"
    if _GLOBAL.search(linha):
        return "mundo"
    sobra = re.sub(r"[^a-zà-ú]+", "", _SO_REMOTO.sub(" ", linha.lower()))
    if sobra:
        return "fora"           # a linha cita algum lugar, e não é o Brasil
    if _SO_EUA.search(d):
        return "fora"
    return "mundo"


def coletar_micro1(pausa=0.3, buscar_descricao=True, termos=None,
                   modo_area=False):
    """Lê TODAS as vagas da micro1 e fica com as que servem ao Brasil.

    Antes a busca era por palavra ("brazil", "portuguese"), e ficava de fora
    toda vaga aberta ao Brasil que não dizia isso no título, como a
    "At-Home Video Recorder (LATAM)". Agora a lista inteira é lida (com a
    palavra de busca vazia a API devolve tudo, de 100 em 100) e a decisão
    é tomada pela linha "Location:" da descrição de cada vaga.

    A separação entre vaga geral e vaga de área é feita depois, no coletor.
    Por isso a segunda chamada, a de áreas (modo_area=True), não tem mais o
    que buscar: tudo já veio na primeira.
    """
    if modo_area:
        print("  → micro1 (áreas) ... já incluídas na leitura completa")
        return []

    print("  → micro1 ...", end=" ")
    brutas, ids_vistos = [], set()
    houve_resposta = False
    erros = []

    for pagina in range(1, 21):          # trava de segurança: 2.000 vagas
        try:
            resposta = _baixar(URL_MICRO1.format(pagina=pagina),
                               corpo=CORPO_MICRO1,
                               origem="https://www.micro1.ai")
            houve_resposta = True
        except Exception as e:
            erros.append(f"página {pagina}: {e}")
            break
        lote = resposta.get("data") or []
        for v in lote:
            jid = v.get("job_id")
            if jid and jid not in ids_vistos:
                ids_vistos.add(jid)
                brutas.append(v)
        if len(lote) < 100:
            break
        time.sleep(0.4)

    if not houve_resposta:
        bloqueio = any("HTTP 403" in m for m in erros)
        if bloqueio:
            # 403 do nginx = bloqueio por endereço de IP. A micro1 checa a
            # localização de quem acessa (a página dela chama ipinfo.io e
            # ipify) e recusa servidor de nuvem. Do PC de casa funciona
            # normalmente. É o mesmo caso que a TELUS já foi.
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
    fora_titulo = fora_local = sem_texto = 0
    for v in brutas:
        titulo = (v.get("job_name") or "").strip()
        if not titulo:
            continue
        # país, região ou idioma estrangeiro já no título: nem abre a página
        if (pais_estrangeiro(titulo) or idioma_estrangeiro(titulo)
                or (_REGIAO_NO_TITULO.search(titulo) and not _BRASIL.search(titulo))):
            fora_titulo += 1
            continue

        url = URL_MICRO1_VAGA.format(id=v.get("job_id"))
        habilidades = ", ".join(v.get("skills") or [])

        desc = ""
        if buscar_descricao:
            desc = _descricao_micro1(url)
            time.sleep(pausa)

        em_pt = bool(_BRASIL.search(titulo) or _PORTUGUES.search(titulo) or _LATAM.search(titulo))
        if desc:
            onde = local_micro1(desc)
            if onde == "fora" and not _BRASIL.search(titulo):
                fora_local += 1
                continue
        else:
            # Sem descrição não dá para saber onde a pessoa precisa morar.
            # Só entra a vaga que fala de Brasil ou português no título.
            sem_texto += 1
            if not em_pt:
                continue
            onde = "brasil"
        if em_pt:
            onde = "brasil"
        if not desc and habilidades:
            desc = f"Habilidades pedidas: {habilidades}."

        pay = v.get("ideal_hourly_rate") or {}
        pagamento = ""
        if pay.get("min") and pay.get("max") and pay["min"] != pay["max"]:
            pagamento = f"USD {pay['min']}-{pay['max']} / hora"
        elif pay.get("min") or pay.get("max"):
            pagamento = f"USD {pay.get('min') or pay.get('max')} / hora"

        vagas.append({
            "titulo": titulo,
            "url": url,
            "local": "Remoto · Brasil" if onde == "brasil" else "Remoto · Mundial",
            "desc": desc,
            "requisitos": habilidades,
            "data_post": (v.get("date_posted") or "")[:10],
            "pagamento": pagamento,
            "horario": (v.get("engagement_type") or "") or "",
        })

    print(f"{len(vagas)} vaga(s) de {len(brutas)} "
          f"({fora_titulo} fora pelo título, {fora_local} fora pelo local"
          + (f", {sem_texto} sem descrição" if sem_texto else "") + ")")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  ALIGNERR  (Labelbox)
# ═══════════════════════════════════════════════════════════════════

URL_ALIGNERR = "https://www.alignerr.com/api/jobs?limit=100&offset={offset}&search="
ARQUIVO_MESTRES_ALIGNERR = "alignerr-mestres.json"
URL_ALIGNERR_VAGA = "https://www.alignerr.com/jobs/{id}"



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


def coletar_alignerr(pausa=0.2):
    """Lê a lista INTEIRA da Alignerr e fica com as vagas que servem ao Brasil.

    Até outubro de 2026 a busca era por "portuguese" e "brazil", e ficavam de
    fora as vagas abertas ao mundo com título em inglês ("Generalist",
    "Content Reviewer"...).

    A Alignerr publica milhares de anúncios, mas quase todos são cópias
    regionais da mesma vaga (a de Tóquio, a de Berlim, a de São Paulo). Toda
    cópia aponta para a vaga-mãe pelo campo masterJobId. A vaga-mãe não tem
    cidade nem país: é a versão aberta, e é ela que entra no hub.

    Passos:
      1. baixa a lista inteira, de 100 em 100, e agrupa por título
      2. descobre a vaga-mãe de cada título (guardado em alignerr-mestres.json,
         para não perguntar de novo na rodada seguinte)
      3. abre cada vaga-mãe e decide pelo país e pela linha "Location:"
    """
    print("  → Alignerr ...", end=" ")
    brutas, vistos = [], set()
    erros = []
    for offset in range(0, 20000, 100):
        try:
            resposta = _baixar(URL_ALIGNERR.format(offset=offset),
                               origem="https://www.alignerr.com")
        except Exception as e:
            erros.append(f"offset {offset}: {e}")
            break
        lote = resposta.get("jobs") or []
        for v in lote:
            if v.get("id") and v["id"] not in vistos:
                vistos.add(v["id"])
                brutas.append(v)
        if len(lote) < 100:
            break
        time.sleep(0.2)

    if not brutas:
        print("FALHOU")
        for msg in erros:
            print(f"      · {msg}")
        return []

    # 1. um representante por título
    por_titulo = {}
    for v in brutas:
        titulo = (v.get("title") or "").strip()
        if titulo:
            por_titulo.setdefault(titulo, v)

    # 2. a vaga-mãe de cada título
    try:
        with open(ARQUIVO_MESTRES_ALIGNERR, "r", encoding="utf-8") as f:
            mestres = json.load(f)
    except Exception:
        mestres = {}
    conhecidos = mestres.get("titulos") or {}
    titulos_de_hoje = {}
    fora_titulo = 0
    for titulo, v in por_titulo.items():
        if (pais_estrangeiro(titulo) or idioma_estrangeiro(titulo)
                or (_REGIAO_NO_TITULO.search(titulo) and not _BRASIL.search(titulo))):
            fora_titulo += 1
            continue
        mid = conhecidos.get(titulo)
        if not mid:
            det = _detalhe_alignerr(URL_ALIGNERR_VAGA.format(id=v["id"]))
            time.sleep(pausa)
            if not det:
                continue                  # página falhou: tenta de novo na próxima rodada
            mid = det.get("masterJobId") or v["id"]
        titulos_de_hoje[titulo] = mid
    try:
        with open(ARQUIVO_MESTRES_ALIGNERR, "w", encoding="utf-8") as f:
            json.dump({"nota": "Alignerr: qual é a vaga-mãe de cada título. Gerado pelo coletor.",
                       "titulos": dict(sorted(titulos_de_hoje.items()))},
                      f, ensure_ascii=False, indent=1)
    except Exception:
        pass

    # 3. abre cada vaga-mãe uma vez só
    do_mestre = {}
    for titulo, mid in titulos_de_hoje.items():
        do_mestre.setdefault(mid, por_titulo[titulo])
    candidatas = []
    fora_local = 0
    for mid, v in do_mestre.items():
        url = URL_ALIGNERR_VAGA.format(id=mid)
        det = _detalhe_alignerr(url)
        time.sleep(pausa)
        if not det or det.get("isActive") is False:
            continue
        titulo = (det.get("name") or v.get("title") or "").strip()
        if not titulo or idioma_estrangeiro(titulo) or pais_estrangeiro(titulo):
            continue
        pais_vaga = (det.get("countryCode") or "").strip().upper()
        if pais_vaga and pais_vaga != "BR":
            fora_local += 1
            continue
        desc = limpar_html(det.get("longDescription")
                           or det.get("htmlLongDescription")
                           or v.get("description", ""))
        em_pt = bool(pais_vaga == "BR" or _BRASIL.search(titulo) or _PORTUGUES.search(titulo))
        if not em_pt and local_micro1(desc) == "fora":
            fora_local += 1
            continue

        categoria = (det.get("category") or v.get("category") or "").upper()
        candidatas.append({
            "titulo": titulo,
            "url": url,
            "local": "Remoto · Brasil" if em_pt else "Remoto · Mundial",
            "desc": desc,
            "requisitos": limpar_html(det.get("shortDescription") or ""),
            "data_post": (det.get("firstPostDate")
                          or det.get("createdAt") or "")[:10],
            "pagamento": v.get("pay") or "",
            "horario": det.get("jobType") or "",
            # A própria Alignerr separa as vagas em General, Audio, Coding e
            # Stem. As duas últimas são de especialista: se o classificador
            # não achar a área pelo título, a vaga vai para a área de reserva
            # em vez de cair na aba Vagas.
            "area_dica": ("Programacao e Software" if categoria == "CODING"
                          else "Outras areas" if categoria == "STEM" else ""),
        })

    vagas = deduplicar_por_nome(candidatas)
    print(f"{len(vagas)} vaga(s) de {len(brutas)} anúncios "
          f"({len(por_titulo)} títulos, {len(do_mestre)} vagas-mãe; "
          f"{fora_titulo} fora pelo título, {fora_local} fora pelo local)")
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
# Link da vaga. Outubro de 2026: o endereço /jobs?jobId={id}, que é o que o
# site põe na barra quando se clica num card, NÃO abre a vaga para quem chega
# de fora no celular ou em janela estreita: mostra só a lista geral, e a
# pessoa fica perdida. O site tem uma página própria de vaga, que funciona em
# qualquer tela:
#
#     https://work.turing.com/job/home?jobCode={jobCode}
#
# O endereço antigo continua guardado em "url_id" só para calcular o id da
# vaga, que nasce da URL. Sem isso, trocar o link mudaria o id de todas as
# vagas da Turing, e elas perderiam resumo, data e curadoria.

URL_TURING = "https://work.turing.com/api/jobs/all"
URL_TURING_VAGA = "https://work.turing.com/job/home?jobCode={codigo}"
URL_TURING_ID = "https://work.turing.com/jobs?jobId={id}"
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


def coletar_turing(termos=None, modo_area=False):
    """Busca na Turing e junta os resultados sem repetir.

    modo_area=True busca por formação em vez de idioma. A lista de países
    elegíveis continua mandando: sem Brasil na lista, a vaga não serve.
    """
    rotulo = "Turing (áreas)" if modo_area else "Turing"
    print(f"  → {rotulo} ...", end=" ")
    brutas, ids_vistos = [], set()
    houve_resposta = False
    erros = []

    for termo in (termos or TERMOS_TURING):
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
        elif modo_area:
            # Vaga de área: entra por exigir formação. Barra o que estiver
            # preso a outro país ou pedir outro idioma.
            if pais_estrangeiro(titulo) or idioma_estrangeiro(titulo):
                continue
            local = "Remoto · Mundial"
        else:
            # Sem lista de países: cai na regra geral do projeto. Título de
            # português entra (é remoto e aberto), Portugal explícito não.
            if not aceita_brasil(titulo, "remote", "", desc):
                continue
            local = "Remoto · Mundial"

        um_paga = _POR_HORA.search(desc)
        pagamento = um_paga.group(1).replace(" ", "") + " / hora" if um_paga else ""

        contrato = v.get("contract") or v.get("roleGroup") or ""
        url_antiga = URL_TURING_ID.format(id=v.get("id"))
        codigo = (v.get("jobCode") or v.get("public_code") or "").strip()
        vagas.append({
            "titulo": titulo,
            "url": URL_TURING_VAGA.format(codigo=codigo) if codigo else url_antiga,
            "url_id": url_antiga,
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


def _texto_imerit(valor):
    """Setembro de 2026: a iMerit passou a mandar responsibilities,
    requirements etc. como LISTA de itens em vez de texto. Aceita os dois
    formatos e devolve sempre texto, um item por linha."""
    if isinstance(valor, list):
        return "\n".join(_texto_imerit(i) for i in valor if i)
    return str(valor or "")


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
        blocos = [_texto_imerit(v.get(k)) for k in
                  ("description", "about", "responsibilities")]
        desc = limpar_html("\n\n".join(b for b in blocos if b))
        requisitos = limpar_html("\n".join(
            _texto_imerit(v.get(k)) for k in ("requirements", "nice_to_have")))

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
#  MERCOR  (work.mercor.com)
# ═══════════════════════════════════════════════════════════════════
#
# Outubro de 2026. A página /explore traz a lista INTEIRA de vagas dentro
# do bloco __NEXT_DATA__ (um JSON embutido no HTML), já com descrição,
# pagamento e os campos de país de cada uma. Uma requisição só resolve.
#
#     GET https://work.mercor.com/explore
#
# Até setembro a gente lia os links do HTML e ia pedindo ?page=2, ?page=3...
# A Mercor mudou a página: o HTML passou a mostrar só os 15 primeiros
# cartões e o ?page= deixou de fazer efeito. Resultado: o coletor via 15
# vagas de mais de 300, e vagas como a "Audiobook QA Expert — Portuguese
# (Brazil)" nunca entravam.
#
# Campos de país (lista vazia ou null = sem restrição):
#     "eligibleLocation":["USA"]            → só quem está nos EUA
#     "eligibleResidenceLocation":[...]     → só quem mora nesses países
#     "ineligibleLocation"/"ineligibleResidenceLocation" → quem NÃO pode
# O campo "location" é texto livre ("Remote", "Remote (US)", "Bay Area, CA")
# e "workArrangement" diz se é remoto, híbrido ou presencial.

URL_MERCOR = "https://work.mercor.com/explore"
URL_MERCOR_VAGA = "https://work.mercor.com/jobs/{id}/{slug}"
ORIGEM_MERCOR = "https://work.mercor.com"

_DADOS_MERCOR = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
# o endereço oficial de cada vaga, com o nome dela no fim
_URL_MERCOR = re.compile(r'"url":"(https://work\.mercor\.com/jobs/(list_[A-Za-z0-9_\-]+)/[A-Za-z0-9_\-]+)"')
_EH_BRASIL = re.compile(r"^(br|bra|brazil|brasil)$", re.I)
# português de Portugal, pedido de forma que exclui o brasileiro
_SEM_BRASILEIRO = re.compile(r"excluding\s+brazilian", re.I)
_FREQ_MERCOR = {"hourly": "hora", "per-task": "tarefa", "one-time": "pagamento único",
                "yearly": "ano", "monthly": "mês", "per-word": "palavra"}


def _listagens_mercor(html):
    """Acha a lista de vagas dentro do __NEXT_DATA__, onde quer que esteja."""
    m = _DADOS_MERCOR.search(html)
    if not m:
        return []
    dados = json.loads(m.group(1))
    consultas = (((dados.get("props") or {}).get("pageProps") or {})
                 .get("dehydratedState") or {}).get("queries") or []
    for c in consultas:
        d = (c.get("state") or {}).get("data")
        if isinstance(d, dict) and isinstance(d.get("listings"), list):
            return d["listings"]
    return []


def _slug_mercor(titulo):
    t = unicodedata.normalize("NFKD", titulo or "")
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-") or "vaga"


def aceita_mercor(v):
    """Decide se a vaga serve a quem mora no Brasil. Devolve (aceita, local)."""
    titulo = (v.get("title") or "").strip()
    local = v.get("location") or ""
    desc = (v.get("description") or "").replace("*", "")

    if (v.get("workArrangement") or "remote") != "remote":
        return False, ""
    tem_brasil_na_lista = False
    for campo in ("eligibleLocation", "eligibleResidenceLocation"):
        lista = v.get(campo) or []
        if lista:
            if not any(_EH_BRASIL.match(str(p).strip()) for p in lista):
                return False, ""
            tem_brasil_na_lista = True
    for campo in ("ineligibleLocation", "ineligibleResidenceLocation"):
        if any(_EH_BRASIL.match(str(p).strip()) for p in (v.get(campo) or [])):
            return False, ""

    brasil = bool(tem_brasil_na_lista or _BRASIL.search(titulo) or _BRASIL.search(local)
                  or _LATAM.search(titulo) or _LATAM.search(local))
    if not brasil:
        # o texto do local cita algum lugar que não é o Brasil ("Remote (US)")
        sobra = re.sub(r"[^a-zà-ú]+", "", _SO_REMOTO.sub(" ", _GLOBAL.sub(" ", local.lower())))
        if sobra:
            return False, ""
        if (pais_estrangeiro(titulo) or idioma_estrangeiro(titulo)
                or _REGIAO_NO_TITULO.search(titulo)):
            return False, ""
        if _SO_EUA.search(desc):
            return False, ""
    if _SEM_BRASILEIRO.search(titulo) or _SEM_BRASILEIRO.search(desc[:1500]):
        return False, ""
    return True, ("Remoto · Brasil" if brasil else "Remoto · Mundial")


def coletar_mercor(pausa=0.8, max_paginas=None):
    """Lê a lista inteira da Mercor e devolve as vagas que servem ao Brasil.

    A separação entre vaga geral e vaga de área é feita depois, no coletor.
    (pausa e max_paginas ficaram só para não quebrar quem chama.)
    """
    print("  → Mercor ...", end=" ")
    html = _baixar(URL_MERCOR, tipo_json=False, origem=ORIGEM_MERCOR)
    listagens = _listagens_mercor(html)
    if not listagens:
        raise RuntimeError("a página /explore veio sem a lista de vagas (mudou de formato?)")
    enderecos = {i: u for u, i in _URL_MERCOR.findall(html)}

    vagas, vistos = [], set()
    for v in listagens:
        jid = v.get("listingId")
        titulo = (v.get("title") or "").strip()
        if not jid or not titulo or jid in vistos:
            continue
        vistos.add(jid)
        if v.get("status") not in (None, "active") or v.get("isPrivate") or v.get("disableApplications"):
            continue
        aceita, local = aceita_mercor(v)
        if not aceita:
            continue

        pagamento = ""
        lo, hi = v.get("rateMin"), v.get("rateMax")
        freq = _FREQ_MERCOR.get(v.get("payRateFrequency") or "", v.get("payRateFrequency") or "")
        if lo and hi and lo != hi:
            pagamento = f"USD {lo:g}-{hi:g} / {freq}"
        elif lo or hi:
            pagamento = f"USD {(lo or hi):g} / {freq}"
        horas = v.get("hoursPerWeek")
        horario = " · ".join(x for x in [v.get("commitment") or "",
                                         f"{horas:g} h/semana" if horas else ""] if x)

        vagas.append({
            "titulo": titulo[:160],
            "local": local,
            "url": enderecos.get(jid) or URL_MERCOR_VAGA.format(id=jid, slug=_slug_mercor(titulo)),
            "desc": limpar_html(v.get("description") or ""),
            "requisitos": "",
            "pagamento": pagamento,
            "horario": horario,
            "data_post": (v.get("postedAt") or v.get("createdAt") or "")[:10],
        })

    print(f"{len(vagas)} vaga(s) de {len(vistos)} na lista")
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
                         ("MERCOR", coletar_mercor),
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
