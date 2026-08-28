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
import urllib.parse
import json
import os
import re
import time
import ssl
from datetime import datetime, timezone

# ─── Correção de SSL no Windows ───
# O Python no Windows às vezes não consegue verificar certificados de sites
# (erro "CERTIFICATE_VERIFY_FAILED"). Tentamos usar os certificados do sistema;
# se não der, criamos um contexto que não trava por causa disso.
try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

# ═══════════════════════════════════════════════════════════════════
#  CONFIGURAÇÃO — edite aqui para adicionar/remover empresas
# ═══════════════════════════════════════════════════════════════════

# Empresas que usam LEVER (slug = nome na URL jobs.lever.co/SLUG)
EMPRESAS_LEVER = {
    "welocalize": "weloglobal",   # jobs.lever.co/weloglobal
    "rws":        "rws",          # jobs.lever.co/rws
    "crowdgen":   "appen",        # jobs.lever.co/appen (CrowdGen by Appen)
}

# Empresas que usam WORKABLE (slug = nome na URL apply.workable.com/SLUG)
EMPRESAS_WORKABLE = {
    "toloka": "toloka-annotators",  # apply.workable.com/toloka-annotators
}

# ─── FASE 2: AGREGADORES ───
# Estes trazem vagas de MUITAS empresas de uma vez (parte do "LinkedIn").
# ATENÇÃO: as regras deles exigem CREDITAR A FONTE e LINKAR de volta.
# Por isso cada vaga guarda o campo "fonte" e o link aponta pro agregador.
#
# Palavras que buscamos nos agregadores (foco em IA/dados/tradução PT-BR).
BUSCAS_AGREGADOR = [
    "portuguese", "brazil", "annotation", "ai trainer",
    "data annotator", "transcription", "localization",
]

# Ligue/desligue cada agregador aqui:
# (DESLIGADOS: traziam vagas genéricas fora da área de IA/dados/anotação)
USAR_JOBICY = False
USAR_REMOTEOK = False

# ─── FASE 3: SCRAPERS (empresas sem API) ───
# Estes "leem" o site da empresa. Podem ser bloqueados em servidores de
# nuvem (GitHub) — se falharem lá, rode no seu PC.
USAR_ONEFORMA = True
# abrir_incertos: abre páginas "Selected Locations" p/ confirmar Brasil.
# True = mais preciso e um pouco mais lento. False = rápido, só pega
# as vagas "Worldwide" e as que citam Brasil no título.
ONEFORMA_ABRIR_INCERTOS = True

# Telus: LIGADA de novo em agosto de 2026. O site foi refeito, saiu o
# Cloudflare e apareceu uma API pública de verdade. Cada vaga traz o idioma
# exato ("Portuguese (Brazil)"), então o filtro não precisa adivinhar.
# O scraper antigo (scraper_telus.py) ficou obsoleto e não é mais usado.
#
# ATENÇÃO: a API da TELUS filtra pelo PAÍS DE QUEM CHAMA, descoberto pelo
# endereço de IP. Do Brasil ela devolve 107 vagas, com as exclusivas do Brasil
# incluídas. Do servidor do GitHub, que fica nos Estados Unidos, ela devolve
# 116 vagas diferentes, sem as do Brasil. Não dá para forçar: testamos mandar
# country, region, language_ids e keyword no corpo, e a API ignora todos.
# Por isso a TELUS também entra na lista de fontes que só rodam no seu PC.
USAR_TELUS = True

# Rex.zone (RemoExperts): DESLIGADO — as vagas dele já chegam pelo LinkedIn.
USAR_REXZONE = False

# ─── FONTES NOVAS (agosto de 2026, no módulo scraper_extras.py) ───
# Meridial: o site meridial.ai é vitrine, por baixo é Greenhouse (quadro
# "agency"). API pública, com descrição completa e data de publicação.
USAR_MERIDIAL = True
# micro1: API por busca de palavra. A descrição só existe na página da vaga,
# então o robô abre uma página por vaga. São poucas, o custo é baixo.
#
# ATENÇÃO: a micro1 BLOQUEIA servidor de nuvem, com erro 403 em tudo.
# Do seu PC funciona normalmente.
USAR_MICRO1 = True
MICRO1_BUSCAR_DESCRICAO = True

# ─── FONTES QUE SÓ FUNCIONAM DIREITO NO SEU PC ───
# Duas fontes tratam servidor de nuvem de forma diferente do seu computador:
#
#   micro1 → recusa com 403. Não devolve nada.
#   telus  → devolve, mas as vagas ERRADAS. A API filtra pelo país do IP, e do
#            servidor americano do GitHub as vagas exclusivas do Brasil somem.
#
# A telus é o caso mais traiçoeiro dos dois, porque ela não dá erro nenhum.
# Ela simplesmente traz um conjunto parecido, só que sem as vagas brasileiras,
# e a rodada do GitHub sobrescreveria as vagas boas que você coletou no PC.
#
# Por isso o robô PULA essas duas quando roda no GitHub e preserva o que foi
# coletado da última vez. Para atualizá-las, rode o rodar-coletor.bat no PC.
FONTES_SO_NO_PC = {"micro1", "telus"}

# Detecta se estamos rodando dentro do GitHub Actions (o GitHub define essa
# variável sozinho). No seu PC ela não existe.
RODANDO_NO_GITHUB = os.environ.get("GITHUB_ACTIONS") == "true"


def so_roda_no_pc(nome):
    """Diz se esta fonte deve ser pulada nesta execução."""
    return RODANDO_NO_GITHUB and nome in FONTES_SO_NO_PC
# Alignerr (Labelbox): repete muito o mesmo anúncio, um por país. O robô abre
# cada vaga para descobrir o país verdadeiro e fica com a mais recente.
USAR_ALIGNERR = True

# ─── FONTES NOVAS DE SETEMBRO DE 2026 ───
# Turing (work.turing.com): API por busca de texto. Não tem campo de país;
# os países elegíveis vêm escritos na descrição, numa linha "Location : ...".
# O scraper só aceita a vaga se o Brasil estiver nessa linha.
USAR_TURING = True
# iMerit (imerit.ai): feed JSON estático, o mais simples do projeto.
# Hoje não tem nenhuma vaga em português. Fica ligada como posto de vigia.
USAR_IMERIT = True

