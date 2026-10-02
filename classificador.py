# -*- coding: utf-8 -*-
"""
Classificador de areas do Home Office Hub.

Decide se a vaga e geral (aparece na aba Vagas) ou especifica de area
(fica escondida ate a pessoa se cadastrar).

Quem decide e o titulo. A descricao so e consultada quando o titulo nao
disse nada, e mesmo assim so na parte que fala de exigencia de formacao.

Para corrigir uma vaga solta, use a lista EXCECOES logo abaixo. Nao e
preciso mexer em mais nada.
"""

import re
import unicodedata

# ══════════════════════════════════════════════════════════════════
#  EXCECOES A MAO
#
#  Quando uma vaga cair no lugar errado, resolva aqui, sem mexer no
#  resto do arquivo. Copie o titulo da vaga como ele aparece no site,
#  ou so o pedaco que identifica ela, e escreva do lado:
#
#     o nome da area  -> para esconder a vaga naquela area
#     ""              -> para forcar a vaga a aparecer na aba Vagas
#
#  O nome da area precisa ser um dos que estao na lista AREAS mais
#  abaixo, escrito igual, sem acento.
# ══════════════════════════════════════════════════════════════════
EXCECOES = {
    "FP&A Expert": "Financas e Contabilidade",

    # ── micro1 (outubro de 2026) ──
    # Passamos a ler a lista inteira da micro1. Estes titulos pedem
    # experiencia profissional numa area, mas nao tem nenhuma palavra das
    # listas abaixo, e por isso cairiam na aba Vagas por engano.
    "Fusion 360": "Engenharia",
    "Fusion360": "Engenharia",
    "Autodesk": "Engenharia",
    "SolidWorks": "Engenharia",
    "FreeCAD": "Engenharia",
    "CAD Expert": "Engenharia",
    "Hardware Expert": "Engenharia",
    "Field Service Technician": "Engenharia",
    "MCP Expert": "Programacao e Software",
    "GitHub": "Programacao e Software",
    "Security Onion": "Programacao e Software",
    "Information Systems Manager": "Programacao e Software",
    "Computer User Support": "Programacao e Software",
    "IT Manager": "Programacao e Software",
    "Data Analyst": "Programacao e Software",
    "Computer Vision Specialist": "Programacao e Software",
    "Suicide & Self-Harm Specialist": "Psicologia e Ciencias Sociais",
    "Trauma Specialist": "Psicologia e Ciencias Sociais",
    "Addiction Specialist": "Psicologia e Ciencias Sociais",
    "Mental Health Expert": "Psicologia e Ciencias Sociais",
    "Behavioral Analyst": "Psicologia e Ciencias Sociais",
    "Hospitalist": "Medicina e Saude",
    "Document Reviewer": "Direito",
    "Data Privacy Analyst": "Direito",
    "UltraTax": "Financas e Contabilidade",
    "Revenue Operations": "Economia e Negocios",
    "Revenue Systems": "Economia e Negocios",
    "Shopify Specialist": "Economia e Negocios",
    "Purchasing Agent": "Economia e Negocios",
    "Product Manager": "Economia e Negocios",
    "Training & Development Specialist": "Economia e Negocios",
    "Buildium Specialist": "Economia e Negocios",
    "Procore Specialist": "Economia e Negocios",
    "Toast POS Specialist": "Economia e Negocios",
    "Business Document Expert": "Economia e Negocios",
    "Brand & Creative Strategy": "Marketing e Vendas",
    "Audiovisual Producer": "Design e Criacao",
    "Filmmaker": "Design e Criacao",
    "Avid Media Composer": "Design e Criacao",
    "DaVinci Resolve": "Design e Criacao",
    "Producer (Film": "Design e Criacao",
    "Book Editor": "Humanidades",
    # o "=" na frente faz valer so para o titulo exato: sem ele, "Audio Expert"
    # esconderia tambem a "Music and Audio experts", que e vaga geral
    "=Audio Expert": "Outras areas",

    # ── revisao de outubro de 2026: especialista nao fica na aba Vagas ──
    # A regra: se a vaga exige diploma, pos-graduacao ou anos de profissao
    # numa area tecnica, ela vai para a area, mesmo com titulo generico.
    "Prompt & Verifier": "Programacao e Software",
    "Professional Writing Human Data Collection - Academic": "Humanidades",
    "Professional Writing Human Data Collection": "Marketing e Vendas",
    "Board Game Reasoning Expert": "Outras areas",
    "Context Elicitation": "Psicologia e Ciencias Sociais",
    "Web Research Specialist": "Outras areas",
    "Web Research Task Author": "Outras areas",
    "Portuguese Language Specialist (Brazil)": "Linguistica",
    "AI Language Expert": "Linguistica",
    "Customer Support Task Author": "Outras areas",
    # "music" agora e palavra de area; esta aqui e avaliacao de busca, geral
    "App Store And Music Search Evaluator": "",

    # ── Mercor inteira (outubro de 2026) ──
    # A Mercor e quase toda de especialista. "Expert" no titulo agora manda
    # para as areas (lista TITULO_DE_ESPECIALISTA). Estas sao as excecoes:
    # tem "Expert" no nome, mas nao pedem formacao em area nenhuma.
    "=Generalist Expert": "",
    "Multilingual Image & Text AI Quality Expert": "",
    "=Customer Service Expert": "",
    "=Lifestyle Experts": "",
    # pedem o programa instalado e uso profissional dele
    "Application Users": "Outras areas",
    "Generalist (Must own MacBook)": "Outras areas",
    "Dispatcher": "Outras areas",
}

