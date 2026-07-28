#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  SCRAPER — Telus International / TELUS Digital (Fase 3)
═══════════════════════════════════════════════════════════════════
  A Telus carrega as vagas via JavaScript, MAS tem uma "API escondida":
  basta adicionar .json na URL de busca por país.

  Endpoint descoberto:
    https://jobs.telusdigital.com/search/jobs/in/country/brazil.json

  Retorna JSON com:
    { "current_page":1, "per_page":25, "total_entries":N,
      "entries":[ {"id","permalink","title","location":{"country","name",...}}, ... ] }

  O link de cada vaga se monta como:
    https://jobs.telusdigital.com/jobs/{id}-{permalink}

  Este arquivo é IMPORTADO pelo coletor.py (função coletar_telus).
═══════════════════════════════════════════════════════════════════
"""
import urllib.request
import json
import time

BASE_JSON = "https://jobs.telusdigital.com/search/jobs/in/country/brazil.json"
JOB_URL = "https://jobs.telusdigital.com/jobs/{id}-{permalink}"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "identity",
    # finge que a chamada veio de dentro do próprio site da Telus
    "Referer": "https://jobs.telusdigital.com/search/jobs/in/country/brazil",
    "X-Requested-With": "XMLHttpRequest",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}


def _baixar_json(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", errors="ignore"))


def coletar_telus(max_paginas=10, pausa=1.0):
    """Busca as vagas de Brasil da Telus via a API .json (com paginação).

    Retorna lista de dicts crus: {titulo, local, url, id}
    Já vem filtrado por Brasil (a própria URL filtra por país).
    """
    print("  → Telus (API .json) ...", end=" ")
    todas = []
    pagina = 1
    while pagina <= max_paginas:
        # a plataforma aceita ?page=N para paginar
        url = BASE_JSON if pagina == 1 else f"{BASE_JSON}?page={pagina}"
        try:
            dados = _baixar_json(url)
        except Exception as e:
            if pagina == 1:
                print(f"FALHOU ({str(e)[:40]})")
                return []
            break  # acabou a paginação

        entries = dados.get("entries", []) if isinstance(dados, dict) else []
        if not entries:
            break

        for v in entries:
            titulo = (v.get("title") or "").strip()
            loc = v.get("location", {}) or {}
            pais = (loc.get("country") or "").strip()
            nome_local = (loc.get("name") or "").strip()
            jid = v.get("id") or v.get("talemetry_job_id") or ""
            permalink = v.get("permalink") or ""

            # segurança extra: confirma que é Brasil
            texto_local = f"{pais} {nome_local} {titulo}".lower()
            if "brazil" not in texto_local and "brasil" not in texto_local:
                # a URL já filtra por país, mas garantimos
                if pais.lower() not in ("brazil", "brasil", ""):
                    continue

            # monta o link da vaga
            if jid and permalink:
                link = JOB_URL.format(id=jid, permalink=permalink)
            else:
                link = "https://jobs.telusdigital.com/search/jobs/in/country/brazil"

            # local de exibição (limpa "Home Office- Brazil" → "Brasil")
            if nome_local:
                low = nome_local.lower()
                if "home office" in low or "remote" in low or "remoto" in low:
                    local_exib = "Remoto · Brasil"
                else:
                    local_exib = nome_local
            elif pais:
                local_exib = "Remoto · Brasil"
            else:
                local_exib = "Remoto · Brasil"

            todas.append({
                "titulo": titulo,
                "local": local_exib,
                "url": link,
                "id": jid,
            })

        # verifica se há mais páginas
        total = dados.get("total_entries", len(todas))
        per_page = dados.get("per_page", 25)
        if pagina * per_page >= total:
            break
        pagina += 1
        time.sleep(pausa)

    # dedup por id
    vistos = set(); unicas = []
    for v in todas:
        chave = v["id"] or v["titulo"]
        if chave in vistos: continue
        vistos.add(chave); unicas.append(v)

    print(f"{len(unicas)} vaga(s) BR")
    return unicas


if __name__ == "__main__":
    vagas = coletar_telus()
    for v in vagas:
        print(f"  • {v['titulo']} | {v['local']}")
        print(f"    {v['url']}")