# ─── FASE 4: LINKEDIN via GMAIL ───
# As vagas do LinkedIn chegam por email, um Google Apps Script as coloca numa
# planilha, e a planilha é publicada como CSV. O coletor lê esse CSV aqui.
#
# DESLIGADO em agosto de 2026. Quatro motivos, todos visíveis no site:
#   · a planilha só cresce, então vaga fechada ficava na lista para sempre
#   · o título vinha com empresa, local e salário grudados no fim
#   · o mesmo anúncio entrava duas vezes, porque a deduplicação compara
#     títulos e esse lixo no fim fazia parecerem vagas diferentes
#   · entrava vaga de desenvolvedor, fora do nicho do hub
# A planilha CONTINUA sendo preenchida pelo Apps Script, nada foi perdido.
# Para religar depois de redesenhar esse fluxo, volte esta linha para True.
USAR_LINKEDIN = False
LINKEDIN_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRj6J6YOyu5ofZvOYuwbqnPAuTTXq5BD3FisRMd4fGEpsVYgDahOr6IFzKUIT5HUtSo3IVkPO5LspO7/pub?gid=300031726&single=true&output=csv"

# ─── RESUMO DAS VAGAS (função + requisitos + dica de currículo) ───
# O robô gera um resumo de cada vaga e tenta traduzir para PT-BR (grátis).
# Se a tradução falhar, mantém o texto original. Reaproveita resumos já
# feitos para não reprocessar toda vez.
USAR_RESUMOS = True

# Gera um arquivo extra (vagas_para_resumo.json) com as descrições completas
# das vagas, para você enviar ao assistente e receber resumos de qualidade.
GERAR_ARQUIVO_ANALISE = True

# ─── MEMÓRIA DAS DATAS ───
# Arquivo separado que guarda quando cada vaga apareceu no hub pela primeira
# vez. Só cresce, nunca é reescrito do zero. Antes essa informação morava
# dentro do próprio vagas.json, e rodar o coletor no PC com um vagas.json
# defasado carimbava a data de hoje em vaga antiga: era isso que fazia a
# tag "nova" voltar sozinha a cada rodada.
ARQUIVO_DATAS = "datas.json"

# Endereço do site publicado. Quando o coletor roda no seu PC, ele baixa
# daqui a versão que está no ar antes de começar, para não trabalhar em cima
# de arquivo velho. É o equivalente automático de um "git pull".
SITE_PUBLICADO = "https://alvittaluc.github.io/home-office-hub/"

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

# Cidades e estados brasileiros — usado para reconhecer vagas que o Lever
# marca só com a cidade (ex: "Recife", "Curitiba") sem dizer "Brazil".
# Cobre as capitais e principais cidades + siglas de estado.
CIDADES_ESTADOS_BR = [
    # capitais
    "são paulo", "sao paulo", "rio de janeiro", "belo horizonte",
    "brasília", "brasilia", "salvador", "fortaleza", "recife",
    "curitiba", "porto alegre", "manaus", "belém", "belem", "goiânia",
    "goiania", "são luís", "sao luis", "maceió", "maceio", "natal",
    "campo grande", "teresina", "joão pessoa", "joao pessoa", "aracaju",
    "cuiabá", "cuiaba", "florianópolis", "florianopolis", "vitória",
    "vitoria", "porto velho", "macapá", "macapa", "rio branco",
    "boa vista", "palmas",
    # outras cidades grandes / comuns em vagas
    "campinas", "guarulhos", "são gonçalo", "sao goncalo", "duque de caxias",
    "santo andré", "santo andre", "osasco", "sorocaba", "ribeirão preto",
    "ribeirao preto", "uberlândia", "uberlandia", "contagem", "niterói",
    "niteroi", "joinville", "londrina", "juiz de fora", "caxias do sul",
    # estados por extenso
    "acre", "alagoas", "amapá", "amapa", "amazonas", "bahia", "ceará",
    "ceara", "espírito santo", "espirito santo", "goiás", "goias",
    "maranhão", "maranhao", "mato grosso", "mato grosso do sul",
    "minas gerais", "pará", "paraíba", "paraiba", "paraná", "parana",
    "pernambuco", "piauí", "piaui", "rio grande do norte",
    "rio grande do sul", "rondônia", "rondonia", "roraima",
    "santa catarina", "sergipe", "tocantins", "distrito federal",
]

# Siglas de estado do Brasil — checadas separadamente com regex de fronteira
# de palavra, para NÃO casar dentro de outras palavras (ex: "sp" em "Spain").
SIGLAS_ESTADO_BR = ["sp", "rj", "mg", "rs", "pr", "sc", "ba", "pe",
                    "ce", "go", "pa", "ma", "pb", "es", "df", "am",
                    "rn", "al", "pi", "mt", "ms", "se", "to", "ro"]


def local_eh_brasil(texto: str) -> bool:
    """Reconhece se um texto de localização é do Brasil — inclusive quando
    vem só com a cidade/estado (ex: 'Recife', 'Curitiba') sem dizer 'Brazil'."""
    if not texto:
        return False
    t = texto.lower()
    # Portugal explícito sem Brasil → não é
    if ("portugal" in t or "lisbon" in t or "lisboa" in t) and \
       not ("brazil" in t or "brasil" in t):
        return False
    if "brazil" in t or "brasil" in t:
        return True
    # cidades/estados por nome
    if any(cidade in t for cidade in CIDADES_ESTADOS_BR):
        return True
    # siglas de estado — só com fronteira de palavra (não casa "sp" em "Spain")
    for sig in SIGLAS_ESTADO_BR:
        if re.search(r'\b' + sig + r'\b', t):
            return True
    return False


# Termos que indicam localização aberta ao mundo todo.
# Usado tanto no filtro quanto na hora de escrever o local na tela.
TERMOS_WORLDWIDE = [
    "worldwide", "anywhere", "global", "any location",
    "remote - global", "remote, worldwide", "mundial",
]

# Palavras que aparecem na localização mas NÃO nomeiam lugar nenhum.
# Servem para descobrir se, tirando esse ruído, sobrou o nome de um país.
_RUIDO_LOCAL = [
    "remote", "remoto", "home office", "home-based", "homebased",
    "hybrid", "híbrido", "onsite", "on-site", "presencial",
    "full time", "full-time", "part time", "part-time",
    "freelance", "contract", "flexible",
]