# Falar de portugues ou Brasil manda a vaga para a aba Vagas, MAS so
# depois que a busca por area nao achou nada. Vaga que pede formacao de
# area vai para a aba de areas mesmo escrita em portugues: "Mathematics
# Specialist (Fluent in Portuguese - Brazil)" pede base de matematica, e
# o aluno que nao tem essa base nao deve nem ver a vaga.
SEMPRE_GERAL = [
    "portuguese", "brazil", "brazilian", "pt-br", "ptbr", "pt br",
    "portugues", "brasil", "brasileiro", "brasileira",
]

# Termos que enganam a palavra "engineer" e nao indicam area.
# ("ai engineer" e "engineering manager" sairam daqui em outubro de 2026:
# eram justamente os cargos de programacao senior que apareciam na aba Vagas.)
FALSOS_POSITIVOS = [
    "prompt engineer", "annotation engineer", "data engineer intern",
]

# Ordem importa: a primeira area que casar e a escolhida.
AREAS = [
    ("Direito", [
        "law", "laws", "legal", "lawyer", "attorney", "paralegal", "litigation",
        "juris doctor", "jurist", "counsel", "contract law", "patent",
        "public defender",
        "intellectual property", "direito", "advogado", "juridico",
    ]),
    ("Medicina e Saude", [
        "medical", "medicine", "physician", "doctor of medicine", "nurse",
        "nursing", "clinical", "clinician", "healthcare", "health care",
        "pharmacy", "pharmacist", "pharmaceutical", "dentist", "dental",
        "veterinary", "radiology", "oncology", "cardiology", "neurology",
        "psychiatry", "psychiatrist", "surgeon", "epidemiology", "nutrition",
        "medicare", "medicaid", "patient",
        "dietitian", "physical therapy", "medicina", "medico", "enfermagem",
        "saude", "farmaceutico",
    ]),
    ("Programacao e Software", [
        "software engineer", "software developer", "developer", "programmer",
        "programming", "coding", "swe", "full stack", "fullstack", "backend",
        "back end", "frontend", "front end", "devops", "python", "javascript",
        "typescript", "golang", "rust", "c++", "java developer", "sql",
        "machine learning engineer", "ml engineer", "data scientist",
        "data science", "data engineer", "cybersecurity", "security engineer",
        "cloud engineer", "qa engineer", "android", "ios developer",
        "competitive programming", "algorithms", "coder", "code expert",
        "computer science", "ai engineer", "engineering manager",
        "function call", "function calling",
        "programacao", "desenvolvedor",
    ]),
    ("Matematica e Estatistica", [
        "math", "maths", "mathematics", "mathematician", "mathematical",
        "calculus", "algebra", "geometry", "topology", "number theory",
        "statistics", "statistician", "statistical", "probability",
        "matematica", "estatistica",
    ]),
    ("Fisica e Astronomia", [
        "physics", "physicist", "astrophysics", "quantum", "astronomy",
        "astronomer", "thermodynamics", "mechanics phd", "fisica",
    ]),
    ("Quimica", [
        "chemistry", "chemist", "chemical", "biochemistry", "organic chemistry",
        "inorganic chemistry", "chemical engineering", "quimica",
    ]),
    ("Biologia e Ciencias da Vida", [
        "biology", "biologist", "biological", "molecular biology", "genetics",
        "genomics", "microbiology", "neuroscience", "ecology", "botany",
        "zoology", "bioinformatics", "biotech", "biologia",
    ]),
    ("Engenharia", [
        "engineering", "engineer", "mechanical", "electrical", "civil",
        "aerospace", "aeronautical", "industrial engineering", "materials",
        "robotics", "automation", "engenharia", "engenheiro",
    ]),
    ("Financas e Contabilidade", [
        "finance", "financial", "accounting", "accountant", "cpa", "cfa",
        "audit", "auditor", "bookkeeping", "taxation", "tax analyst",
        "tax form", "tax expert", "tax preparer",
        "investment", "equity research", "banking", "actuarial", "actuary",
        "trading", "hedge fund", "private equity", "financas", "contabilidade",
        "contador",
    ]),
    ("Economia e Negocios", [
        "economics", "economist", "econometrics", "business analyst",
        "business strategy", "mba", "management consulting", "consultant",
        "supply chain", "logistics", "operations research", "human resources",
        "product owner", "product manager", "servicenow",
        "economia", "negocios",
    ]),
    ("Psicologia e Ciencias Sociais", [
        "psychology", "psychologist", "sociology", "sociologist",
        "anthropology", "anthropologist", "political science", "social work",
        "public policy", "policy analyst", "political scientist",
        "international relations", "criminology",
        "psicologia", "sociologia",
    ]),
    ("Humanidades", [
        "history", "historian", "philosophy", "philosopher", "literature",
        "humanities", "religious studies", "theology", "archaeology",
        "classics", "historia", "filosofia", "literatura",
    ]),
    ("Linguistica", [
        "linguistics", "linguist", "phonetics", "phonology", "morphology",
        "syntax", "lexicography", "computational linguistics", "linguistica",
    ]),
    ("Musica e Audio", [
        "music", "musician", "musical", "composer", "sound designer",
        "sound design", "audio engineer", "audio engineering", "music editor",
    ]),
    ("Design e Criacao", [
        "graphic design", "designer", "ux", "ui design", "product design",
        "illustrator", "illustration", "animation", "animator", "3d artist",
        "video editing", "video editor", "motion graphics", "architect",
        "architecture", "photography", "creative writing", "screenwriting",
    ]),
    ("Marketing e Vendas", [
        "marketing", "seo", "copywriting", "copywriter", "advertising",
        "brand strategy", "sales", "growth", "public relations",
    ]),
]

