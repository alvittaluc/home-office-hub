#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pulso do Hub — rotina diária.

Lê o agregado anônimo do Worker, cruza com o vagas.json e escreve o pulso.json,
que é o único arquivo que o site lê. O contrato desse arquivo está descrito em
claude/PULSO.md e não muda quando o site migrar para banco de dados.

Roda logo depois do coletor.py, dentro do atualizar-vagas.yml.

Regra de ouro, herdada do resumos_novos.json: NUNCA sobrescrever um arquivo bom
com um arquivo parcial. Sem chave, sem rede ou com resposta estranha, esta rotina
mantém o pulso.json da véspera e sai com sucesso.

Variáveis de ambiente esperadas (segredos do GitHub):
    PULSO_URL     endereço do Worker, ex: https://pulso.exemplo.workers.dev
    PULSO_CHAVE   o mesmo valor do CHAVE_LEITURA configurado no Worker
"""

import json
import math
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

# ═══════════════════════════════════════════════════════════════════
#  Ajustes da fórmula. Mexer aqui muda o comportamento do destaque.
# ═══════════════════════════════════════════════════════════════════

JANELA_DIAS = 21          # período considerado no cálculo
DIAS_PARA_MADURAR = 12    # tempo mínimo para uma aplicação poder ter resposta
PISO_APLICACOES = 5       # abaixo disso a vaga nem é considerada
DESTAQUES_MIN = 2         # com menos que isso, a faixa some da página
DESTAQUES_MAX = 5
POR_EMPRESA_MAX = 2       # teto de vagas da mesma empresa na faixa
DIAS_EM_DESTAQUE = 10     # tempo máximo seguido em destaque
DIAS_DE_QUARENTENA = 14   # descanso obrigatório depois disso

PESO_INTERESSE = 0.45
PESO_RETORNO = 0.55
MEIA_VIDA_DIAS = 30.0     # frescor cai pela metade a cada 30 dias
TETO_DE_RETORNO = 0.5     # 50% de retorno já vale nota máxima

SELO_ALTA_MIN_APLICACOES = 8
SELO_ALTA_MIN_INTERESSE = 0.60
SELO_RESPONDE_MIN_MADURAS = 5
SELO_RESPONDE_MIN_TAXA = 0.25

ARQ_VAGAS = "vagas.json"
ARQ_PULSO = "pulso.json"

HOJE = date.today()

_CTX = ssl.create_default_context()
try:
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    pass


# ═══════════════════════════════════════════════════════════════════
#  Leitura
# ═══════════════════════════════════════════════════════════════════

def ler_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def buscar_agregado(url, chave):
    """Devolve o dicionário de vagas do Worker, ou None se algo falhar."""
    endereco = url.rstrip("/") + "/agregado"
    req = urllib.request.Request(endereco, headers={
        "x-pulso-chave": chave,
        "User-Agent": "home-office-hub/pulso",
    })
    try:
        with urllib.request.urlopen(req, timeout=30, context=_CTX) as r:
            dados = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"  ! Worker respondeu {e.code}. Mantendo o pulso.json anterior.")
        return None
    except Exception as e:
        print(f"  ! Não foi possível falar com o Worker ({str(e)[:60]}).")
        return None

    vagas = dados.get("vagas")
    if not isinstance(vagas, dict):
        print("  ! Resposta do Worker sem o campo vagas. Nada será reescrito.")
        return None
    return vagas


def data_da_vaga(v):
    for campo in ("data_ref", "data_post", "data_vista"):
        bruto = v.get(campo)
        if not bruto:
            continue
        try:
            return datetime.strptime(str(bruto)[:10], "%Y-%m-%d").date()
        except ValueError:
            continue
    return None


# ═══════════════════════════════════════════════════════════════════
#  Cálculo
# ═══════════════════════════════════════════════════════════════════

def dentro_da_janela(datas, inicio):
    saida = []
    for d in datas:
        try:
            dia = datetime.strptime(d[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        if dia >= inicio:
            saida.append(dia)
    return saida


def medir(vagas_abertas, agregado):
    """Devolve a lista de vagas acima do piso, já pontuadas."""
    inicio = HOJE - timedelta(days=JANELA_DIAS)
    limite_maduro = HOJE - timedelta(days=DIAS_PARA_MADURAR)

    crus = []
    for vaga_id, info in vagas_abertas.items():
        sinal = agregado.get(vaga_id)
        if not sinal:
            continue

        aplicou = dentro_da_janela(sinal.get("aplicou", []), inicio)
        if len(aplicou) < PISO_APLICACOES:
            continue

        resposta = dentro_da_janela(sinal.get("resposta", []), inicio)
        maduras = [d for d in aplicou if d <= limite_maduro]

        crus.append({
            "id": vaga_id,
            "empresa": info["empresa"],
            "a": len(aplicou),
            "a_mad": len(maduras),
            "r": len(resposta),
            "dias": info["dias"],
        })

    if not crus:
        return []

    a_max = max(c["a"] for c in crus)
    medidas = []

    for c in crus:
        interesse = math.log(1 + c["a"]) / math.log(1 + a_max) if a_max > 1 else 1.0
        retorno_bruto = (c["r"] + 1) / (c["a_mad"] + 4)
        retorno = min(retorno_bruto / TETO_DE_RETORNO, 1.0)
        frescor = 0.5 ** (c["dias"] / MEIA_VIDA_DIAS)
        pontos = (PESO_INTERESSE * interesse + PESO_RETORNO * retorno) * frescor

        selos = []
        if c["a"] >= SELO_ALTA_MIN_APLICACOES and interesse >= SELO_ALTA_MIN_INTERESSE:
            selos.append("alta")
        if (c["a_mad"] >= SELO_RESPONDE_MIN_MADURAS
                and c["r"] / c["a_mad"] >= SELO_RESPONDE_MIN_TAXA):
            selos.append("responde")

        medidas.append({
            "id": c["id"],
            "empresa": c["empresa"],
            "pontos": round(pontos, 4),
            "selos": selos,
        })

    medidas.sort(key=lambda m: m["pontos"], reverse=True)
    return medidas


def escolher_destaques(medidas, anterior):
    """Aplica quarentena, rodízio e teto por empresa."""
    quarentena = {}
    for vaga_id, ate in (anterior.get("quarentena") or {}).items():
        try:
            if datetime.strptime(ate, "%Y-%m-%d").date() > HOJE:
                quarentena[vaga_id] = ate
        except (ValueError, TypeError):
            continue

    desde_anterior = {
        d["id"]: d.get("desde")
        for d in (anterior.get("destaques") or [])
        if isinstance(d, dict) and d.get("id")
    }

    escolhidos = []
    por_empresa = {}

    for m in medidas:
        if not m["selos"]:
            continue
        if m["id"] in quarentena:
            continue

        empresa = m["empresa"]
        if por_empresa.get(empresa, 0) >= POR_EMPRESA_MAX:
            continue

        desde = desde_anterior.get(m["id"]) or HOJE.isoformat()
        try:
            entrou = datetime.strptime(desde, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            entrou = HOJE

        # tempo de prateleira esgotado: sai e descansa
        if (HOJE - entrou).days >= DIAS_EM_DESTAQUE:
            fim = HOJE + timedelta(days=DIAS_DE_QUARENTENA)
            quarentena[m["id"]] = fim.isoformat()
            continue

        escolhidos.append({
            "id": m["id"],
            "posicao": len(escolhidos) + 1,
            "selos": m["selos"],
            "desde": desde,
        })
        por_empresa[empresa] = por_empresa.get(empresa, 0) + 1

        if len(escolhidos) >= DESTAQUES_MAX:
            break

    if len(escolhidos) < DESTAQUES_MIN:
        escolhidos = []

    return escolhidos, quarentena


# ═══════════════════════════════════════════════════════════════════
#  Execução
# ═══════════════════════════════════════════════════════════════════

def main():
    print("\n=== Pulso do Hub ===")

    url = os.environ.get("PULSO_URL", "").strip()
    chave = os.environ.get("PULSO_CHAVE", "").strip()
    anterior = ler_json(ARQ_PULSO, {})

    if not url or not chave:
        print("  Pulso desligado (PULSO_URL ou PULSO_CHAVE ausentes). Nada a fazer.")
        return 0

    dados_vagas = ler_json(ARQ_VAGAS, None)
    if not dados_vagas or not dados_vagas.get("vagas"):
        print("  ! vagas.json ilegível ou vazio. Mantendo o pulso.json anterior.")
        return 0

    vagas_abertas = {}
    for v in dados_vagas["vagas"]:
        vaga_id = v.get("id")
        if not vaga_id:
            continue
        publicada = data_da_vaga(v)
        dias = (HOJE - publicada).days if publicada else 30
        vagas_abertas[vaga_id] = {
            "empresa": v.get("empresa", "?"),
            "dias": max(dias, 0),
        }

    agregado = buscar_agregado(url, chave)
    if agregado is None:
        return 0

    medidas = medir(vagas_abertas, agregado)
    destaques, quarentena = escolher_destaques(medidas, anterior)

    sinais = {
        m["id"]: {
            "pontos": m["pontos"],
            "selos": m["selos"],
        }
        for m in medidas
    }

    saida = {
        "versao": 1,
        "gerado_em": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "janela_dias": JANELA_DIAS,
        "destaques": destaques,
        "sinais": sinais,
        "quarentena": quarentena,
    }

    with open(ARQ_PULSO, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)

    print(f"  {len(vagas_abertas)} vaga(s) abertas, {len(sinais)} acima do piso, "
          f"{len(destaques)} em destaque.")
    for d in destaques:
        print(f"    {d['posicao']}. {d['id']}  {'+'.join(d['selos'])}")
    if quarentena:
        print(f"  {len(quarentena)} vaga(s) em quarentena.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