def local_nomeia_lugar(texto: str) -> str:
    """Tira o ruído ('Remote', traços, vírgulas, 'Worldwide') e devolve o que
    sobrou. Se sobrar alguma coisa, a localização nomeia um lugar de verdade.

    'Remote'            → ''          (genérico)
    'Remote, Worldwide' → ''          (aberto ao mundo)
    'California'        → 'california' (nomeia lugar)
    'Remote - Europe'   → 'europe'     (nomeia lugar)
    """
    if not texto:
        return ""
    t = texto.lower()
    for termo in TERMOS_WORLDWIDE:
        t = t.replace(termo, " ")
    for palavra in _RUIDO_LOCAL:
        t = t.replace(palavra, " ")
    t = re.sub(r"[^a-zà-ÿ]+", " ", t)
    return t.strip()


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
    # Traduz termos genéricos de "qualquer lugar"
    if low in ("anywhere", "worldwide", "global", "remote", "remoto"):
        return "Remoto · Brasil"
    # Já começa com "Remoto" → não prefixa de novo, senão sai
    # "Remoto · Remoto - Europe". Só troca o traço pelo separador do site.
    if low.startswith("remoto"):
        return texto.replace(" - ", " · ").replace(" – ", " · ")
    # Se menciona Brasil, formata bonito (e em português, o site é pt-BR)
    if "brazil" in low or "brasil" in low:
        texto = re.sub(r"\bBrazil\b", "Brasil", texto, flags=re.IGNORECASE)
        return texto if "remoto" in low else f"Remoto · {texto}"
    # Se é só vazio, assume Brasil (já passou no filtro)
    if low == "":
        return "Remoto · Brasil"
    # Caso tenha uma cidade brasileira mas sem "Brasil"
    return f"Remoto · {texto}"


def normalizar_data(valor) -> str:
    """Converte várias formas de data para 'YYYY-MM-DD'.
    Aceita: timestamp em ms (Lever/Workable), string ISO (Rex.zone),
    ou vazio. Retorna '' se não conseguir."""
    if not valor:
        return ""
    try:
        # timestamp numérico (ms desde 1970) — Lever e Workable usam isso
        if isinstance(valor, (int, float)):
            # se for muito grande, está em milissegundos
            ts = valor / 1000 if valor > 1e11 else valor
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        # string
        s = str(valor).strip()
        if not s:
            return ""
        # ISO tipo "2026-04-23T06:33:38.555Z" → pega só a data
        if "T" in s:
            return s.split("T")[0]
        # já é YYYY-MM-DD
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            return s[:10]
    except Exception:
        pass
    return ""


# ═══════════════════════════════════════════════════════════════════
#  BUSCA — Lever
# ═══════════════════════════════════════════════════════════════════