# Sinais de exigencia academica alta sem area clara no titulo.
ESPECIALISTA_GENERICO = [
    "phd", "phds", "ph.d", "doctorate", "postdoc", "post doc", "professor",
    "stem", "subject matter expert", "subject matter experts",
    "domain expert", "domain experts", "technical expert", "sme", "expert in",
    "specialist in", "graduate degree", "masters degree", "m.d.", "science",
    "master s degree", "master degree", "masters", "degree", "researcher",
    "research scientist", "nuclear", "radiological", "radiologicals",
    "nonproliferation", "safeguards", "source security",
]

# Palavras que, no titulo, dizem que a vaga e para quem ja e profissional de
# alguma area. Valem depois do portugues/Brasil e fora do trabalho geral do
# ramo: "Portuguese Language Expert" e "Video Annotation Expert" continuam
# gerais, "Biotechnology Expert" nao.
TITULO_DE_ESPECIALISTA = [
    "expert", "talent network", "scientist", "officer", "professional",
    "benchmark specialist",
]

# Cargo de chefia ou senioridade no titulo. So vale quando o titulo nao fala
# de portugues/Brasil e nao e de trabalho geral do ramo: "Senior AI Trainer"
# continua na aba Vagas, "Senior Backend Lead" nao.
SENIORIDADE = [
    "senior", "sr", "lead", "principal", "staff", "manager", "head of",
    "director", "architect", "vp", "chief",
]

