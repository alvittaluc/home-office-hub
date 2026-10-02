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

    # ══ FICAM NA ABA VAGAS ("" = geral) ══
    # Vagas que o anuncio diz, com todas as letras, que nao exigem formacao
    # nem experiencia na area, mas cujo titulo ou descricao tem palavra de area.
    "App Store And Music Search Evaluator": "",
    "=Generalist Expert": "",
    "Multilingual Image & Text AI Quality Expert": "",
    "=Customer Service Expert": "",
    "=Lifestyle Experts": "",
    "Data Operations Specialist": "",
    "Document Review Specialist": "",
    "Creative Writing Evaluator": "",
    "E-commerce Data Analyst": "",
    "AI Policy, Ethics & Compliance Analyst": "",
    "Image Description Specialist": "",
    "Robotics Technician": "",
    "Film Scene Description Specialist": "",
    "AI Data Quality Analyst": "",
    "Conversation Quality Analyst": "",
    "Map & Location Data Analyst": "",
    # ja estavam na aba Vagas; a descricao cita areas so como diferencial
    "AI Chatbot Tester": "",
    "Product Review Analyst": "",
    "=Quality Analyst": "",
    # suporte da propria Mercor, so para quem mora na America Latina
    "Customer Success Engineer (LatAm)": "",

    # ══ PROGRAMAS ESPECIFICOS (Mercor "Application Users") ══
    # Pedem o programa instalado e uso profissional dele. A ordem importa:
    # as linhas especificas vem antes da linha geral "Application Users".
    "Application Users - Quartus": "Engenharia",
    "Application Users - Vivado": "Engenharia",
    "Application Users - AutoCAD": "Engenharia",
    "Application Users - Inventor": "Engenharia",
    "Application Users - SolidWorks": "Engenharia",
    "Application Users - EViews": "Matematica e Estatistica",
    "Application Users - Stata": "Matematica e Estatistica",
    "Application Users - Excel": "Economia e Negocios",
    "Application Users - PowerPoint": "Economia e Negocios",
    "Application Users - Word": "Economia e Negocios",
    "Application Users - FruitLoops": "Musica e Audio",
    "Application Users - Blender": "Design e Criacao",
    "Application Users - Adobe Illustrator": "Design e Criacao",
    "Application Users - Photoshop": "Design e Criacao",
    "Application Users - Premiere": "Design e Criacao",
    "Application Users - Unreal Engine": "Design e Criacao",
    "Application Users - DaVinci": "Design e Criacao",
    "Application Users - Android Studio": "Programacao e Software",
    "Application Users - PyCharm": "Programacao e Software",
    "Application Users - VMware": "Programacao e Software",
    "Application Users - Visual Studio Code": "Programacao e Software",
    "Application Users - Linux": "Programacao e Software",
    "Application Users - Windows 11": "Programacao e Software",
    "Application Users - macOS Sonoma": "Programacao e Software",
    "Application Users": "Outras areas",

    # ══ TITULOS QUE ENGANAM AS LISTAS DE PALAVRAS ══
    # Engenharia (CAD e afins)
    "Fusion 360": "Engenharia",
    "Fusion360": "Engenharia",
    "Autodesk": "Engenharia",
    "SolidWorks": "Engenharia",
    "FreeCAD": "Engenharia",
    "CAD Expert": "Engenharia",
    "Hardware Expert": "Engenharia",
    "Field Service Technician": "Engenharia",
    "Nuclear Security Engineer": "Engenharia",
    # Programacao e TI
    "MCP Expert": "Programacao e Software",
    "GitHub": "Programacao e Software",
    "Security Onion": "Programacao e Software",
    "Information Systems Manager": "Programacao e Software",
    "Computer User Support": "Programacao e Software",
    "IT Manager": "Programacao e Software",
    "=Data Analyst": "Programacao e Software",
    "MLE Bench": "Programacao e Software",
    "Computer Vision Specialist": "Programacao e Software",
    "Prompt & Verifier": "Programacao e Software",
    # Financas, mesmo falando de Python ou de previsao
    "Finance Experts: US Modeling": "Financas e Contabilidade",
    "Sales Agent (Securities": "Financas e Contabilidade",
    # Fisica, mesmo com "mathematical" ou "statistical" no titulo
    "Mathematical Physicist": "Fisica e Astronomia",
    "Statistical Physics": "Fisica e Astronomia",
    # Psicologia e ciencias sociais
    "Suicide & Self-Harm Specialist": "Psicologia e Ciencias Sociais",
    "Trauma Specialist": "Psicologia e Ciencias Sociais",
    "Addiction Specialist": "Psicologia e Ciencias Sociais",
    "Mental Health Expert": "Psicologia e Ciencias Sociais",
    "Behavioral Analyst": "Psicologia e Ciencias Sociais",
    "Safeguarding & Exploitation": "Psicologia e Ciencias Sociais",
    "Eating Disorder": "Psicologia e Ciencias Sociais",
    "Context Elicitation": "Psicologia e Ciencias Sociais",
    # Saude
    "Hospitalist": "Medicina e Saude",
    # Direito
    "Document Reviewer": "Direito",
    "Data Privacy Analyst": "Direito",
    "Compliance & Risk Specialist": "Direito",
    "Professional Writing Human Data Collection - Legal": "Direito",
    # Contabilidade
    "UltraTax": "Financas e Contabilidade",
    # Economia e negocios
    "Revenue Operations": "Economia e Negocios",
    "Revenue Systems": "Economia e Negocios",
    "Shopify Specialist": "Economia e Negocios",
    "Purchasing Agent": "Economia e Negocios",
    "Product Manager": "Economia e Negocios",
    "Buildium Specialist": "Economia e Negocios",
    "Procore Specialist": "Economia e Negocios",
    "Toast POS Specialist": "Economia e Negocios",
    "Business Document Expert": "Economia e Negocios",
    "Legal Headhunter": "Economia e Negocios",
    # Educacao
    "Training & Development Specialist": "Educacao e Ensino",
    "Professional Writing Human Data Collection - Academic": "Educacao e Ensino",
    # Marketing e vendas
    "Brand & Creative Strategy": "Marketing e Vendas",
    "Sales Representatives": "Marketing e Vendas",
    "Professional Writing Human Data Collection": "Marketing e Vendas",
    # Design, video e arte
    "Audiovisual Producer": "Design e Criacao",
    "Filmmaker": "Design e Criacao",
    "Avid Media Composer": "Design e Criacao",
    "DaVinci Resolve": "Design e Criacao",
    "Producer (Film": "Design e Criacao",
    "Cinematography": "Design e Criacao",
    "Arts & Design Expert": "Design e Criacao",
    "Domain Expert - Art": "Design e Criacao",
    "Senior Design Expert": "Design e Criacao",
    # Humanidades
    "Book Editor": "Humanidades",
    "Generalist Search Expert": "Humanidades",   # procura doutores de humanas
    # Linguistica e traducao
    "Portuguese Language Specialist (Brazil)": "Linguistica",
    "AI Language Expert": "Linguistica",
    "Linguist for Patent": "Linguistica",
    # Musica e audio. O "=" faz valer so para o titulo exato: sem ele,
    # "Audio Expert" esconderia tambem a "Music and Audio experts".
    "=Audio Expert": "Musica e Audio",
    "Sound Engineer": "Musica e Audio",
    "Audio Engineer": "Musica e Audio",
    # Sem area propria
    "Board Game Reasoning Expert": "Outras areas",
    "Web Research Specialist": "Outras areas",
    "Web Research Task Author": "Outras areas",
    "Customer Support Task Author": "Outras areas",
    "Customer Support / Success Task Author": "Outras areas",
    "Technical Problem Author": "Outras areas",
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