def buscar_lever(nome_interno: str, slug: str) -> list:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    print(f"  → Lever: {slug} ...", end=" ")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
            dados = json.loads(r.read().decode())
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    vagas = []
    for v in dados:
        titulo = v.get("text", "").strip()
        cats = v.get("categories", {}) or {}
        local = cats.get("location", "") or ""
        lista_locs = cats.get("allLocations", []) or []
        all_locs = " ".join(lista_locs)
        commitment = cats.get("commitment", "") or ""

        # ─── FILTRO BRASIL (regra rígida, mas justa) ───
        # A vaga entra se a localização permitir o Brasil (worldwide OU Brasil)
        # E ela for relevante para o Brasil, evitando vagas de Portugal.
        #
        # "Portuguese" sozinho NÃO basta (pode ser Portugal). Mas a vaga entra se:
        #   - a localização PRINCIPAL é o Brasil (mesmo título genérico), OU
        #   - o título diz explicitamente Brasil/Brazilian Portuguese, OU
        #   - é worldwide E o título é português-brasil
        titulo_l = titulo.lower()
        local_l = local.lower()
        todos_locais = (local + " " + all_locs).lower()

        # localização (reconhece cidades/estados brasileiros, não só "Brazil")
        local_principal_brasil = local_eh_brasil(local)
        loc_tem_brasil = local_eh_brasil(todos_locais)
        loc_worldwide = any(w in todos_locais for w in TERMOS_WORLDWIDE)
        # vaga presencial nunca serve para o hub, que é só de trabalho remoto
        eh_presencial = (v.get("workplaceType") or "").lower() in ("onsite", "on-site")

        # título menciona Brasil explicitamente
        titulo_diz_brasil = any(t in titulo_l for t in [
            "portuguese (brazil)", "brazilian portuguese", "portuguese brazil",
            "português (brasil)", "pt-br", "ptbr", "(brazil)",
            "brazil", "brasil", "brazilian",
        ])
        # título é português (genérico — pode ser Portugal)
        titulo_portugues = "portuguese" in titulo_l or "português" in titulo_l

        # localização é claramente só Portugal/fora (sem Brasil)
        so_portugal = (("portugal" in todos_locais or "lisbon" in todos_locais
                        or "porto" in todos_locais) and not loc_tem_brasil)

        # ─── DECISÃO (mais rígida contra vagas de fora) ───
        # O problema: vagas globais listam MUITOS países (Barcelona, Malta,
        # Karachi...) e o Brasil aparece perdido na lista. Isso NÃO basta.
        # A vaga só entra se o BRASIL for o foco de verdade:
        entra = False

        # (1) localização PRINCIPAL é o Brasil → entra (o foco é BR)
        if local_principal_brasil:
            entra = True
        # (2) título diz explicitamente Brasil/Brazilian Portuguese → entra
        #     (aqui o Brasil é o alvo, mesmo que rode em vários lugares)
        elif titulo_diz_brasil:
            entra = True
        # (3) worldwide/anywhere + título português → entra (aberto ao mundo)
        elif loc_worldwide and titulo_portugues and not so_portugal:
            entra = True

        # ─── Exclusão final: o local nomeia um lugar que não é o Brasil ───
        # Antes o título explícito de Brasil salvava a vaga. Não dá mais: o
        # "Project Perseus | Data Labeling - Portuguese (Brazil) Speakers" da
        # Welocalize dizia isso no título e era 100% PRESENCIAL na Califórnia,
        # exigindo autorização de trabalho nos EUA.
        #
        # Regra atual: se, tirando o ruído ("Remote", traços), sobra o nome de
        # um lugar e esse lugar não é o Brasil, a vaga só entra se a lista
        # completa de locais abrir para o mundo. Só "Brazil" perdido no meio de
        # uma lista grande de países não vale (era o caso Barcelona/Malta).
        lugar_citado = local_nomeia_lugar(local)
        local_estrangeiro = bool(lugar_citado) and not local_principal_brasil

        if local_estrangeiro and not loc_worldwide:
            entra = False

        if not entra or so_portugal or eh_presencial:
            continue

        # ─── Texto do local na tela ───
        # Vaga aberta ao mundo virava "Remoto · Remote - Europe", que fica feio
        # e ainda por cima engana, porque ela aceita o Brasil.
        if local_principal_brasil:
            local_exib = limpar_local(local)
        elif loc_worldwide:
            local_exib = "Remoto · Mundial"
        else:
            local_exib = limpar_local(local)

        cat_id, badge = categorizar(titulo)
        # captura descrição e requisitos para o resumo
        desc_txt = v.get("descriptionPlain") or v.get("description") or ""
        req_txt = ""
        for bloco in (v.get("lists") or []):
            texto_bloco = bloco.get("content", "")
            titulo_bloco = (bloco.get("text") or "").lower()
            if any(k in titulo_bloco for k in ["require", "qualif", "look", "skill", "need"]):
                req_txt += " " + texto_bloco
        vagas.append({
            "empresa": nome_interno,
            "titulo": titulo,
            "local": local_exib,
            "categoria": cat_id,
            "badge": badge,
            "url": v.get("hostedUrl") or v.get("applyUrl") or "",
            "commitment": commitment,
            "fonte": "direto",
            "data_post": normalizar_data(v.get("createdAt")),
            "_desc": desc_txt,
            "_req": req_txt,
        })
    print(f"{len(vagas)} vaga(s) BR de {len(dados)} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  BUSCA — Workable
# ═══════════════════════════════════════════════════════════════════

def buscar_workable(nome_interno: str, slug: str) -> list:
    # ?details=true traz localização completa; a Workable pode ter várias vagas
    url = f"https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true"
    print(f"  → Workable: {slug} ...", end=" ")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
            dados = json.loads(r.read().decode())
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    jobs = dados.get("jobs", []) if isinstance(dados, dict) else []
    total_bruto = len(jobs)
    vagas = []
    for v in jobs:
        titulo = v.get("title", "").strip()
        estado = v.get("state", "published")
        if estado and estado != "published":
            continue

        # A localização da Workable pode vir de VÁRIAS formas:
        #  - location: {objeto} com country/city/location_str
        #  - locations: [lista de objetos] (vaga para vários países)
        #  - workplace: "remote" e telecommuting: true
        locais_texto = []

        # caso 1: location único (objeto ou string)
        loc = v.get("location")
        if isinstance(loc, dict):
            locais_texto.append(loc.get("location_str", "") or "")
            locais_texto.append(loc.get("country", "") or "")
            locais_texto.append(loc.get("city", "") or "")
        elif isinstance(loc, str):
            locais_texto.append(loc)

        # caso 2: locations (lista) — vaga aberta em vários países
        locs = v.get("locations")
        if isinstance(locs, list):
            for L in locs:
                if isinstance(L, dict):
                    locais_texto.append(L.get("country", "") or "")
                    locais_texto.append(L.get("city", "") or "")
                    locais_texto.append(L.get("location_str", "") or "")
                elif isinstance(L, str):
                    locais_texto.append(L)

        # junta tudo num texto só pra filtrar
        local_completo = " ".join(t for t in locais_texto if t).strip()

        # FILTRO BRASIL — checa título + todas as localizações
        if not texto_parece_brasil(titulo, local_completo):
            continue

        # decide o texto de exibição do local
        if "brazil" in local_completo.lower() or "brasil" in local_completo.lower():
            local_exib = "Remoto · Brasil"
        else:
            local_exib = limpar_local(local_completo)

        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": nome_interno,
            "titulo": titulo,
            "local": local_exib,
            "categoria": cat_id,
            "badge": badge,
            "url": v.get("url") or v.get("shortlink") or "",
            "commitment": "",
            "fonte": "direto",
            "data_post": normalizar_data(v.get("published") or v.get("created_at")),
            "_desc": v.get("description") or "",
            "_req": v.get("requirements") or "",
        })
    print(f"{len(vagas)} vaga(s) BR de {total_bruto} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  BUSCA — AGREGADORES (Fase 2)
#  Regra: sempre creditar a fonte e linkar de volta ao agregador.
# ═══════════════════════════════════════════════════════════════════

def buscar_jobicy() -> list:
    """Jobicy tem filtro por região — usamos geo apropriado + tags."""
    print("  → Jobicy ...", end=" ")
    vagas = []
    vistos = set()
    # Jobicy usa 'geo' por país/região; buscamos por tags relevantes
    for tag in BUSCAS_AGREGADOR:
        url = f"https://jobicy.com/api/v2/remote-jobs?count=50&tag={urllib.parse.quote(tag)}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
                dados = json.loads(r.read().decode())
        except Exception:
            continue
        for v in dados.get("jobs", []):
            titulo = (v.get("jobTitle") or "").strip()
            empresa_nome = (v.get("companyName") or "").strip()
            geo = (v.get("jobGeo") or "").strip()
            excerpt = (v.get("jobExcerpt") or "")
            job_id = v.get("id")

            if job_id in vistos:
                continue

            # FILTRO BRASIL — checa título, geo, empresa e trecho
            if not texto_parece_brasil(titulo, geo, empresa_nome, excerpt):
                continue

            vistos.add(job_id)
            cat_id, badge = categorizar(titulo)
            vagas.append({
                "empresa": "jobicy",  # agrupa todas sob o agregador
                "empresa_real": empresa_nome,
                "titulo": titulo,
                "local": limpar_local(geo),
                "categoria": cat_id,
                "badge": badge,
                "url": v.get("url") or "",
                "commitment": v.get("jobType", "") or "",
                "fonte": "Jobicy",
            })
        time.sleep(1)
    print(f"{len(vagas)} vaga(s) BR")
    return vagas


def buscar_remoteok() -> list:
    """RemoteOK: um único feed grande. Filtramos localmente por Brasil."""
    print("  → RemoteOK ...", end=" ")
    url = "https://remoteok.com/api"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
            dados = json.loads(r.read().decode())
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    vagas = []
    for v in dados:
        # O primeiro item costuma ser um aviso legal (sem 'position')
        if not isinstance(v, dict) or not v.get("position"):
            continue
        titulo = (v.get("position") or "").strip()
        empresa_nome = (v.get("company") or "").strip()
        local = (v.get("location") or "")
        tags = " ".join(v.get("tags", []) or [])
        desc = (v.get("description") or "")[:400]

        # FILTRO BRASIL — RemoteOK é global, então filtro é essencial
        if not texto_parece_brasil(titulo, local, empresa_nome, tags, desc):
            continue

        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": "remoteok",
            "empresa_real": empresa_nome,
            "titulo": titulo,
            "local": limpar_local(local),
            "categoria": cat_id,
            "badge": badge,
            "url": v.get("url") or "",
            "commitment": "",
            "fonte": "RemoteOK",
        })
    print(f"{len(vagas)} vaga(s) BR de {len(dados)} total")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  SCRAPER — OneForma (via módulo scraper_oneforma.py)
# ═══════════════════════════════════════════════════════════════════