AREA_RESERVA = "Outras areas"

# ══════════════════════════════════════════════════════════════════
#  LEITURA DA DESCRICAO
#
#  Titulo curto tipo "Circuit Design Expert" nao tem nenhuma palavra
#  das listas acima, e escapava. A descricao da vaga resolve, mas so
#  se for lida com cuidado: o texto inteiro fala de mil coisas e
#  qualquer palavra solta esconderia vaga boa.
#
#  Por isso a descricao so e consultada:
#    1. quando o titulo nao decidiu nada, e
#    2. dentro de frase que fala de exigencia de formacao, e
#    3. quando o titulo nao e de trabalho geral do ramo.
# ══════════════════════════════════════════════════════════════════

# Trabalho do dia a dia do ramo. Se o titulo diz isso, a vaga e geral
# mesmo que a descricao peca diploma de alguma coisa, porque o titulo
# e quem diz o que a pessoa vai fazer.
TRABALHO_GERAL = [
    "annotation", "annotator", "transcription", "transcriber", "transcript",
    "translation", "translator", "localization", "localisation", "subtitle",
    "subtitling", "caption", "captioning", "rater", "rating", "evaluator",
    "evaluation", "reviewer", "proofreader", "proofreading", "voice",
    "speech", "audio", "recording", "dialect", "linguist data",
    "data collection", "data collector", "search quality", "content moderation",
    "moderator", "ai trainer", "prompt", "red team", "red teaming",
]

# Só entra na conta o pedaço da descrição que fala de formação.
EXIGENCIA = [
    "degree in", "degrees in", "bachelor", "bachelors", "b.sc", "bsc",
    "master", "masters", "m.sc", "msc", "phd in", "doctorate in",
    "background in", "major in", "majored in", "graduated in",
    "graduate degree in", "studied", "licensed", "certification in",
    "certified", "qualification in", "formacao em", "graduacao em",
    "diploma em", "bacharel", "licenciatura",
]


def normalizar(texto):
    """Tira acento, deixa minusculo e limpa pontuacao."""
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9+#. ]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def _tem(texto, termo):
    """Casa o termo respeitando inicio e fim de palavra.

    Aceita o plural em s ou es: "lawyer" casa com "lawyers", "physicist"
    casa com "physicists". Sem isso metade dos titulos escapava, porque
    vaga de area quase sempre vem no plural.
    """
    padrao = r"(?<![a-z0-9])" + re.escape(termo) + r"(?:es|s)?(?![a-z0-9])"
    return re.search(padrao, texto) is not None


def _area_no_texto(texto):
    """Procura as palavras de area num texto ja normalizado."""
    for area, termos in AREAS:
        for termo in termos:
            if _tem(texto, termo):
                return area
    return None


def _frases_de_exigencia(descricao):
    """Devolve só os trechos da descrição que falam de formação.

    Corta o texto em frases e guarda as que têm alguma palavra da
    lista EXIGENCIA. O resto da descrição é ignorado de propósito.
    """
    if not descricao:
        return ""
    inteiro = normalizar(descricao)
    if not inteiro:
        return ""
    guardar = []
    for frase in re.split(r"[.;!?\n]+", inteiro):
        frase = frase.strip()
        if not frase:
            continue
        if any(_tem(frase, termo) for termo in EXIGENCIA):
            guardar.append(frase)
    return " . ".join(guardar)


def _pela_descricao(texto_titulo, descricao):
    """Último recurso, quando o título não decidiu nada."""
    for termo in TRABALHO_GERAL:
        if _tem(texto_titulo, termo):
            return None
    return _area_no_texto(_frases_de_exigencia(descricao))