# "Generalista" no titulo: vaga que nao pede formacao em area nenhuma. Fica
# na aba Vagas mesmo que o resto do titulo ou a descricao falem de alguma
# area. So uma linha em EXCECOES passa por cima disto.
GENERALISTA = ["generalist", "generalista"]

# Termos que enganam a palavra "engineer" e nao indicam area.
# ("ai engineer" e "engineering manager" sairam daqui em outubro de 2026:
# eram justamente os cargos de programacao senior que apareciam na aba Vagas.)
FALSOS_POSITIVOS = [
    "prompt engineer", "annotation engineer", "data engineer intern",
]

# Ordem importa: a primeira area que casar e a escolhida. Por isso
# Programacao vem antes de Engenharia ("Software Engineer" e programacao) e
# Meio Ambiente vem antes das duas ("Environmental Engineering").
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
        "epidemiologist", "pharmacovigilance", "regulatory affairs",
        "medicare", "medicaid", "patient", "ehr", "emr", "population health",
        "informaticist", "health data", "health informatics", "health policy",
        "digital health",
        "dietitian", "physical therapy", "medicina", "medico", "enfermagem",
        "saude", "farmaceutico",
    ]),
    ("Meio Ambiente e Ciencias da Terra", [
        "environmental", "forestry", "soil", "climate",
        "conservation", "wildlife", "earth science", "earth sciences",
        "geology", "geologist", "hydrology", "oceanography", "meio ambiente",
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
        "function call", "function calling", "machine learning",
        "security operations", "incident response", "threat intelligence",
        "data security", "penetration testing", "penetration tester",
        # titulos com "engineer" que sao de software, nao de engenharia
        "software engineering", "computer engineering", "infrastructure engineer",
        "systems engineer", "agent engineer", "applied engineer",
        "research engineer", "code quality", "dockerfile", "servicenow engineer",
        "cloud security", "security analyst", "security architect",
        "security expert", "iam", "vulnerability", "soc manager",
        "exploitation lead", "governance risk compliance", "ai architect",
        "computer vision", "llm research", "codebase", "data analysis",
        "data platform", "data infrastructure", "systems programmer",
        "code review", "software testing", "swe bench", "scientific coding",
        "lua",
        "programacao", "desenvolvedor",
    ]),
    ("Matematica e Estatistica", [
        "math", "maths", "mathematics", "mathematician", "mathematical",
        "calculus", "algebra", "geometry", "topology", "number theory",
        "statistics", "statistician", "statistical", "probability",
        "biostatistician", "lean 4", "lean", "mathlib", "formal verification",
        "formal methods", "formal proof", "theorem proving",
        "matematica", "estatistica",
    ]),
    ("Fisica e Astronomia", [
        "physics", "physicist", "astrophysics", "quantum", "astronomy",
        "astronomer", "thermodynamics", "mechanics phd", "physical scientist",
        "physical sciences", "fisica",
    ]),
    ("Quimica", [
        "chemistry", "chemist", "chemical", "biochemistry", "biochemist",
        "organic chemistry", "inorganic chemistry", "chemical engineering",
        "quimica",
    ]),
    ("Biologia e Ciencias da Vida", [
        "biology", "biologist", "biological", "molecular biology", "genetics",
        "genomics", "microbiology", "neuroscience", "ecology", "botany",
        "zoology", "bioinformatics", "biotech", "biotechnology",
        "drug discovery", "preclinical", "life science", "life sciences",
        "biologia",
    ]),
    ("Engenharia", [
        "engineering", "engineer", "mechanical", "electrical", "civil",
        "aerospace", "aeronautical", "industrial engineering", "materials",
        "material science", "electronics", "circuit", "eda", "kicad", "aerodynamics",
        "cfd", "robotics", "automation",
        # seguranca nuclear, radiologica e de explosivos
        "nuclear", "nonproliferation", "safeguards", "source security",
        "radiation safety", "radiological", "radiologicals",
        "energetic materials", "blasting", "propulsion", "hazardous device",
        "process safety",
        "engenharia", "engenheiro",
    ]),
    ("Financas e Contabilidade", [
        "finance", "financial", "accounting", "accountant", "cpa", "cfa",
        "audit", "auditor", "bookkeeping", "taxation", "tax analyst",
        "tax form", "tax expert", "tax preparer",
        "investment", "equity research", "banking", "actuarial", "actuary",
        "trading", "trader", "hedge fund", "private equity", "venture capital",
        "wealth management", "prediction market", "credit risk",
        "quantitative analyst", "bloomberg", "company analysis",
        "financas", "contabilidade", "contador",
    ]),
    ("Economia e Negocios", [
        "economics", "economist", "econometrics", "economic", "business analyst",
        "business strategy", "mba", "management consulting", "consultant",
        "supply chain", "logistics", "operations research", "human resources",
        "product owner", "product manager", "servicenow", "entrepreneurship",
        "business intelligence", "business operations", "business performance",
        "business teacher", "central bank", "compensation", "project manager",
        "project management", "program management", "product management",
        "product mangement", "hr", "people ops", "erp",
        "enterprise resource planning", "team management",
        "management leadership",
        "economia", "negocios",
    ]),
    ("Psicologia e Ciencias Sociais", [
        "psychology", "psychologist", "sociology", "sociologist",
        "anthropology", "anthropologist", "political science", "social work",
        "public policy", "policy analyst", "political scientist",
        "international relations", "criminology", "political", "politics",
        "elections",
        "psicologia", "sociologia",
    ]),
    ("Educacao e Ensino", [
        "education", "pedagogy", "instructional design", "curriculum",
        "educacao", "pedagogia",
    ]),
    ("Humanidades", [
        "history", "historian", "philosophy", "philosopher", "literature",
        "humanities", "religious studies", "theology", "archaeology",
        "classics", "reporter", "correspondent", "journalist",
        "religion", "historia", "filosofia", "literatura",
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
        "architecture", "photography", "creative writing",
        "screenwriting", "vfx",
    ]),
    ("Marketing e Vendas", [
        "marketing", "seo", "copywriting", "copywriter", "advertising",
        "brand strategy", "sales", "growth", "public relations",
        "social media analyst", "social insights",
    ]),
]