def buscar_oneforma() -> list:
    """Chama o scraper da OneForma e converte para o formato padrão."""
    try:
        from scraper_oneforma import coletar_oneforma
    except Exception as e:
        print(f"  → OneForma: módulo não encontrado ({str(e)[:40]})")
        return []

    try:
        cruas = coletar_oneforma(max_paginas=8,
                                 abrir_incertos=ONEFORMA_ABRIR_INCERTOS)
    except Exception as e:
        print(f"  → OneForma: falhou ({str(e)[:50]})")
        return []

    vagas = []
    for v in cruas:
        titulo = v["titulo"]
        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": "oneforma",
            "titulo": titulo,
            "local": limpar_local(v.get("local", "")),
            "categoria": cat_id,
            "badge": badge,
            "url": v["url"],
            "commitment": v.get("horario", ""),
            "fonte": "direto",
            "_desc": v.get("desc", ""),
            "_comp": v.get("pagamento", ""),
        })
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  SCRAPER — Telus (via módulo scraper_telus.py)
# ═══════════════════════════════════════════════════════════════════

def buscar_telus() -> list:
    """Chama o scraper da Telus e converte para o formato padrão."""
    try:
        from scraper_telus import coletar_telus
    except Exception as e:
        print(f"  → Telus: módulo não encontrado ({str(e)[:40]})")
        return []

    try:
        cruas = coletar_telus()
    except Exception as e:
        print(f"  → Telus: falhou ({str(e)[:50]})")
        return []

    vagas = []
    for v in cruas:
        titulo = v["titulo"]
        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": "telus",
            "titulo": titulo,
            "local": limpar_local(v.get("local", "")),
            "categoria": cat_id,
            "badge": badge,
            "url": v["url"],
            "commitment": "",
            "fonte": "direto",
        })
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  FASE 4 — LINKEDIN (lê a planilha do Google publicada como CSV)
# ═══════════════════════════════════════════════════════════════════

def buscar_linkedin() -> list:
    """Lê a planilha do Google (CSV) que o Apps Script preenche com as
    vagas vindas dos alertas do LinkedIn. Colunas: titulo, url, capturado_em."""
    import csv
    import io

    print("  → LinkedIn (planilha Google) ...", end=" ")
    try:
        req = urllib.request.Request(LINKEDIN_CSV_URL, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        })
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as r:
            texto = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"FALHOU ({str(e)[:40]})")
        return []

    linhas = list(csv.reader(io.StringIO(texto)))
    if not linhas:
        print("0 (planilha vazia)")
        return []

    # primeira linha é cabeçalho (titulo, url, capturado_em)
    cabecalho = [c.strip().lower() for c in linhas[0]]
    try:
        i_titulo = cabecalho.index("titulo")
    except ValueError:
        i_titulo = 0
    try:
        i_url = cabecalho.index("url")
    except ValueError:
        i_url = 1
    # o Apps Script já escreve quando o alerta chegou. Antes o coletor jogava
    # essa coluna fora, e por isso vaga do LinkedIn ficava sem data nenhuma.
    try:
        i_data = cabecalho.index("capturado_em")
    except ValueError:
        i_data = -1

    vagas = []
    for linha in linhas[1:]:
        if len(linha) <= max(i_titulo, i_url):
            continue
        titulo = (linha[i_titulo] or "").strip()
        url = (linha[i_url] or "").strip()
        if not titulo or not url:
            continue

        # filtro Brasil (reforço — o Apps Script já filtra, mas garantimos)
        if not texto_parece_brasil(titulo):
            continue

        capturado = ""
        if i_data >= 0 and len(linha) > i_data:
            capturado = normalizar_data(linha[i_data])

        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": "linkedin",
            "titulo": titulo,
            "local": "Remoto · Brasil",
            "categoria": cat_id,
            "badge": badge,
            "url": url,
            "commitment": "",
            "fonte": "linkedin",
            "data_post": capturado,
        })

    print(f"{len(vagas)} vaga(s)")
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  FONTES NOVAS — Meridial, TELUS, micro1 e Alignerr
#  (toda a lógica de rede e de filtro vive em scraper_extras.py)
# ═══════════════════════════════════════════════════════════════════

def _buscar_extra(nome_interno, nome_funcao, **kwargs) -> list:
    """Ponte entre o scraper_extras.py e o formato padrão do coletor.

    Uma função só serve as quatro fontes porque todas devolvem a mesma
    estrutura de dicionário. Se o módulo não existir ou a fonte falhar,
    devolve lista vazia e o coletor preserva as vagas da rodada anterior.
    """
    try:
        import scraper_extras
        funcao = getattr(scraper_extras, nome_funcao)
    except Exception as e:
        print(f"  → {nome_interno}: módulo não encontrado ({str(e)[:40]})")
        return []

    try:
        cruas = funcao(**kwargs)
    except Exception as e:
        print(f"  → {nome_interno}: falhou ({str(e)[:50]})")
        return []

    vagas = []
    for v in cruas:
        titulo = v["titulo"]
        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": nome_interno,
            "titulo": titulo,
            "local": limpar_local(v.get("local", "")) or "Remoto",
            "categoria": cat_id,
            "badge": badge,
            "url": v["url"],
            "commitment": v.get("horario", ""),
            "fonte": "direto",
            "data_post": normalizar_data(v.get("data_post")),
            "_desc": v.get("desc", ""),
            "_req": v.get("requisitos", ""),
            "_comp": v.get("pagamento", ""),
        })

    # Lista o que passou no filtro. São poucas vagas por fonte, e ver o título
    # no log é o que permite comparar com o que o site da empresa mostra.
    # Foi assim que descobrimos que a TELUS trazia menos vagas do que devia.
    for v in vagas:
        marca = "" if v["_desc"] else "  (SEM DESCRIÇÃO)"
        print(f"      · {v['titulo'][:64]}{marca}")

    return vagas


def buscar_meridial() -> list:
    return _buscar_extra("meridial", "coletar_meridial")


def buscar_micro1() -> list:
    return _buscar_extra("micro1", "coletar_micro1",
                         buscar_descricao=MICRO1_BUSCAR_DESCRICAO)


def buscar_alignerr() -> list:
    return _buscar_extra("alignerr", "coletar_alignerr")


def buscar_telus_api() -> list:
    return _buscar_extra("telus", "coletar_telus")


def buscar_turing() -> list:
    return _buscar_extra("turing", "coletar_turing")


def buscar_imerit() -> list:
    return _buscar_extra("imerit", "coletar_imerit")


