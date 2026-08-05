#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  SCRAPER — OneForma (site novo, 2026)
═══════════════════════════════════════════════════════════════════
  A OneForma reformulou o site. Agora existe filtro de país na URL:

    https://www.oneforma.com/projects/?country=brazil
    https://www.oneforma.com/projects/page/2/?country=brazil

  Isso simplifica muito: TODAS as vagas dessa URL já aceitam o Brasil.
  Não precisamos mais adivinhar pelo texto nem abrir páginas incertas.

  Cada projeto na listagem traz:
    - Domínio e tipo (ex: "Languages Transcription")
    - Título com link para /projects/{slug}/
    - Descrição limpa, de uma ou duas frases
    - Lista de países onde está disponível
    - Carga horária, quando informada
    - Tipo de pagamento (por hora, por item aprovado, por palavra)

  Importado pelo coletor.py através da função coletar_oneforma().
═══════════════════════════════════════════════════════════════════
"""
import urllib.request
import re
import ssl
import time
import html as _html

# Correção de SSL no Windows
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

BASE = "https://www.oneforma.com"
URL_PAGINA_1 = BASE + "/projects/?country=brazil"
URL_PAGINA_N = BASE + "/projects/page/{n}/?country=brazil"

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

# Marcadores de pagamento que aparecem nos cards
PADRAO_PAGAMENTO = re.compile(
    r"(\$[\d.,]+\s*[\u2013\-\u2014]\s*\$?[\d.,]+\s*/\s*\w+"   # $0.012-$0.033/word
    r"|Fixed rate per [a-z ]+?(?=\s*(?:Apply|$))"              # Fixed rate per hour
    r"|Per hour|Per word|Per completion|Per approved asset)",
    re.IGNORECASE,
)

# Carga horária (ex: "10 hours per week", "2 hours per day", "Flexible")
PADRAO_HORARIO = re.compile(
    r"(\d+\s*[\u2013\-\u2014]?\s*\d*\s*hours? per (?:week|day|month)"
    r"|Flexible[^.]{0,40})",
    re.IGNORECASE,
)


def _baixar(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as r:
        return r.read().decode("utf-8", errors="ignore")


def _texto(trecho_html):
    """Remove tags HTML e normaliza os espaços."""
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", trecho_html,
               flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = _html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def _extrair_projetos(html_pagina):
    """Encontra os projetos na página e devolve uma lista de dicts."""
    # Casa a abertura completa da tag <a>, para que o bloco comece no "<a"
    # e o texto do link (o título) possa ser lido logo em seguida.
    padrao_link = re.compile(
        r'<a\b[^>]*href="(?:https?://(?:www\.)?oneforma\.com)?'
        r'(/projects/([a-z0-9\-]+)/)"[^>]*>',
        re.IGNORECASE,
    )

    ocorrencias = []          # (posicao, slug, url)
    vistos = set()
    for m in padrao_link.finditer(html_pagina):
        slug = m.group(2).lower()
        if slug in ("page", "projects"):
            continue
        if slug in vistos:
            continue          # só a primeira aparição de cada projeto
        vistos.add(slug)
        ocorrencias.append((m.start(), slug, BASE + m.group(1)))

    projetos = []
    for i, (pos, slug, url) in enumerate(ocorrencias):
        fim = ocorrencias[i + 1][0] if i + 1 < len(ocorrencias) else len(html_pagina)
        bloco = html_pagina[pos:fim]
        texto = _texto(bloco)
        if not texto:
            continue

        # ─── título ───
        # É o texto do primeiro link do bloco, normalmente dentro de um h3.
        titulo = ""
        m_titulo = re.search(r"<a[^>]*>(.*?)</a>", bloco, flags=re.S | re.I)
        if m_titulo:
            titulo = _texto(m_titulo.group(1))
        if not titulo or len(titulo) < 3 or titulo.lower() == "apply":
            titulo = slug.replace("-", " ").title()   # reserva

        # ─── países, descrição ───
        paises, horario = "", ""
        descricao = texto
        m_paises = re.search(r"Available in \d+ countr(?:y|ies)(.*)",
                             texto, flags=re.I)
        if m_paises:
            descricao = texto[:m_paises.start()]
            depois = m_paises.group(1)
            # o trecho de países vai até o tipo de pagamento
            m_pag = PADRAO_PAGAMENTO.search(depois)
            seg = depois[:m_pag.start()] if m_pag else depois
            # dentro desse trecho, o que vier depois dos países é a carga horária
            m_hor = PADRAO_HORARIO.search(seg)
            if m_hor:
                paises = seg[:m_hor.start()].strip()
                horario = m_hor.group(1).strip()
            else:
                paises = seg.strip()

        # tira o título do começo da descrição
        idx = descricao.find(titulo)
        if idx >= 0:
            descricao = descricao[idx + len(titulo):]
        # tira a prévia de países no fim (ex: "Brazil · China +20")
        descricao = re.sub(
            r"[A-Z][A-Za-z ]*(?:\u00b7 [A-Z][A-Za-z ]*)*\+\s*\d+\s*$",
            "", descricao).strip()
        descricao = descricao.strip(" \u00b7-\u2014|")

        # ─── pagamento ───
        m_pag_txt = PADRAO_PAGAMENTO.search(texto)
        pagamento = m_pag_txt.group(1).strip() if m_pag_txt else ""

        projetos.append({
            "titulo": titulo,
            "url": url,
            "desc": descricao,
            "paises": paises,
            "pagamento": pagamento,
            "horario": horario,
            "local": "Remoto \u00b7 Brasil",
        })

    return projetos


def coletar_oneforma(max_paginas=6, abrir_incertos=False, pausa=1.0):
    """Coleta os projetos da OneForma abertos para o Brasil.

    O parâmetro abrir_incertos existe só por compatibilidade com o coletor
    antigo. No site novo ele não é usado, porque o filtro de país da URL
    já garante que toda vaga listada aceita o Brasil.
    """
    print("  \u2192 OneForma (pais=brazil) ...", end=" ")
    todos = []
    urls_vistas = set()

    for n in range(1, max_paginas + 1):
        url = URL_PAGINA_1 if n == 1 else URL_PAGINA_N.format(n=n)
        try:
            html_pagina = _baixar(url)
        except Exception as e:
            if n == 1:
                print(f"FALHOU ({str(e)[:40]})")
                return []
            break     # páginas seguintes podem simplesmente não existir

        projetos = _extrair_projetos(html_pagina)
        novos = [p for p in projetos if p["url"] not in urls_vistas]
        for p in novos:
            urls_vistas.add(p["url"])
        todos += novos

        if not novos:
            break     # acabou a paginação
        time.sleep(pausa)

    print(f"{len(todos)} vaga(s) para o Brasil")
    return todos


if __name__ == "__main__":
    vagas = coletar_oneforma()
    for v in vagas:
        print(f"\n- {v['titulo']}")
        print(f"  {v['url']}")
        print(f"  pagamento: {v['pagamento']} | horario: {v['horario']}")
        print(f"  desc: {v['desc'][:130]}")