# ══════════════════════════════════════════════════════════════════
#  ESPECIALIDADES DENTRO DAS AREAS GRANDES
#
#  Um engenheiro eletricista nao quer ver vaga de mecanica. Nas areas com
#  muita vaga, o titulo tambem decide a especialidade. A primeira que casar
#  vale. Vaga que nao casa com nenhuma fica sem especialidade: e a vaga
#  generica da area ("Engineering Expert"), que o site mostra para todo
#  mundo que marcou a area.
#
#  Os nomes daqui (sem acento) tem que ser iguais aos do layout.js.
# ══════════════════════════════════════════════════════════════════
SUBAREAS = {
    "Programacao e Software": [
        ("Seguranca da Informacao", [
            "security", "cybersecurity", "cyber", "penetration", "soc", "iam",
            "identity", "threat", "vulnerability", "appsec", "exploitation",
            "incident response", "offensive", "dlp", "grc",
            "governance risk compliance",
        ]),
        ("Dados e Machine Learning", [
            "data scientist", "data science", "machine learning", "ml",
            "data engineer", "big data", "data analyst", "data analysis",
            "computer vision", "mle bench", "data platform", "llm research",
            "data quality", "scientific coding",
        ]),
        ("DevOps, Infraestrutura e TI", [
            "devops", "infrastructure", "insfrastructure", "platform engineer",
            "cloud", "systems", "hpc", "dockerfile", "docker", "iac", "linux",
            "it manager", "information systems", "user support",
            "windows 11", "macos sonoma", "vmware",
        ]),
        ("Desenvolvimento de Software", [
            "software", "developer", "backend", "back end", "frontend",
            "front end", "full stack", "fullstack", "python", "rust",
            "javascript", "typescript", "java", "golang", "go", "c++", "c#",
            "ruby", "lua", "coding", "coder", "code", "programmer", "swe",
            "github", "open source", "android studio", "pycharm",
            "visual studio code",
        ]),
    ],
    "Engenharia": [
        ("Eletrica e Eletronica", [
            "electrical", "electronics", "electronic", "circuit", "hardware",
            "firmware", "radio frequency", "electromagnetic", "eda", "kicad",
            "vivado", "quartus", "semiconductor",
        ]),
        ("Aeroespacial e Fluidos", [
            "aerospace", "aerodynamics", "aviation", "cfd", "fluid",
        ]),
        ("Mecanica e CAD", [
            "mechanical", "cad", "solidworks", "fusion", "fusion360",
            "inventor", "freecad", "autocad", "manufacturing", "machinist",
            "cnc", "mechatronics", "field service", "ndt", "source inspection",
        ]),
        ("Civil e Estruturas", [
            "civil", "structural", "construction",
        ]),
        ("Quimica, Materiais e Nuclear", [
            "chemical", "materials", "material science", "metallurgist",
            "welding", "nuclear", "blasting", "energetic", "hazardous",
            "process safety", "nonproliferation", "safeguards", "radiation",
            "radiological", "radiologicals", "source security", "propulsion",
        ]),
        ("Robotica e Controle", [
            "robotics", "robot", "control system", "automation",
        ]),
    ],
    "Medicina e Saude": [
        ("Dados e Informatica em Saude", [
            "informatics", "informaticist", "ehr", "emr", "data",
            "systems analyst", "business intelligence", "digital health",
            "coder", "auditor", "labeling", "annotator", "annotation",
        ]),
        ("Pesquisa Clinica e Regulatorio", [
            "clinical trial", "clinical study", "clinical researcher",
            "research scientist", "clinical scientist", "epidemiologist",
            "pharmacovigilance", "regulatory", "medical science liaison",
            "medical writer", "publications", "medical communications",
            "health policy",
        ]),
        ("Medicos, Enfermagem e Farmacia", [
            "nursing", "nurse", "pharmacist", "pharmacy",
            "physician", "m.d.", "md", "clinician", "hospitalist",
            "dermatology", "oncology", "medical expert", "resident",
            "medicine",
        ]),
    ],
    "Financas e Contabilidade": [
        ("Contabilidade e Impostos", [
            "accounting", "accountant", "auditor", "audit", "tax", "cpa",
            "bookkeeping", "ultratax", "cch", "fp a",
        ]),
        ("Mercado Financeiro e Investimentos", [
            "trading", "trader", "investment", "equity", "portfolio",
            "banking", "venture capital", "markets", "quant", "quantitative",
            "bloomberg", "wealth", "securities", "prediction market",
            "credit risk", "company analysis",
        ]),
    ],
    "Design e Criacao": [
        ("Video, Cinema e Animacao", [
            "video", "film", "filmmaker", "cinematography", "editor",
            "colorist", "animator", "animation", "vfx", "motion graphics",
            "premiere", "davinci", "producer", "audiovisual", "unreal",
            "blender", "3d",
        ]),
        ("Design Grafico, UX e Ilustracao", [
            "graphic", "ux", "ui", "designer", "illustrator", "illustration",
            "photoshop", "photographer", "art", "arts", "design",
        ]),
    ],
}