# ═══════════════════════════════════════════════════════════════════
#  SCRAPER — Rex.zone (via módulo scraper_rexzone.py)
# ═══════════════════════════════════════════════════════════════════

def buscar_rexzone() -> list:
    """Chama o scraper do Rex.zone e converte para o formato padrão."""
    try:
        from scraper_rexzone import coletar_rexzone
    except Exception as e:
        print(f"  → Rex.zone: módulo não encontrado ({str(e)[:40]})")
        return []

    try:
        cruas = coletar_rexzone()
    except Exception as e:
        print(f"  → Rex.zone: falhou ({str(e)[:50]})")
        return []

    vagas = []
    for v in cruas:
        titulo = v["titulo"]
        cat_id, badge = categorizar(titulo)
        vagas.append({
            "empresa": "rexzone",
            "titulo": titulo,
            "local": "Remoto · Brasil",
            "categoria": cat_id,
            "badge": badge,
            "url": v["url"],
            "commitment": "",
            "fonte": "direto",
            "data_post": normalizar_data(v.get("data_post")),
            "_desc": v.get("desc") or "",
            "_req": v.get("req") or "",
            "_comp": v.get("comp") or "",
        })
    return vagas


# ═══════════════════════════════════════════════════════════════════
#  REMOVER DUPLICADAS
# ═══════════════════════════════════════════════════════════════════

