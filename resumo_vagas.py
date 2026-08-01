#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  RESUMO DE VAGAS (gratuito) — para o Home Office Hub
═══════════════════════════════════════════════════════════════════
  Gera um resumo curto de cada vaga com:
    • O que você vai fazer (extraído da descrição)
    • Requisitos (extraídos da vaga)
    • Dica de currículo (gerada por palavras-chave)

  Tenta traduzir para PT-BR usando um tradutor gratuito.
  Se a tradução falhar, mantém o texto original (inglês) — nunca quebra.

  Importado pelo coletor.py.
═══════════════════════════════════════════════════════════════════
"""
import urllib.request
import urllib.parse
import json
import re
import ssl
import html as _html

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL = ssl.create_default_context()
    _SSL.check_hostname = False
    _SSL.verify_mode = ssl.CERT_NONE


# ─── Limpeza de HTML/texto ───
def _limpar(texto):
    if not texto:
        return ""
    # remove tags HTML
    t = re.sub(r"<[^>]+>", " ", texto)
    t = _html.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _cortar(texto, limite=340):
    """Corta o texto no limite, sem quebrar palavra, adicionando '…'."""
    texto = texto.strip()
    if len(texto) <= limite:
        return texto
    corte = texto[:limite].rsplit(" ", 1)[0]
    return corte.rstrip(".,;:") + "…"


# ─── Tradução gratuita (Google Translate endpoint público) ───
_CACHE_TRAD = {}

def traduzir(texto, para="pt"):
    """Traduz texto para PT-BR usando o endpoint gratuito do Google Translate.
    Se falhar, retorna o texto original (fallback). Faz cache para não repetir."""
    if not texto or not texto.strip():
        return texto
    chave = texto[:200]
    if chave in _CACHE_TRAD:
        return _CACHE_TRAD[chave]
    try:
        url = ("https://translate.googleapis.com/translate_a/single"
               "?client=gtx&sl=auto&tl=" + para + "&dt=t&q="
               + urllib.parse.quote(texto[:1800]))
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15, context=_SSL) as r:
            dados = json.loads(r.read().decode("utf-8", errors="ignore"))
        # a resposta é uma lista aninhada; junta os pedaços traduzidos
        partes = [seg[0] for seg in dados[0] if seg and seg[0]]
        resultado = "".join(partes).strip()
        if resultado:
            _CACHE_TRAD[chave] = resultado
            return resultado
    except Exception:
        pass
    # fallback: original
    return texto


# ─── Dicas de currículo por palavras-chave ───
# Mapeia sinais na vaga → sugestão do que destacar no CV.
DICAS_CV = [
    (["annotat", "labeling", "labelling", "tagging"],
     "experiência com anotação/rotulagem de dados"),
    (["transcription", "transcri"],
     "experiência com transcrição de áudio"),
    (["translat", "localization", "localisation", "linguist"],
     "fluência no idioma e experiência com tradução/localização"),
    (["evaluat", "rating", "rater", "quality", "review"],
     "atenção a detalhes e experiência avaliando conteúdo"),
    (["rlhf", "llm", "prompt", "generative"],
     "familiaridade com IA generativa e modelos de linguagem"),
    (["speech", "voice", "audio", "recording"],
     "boa dicção e experiência com áudio/voz"),
    (["image", "video", "visual", "object detection"],
     "atenção visual e experiência com conteúdo de imagem/vídeo"),
    (["code", "python", "programming", "software", "developer"],
     "conhecimento de programação (Python e afins)"),
    (["legal", "law", "compliance"],
     "formação/experiência na área jurídica"),
    (["medical", "clinical", "health"],
     "formação/experiência na área da saúde"),
    (["finance", "financial", "accounting"],
     "formação/experiência na área financeira"),
]

def _gerar_dica_cv(titulo, descricao, requisitos):
    """Gera dicas de currículo com base nas palavras-chave da vaga."""
    texto = f"{titulo} {descricao} {requisitos}".lower()
    achados = []
    for termos, dica in DICAS_CV:
        if any(t in texto for t in termos):
            achados.append(dica)
    # sempre lembra do inglês (quase todas exigem)
    if any(t in texto for t in ["english", "fluent", "proficiency", "b2", "c1", "c2"]):
        achados.append("nível de inglês (mencione seu nível: B2, C1, etc.)")

    achados = achados[:3]  # no máximo 3 dicas
    if not achados:
        return "Destaque experiências relevantes à área da vaga e seu nível de inglês."
    return "Destaque no currículo: " + "; ".join(achados) + "."


# ─── Montagem do resumo ───
def gerar_resumo(titulo, descricao="", requisitos="", compensation="",
                 commitment="", traduzir_texto=True):
    """Monta o resumo estruturado de uma vaga.
    Retorna um dict com as partes (já traduzidas se possível)."""
    desc = _cortar(_limpar(descricao), 340)
    req = _cortar(_limpar(requisitos), 300)

    # dica de CV (gerada em PT-BR por regras — não precisa traduzir)
    dica = _gerar_dica_cv(titulo, descricao, requisitos)

    # traduz descrição e requisitos (com fallback pro original)
    if traduzir_texto:
        if desc:
            desc = traduzir(desc)
        if req:
            req = traduzir(req)

    return {
        "o_que_faz": desc,
        "requisitos": req,
        "dica_cv": dica,
        "contrato": commitment or "",
        "remuneracao": _cortar(_limpar(compensation), 140) if compensation else "",
    }


if __name__ == "__main__":
    # teste
    r = gerar_resumo(
        "AI Data Annotator - Portuguese (Brazil)",
        descricao="We are looking for annotators to label text and evaluate AI responses. Remote work, flexible hours.",
        requisitos="Fluent English (B2+). Experience with data annotation is a plus. Attention to detail.",
        compensation="$11 USD/hour",
        commitment="Freelance",
    )
    for k, v in r.items():
        print(f"{k}: {v}")
