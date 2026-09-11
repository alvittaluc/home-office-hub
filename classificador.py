# -*- coding: utf-8 -*-
"""
Classificador de areas do Home Office Hub.

Decide, pelo titulo da vaga, se ela e uma vaga geral (aparece na aba Vagas)
ou uma vaga especifica de area (fica escondida ate a pessoa se cadastrar).
"""

import re
import unicodedata

# Se o titulo fala de portugues ou Brasil, e sempre vaga geral.
SEMPRE_GERAL = [
    "portuguese", "brazil", "brazilian", "pt-br", "ptbr", "pt br",
    "portugues", "brasil", "brasileiro", "brasileira",
]

# Termos que enganam a palavra "engineer" e nao indicam area.
FALSOS_POSITIVOS = [
    "prompt engineer", "ai engineer", "annotation engineer",
    "data engineer intern", "engineering manager",
]

# Ordem importa: a primeira area que casar e a escolhida.
AREAS = [
    ("Direito", [
        "law", "laws", "legal", "lawyer", "attorney", "paralegal", "litigation",
        "juris doctor", "jurist", "counsel", "contract law", "patent",
        "intellectual property", "direito", "advogado", "juridico",
    ]),
    ("Medicina e Saude", [
        "medical", "medicine", "physician", "doctor of medicine", "nurse",
        "nursing", "clinical", "clinician", "healthcare", "health care",
        "pharmacy", "pharmacist", "pharmaceutical", "dentist", "dental",
        "veterinary", "radiology", "oncology", "cardiology", "neurology",
        "psychiatry", "psychiatrist", "surgeon", "epidemiology", "nutrition",
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
        "chemistry", "chemist", "biochemistry", "organic chemistry",
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
    "specialist in", "graduate degree", "masters degree", "m.d.",
]

AREA_RESERVA = "Outras areas"


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


def classificar_area(titulo):
    """Devolve o nome da area, ou None se a vaga for geral."""
    texto = normalizar(titulo)
    if not texto:
        return None

    for termo in SEMPRE_GERAL:
        if _tem(texto, termo):
            return None

    for termo in FALSOS_POSITIVOS:
        if _tem(texto, termo):
            return None

    for area, termos in AREAS:
        for termo in termos:
            if _tem(texto, termo):
                return area

    for termo in ESPECIALISTA_GENERICO:
        if _tem(texto, termo):
            return AREA_RESERVA

    return None


def separar_vagas(vagas):
    """Divide a lista em (gerais, especificas). As especificas ganham o campo area."""
    gerais = []
    especificas = []
    for vaga in vagas:
        area = classificar_area(vaga.get("titulo") or vaga.get("title") or "")
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
    testes = [
        "Portuguese (Brazil) Data Annotator",
        "AI Trainer - Prompt Engineer",
        "Legal Expert - Contract Review",
        "Physician Reviewer for AI Training",
        "Senior Software Engineer (Python)",
        "PhD Mathematician - Reasoning Data",
        "Mechanical Engineering Expert",
        "CFA Charterholder - Financial Analysis",
        "Search Quality Rater",
        "Subject Matter Expert - PhD required",
    ]
    for t in testes:
        print(f"{classificar_area(t) or 'GERAL':28} | {t}")