def _normalizar_titulo(titulo: str) -> str:
    """Normaliza o título para detectar a MESMA vaga anunciada em locais
    diferentes. Ex: 'AI Trainer - São Paulo' e 'AI Trainer - Rio' viram igual."""
    t = titulo.lower().strip()
    # remove todas as cidades/estados brasileiros conhecidos + termos de local
    locais = list(CIDADES_ESTADOS_BR) + [
        "brazil", "brasil", "remoto", "remote", "anywhere", "worldwide",
        "latam", "latin america", "(sp)", "(rj)", "(mg)",
    ]
    for loc in locais:
        t = t.replace(loc, " ")
    # remove pontuação de separação e espaços repetidos
    t = re.sub(r"[-–—,|/()]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def remover_duplicadas(vagas: list) -> list:
    vistas = set()
    unicas = []
    for v in vagas:
        # chave inclui empresa_real quando existe (agregadores)
        ident = v.get("empresa_real") or v["empresa"]
        # usa título normalizado → mesma vaga em estados diferentes = 1 só
        chave = (ident.lower(), _normalizar_titulo(v["titulo"]))
        if chave in vistas:
            continue
        vistas.add(chave)
        unicas.append(v)
    return unicas


# ═══════════════════════════════════════════════════════════════════
#  PROGRAMA PRINCIPAL
# ═══════════════════════════════════════════════════════════════════

def _preservar_do_arquivo(empresa):
    """Lê o vagas.json atual e devolve as vagas de uma empresa específica.
    Usado para não perder vagas de fontes puladas (ex: Telus no GitHub)."""
    try:
        with open("vagas.json", "r", encoding="utf-8") as f:
            dados = json.load(f)
        return [v for v in dados.get("vagas", []) if v.get("empresa") == empresa]
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════════════
#  DATAS: MEMÓRIA DE QUANDO CADA VAGA APARECEU
# ═══════════════════════════════════════════════════════════════════

def chave_da_vaga(v) -> str:
    """Chave estável de uma vaga: empresa + título normalizado.

    De propósito NÃO usa a URL. Parâmetro de rastreio, vaga republicada ou
    endereço trocado mudam a URL e zerariam a data de primeira aparição.
    O título normalizado já ignora cidade e estado, então a mesma vaga
    anunciada em São Paulo e no Rio cai na mesma chave."""
    ident = (v.get("empresa_real") or v.get("empresa") or "").strip().lower()
    return f"{ident}|{_normalizar_titulo(v.get('titulo', ''))}"


def _baixar_do_site(nome_arquivo):
    """Baixa um JSON do site publicado. Devolve None se não der."""
    try:
        req = urllib.request.Request(
            SITE_PUBLICADO + nome_arquivo,
            headers={"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=25, context=_SSL_CTX) as r:
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:
        return None


def sincronizar_com_o_site():
    """Antes de rodar no seu PC, traz o vagas.json que está no ar se ele for
    mais novo que o da sua pasta. Sem isso, rodar o coletor com uma pasta
    defasada apaga o histórico das vagas que entraram nesse meio tempo.
    No GitHub não faz nada: lá o checkout já vem atualizado."""
    if RODANDO_NO_GITHUB:
        return
    print("  → Conferindo a versão que está no ar ...", end=" ")
    publicado = _baixar_do_site("vagas.json")
    if not publicado or not publicado.get("vagas"):
        print("não consegui baixar (seguindo com os arquivos da pasta)")
        return
    try:
        with open("vagas.json", "r", encoding="utf-8") as f:
            local = json.load(f)
    except Exception:
        local = {}
    d_pub = publicado.get("atualizado_em", "")
    d_loc = local.get("atualizado_em", "")
    if d_pub > d_loc:
        with open("vagas.json", "w", encoding="utf-8") as f:
            json.dump(publicado, f, ensure_ascii=False, indent=2)
        print(f"baixei a versão do site ({len(publicado['vagas'])} vagas)")
    else:
        print("sua pasta já está em dia")


def carregar_datas() -> dict:
    """Monta o mapa {chave: data de primeira aparição} juntando três fontes,
    e em qualquer conflito a data MAIS ANTIGA ganha:

      1. o datas.json publicado no site (só quando roda no seu PC)
      2. o datas.json da sua pasta
      3. o data_vista do vagas.json antigo, para migrar o que já existia

    A regra da data mais antiga faz o arquivo se corrigir sozinho: carimbo
    errado de uma rodada passada é substituído assim que aparece um registro
    anterior, sem você precisar editar nada à mão."""
    mapa = {}

    def juntar(novos):
        for ch, data in (novos or {}).items():
            if not ch or not data:
                continue
            atual = mapa.get(ch)
            if not atual or data < atual:
                mapa[ch] = data

    if not RODANDO_NO_GITHUB:
        do_site = _baixar_do_site(ARQUIVO_DATAS)
        if isinstance(do_site, dict):
            juntar(do_site.get("primeira_vez", {}))

    try:
        with open(ARQUIVO_DATAS, "r", encoding="utf-8") as f:
            juntar(json.load(f).get("primeira_vez", {}))
    except Exception:
        pass

    # migração: o que já estava guardado dentro do vagas.json
    try:
        with open("vagas.json", "r", encoding="utf-8") as f:
            for v in json.load(f).get("vagas", []):
                if v.get("data_vista"):
                    juntar({chave_da_vaga(v): v["data_vista"]})
    except Exception:
        pass

    print(f"  → Memória de datas: {len(mapa)} vaga(s) com data guardada")
    return mapa


def gravar_datas(mapa: dict, chaves_de_hoje: set) -> None:
    """Grava o datas.json. Vaga que sumiu continua registrada, para o caso de
    voltar depois com a data certa. Só é descartado o registro que sumiu há
    mais de 400 dias, para o arquivo não crescer para sempre."""
    limite = datetime.now(timezone.utc).timestamp() - 400 * 86400
    guardar = {}
    for ch, data in mapa.items():
        if ch in chaves_de_hoje:
            guardar[ch] = data
            continue
        try:
            quando = datetime.strptime(data, "%Y-%m-%d").replace(
                tzinfo=timezone.utc).timestamp()
        except Exception:
            continue
        if quando >= limite:
            guardar[ch] = data
    with open(ARQUIVO_DATAS, "w", encoding="utf-8") as f:
        json.dump({
            "nota": ("Quando cada vaga apareceu no hub pela primeira vez. "
                     "Este arquivo só cresce. Não edite à mão."),
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
            "total": len(guardar),
            "primeira_vez": dict(sorted(guardar.items())),
        }, f, ensure_ascii=False, indent=2)
    print(f"  ✓ datas.json com {len(guardar)} registro(s)")


def main():
    print("═" * 60)
    print("  HOME OFFICE HUB — Coletor de Vagas")
    print("═" * 60)
    print(f"  Início: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")

    sincronizar_com_o_site()
    print()

    todas = []

    print("[1/3] Buscando em empresas Lever...")
    for nome, slug in EMPRESAS_LEVER.items():
        todas += buscar_lever(nome, slug)
        time.sleep(1)  # educado com a API

    print("\n[2/3] Buscando em empresas Workable...")
    for nome, slug in EMPRESAS_WORKABLE.items():
        todas += buscar_workable(nome, slug)
        time.sleep(1)

    print("\n[3/4] Buscando em agregadores...")
    if USAR_JOBICY:
        todas += buscar_jobicy()
    if USAR_REMOTEOK:
        todas += buscar_remoteok()
    if not USAR_JOBICY and not USAR_REMOTEOK:
        print("  (agregadores desligados)")

    print("\n[4/4] Buscando em empresas via scraping...")
    if USAR_ONEFORMA:
        vagas_of = buscar_oneforma()
        if vagas_of:
            todas += vagas_of
        else:
            # O site da OneForma é lido por scraping e pode falhar (bloqueio,
            # timeout, mudança de layout). Nesse caso, mantemos as vagas da
            # última execução em vez de deixá-las sumir do site.
            preservadas_of = _preservar_do_arquivo("oneforma")
            if preservadas_of:
                print(f"  → OneForma: scraper não retornou nada, "
                      f"mantendo {len(preservadas_of)} vaga(s) da última vez")
                todas += preservadas_of
    if USAR_REXZONE:
        todas += buscar_rexzone()

    # ─── Fontes novas de agosto de 2026 ───
    # Todas seguem a mesma proteção: se a fonte não responder, mantemos as
    # vagas da rodada anterior em vez de deixá-las sumir do site.
    for ligada, funcao, nome in (
        (USAR_TELUS and not so_roda_no_pc("telus"), buscar_telus_api, "telus"),
        (USAR_MERIDIAL, buscar_meridial, "meridial"),
        (USAR_MICRO1 and not so_roda_no_pc("micro1"), buscar_micro1, "micro1"),
        (USAR_ALIGNERR, buscar_alignerr, "alignerr"),
        (USAR_TURING, buscar_turing, "turing"),
        (USAR_IMERIT, buscar_imerit, "imerit"),
    ):
        if not ligada:
            if so_roda_no_pc(nome):
                motivo = ("bloqueia servidor de nuvem" if nome == "micro1"
                          else "do GitHub a API devolve as vagas erradas, "
                               "sem as exclusivas do Brasil")
                print(f"  → {nome}: pulada no GitHub ({motivo}). "
                      f"Rode no seu PC para atualizar.")
            else:
                print(f"  → {nome}: desligada nas configurações")
            preservadas = _preservar_do_arquivo(nome)
            if preservadas:
                print(f"      · mantendo {len(preservadas)} vaga(s) "
                      f"da última rodada")
                todas += preservadas
            continue
        novas = funcao()
        if novas:
            todas += novas
        else:
            preservadas = _preservar_do_arquivo(nome)
            if preservadas:
                print(f"  → {nome}: não retornou nada, "
                      f"mantendo {len(preservadas)} vaga(s) da última vez")
                todas += preservadas

    if USAR_LINKEDIN:
        todas += buscar_linkedin()

    print(f"\n  Total bruto: {len(todas)} vagas")
    todas = remover_duplicadas(todas)
    print(f"  Após remover duplicadas: {len(todas)} vagas")

    # ─── DATAS ───
    # Duas datas convivem no site:
    #   data_post  = a data que a própria empresa publicou (a boa)
    #   data_vista = quando o hub viu a vaga pela primeira vez (a reserva)
    # A data_vista agora vem do datas.json, que só cresce. Se a chave já tem
    # data guardada, a antiga vale, mesmo que esta rodada tenha sido feita
    # noutro computador. É isso que impede a tag "nova" de zerar sozinha.
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    primeira_vez = carregar_datas()
    chaves_de_hoje = set()
    estreantes = 0

    for v in todas:
        ch = chave_da_vaga(v)
        chaves_de_hoje.add(ch)
        guardada = primeira_vez.get(ch)
        if not guardada or guardada > hoje:
            primeira_vez[ch] = hoje
            guardada = hoje
            estreantes += 1
        v["data_vista"] = guardada
        v["data_ref"] = v.get("data_post") or guardada
        # o site usa este campo para decidir entre escrever "Publicada" ou
        # "No hub desde", e para só chamar de "nova" a vaga que tem data
        # oficial da empresa. Sem ele a tag falava por vagas sem data.
        v["data_oficial"] = bool(v.get("data_post"))

    print(f"  → {estreantes} vaga(s) aparecendo pela primeira vez hoje")
    gravar_datas(primeira_vez, chaves_de_hoje)

    # dá um id único e estável a cada vaga (usado nos resumos e na página)
    import hashlib
    for v in todas:
        base = (v.get("url") or v.get("titulo") or "").encode("utf-8")
        v["id"] = hashlib.md5(base).hexdigest()[:10]

    # ─── RESUMO DAS VAGAS (função + requisitos + dica de CV) ───
    # SOMENTE resumos de qualidade, escritos à mão, vindos do resumos.json.
    # Nada de resumo automático: ele cortava o texto e deixava reticências.
    # Vaga sem resumo manual simplesmente não mostra a seção de detalhes.
    # resumos_ok fica False se o resumos.json existir mas estiver quebrado.
    # Nesse caso NÃO regeramos o vagas_para_resumo.json, senão o arquivo sairia
    # com todas as vagas e você refaria trabalho que já está pronto.
    resumos_ok = True

    if USAR_RESUMOS:
        def _ler_resumos(caminho):
            """Lê um arquivo de resumos e devolve {id: resumo}.
            Devolve (dicionario, existe, deu_erro)."""
            try:
                with open(caminho, "r", encoding="utf-8") as f:
                    rq = json.load(f)
            except FileNotFoundError:
                return {}, False, False
            except Exception as e:
                print(f"\n  ⚠ ERRO ao ler {caminho}: {str(e)[:80]}")
                return {}, True, True
            itens = rq.get("vagas", []) if isinstance(rq, dict) else rq
            saida = {}
            for item in itens or []:
                if isinstance(item, dict) and item.get("id") and item.get("resumo"):
                    saida[item["id"]] = item["resumo"]
            return saida, True, False

        # 1) resumos já consolidados
        resumos_qualidade, tinha_arquivo, deu_erro = _ler_resumos("resumos.json")
        if deu_erro:
            resumos_ok = False
        elif not tinha_arquivo:
            print("\n  (resumos.json não encontrado — nenhuma vaga terá resumo)")

        # 2) resumos novos que você acabou de subir (arquivo pequeno, só as
        #    vagas que estavam pendentes). Eles são JUNTADOS aos antigos,
        #    nunca substituem o arquivo inteiro.
        novos, tinha_novos, erro_novos = _ler_resumos("resumos_novos.json")
        if erro_novos:
            resumos_ok = False
        elif tinha_novos:
            so_novos = [i for i in novos if i not in resumos_qualidade]
            atualizados = [i for i in novos if i in resumos_qualidade]
            resumos_qualidade.update(novos)   # id repetido = correção, vale o novo
            print(f"\n  ✓ resumos_novos.json: {len(so_novos)} novo(s), "
                  f"{len(atualizados)} atualizado(s). Total agora: "
                  f"{len(resumos_qualidade)}")

            # 3) grava o consolidado de volta no resumos.json
            if not deu_erro:
                consolidado = [{"id": i, "resumo": r}
                               for i, r in resumos_qualidade.items()]
                with open("resumos.json", "w", encoding="utf-8") as f:
                    json.dump({"total": len(consolidado), "vagas": consolidado},
                              f, ensure_ascii=False, indent=2)
                # zera o arquivo de entrada para deixar claro que já foi absorvido
                with open("resumos_novos.json", "w", encoding="utf-8") as f:
                    json.dump({"total": 0, "vagas": []}, f,
                              ensure_ascii=False, indent=2)
                print(f"  ✓ resumos.json consolidado com "
                      f"{len(consolidado)} resumo(s)")

        com_resumo, sem_resumo = 0, []
        for v in todas:
            vid = v.get("id")
            if vid and vid in resumos_qualidade:
                v["resumo"] = resumos_qualidade[vid]
                com_resumo += 1
            else:
                v.pop("resumo", None)
                sem_resumo.append(v)

        print(f"\n  Resumos: {com_resumo} com resumo, "
              f"{len(sem_resumo)} sem resumo ainda")
        if sem_resumo:
            print("  Vagas aguardando resumo:")
            for v in sem_resumo[:20]:
                print(f"    · [{v.get('id')}] {v.get('titulo','')[:60]}")
            if len(sem_resumo) > 20:
                print(f"    · (e mais {len(sem_resumo) - 20})")

    # ─── ARQUIVO PARA ANÁLISE (com descrições completas) ───
    # Salva um arquivo separado que MANTÉM a descrição completa de cada vaga.
    # É este que você me envia quando quiser que eu gere resumos de qualidade.
    # As vagas do LinkedIn não têm descrição, então ficam de fora deste arquivo.
    # TRAVAS DE SEGURANÇA antes de regerar o arquivo:
    #  · USAR_RESUMOS desligado = não sabemos quem já tem resumo
    #  · resumos_ok False = o resumos.json existe mas não pôde ser lido
    # Em qualquer um dos casos o arquivo antigo é MANTIDO como está.
    if GERAR_ARQUIVO_ANALISE and not USAR_RESUMOS:
        print("\n  ⚠ USAR_RESUMOS está desligado. O vagas_para_resumo.json "
              "foi mantido como estava (não dá para saber quem já tem resumo).")
    elif GERAR_ARQUIVO_ANALISE and not resumos_ok:
        print("\n  ⚠ Falha ao ler os resumos. O vagas_para_resumo.json foi "
              "MANTIDO como estava, para você não refazer resumos prontos.")
    elif GERAR_ARQUIVO_ANALISE:
        para_analise = []
        for v in todas:
            desc = v.get("_desc", "")
            req = v.get("_req", "")
            # LinkedIn fica SEMPRE de fora: ainda não fazemos resumo para lá.
            if v.get("fonte") == "linkedin" or v.get("empresa") == "linkedin":
                continue
            # sem nenhum texto para resumir, não adianta mandar
            if not desc and not req:
                continue
            # pula as que JÁ têm resumo de qualidade: assim o arquivo traz
            # apenas as vagas novas, que ainda precisam de resumo.
            if v.get("resumo"):
                continue
            para_analise.append({
                "id": v["id"],
                "empresa": v["empresa"],
                "titulo": v["titulo"],
                "url": v["url"],
                "local": v.get("local", ""),
                "categoria_badge": v.get("badge", ""),
                "descricao": desc,
                "requisitos": req,
                "remuneracao": v.get("_comp", ""),
            })
        with open("vagas_para_resumo.json", "w", encoding="utf-8") as f:
            json.dump({"total": len(para_analise), "vagas": para_analise},
                      f, ensure_ascii=False, indent=2)
        if para_analise:
            print(f"\n  ✓ Arquivo de análise: 'vagas_para_resumo.json' "
                  f"({len(para_analise)} vaga(s) SEM resumo — envie ao Claude)")
        else:
            print("\n  ✓ Todas as vagas já têm resumo. "
                  "Nada a enviar ao Claude desta vez.")

    # remove os campos temporários de descrição (não vão pro arquivo final)
    for v in todas:
        for campo in ("_desc", "_req", "_comp"):
            v.pop(campo, None)

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
