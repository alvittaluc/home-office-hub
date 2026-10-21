# -*- coding: utf-8 -*-
"""Gera resumos-arquivo.json: o resumo de toda vaga que já passou pelo Hub, por id.

O Meu Controle usa este arquivo para mostrar a vaga de uma candidatura antiga
quando ela já saiu da lista do site (a vaga fechou, ou a empresa republicou com
outro link e o id mudou). Roda na publicação do site (publicar-site.yml), a
partir do resumos.json, que fica fora do site.

  python3 arquivo_resumos.py [saida.json]
"""
import json
import sys

CAMPOS = ("frase", "o_que_faz", "requisitos", "remuneracao", "carga", "contrato", "idioma", "estudo")

saida = sys.argv[1] if len(sys.argv) > 1 else "resumos-arquivo.json"
with open("resumos.json", encoding="utf-8") as f:
    resumos = json.load(f)

arquivo = {}
for v in resumos.get("vagas", []):
    r = v.get("resumo") or {}
    item = {k: r[k] for k in CAMPOS if r.get(k)}
    if item.get("o_que_faz") or item.get("requisitos"):
        arquivo[v["id"]] = item

with open(saida, "w", encoding="utf-8") as f:
    json.dump({"total": len(arquivo), "resumos": arquivo}, f, ensure_ascii=False, separators=(",", ":"))
print(f"resumos-arquivo.json: {len(arquivo)} resumo(s)")