def classificar_area(titulo, descricao=""):
    """Devolve o nome da area, ou None se a vaga for geral.

    A descricao e opcional e so entra em cena quando o titulo nao
    decidiu nada. Sem ela, o resultado e exatamente o de antes.
    """
    texto = normalizar(titulo)
    if not texto:
        return None

    # 0. o que estiver escrito a mao em EXCECOES vence tudo
    #    chave comecando com "=" so vale para o titulo inteiro, igualzinho
    for chave, area in EXCECOES.items():
        exato = chave.startswith("=")
        alvo = normalizar(chave[1:] if exato else chave)
        if alvo and (alvo == texto or (not exato and _tem(texto, alvo))):
            return area or None

    # 1. palavras que enganam, tipo "prompt engineer". Ficam de fora antes
    #    de qualquer outra coisa, senao "engineer" esconderia a vaga.
    for termo in FALSOS_POSITIVOS:
        if _tem(texto, termo):
            return None

    # 2. a area vem antes do portugues. Vaga que pede formacao de area
    #    vai para a aba de areas mesmo que o titulo diga "Portuguese"
    #    ou "Brazil": e o caso de "Mathematics Specialist (Fluent in
    #    Portuguese - Brazil)", que pede base de matematica.
    area = _area_no_texto(texto)
    if area:
        return area

    for termo in ESPECIALISTA_GENERICO:
        if _tem(texto, termo):
            return AREA_RESERVA

    # 3. sem area no titulo, falar de portugues ou Brasil manda para a
    #    aba Vagas e encerra: a descricao nem chega a ser lida.
    for termo in SEMPRE_GERAL:
        if _tem(texto, termo):
            return None

    # 4. cargo senior ou de chefia, fora do trabalho geral do ramo
    if not any(_tem(texto, termo) for termo in TRABALHO_GERAL):
        for termo in SENIORIDADE + TITULO_DE_ESPECIALISTA:
            if _tem(texto, termo):
                # a descricao pode dizer de que area e; se nao disser, reserva
                return _area_no_texto(_frases_de_exigencia(descricao)) or AREA_RESERVA

    return _pela_descricao(texto, descricao)


def separar_vagas(vagas):
    """Divide a lista em (gerais, especificas). As especificas ganham o campo area."""
    gerais = []
    especificas = []
    for vaga in vagas:
        area = classificar_area(
            vaga.get("titulo") or vaga.get("title") or "",
            vaga.get("_desc") or vaga.get("desc") or "")
        if area:
            vaga = dict(vaga)
            vaga["area"] = area
            especificas.append(vaga)
        else:
            gerais.append(vaga)
    return gerais, especificas


def listar_areas():
    """Nomes das areas, na ordem, para usar no cadastro do site."""
    return [area for area, _ in AREAS] + [AREA_RESERVA]