def classificar_subarea(area, titulo):
    """Devolve a especialidade da vaga dentro da area, ou "" se a vaga for
    a generica da area (ou se a area nao tiver especialidades)."""
    texto = normalizar(titulo)
    for nome, termos in SUBAREAS.get(area, []):
        for termo in termos:
            if _tem(texto, termo):
                return nome
    return ""

# Sinais de exigencia academica alta sem area clara no titulo.
ESPECIALISTA_GENERICO = [
    "phd", "phds", "ph.d", "doctorate", "postdoc", "post doc", "professor",
    "stem", "subject matter expert", "subject matter experts",
    "domain expert", "domain experts", "technical expert", "sme", "expert in",
    "specialist in", "graduate degree", "masters degree", "m.d.", "science",
    "master s degree", "master degree", "masters", "degree", "researcher",
    "research scientist",
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

    # 0b. generalista fica na aba Vagas
    for termo in GENERALISTA:
        if _tem(texto, termo):
            return None

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


def geral_por_regra(titulo):
    """True quando o titulo e geral por decisao explicita: excecao escrita a
    mao com "", palavra de generalista, portugues/Brasil ou trabalho geral do
    ramo. O coletor usa isto para nao deixar a dica de area da empresa
    esconder uma vaga que a gente decidiu mostrar."""
    texto = normalizar(titulo)
    for chave, area in EXCECOES.items():
        exato = chave.startswith("=")
        alvo = normalizar(chave[1:] if exato else chave)
        if alvo and (alvo == texto or (not exato and _tem(texto, alvo))):
            return not area
    listas = GENERALISTA + SEMPRE_GERAL + TRABALHO_GERAL
    return any(_tem(texto, termo) for termo in listas)


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
        ("Domain Expert - Enterprise Resource Planning (ERP)", "", "Economia e Negocios"),
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
        ("Professional Writing Human Data Collection - Academic and Education", "", "Educacao e Ensino"),
        ("Professional Writing Human Data Collection", "", "Marketing e Vendas"),
        ("Operations Lead", "", "Outras areas"),
        # ── generalista fica na aba Vagas ──
        ("Generalist", "Degree in any field is a plus.", "GERAL"),
        ("English Writing Generalist – Advanced", "", "GERAL"),
        ("Generalist (Must own MacBook)", "Bachelors from a prestigious institution.", "GERAL"),
        ("Generalist Search Expert", "", "Humanidades"),
        ("Security Operations Analyst", "", "Programacao e Software"),
        # ── Mercor inteira ──
        ("Audiobook QA Expert — Portuguese (Brazil)", "", "GERAL"),
        ("Video Annotation Expert", "", "GERAL"),
        ("Customer Service Expert", "", "GERAL"),
        ("Multilingual Image & Text AI Quality Expert", "", "GERAL"),
        ("Generalist Expert", "", "GERAL"),
        ("Quality Analyst", "", "GERAL"),
        ("Biotechnology Expert", "", "Biologia e Ciencias da Vida"),
        ("Consumer & Lifestyle Expert", "", "Outras areas"),
        ("HR & Administration Specialist Talent Network", "", "Economia e Negocios"),
        ("Radiation Safety Officer", "", "Engenharia"),
        ("Nonproliferation Analyst", "", "Engenharia"),
        ("Application Users - Photoshop on Windows - Generalist", "", "Design e Criacao"),
        ("Public Defenders — Paid Research Study", "", "Direito"),
        # ── revisao geral das areas ──
        ("Dockerfile Data Validation Engineer", "", "Programacao e Software"),
        ("Audio Engineer - Pro Tools", "", "Musica e Audio"),
        ("Environmental Engineering - AI Data Trainer", "", "Meio Ambiente e Ciencias da Terra"),
        ("Mathematical Physicist (PhD)", "", "Fisica e Astronomia"),
        ("Quantitative Analyst (Quant)", "", "Financas e Contabilidade"),
        ("E-commerce Data Analyst", "", "GERAL"),
        ("Map & Location Data Analyst", "", "GERAL"),
        ("Data Analyst", "", "Programacao e Software"),
        ("AI Data Quality Analyst", "", "GERAL"),
        ("Application Users - Vivado on Windows - STEM", "", "Engenharia"),
        ("Education & Training Expert", "", "Educacao e Ensino"),
        ("Legal Headhunter - Referral Partner", "", "Economia e Negocios"),
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

    SUBS = [
        ("Engenharia", "Electrical Engineering Expert", "Eletrica e Eletronica"),
        ("Engenharia", "Aerospace CAD Expert", "Aeroespacial e Fluidos"),
        ("Engenharia", "Senior Mechanical Design Engineer", "Mecanica e CAD"),
        ("Engenharia", "Engineering Expert", ""),
        ("Programacao e Software", "Backend Security Engineer", "Seguranca da Informacao"),
        ("Programacao e Software", "Machine Learning Engineer", "Dados e Machine Learning"),
        ("Programacao e Software", "Rust Developer", "Desenvolvimento de Software"),
        ("Medicina e Saude", "Nursing Informatics Specialist", "Dados e Informatica em Saude"),
        ("Medicina e Saude", "Hospitalist Physician", "Medicos, Enfermagem e Farmacia"),
        ("Financas e Contabilidade", "Accountant (CPA/CA)", "Contabilidade e Impostos"),
        ("Direito", "Corporate Attorney", ""),
    ]
    for area, titulo, esperado in SUBS:
        obtido = classificar_subarea(area, titulo)
        if obtido != esperado:
            falhas += 1
            print(f"ERRO especialidade de {titulo}: {obtido!r}, esperado {esperado!r}")

    print()
    if falhas:
        print(f"{falhas} caso(s) com resultado diferente do esperado.")
    else:
        print(f"Os {len(CASOS)} casos passaram.")
