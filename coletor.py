#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  HOME OFFICE HUB — Coletor de Vagas (Fase 1)
═══════════════════════════════════════════════════════════════════

  O que este programa faz:
  1. Busca vagas nas empresas via API pública (Lever e Workable)
  2. Filtra SÓ vagas para o Brasil / em Português (Brazil)
  3. Remove vagas duplicadas
  4. Salva tudo num arquivo 'vagas.json' que o site lê

  As vagas que fecharam somem sozinhas (a API só devolve as abertas).

  Como rodar:
      python3 coletor.py

  Não precisa instalar nada — usa só o que já vem no Python.
═══════════════════════════════════════════════════════════════════
"""

import urllib.request
import urllib.error
import json
import re
import time
from datetime import datetime, timezone

# ═══════════════════════════════════════════════════════════════════
#  CONFIGURAÇÃO — edite aqui para adicionar/remover empresas
# ═══════════════════════════════════════════════════════════════════

# Empresas que usam LEVER (slug = nome na URL jobs.lever.co/SLUG)
EMPRESAS_LEVER = {
    "welocalize": "weloglobal",   # jobs.lever.co/weloglobal
    "rws":        "rws",          # jobs.lever.co/rws
    # "crowdgen": "appen",        # descomente se quiser testar
}

# Empresas que usam WORKABLE (slug = nome na URL apply.workable.com/SLUG)
EMPRESAS_WORKABLE = {
    "toloka": "toloka-annotators",  # apply.workable.com/toloka-annotators
}

# ═══════════════════════════════════════════════════════════════════
#  FILTRO BRASIL / PORTUGUÊS
#  Uma vaga só entra se casar com um destes termos.
#  (deixamos amplo de propósito e depois refinamos)
# ═══════════════════════════════════════════════════════════════════

TERMOS_BRASIL = [
    "brazil", "brasil",
    "portuguese (brazil)", "portuguese brazil", "pt-br", "ptbr",
    "brazilian portuguese", "português", "portugues",
    "são paulo", "sao paulo", "rio de janeiro",
    "belo horizonte", "brasília", "brasilia",
]

# Termos que, se aparecerem SOZINHOS na localização, indicam que
# NÃO é pra cá (evita pegar "Portugal", "Portuguese (Portugal)" etc.)
TERMOS_EXCLUIR = [
    "portugal", "portuguese (portugal)", "lisbon", "lisboa", "porto,",
]


def texto_parece_brasil(*partes) -> bool:
    """Retorna True se algum pedaço de texto indicar vaga para o Brasil."""
    alvo = " ".join(p for p in partes if p).lower()

    # Primeiro exclui Portugal e afins
    for termo in TERMOS_EXCLUIR:
        if termo in alvo:
            # Só exclui se NÃO tiver também menção clara ao Brasil
            if not any(b in alvo for b in ["brazil", "brasil", "(brazil)"]):
                return False

    # Depois inclui se bater com termo Brasil
    return any(termo in alvo for termo in TERMOS_BRASIL)


# ═══════════════════════════════════════════════════════════════════
#  CATEGORIZAÇÃO — decide o "selo" e a área da vaga pelo título
# ═══════════════════════════════════════════════════════════════════

def categorizar(titulo: str) -> tuple:
    """Retorna (categoria_id, rotulo_badge) com base no título da vaga."""
    t = titulo.lower()
    if any(w in t for w in ["translat", "tradut", "localiz", "linguist", "language"]):
        return ("transl", "Tradução")
    if any(w in t for w in ["quality", "qa ", "rater", "evaluat", "review", "audit", "safety"]):
        return ("qa", "QA")
    if any(w in t for w in ["subject matter", "sme", "expert"]):
        return ("sme", "Especialista")
    if any(w in t for w in ["writer", "writing", "author", "content creat"]):
        return ("write", "Escrita")
    if any(w in t for w in ["annotat", "data", "labell", "label", "dubber",
                             "audio", "voice", "speech", "trainer", "video", "image"]):
        return ("ai", "IA & Dados")
    return ("ai", "IA & Dados")  # padrão


def limpar_local(texto: str) -> str:
    """Simplifica a localização para exibição."""
    if not texto:
        return "Remoto · Brasil"
    texto = texto.replace("Remote", "Remoto").strip(" -–—/")
    low = texto.lower()
    # Se menciona Brasil, formata bonito
    if "brazil" in low or "brasil" in low:
        return texto if "remoto" in low else f"Remoto · {texto}"
    # Se é só "Remoto" ou vazio, assume Brasil (já passou no filtro)
    if low in ("remoto", "", "remote"):
        return "Remoto · Brasil"
    # Caso tenha uma cidade brasileira mas sem "Brasil"
    return f"Remoto · {texto}"


# ═══════════════════════════════════════════════════════════════════
#  BUSCA — Lever
# ═══════════════════════════════════════════════════════════════════

def buscar_lever(nome_interno: str, slug: str) -> list:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    print(f"  → Lever: {slug} ...", end=" ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            dados = json.loads(r.read().decode())
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    vagas = []
    for v in dados:
        titulo = v.get("text", "").strip()
        cats = v.get("categories", {}) or {}
        local = cats.get("location", "") or ""
        all_locs = " ".join(cats.get("allLocations", []) or [])
        commitment = cats.get("commitment", "") or ""

        # FILTRO BRASIL
        if not texto_parece_brasil(titulo, local, all_locs):
            continue

        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": nome_interno,
            "titulo": titulo,
            "local": limpar_local(local),
            "categoria": cat_id,
            "badge": badge,
            "url": v.get("hostedUrl") or v.get("applyUrl") or "",
            "commitment": commitment,
        })
    print(f"{len(vagas)} vaga(s) BR de {len(dados)} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  BUSCA — Workable
# ═══════════════════════════════════════════════════════════════════

def buscar_workable(nome_interno: str, slug: str) -> list:
    url = f"https://apply.workable.com/api/v1/widget/accounts/{slug}"
    print(f"  → Workable: {slug} ...", end=" ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            dados = json.loads(r.read().decode())
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    jobs = dados.get("jobs", []) if isinstance(dados, dict) else []
    vagas = []
    for v in jobs:
        titulo = v.get("title", "").strip()
        local_obj = v.get("location", {}) or {}
        # location pode vir como string ou objeto
        if isinstance(local_obj, dict):
            local = local_obj.get("location_str", "") or \
                    ", ".join(filter(None, [local_obj.get("city", ""),
                                            local_obj.get("country", "")]))
        else:
            local = str(local_obj)
        estado = v.get("state", "published")

        if estado and estado != "published":
            continue
        if not texto_parece_brasil(titulo, local):
            continue

        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": nome_interno,
            "titulo": titulo,
            "local": limpar_local(local),
            "categoria": cat_id,
            "badge": badge,
            "url": v.get("url") or v.get("shortlink") or "",
            "commitment": "",
        })
    print(f"{len(vagas)} vaga(s) BR de {len(jobs)} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  REMOVER DUPLICADAS
# ═══════════════════════════════════════════════════════════════════

def remover_duplicadas(vagas: list) -> list:
    vistas = set()
    unicas = []
    for v in vagas:
        chave = (v["empresa"], v["titulo"].lower().strip())
        if chave in vistas:
            continue
        vistas.add(chave)
        unicas.append(v)
    return unicas


# ═══════════════════════════════════════════════════════════════════
#  PROGRAMA PRINCIPAL
# ═══════════════════════════════════════════════════════════════════

def main():
    print("═" * 60)
    print("  HOME OFFICE HUB — Coletor de Vagas")
    print("═" * 60)
    print(f"  Início: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")

    todas = []

    print("[1/2] Buscando em empresas Lever...")
    for nome, slug in EMPRESAS_LEVER.items():
        todas += buscar_lever(nome, slug)
        time.sleep(1)  # educado com a API

    print("\n[2/2] Buscando em empresas Workable...")
    for nome, slug in EMPRESAS_WORKABLE.items():
        todas += buscar_workable(nome, slug)
        time.sleep(1)

    print(f"\n  Total bruto: {len(todas)} vagas")
    todas = remover_duplicadas(todas)
    print(f"  Após remover duplicadas: {len(todas)} vagas")

    # Monta a estrutura final
    resultado = {
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
        "atualizado_br": datetime.now().strftime("%d/%m/%Y às %H:%M"),
        "total": len(todas),
        "vagas": todas,
    }

    with open("vagas.json", "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"\n  ✓ Salvo em 'vagas.json'")
    print("═" * 60)

    # Resumo por empresa
    print("\n  RESUMO POR EMPRESA:")
    contagem = {}
    for v in todas:
        contagem[v["empresa"]] = contagem.get(v["empresa"], 0) + 1
    for emp, qtd in sorted(contagem.items()):
        print(f"    • {emp}: {qtd} vaga(s)")
    print()


if __name__ == "__main__":
    main()