if __name__ == "__main__":
    # Casos reais, tirados das vagas que já passaram pelo site.
    # Formato: (titulo, descricao, resultado esperado)
    # "GERAL" quer dizer que a vaga tem que aparecer na aba Vagas.
    CASOS = [
        # ── tem que ficar na aba Vagas ──
        ("Portuguese (Brazil) Sports Localization Specialist (Football)", "", "GERAL"),
        ("Carioca Dialect Specialist - Freelance AI Trainer Project", "", "GERAL"),
        ("AI Trainer - English-Chinese Bilingual Voice Recording", "", "GERAL"),
        ("Portuguese Transcription Expert", "", "GERAL"),
        ("Search Quality Rater", "", "GERAL"),
        ("Freelance Annotator (English) - AI Trainer", "", "GERAL"),
        ("Quality Analyst", "", "GERAL"),
        ("App Store And Music Search Evaluator", "", "GERAL"),
        ("Senior AI Trainer", "", "GERAL"),
        ("Hydrus - Session Director - Portuguese (BR) - V2", "", "GERAL"),
        ("Lifestyle Experts", "", "GERAL"),
        ("AI Quality Analyst (Personalization) - Portuguese", "", "GERAL"),
        # descricao pede diploma, mas o titulo diz que o trabalho e do ramo
        ("Portuguese (Brazil) Translator",
         "Requirements: bachelor's degree in Translation or Linguistics.", "GERAL"),
        # ── tem que ficar escondida ──
        ("Mechanical Engineering Expert", "", "Engenharia"),
        ("Physics Expert (PhD / Postdoc)", "", "Fisica e Astronomia"),
        ("Litigation Associate Attorney (BigLaw Firms)", "", "Direito"),
        ("Software Engineer", "", "Programacao e Software"),
        ("Domain Expert - Enterprise Resource Planning (ERP)", "", "Outras areas"),
        # ── os tres que escapavam antes ──
        ("Circuit Design Expert",
         "We are looking for experts. Requirements: degree in Electrical "
         "Engineering or related field.", "Engenharia"),
        ("Creative & Design Specialist",
         "You should have a background in graphic design or illustration.",
         "Design e Criacao"),
        ("FP&A Expert", "", "Financas e Contabilidade"),   # resolvido por EXCECOES
        # ── area vence o portugues: pedem formacao, mesmo sendo vaga BR ──
        ("Mathematics Specialist (Fluent in Portuguese - Brazil) - Freelance AI Trainer Project",
         "", "Matematica e Estatistica"),
        ("Coding Specialist (Fluent in Portuguese - Brazil) - Freelance AI Trainer Project",
         "", "Programacao e Software"),
        ("STEM Specialist (Fluent in Portuguese - Brazil) - Freelance AI Trainer Project",
         "", "Outras areas"),
        ("Science Specialist (Fluent in Portuguese - Brazil) - Freelance AI Trainer Project",
         "", "Outras areas"),
        ("Computer Science Expert (PhD)", "", "Programacao e Software"),
        # ── revisao de outubro de 2026: especialista fora da aba Vagas ──
        ("Chemical Defense Researcher", "", "Quimica"),
        ("Senior AI Engineer, Data Quality & Pipeline Automation", "", "Programacao e Software"),
        ("Python Engineering Manager – LLM Training & Evaluation", "", "Programacao e Software"),
        ("Engineering Manager – LLM Evaluation", "", "Programacao e Software"),
        ("LLM Trainer - Agent Function call", "", "Programacao e Software"),
        ("Prompt & Verifier", "", "Programacao e Software"),
        ("LLM Annotator - Master's Degree", "", "Outras areas"),
        ("Board Game Reasoning Expert (AI Training & Evaluation)", "", "Outras areas"),
        ("LLM ServiceNow Product Owner", "", "Economia e Negocios"),
        ("Music and Audio experts", "", "Musica e Audio"),
        ("Music & Sound Annotation Expert", "", "Musica e Audio"),
        ("Web Research Specialist", "", "Outras areas"),
        ("Portuguese Language Specialist (Brazil) - Freelance AI Trainer Project", "", "Linguistica"),
        ("Professional Writing Human Data Collection - Academic and Education", "", "Humanidades"),
        ("Professional Writing Human Data Collection", "", "Marketing e Vendas"),
        ("Operations Lead", "", "Outras areas"),
        # ── Mercor inteira ──
        ("Audiobook QA Expert — Portuguese (Brazil)", "", "GERAL"),
        ("Video Annotation Expert", "", "GERAL"),
        ("Customer Service Expert", "", "GERAL"),
        ("Multilingual Image & Text AI Quality Expert", "", "GERAL"),
        ("Generalist Expert", "", "GERAL"),
        ("Quality Analyst", "", "GERAL"),
        ("Biotechnology Expert", "", "Outras areas"),
        ("Consumer & Lifestyle Expert", "", "Outras areas"),
        ("HR & Administration Specialist Talent Network", "", "Outras areas"),
        ("Radiation Safety Officer", "", "Outras areas"),
        ("Nonproliferation Analyst", "", "Outras areas"),
        ("Application Users - Photoshop on Windows - Generalist", "", "Outras areas"),
        ("Public Defenders — Paid Research Study", "", "Direito"),
    ]

    falhas = 0
    for titulo, desc, esperado in CASOS:
        obtido = classificar_area(titulo, desc) or "GERAL"
        ok = obtido == esperado
        if not ok:
            falhas += 1
        print(f"{'ok ' if ok else 'ERRO'} {obtido:28} | {titulo[:56]}")
        if not ok:
            print(f"     esperado: {esperado}")

    print()
    if falhas:
        print(f"{falhas} caso(s) com resultado diferente do esperado.")
    else:
        print(f"Os {len(CASOS)} casos passaram.")
