#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  SCRAPER — Rex.zone / RemoExperts (Fase 3)
═══════════════════════════════════════════════════════════════════
  API descoberta (via F12):
    https://www.rex.zone/api/job/job-list?page=1&limit=100

  Estrutura de cada vaga:
    { jobNo, jobTitle, jobCategory:[...], countries:[...],
      isRemote, jobId, ... }

  Filtro aplicado:
    (1) ACEITA BRASIL: countries contém "ALL" ou "Brazil"
    (2) É DO NICHO: categoria/título de IA, dados, anotação, LLM,
        avaliação, tradução, etc. (evita advogado/médico/ator puros
        que não são o foco do hub)

  Link de cada vaga:
    https://www.rex.zone/open-opportunities  (a plataforma abre a vaga
    pelo jobNo; usamos a página geral + âncora do jobNo)

  Este arquivo é IMPORTADO pelo coletor.py (função coletar_rexzone).
═══════════════════════════════════════════════════════════════════
"""
import urllib.request
import json
import ssl

# Correção de SSL no Windows (ver explicação no coletor.py)
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

API_URL = "https://www.rex.zone/api/job/job-list?page=1&limit=100"
# link da vaga: a plataforma lista tudo em /open-opportunities.
# Cada vaga tem um jobNo (ex: JOB062); a página abre pelo número.
LINK_BASE = "https://www.rex.zone/open-opportunities"

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.rex.zone/open-opportunities",
}

# Categorias (jobCategory) que são do NOSSO NICHO (IA/dados/anotação)
CATEGORIAS_NICHO = {
    "GENERAL", "COMPUTER_SCIENCE", "AI", "DATA", "LANGUAGE", "LINGUISTICS",
    "TRANSLATION", "ARTS_DESIGN",  # design entra por causa de anotação visual
}

# Palavras no TÍTULO que indicam nicho (reforço, caso a categoria seja outra)
PALAVRAS_NICHO = [
    "ai trainer", "ai specialist", "annotat", "data", "llm", "rlhf",
    "trainer", "evaluat", "labeling", "labelling", "prompt",
    "transcription", "translat", "linguist", "speech", "audio",
    "search quality", "rater", "content", "generalist", "code annotator",
    "machine learning", "computer vision", "nlp",
]

# Títulos/áreas que NÃO são do nicho (mesmo aceitando Brasil) — evita ruído
PALAVRAS_FORA = [
    "actuarial", "insurance", "clinical medicine", "financial analyst",
    "legal & compliance", "photoshop",
]


def _baixar_json(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8", errors="ignore"))


def _aceita_brasil(countries):
    """countries é uma lista. Aceita se tem 'ALL' ou 'Brazil'/'Brasil'."""
    if not countries:
        return False
    baixo = [str(c).strip().lower() for c in countries]
    if "all" in baixo:
        return True
    return "brazil" in baixo or "brasil" in baixo


def _eh_nicho(titulo, categorias):
    """Decide se a vaga é do nosso nicho (IA/dados/anotação)."""
    t = (titulo or "").lower()

    # exclui explicitamente áreas fora do foco
    for fora in PALAVRAS_FORA:
        if fora in t:
            return False

    # aceita se a categoria bate
    cats = set(str(c).strip().upper() for c in (categorias or []))
    if cats & CATEGORIAS_NICHO:
        return True

    # ou se o título tem palavra do nicho
    for p in PALAVRAS_NICHO:
        if p in t:
            return True

    return False


def coletar_rexzone():
    """Busca as vagas do Rex.zone, filtrando nicho + aceita Brasil.
    Retorna lista de dicts crus: {titulo, categoria_rex, url, jobno}."""
    print("  → Rex.zone (API) ...", end=" ")
    try:
        dados = _baixar_json(API_URL)
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    jobs = []
    if isinstance(dados, dict):
        jobs = dados.get("data", {}).get("jobs", []) or []

    total_bruto = len(jobs)
    aprovadas = []
    for v in jobs:
        titulo = (v.get("jobTitle") or "").strip()
        countries = v.get("countries", []) or []
        categorias = v.get("jobCategory", []) or []
        jobno = v.get("jobNo") or ""

        if not titulo:
            continue
        # (1) aceita Brasil?
        if not _aceita_brasil(countries):
            continue
        # (2) é do nicho?
        if not _eh_nicho(titulo, categorias):
            continue

        aprovadas.append({
            "titulo": titulo,
            "categoria_rex": categorias[0] if categorias else "",
            "url": LINK_BASE,   # a plataforma abre a vaga pela listagem
            "jobno": jobno,
            "data_post": v.get("publishTime") or "",
            "desc": v.get("jobDescription") or "",
            "req": v.get("requirements") or "",
            "comp": v.get("compensation") or "",
        })

    print(f"{len(aprovadas)} vaga(s) BR de {total_bruto} total")
    return aprovadas


if __name__ == "__main__":
    vagas = coletar_rexzone()
    for v in vagas:
        print(f"  • [{v['categoria_rex']}] {v['titulo']}  ({v['jobno']})")
