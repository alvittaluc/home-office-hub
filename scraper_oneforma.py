#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  SCRAPER — OneForma (Fase 3)
═══════════════════════════════════════════════════════════════════
  O OneForma não tem API, então este programa "lê" a página de vagas
  (que é um WordPress bem organizado) e extrai as vagas.

  Estratégia de filtro Brasil:
  - "Worldwide" / "Global"  → aceita (mundo todo inclui o Brasil)
  - "US", "US only", etc.   → rejeita
  - "Selected Locations"    → abre a vaga e verifica se cita Brasil/Portuguese
  - Título/descrição com "Portuguese (Brazil)" → aceita direto

  Este arquivo é IMPORTADO pelo coletor.py (função coletar_oneforma).
═══════════════════════════════════════════════════════════════════
"""
import urllib.request
import urllib.parse
import re
import time
import html as html_lib

BASE = "https://www.oneforma.com/jobs/"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

# Localizações que significam "não é pra cá"
LOC_EXCLUI = ["us only", "u.s. only", "united states only", "us  us"]
# Localizações abertas (mundo todo)
LOC_MUNDO = ["worldwide", "global", "anywhere", "all locations"]


def _baixar(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="ignore")


def _extrair_vagas_da_pagina(html):
    """Extrai (categoria, titulo, local, descricao, url) de cada vaga na listagem.

    Cada vaga é um link <a href=".../jobs/SLUG/"> com o texto contendo
    categoria + titulo + localização (repetida 2x) + tipo de pagamento + descrição.
    """
    vagas = []
    # captura blocos <a ...href="https://www.oneforma.com/jobs/ALGO/">TEXTO</a>
    padrao = re.compile(
        r'<a[^>]+href="(https://www\.oneforma\.com/jobs/[^"/]+/)"[^>]*>(.*?)</a>',
        re.DOTALL | re.IGNORECASE
    )
    for m in padrao.finditer(html):
        url = m.group(1)
        # limpa tags internas e normaliza espaços
        texto = re.sub(r'<[^>]+>', ' ', m.group(2))
        texto = html_lib.unescape(texto)
        texto = re.sub(r'\s+', ' ', texto).strip()
        if not texto or "Learn more" not in texto and len(texto) < 20:
            continue
        # ignora links de navegação/rodapé
        if url.rstrip('/').endswith('/jobs'):
            continue
        vagas.append({"url": url, "texto_bruto": texto})
    return vagas


def _parse_vaga(texto_bruto):
    """Separa categoria, título e localização do texto bruto de uma vaga."""
    # Categorias conhecidas aparecem grudadas no início
    categorias = ["Annotation", "Translation", "Data Collection", "Transcription",
                  "Judging", "LLM Prompt Authoring"]
    categoria = ""
    resto = texto_bruto
    for c in categorias:
        if texto_bruto.startswith(c):
            categoria = c
            resto = texto_bruto[len(c):].strip()
            break

    # Remove "Learn more" do fim
    resto = re.sub(r'\s*Learn more\s*$', '', resto).strip()

    # A localização costuma aparecer repetida (ex: "US US", "Worldwide Worldwide")
    # e o tipo de pagamento também ("Fixed Rate Per Hour Fixed Rate Per Hour")
    # O título é o começo até a primeira localização repetida.
    loc_match = re.search(
        r'\b(Worldwide|Global|Selected Locations|US|United States|Anywhere|'
        r'[A-Z]{2,3})\s+\1\b', resto)
    if loc_match:
        titulo = resto[:loc_match.start()].strip()
        local = loc_match.group(1)
    else:
        titulo = resto
        local = ""

    return categoria, titulo, local


def _pagina_cita_brasil(url):
    """Abre a página individual da vaga e vê se cita Brasil/Português."""
    try:
        html = _baixar(url, timeout=25)
    except Exception:
        return None  # não conseguiu abrir → incerto
    # tira tags e procura menções
    texto = re.sub(r'<[^>]+>', ' ', html).lower()
    tem_brasil = any(t in texto for t in
                     ["brazil", "brasil", "portuguese (brazil)",
                      "brazilian portuguese", "pt-br"])
    # exclui se for explicitamente "portugal" sem brasil
    if "portugal" in texto and not tem_brasil:
        return False
    return tem_brasil


def _decidir_brasil(titulo, local, url, abrir_incertos=True):
    """Decide se a vaga serve para o Brasil.
    Retorna True (aceita), False (rejeita)."""
    ll = (local or "").lower()
    # 1. Título já diz Portuguese Brazil
    if any(t in titulo.lower() for t in
           ["portuguese (brazil)", "brazilian portuguese", "brazil", "pt-br"]):
        return True
    # 2. Mundo todo → inclui Brasil
    if any(w in ll for w in ["worldwide", "global", "anywhere", "all locations"]):
        return True
    # 3. Só EUA ou outro país único claramente ≠ Brasil
    if local.strip() in ("US", "United States", "UK", "Canada", "India"):
        return False
    if "us only" in ll or "united states only" in ll:
        return False
    # 4. "Selected Locations" ou incerto → abre a página se permitido
    if abrir_incertos:
        r = _pagina_cita_brasil(url)
        if r is not None:
            return r
    # 5. fallback: não dá pra confirmar Brasil → rejeita (evita lixo)
    return False


def coletar_oneforma(max_paginas=8, abrir_incertos=True, pausa=1.0):
    """Retorna vagas do OneForma JÁ FILTRADAS para o Brasil.

    abrir_incertos: se True, abre páginas 'Selected Locations' p/ confirmar Brasil.
                    Mais preciso, um pouco mais lento.
    Formato de saída compatível com o coletor principal.
    """
    print("  → OneForma (scraping) ...")
    cruas = []
    for pagina in range(1, max_paginas + 1):
        url = BASE if pagina == 1 else f"{BASE}page/{pagina}/"
        try:
            html = _baixar(url)
        except Exception as e:
            print(f"    página {pagina}: falhou ({str(e)[:40]})")
            break
        vagas_pg = _extrair_vagas_da_pagina(html)
        if not vagas_pg:
            break
        for v in vagas_pg:
            cat, titulo, local = _parse_vaga(v["texto_bruto"])
            if not titulo:
                continue
            cruas.append({"categoria_of": cat, "titulo": titulo,
                          "local": local, "url": v["url"]})
        time.sleep(pausa)

    # dedup por url
    vistos = set(); unicas = []
    for v in cruas:
        if v["url"] in vistos: continue
        vistos.add(v["url"]); unicas.append(v)

    # filtra Brasil
    aprovadas = []
    for v in unicas:
        if _decidir_brasil(v["titulo"], v["local"], v["url"], abrir_incertos):
            aprovadas.append(v)
            if abrir_incertos:
                time.sleep(0.5)  # educado ao abrir páginas

    print(f"    {len(aprovadas)} vaga(s) BR de {len(unicas)} lidas")
    return aprovadas


if __name__ == "__main__":
    vagas = coletar_oneforma(max_paginas=2, abrir_incertos=False)
    for v in vagas[:10]:
        print(f"  [{v['categoria_of']}] {v['titulo'][:50]} | {v['local']}")
