#!/usr/bin/env python3
"""
HOME OFFICE HUB — Alerta de vagas novas por e-mail

Roda uma vez por dia no GitHub, logo depois do coletor. Pega as vagas
visíveis que ainda não foram avisadas e manda um e-mail para a lista de
inscritos no Brevo. Dia sem vaga nova não manda nada.

Cada pessoa recebe as vagas abertas a todos. Quem tem conta no Hub com o
mesmo e-mail da inscrição e marcou áreas de formação recebe também as
vagas novas dessas áreas, no mesmo e-mail. Vaga de uma formação nunca vai
para quem não marcou aquela área.

Como usar:
    python3 enviar_alerta.py              envia de verdade para a lista
    python3 enviar_alerta.py --teste      manda só para o e-mail da conta Brevo
    python3 enviar_alerta.py --previa     grava previa-alerta.html e
                                          previa-alerta-area.html, sem enviar
    --area="Direito"                      (com --teste ou --previa) escolhe a
                                          área do exemplo

Chaves, que no GitHub ficam em "secrets":
    BREVO_API_KEY   a chave do Brevo. Sem ela o script não faz nada e não dá
                    erro, para o robô de vagas continuar funcionando.
    ALERTA_CHAVE    o código que deixa o script perguntar ao Supabase quais
                    inscritos marcaram áreas (ver banco/alerta-areas.sql).
                    Sem ele, todo mundo recebe só as abertas a todos.

Os e-mails dos inscritos ficam SÓ no Brevo e no Supabase. Nada deles passa
por este repositório, que é público, nem aparece no registro da execução.
"""

import html
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

SITE = "https://alvittaluc.github.io/home-office-hub/"
API = "https://api.brevo.com/v3"

# O Supabase do site. A chave pública é a mesma do layout.js e sozinha não
# lê nada; quem abre a consulta das áreas é o ALERTA_CHAVE.
SUPABASE = "https://zrqucjktympnwilbvisw.supabase.co"
SUPABASE_CHAVE_PUBLICA = "sb_publishable_4X7Cyykz9ZDMWOTvauxibA_Tpa4KtAh"

# Nome da lista de contatos no Brevo. O script procura por este nome, então
# não precisa anotar número de lista em lugar nenhum.
NOME_DA_LISTA = "Alertas de vagas"
NOME_DO_REMETENTE = "Home Office Hub"

# O Brevo só manda campanha para lista. Então, nos dias com vaga de área,
# o script cria uma lista para cada grupo de pessoas que vai receber as
# mesmas vagas, dentro desta pasta. As listas de dias anteriores são
# apagadas sozinhas; os contatos continuam na lista principal.
PASTA_DAS_AREAS = "Alertas por área (automático)"
DIAS_ATE_APAGAR = 3

# Guarda quais vagas já foram avisadas. Sem ele, todo dia iria tudo de novo.
ARQUIVO_ENVIADOS = "alertas-enviados.json"

# Acima disso, em cada parte do e-mail, mostra as primeiras e manda ver o
# resto no site.
MAXIMO_NO_EMAIL = 15

# Vaga de área que ficou sem aviso por mais tempo que isso (por exemplo,
# porque a consulta das áreas falhou alguns dias) não vai mais.
DIAS_VAGA_NOVA = 7

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL = ssl.create_default_context()


# ═══════════════════════════════════════════════════════════════════
#  BREVO
# ═══════════════════════════════════════════════════════════════════

# A proteção do Brevo (Cloudflare) às vezes recusa pedidos vindos dos
# servidores do GitHub com "erro 1010", antes mesmo de olhar a chave. Isso
# depende de como o programa se apresenta. Tentamos uma identificação própria
# e, se ela for barrada, uma de navegador comum.
_IDENTIFICACOES = [
    "HomeOfficeHub-Alerta/1.0 (+https://alvittaluc.github.io/home-office-hub/)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36",
]


def brevo(metodo, caminho, corpo=None, discreto=False):
    """Chama a API do Brevo e devolve o JSON da resposta (ou {} se vazia).
    discreto: se der erro, não repete a resposta do Brevo, que nesses
    pedidos pode trazer e-mails de inscritos (o registro do GitHub é público)."""
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    ultimo = None
    for identificacao in _IDENTIFICACOES:
        req = urllib.request.Request(API + caminho, data=dados, method=metodo, headers={
            "api-key": os.environ["BREVO_API_KEY"],
            "accept": "application/json",
            "content-type": "application/json",
            "user-agent": identificacao,
        })
        try:
            with urllib.request.urlopen(req, timeout=40, context=_SSL) as r:
                texto = r.read().decode("utf-8")
            return json.loads(texto) if texto.strip() else {}
        except urllib.error.HTTPError as e:
            detalhe = e.read().decode("utf-8", errors="replace")[:300]
            barrado_na_porta = e.code == 403 and "1010" in detalhe
            if discreto:
                detalhe = "(resposta omitida)"
            ultimo = RuntimeError(f"Brevo recusou {metodo} {caminho.split('?')[0]}: HTTP {e.code} — {detalhe}")
            if not barrado_na_porta:
                break
            time.sleep(3)
    raise ultimo


def paginas(caminho, chave, por_pagina):
    """Percorre um resultado do Brevo que vem em páginas."""
    offset = 0
    sep = "&" if "?" in caminho else "?"
    while True:
        r = brevo("GET", f"{caminho}{sep}limit={por_pagina}&offset={offset}&sort=asc", discreto=True)
        itens = r.get(chave) or []
        yield from itens
        offset += len(itens)
        if not itens or offset >= int(r.get("count") or 0):
            return


def achar_lista():
    """Devolve (id, inscritos) da lista de alertas, ou (None, 0)."""
    for lista in paginas("/contacts/lists", "lists", 50):
        if (lista.get("name") or "").strip().lower() == NOME_DA_LISTA.lower():
            return lista["id"], int(lista.get("uniqueSubscribers") or 0)
    return None, 0


def achar_remetente():
    """O primeiro remetente ativo da conta. Sem domínio próprio, o Brevo troca
    o endereço por um dele na hora de enviar; com domínio, sai o seu."""
    try:
        for s in brevo("GET", "/senders").get("senders", []):
            if s.get("active"):
                return s["email"]
    except RuntimeError:
        pass   # sem a lista de remetentes, o e-mail da conta serve
    return brevo("GET", "/account")["email"]


def inscritos_da_lista(id_lista):
    """Os e-mails ativos da lista: sem quem saiu ou foi bloqueado."""
    emails = set()
    for c in paginas(f"/contacts/lists/{id_lista}/contacts", "contacts", 500):
        if c.get("emailBlacklisted") or c.get("listUnsubscribed"):
            continue
        e = (c.get("email") or "").strip().lower()
        if e:
            emails.add(e)
    return sorted(emails)


def achar_pasta():
    """Id da pasta das listas automáticas. Cria a pasta se ainda não existe."""
    for p in paginas("/contacts/folders", "folders", 10):
        if (p.get("name") or "").strip().lower() == PASTA_DAS_AREAS.lower():
            return p["id"]
    return brevo("POST", "/contacts/folders", {"name": PASTA_DAS_AREAS})["id"]


def apagar_listas_antigas(id_pasta):
    """Apaga as listas automáticas de dias anteriores. Os contatos não somem,
    continuam na lista principal. Falhar aqui não atrapalha o envio."""
    limite = (datetime.now(timezone.utc) - timedelta(days=DIAS_ATE_APAGAR)).strftime("%Y-%m-%d")
    try:
        velhas = []
        for lista in paginas(f"/contacts/folders/{id_pasta}/lists", "lists", 10):
            m = re.match(r"Alerta (\d{4}-\d{2}-\d{2}) ", lista.get("name") or "")
            if m and m.group(1) < limite:
                velhas.append(lista["id"])
        for i in velhas:
            brevo("DELETE", f"/contacts/lists/{i}")
    except RuntimeError as erro:
        print(f"  (não deu para apagar as listas antigas: {erro})")


def criar_lista(id_pasta, nome, emails):
    """Cria uma lista automática com estas pessoas (que já estão na principal)."""
    id_lista = brevo("POST", "/contacts/lists", {"name": nome[:150], "folderId": id_pasta})["id"]
    for i in range(0, len(emails), 150):   # o Brevo aceita até 150 por vez
        brevo("POST", f"/contacts/lists/{id_lista}/contacts/add",
              {"emails": emails[i:i + 150]}, discreto=True)
    return id_lista


def enviar_campanha(nome, assunto, conteudo, listas, remetente, excluir=None):
    destino = {"listIds": listas}
    if excluir:
        destino["exclusionListIds"] = excluir
    campanha = brevo("POST", "/emailCampaigns", {
        "name": nome[:150],
        "subject": assunto,
        "sender": {"name": NOME_DO_REMETENTE, "email": remetente},
        "type": "classic",
        "htmlContent": conteudo,
        "recipients": destino,
    })
    brevo("POST", f"/emailCampaigns/{campanha['id']}/sendNow")


# ═══════════════════════════════════════════════════════════════════
#  AS ÁREAS DE CADA INSCRITO
# ═══════════════════════════════════════════════════════════════════

def areas_dos_inscritos(emails):
    """Pergunta ao Supabase quem, entre os inscritos, tem conta no Hub com
    áreas marcadas. Devolve {email: (areas, especialidades)}, ou None se o
    ALERTA_CHAVE não estiver configurado."""
    chave = (os.environ.get("ALERTA_CHAVE") or "").strip()
    if not chave:
        return None
    perfis = {}
    for i in range(0, len(emails), 500):
        corpo = json.dumps({"p_chave": chave, "p_emails": emails[i:i + 500]}).encode("utf-8")
        req = urllib.request.Request(SUPABASE + "/rest/v1/rpc/alerta_areas", data=corpo, method="POST", headers={
            "apikey": SUPABASE_CHAVE_PUBLICA,
            "accept": "application/json",
            "content-type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=40, context=_SSL) as r:
                linhas = json.loads(r.read().decode("utf-8") or "[]")
        except urllib.error.HTTPError as e:
            detalhe = e.read().decode("utf-8", errors="replace")
            motivo = ("o ALERTA_CHAVE não confere com o código do Supabase"
                      if "chave" in detalhe else f"HTTP {e.code}")
            raise RuntimeError(f"Supabase recusou a consulta das áreas: {motivo}")
        except (urllib.error.URLError, TimeoutError) as e:
            raise RuntimeError(f"Supabase não respondeu à consulta das áreas: {e}")
        for linha in linhas:
            areas = [a for a in (linha.get("areas") or []) if isinstance(a, str)]
            subs = [s for s in (linha.get("subareas") or []) if isinstance(s, str)]
            if areas:
                perfis[(linha.get("email") or "").strip().lower()] = (areas, subs)
    return perfis


def serve(v, areas, subs):
    """A vaga de área serve para quem marcou estas áreas e especialidades?
    Mesma regra do site (vagaDasMinhasAreas, no layout.js): vale a área; se
    a pessoa marcou especialidades dela, entram as dessas especialidades e as
    genéricas da área."""
    area = v.get("area")
    if not area or area not in areas:
        return False
    dela = [s for s in subs if s.startswith(area + "/")]
    if not dela or not v.get("sub"):
        return True
    return f"{area}/{v['sub']}" in dela


def montar_grupos(inscritos, perfis, novas_esp):
    """Junta quem vai receber exatamente as mesmas vagas de área. A chave do
    grupo é a lista de vagas; () é quem recebe só as abertas a todos."""
    grupos = {}
    for email in inscritos:
        areas, subs = perfis.get(email, ([], []))
        chave = tuple(v["id"] for v in novas_esp if serve(v, areas, subs))
        grupos.setdefault(chave, []).append(email)
    return grupos


# ═══════════════════════════════════════════════════════════════════
#  VAGAS
# ═══════════════════════════════════════════════════════════════════

def ler_json(caminho, padrao):
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


_NOMES_EMPRESAS = None


def carregar_vagas(arquivo):
    global _NOMES_EMPRESAS
    if _NOMES_EMPRESAS is None:
        _NOMES_EMPRESAS = {e["id"]: e.get("nome", e["id"])
                           for e in ler_json("empresas.json", {}).get("empresas", [])}
    vagas = ler_json(arquivo, {}).get("vagas", [])
    for v in vagas:
        v["_empresa"] = _NOMES_EMPRESAS.get(v.get("empresa"), v.get("empresa", ""))
    # mais nova primeiro, pelo dia em que entrou no hub
    return sorted(vagas, key=lambda v: v.get("data_vista") or "", reverse=True)


def _ler_nomes_das_areas():
    """Os nomes das áreas do jeito que a pessoa lê, tirados do layout.js (a
    mesma lista do site). Se não der para ler, fica o nome do arquivo de
    vagas, que é o mesmo sem acento."""
    try:
        with open("layout.js", "r", encoding="utf-8") as f:
            js = f.read()
        bloco = js[js.index("const AREAS = ["):]
        bloco = bloco[:bloco.index("];")]
        return dict(re.findall(r'\["([^"]+)",\s*"([^"]+)"\]', bloco))
    except Exception:
        return {}


_NOMES_AREAS = _ler_nomes_das_areas()


def nome_area(area):
    return _NOMES_AREAS.get(area, area or "")


def juntar(nomes):
    """["A", "B", "C"] vira "A, B e C"."""
    if len(nomes) <= 1:
        return "".join(nomes)
    return ", ".join(nomes[:-1]) + " e " + nomes[-1]


def areas_das_vagas(vagas):
    """As áreas que aparecem nestas vagas, a com mais vagas primeiro."""
    conta = {}
    for v in vagas:
        conta[v.get("area")] = conta.get(v.get("area"), 0) + 1
    return sorted(conta, key=lambda a: (-conta[a], nome_area(a)))


def amostra_de_area(vagas, area=None):
    """Para a prévia e o teste: algumas vagas de uma área só (a pedida ou,
    sem pedido, a que tem mais vagas)."""
    if not vagas:
        return []
    area = area or areas_das_vagas(vagas)[0]
    return [v for v in vagas if v.get("area") == area][:4]


def encurtar(texto, limite=230):
    texto = " ".join((texto or "").split())
    if len(texto) <= limite:
        return texto
    corte = texto[:limite].rsplit(" ", 1)[0].rstrip(",;:")
    return corte + "…"


# ═══════════════════════════════════════════════════════════════════
#  O E-MAIL
# ═══════════════════════════════════════════════════════════════════

def assunto_para(gerais, da_area=None):
    if not da_area:
        if len(gerais) == 1:
            return f"Vaga nova: {gerais[0].get('titulo', '')}"[:120]
        return f"{len(gerais)} vagas novas no Home Office Hub"
    areas = areas_das_vagas(da_area)
    de = f"de {juntar([nome_area(a) for a in areas])}" if len(areas) <= 2 else "das suas áreas"
    k, g = len(da_area), len(gerais)
    if g == 0:
        if k == 1:
            return f"Vaga nova {de}: {da_area[0].get('titulo', '')}"[:120]
        return f"{k} vagas novas {de}"[:120]
    return f"{k} {'vaga' if k == 1 else 'vagas'} {de} e {g} {'aberta' if g == 1 else 'abertas'} a todos"[:120]


def _cartao(v):
    e = html.escape
    link = f"{SITE}vaga.html?id={urllib.parse.quote(v.get('id', ''))}"
    resumo = encurtar((v.get("resumo") or {}).get("o_que_faz", ""))
    linha_meta = " · ".join(p for p in (v["_empresa"], v.get("local")) if p)
    return f"""
          <tr><td style="padding:0 0 14px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #EAE4D9;border-radius:12px;">
              <tr><td style="padding:18px 20px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A94A1;letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px;">{e(linha_meta)}</div>
                <a href="{e(link)}" style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.3;color:#10203A;text-decoration:none;">{e(v.get('titulo', ''))}</a>
                {f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#54606F;margin-top:9px;">{e(resumo)}</div>' if resumo else ''}
                <div style="margin-top:14px;">
                  <a href="{e(link)}" style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:bold;color:#1A4893;text-decoration:none;">Ver a vaga →</a>
                </div>
              </td></tr>
            </table>
          </td></tr>"""


def _cartoes(vagas, link_resto, texto_resto, texto_link):
    """Os cartões das vagas, até o máximo, e a linha do resto. texto_resto é
    (singular, plural): o que vem entre "E mais N vagas novas" e o link."""
    mostradas = vagas[:MAXIMO_NO_EMAIL]
    resto = len(vagas) - len(mostradas)
    blocos = [_cartao(v) for v in mostradas]
    if resto > 0:
        blocos.append(f"""
          <tr><td style="padding:2px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;color:#54606F;">
            E mais {resto} {'vaga nova' if resto == 1 else 'vagas novas'} {texto_resto[0] if resto == 1 else texto_resto[1]}
            <a href="{html.escape(link_resto)}" style="color:#1A4893;">{texto_link}</a>.
          </td></tr>""")
    return "".join(blocos)


def _rotulo(texto):
    """O título pequeno de cada parte do e-mail com área."""
    return f"""
      <tr><td style="padding:10px 4px 12px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#1A4893;font-weight:bold;">{html.escape(texto)}</td></tr>"""


def montar_html(gerais, da_area=None):
    """E-mail em tabela e estilo embutido, que é o que os programas de e-mail
    entendem. Cores e tom iguais aos do site. Sem vagas de área, sai igual ao
    alerta de sempre; com elas, ganha uma parte para a área da pessoa."""
    e = html.escape
    da_area = da_area or []
    total = len(gerais) + len(da_area)
    quantas = "1 vaga nova" if total == 1 else f"{total} vagas novas"

    if not da_area:
        titulo = f"{quantas} para quem mora no Brasil"
        abertura = "Trabalho remoto com IA, dados e tradução. Estas entraram no hub desde o último aviso."
        corpo = _cartoes(gerais, f"{SITE}vagas.html", ("na", "na"), "lista completa")
        botao = ("Ver todas as vagas abertas", f"{SITE}vagas.html")
        nota_area = ""
    else:
        areas = areas_das_vagas(da_area)
        nomes = juntar([nome_area(a) for a in areas])
        qual = "a área" if len(areas) == 1 else "as áreas"
        titulo = f"{quantas} para você"
        abertura = (f"As abertas a todos e as de {nomes}, {qual} que você marcou na sua conta do Hub."
                    if gerais else
                    f"As vagas novas de {nomes}, {qual} que você marcou na sua conta do Hub.")
        link_area = (f"{SITE}vagas.html?area={urllib.parse.quote(areas[0])}" if len(areas) == 1
                     else f"{SITE}vagas.html?ver=voce")
        corpo = (_rotulo(("Da sua área · " if len(areas) == 1 else "Das suas áreas · ") + nomes)
                 + _cartoes(da_area, link_area, ("da sua área", "da sua área"), "no site"))
        if gerais:
            corpo += (_rotulo("Abertas a todos")
                      + _cartoes(gerais, f"{SITE}vagas.html", ("aberta a todos", "abertas a todos"), "no site"))
        botao = ("Ver a minha lista no site", f"{SITE}vagas.html?ver=voce")
        nota_area = (f"""As vagas de área seguem o que você marcou na sua conta do Hub.
        <a href="{SITE}entrar.html?areas=1&amp;voltar=vagas.html" style="color:#8A94A1;">Mudar as áreas</a><br><br>""")

    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(assunto_para(gerais, da_area))}</title></head>
<body style="margin:0;padding:0;background:#F7F4EF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding:0 4px 20px 4px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1A4893;font-weight:bold;">Home Office Hub</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#10203A;margin-top:8px;">{e(titulo)}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#54606F;margin-top:8px;">
          {e(abertura)}
        </div>
      </td></tr>
      {corpo}
      <tr><td style="padding:6px 4px 0 4px;">
        <a href="{e(botao[1])}" style="display:inline-block;background:#1A4893;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;">{e(botao[0])}</a>
      </td></tr>
      <tr><td style="padding:26px 4px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8A94A1;">
        {nota_area}Você recebe este e-mail porque se inscreveu nos alertas de vagas do Home Office Hub.
        Alguns links de vaga são de indicação: se você for contratado, a empresa paga uma comissão
        ao Hub.<br>
        <a href="{{{{ unsubscribe }}}}" style="color:#8A94A1;">Parar de receber</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


# ═══════════════════════════════════════════════════════════════════
#  PROGRAMA
# ═══════════════════════════════════════════════════════════════════

def gravar_enviados(estado, vistas, no_ar, enviou, especificas_desde):
    """Guarda os ids avisados: os das vagas no ar que já foram avisadas e um
    histórico recente, para a vaga que some e volta não ser avisada de novo."""
    atuais = list(dict.fromkeys(v["id"] for v in no_ar if v.get("id")))
    ids_no_ar = set(atuais)
    historico = [i for i in (estado or {}).get("ids", []) if i not in ids_no_ar][-3000:]
    agora = datetime.now(timezone.utc).isoformat()
    with open(ARQUIVO_ENVIADOS, "w", encoding="utf-8") as f:
        json.dump({
            "nota": ("Vagas que já foram avisadas por e-mail (as abertas a todos e as "
                     "de área). Mantido pelo enviar_alerta.py. Não edite à mão."),
            "ultimo_envio": agora if enviou else (estado or {}).get("ultimo_envio"),
            "conferido_em": agora,
            "especificas_desde": especificas_desde,
            "ids": historico + [i for i in atuais if i in vistas],
        }, f, ensure_ascii=False, indent=2)


def _aviso(texto):
    """Mostra o aviso no resumo da execução do GitHub, sem abrir o log."""
    print(f"  ⚠ {texto}")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::warning title=Alerta por e-mail::{' '.join(texto.split())[:400]}")


def main():
    modo_teste = "--teste" in sys.argv
    modo_previa = "--previa" in sys.argv
    area_exemplo = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--area=")), None)

    print("\n  ALERTA DE VAGAS POR E-MAIL")
    gerais = carregar_vagas("vagas.json")
    especificas = carregar_vagas("vagas-especificas.json")
    if not gerais:
        print("  ⚠ vagas.json vazio ou ilegível. Nada a fazer.")
        return
    no_ar = gerais + especificas

    estado = ler_json(ARQUIVO_ENVIADOS, None)
    vistas = set((estado or {}).get("ids", []))
    agora = datetime.now(timezone.utc)
    hoje = agora.strftime("%Y-%m-%d")

    # As vagas de área entraram no alerta depois. Na primeira vez, as que já
    # estão no ar viram ponto de partida, para ninguém receber o catálogo
    # inteiro de uma vez.
    especificas_desde = (estado or {}).get("especificas_desde")
    if not especificas_desde:
        vistas |= {v["id"] for v in especificas if v.get("id")}
        especificas_desde = hoje
        if estado is not None and not (modo_teste or modo_previa):
            print(f"  ✓ Vagas de área: {len(especificas)} no ar marcadas como ponto de partida.")

    novas_ger = [v for v in gerais if v.get("id") and v["id"] not in vistas]
    corte = (agora - timedelta(days=DIAS_VAGA_NOVA)).strftime("%Y-%m-%d")
    novas_esp = []
    for v in especificas:
        if not v.get("id") or v["id"] in vistas:
            continue
        if (v.get("data_vista") or "") < corte:
            vistas.add(v["id"])   # ficou velha sem aviso: não vai mais
        else:
            novas_esp.append(v)

    # Prévia e teste usam as vagas novas ou, se não houver, as mais recentes.
    amostra = novas_ger if (estado is not None and novas_ger) else gerais[:5]

    if modo_previa:
        amostra_area = amostra_de_area(especificas, area_exemplo)
        with open("previa-alerta.html", "w", encoding="utf-8") as f:
            f.write(montar_html(amostra).replace("{{ unsubscribe }}", "#"))
        with open("previa-alerta-area.html", "w", encoding="utf-8") as f:
            f.write(montar_html(amostra, amostra_area).replace("{{ unsubscribe }}", "#"))
        print(f"  ✓ previa-alerta.html ({len(amostra)} vaga(s)) e previa-alerta-area.html "
              f"(+{len(amostra_area)} de {nome_area(amostra_area[0]['area']) if amostra_area else '—'}) "
              "gravados. Nada foi enviado.")
        return

    if not os.environ.get("BREVO_API_KEY"):
        print("  (sem BREVO_API_KEY: alerta por e-mail desligado, nada foi enviado)")
        return

    if modo_teste:
        testar(amostra, novas_esp, especificas, area_exemplo)
        return

    # Primeira vez: ninguém recebe o catálogo inteiro. Só marca o ponto de
    # partida, e o primeiro e-mail sai quando entrar vaga nova de verdade.
    if estado is None:
        gravar_enviados(estado, {v["id"] for v in no_ar if v.get("id")}, no_ar, False, especificas_desde)
        print(f"  ✓ Primeira rodada: {len(no_ar)} vaga(s) marcadas como ponto de partida. "
              "O primeiro e-mail sai quando entrar vaga nova.")
        return

    if not novas_ger and not novas_esp:
        gravar_enviados(estado, vistas, no_ar, False, especificas_desde)
        print("  ✓ Nenhuma vaga nova desde o último aviso. Nada enviado.")
        return

    id_lista, total = achar_lista()
    if id_lista is None:
        raise RuntimeError(f"Não achei no Brevo a lista chamada \"{NOME_DA_LISTA}\".")
    inscritos = inscritos_da_lista(id_lista)
    if not inscritos:
        vistas |= {v["id"] for v in novas_ger + novas_esp}
        gravar_enviados(estado, vistas, no_ar, False, especificas_desde)
        print(f"  ✓ {len(novas_ger) + len(novas_esp)} vaga(s) nova(s), mas a lista ainda não tem inscritos. Nada enviado.")
        return

    # Quem marcou quais áreas. Sem o ALERTA_CHAVE, ou se a consulta falhar,
    # todo mundo recebe só as abertas a todos.
    perfis, consulta = {}, "sem_chave"
    if novas_esp:
        try:
            r = areas_dos_inscritos(inscritos)
            if r is not None:
                perfis, consulta = r, "ok"
        except RuntimeError as erro:
            consulta = "falhou"
            _aviso(f"{erro}. Hoje foram só as abertas a todos; as de área ficam para o próximo envio.")

    grupos = montar_grupos(inscritos, perfis, novas_esp)
    so_gerais = grupos.pop((), [])
    por_id = {v["id"]: v for v in novas_esp}
    remetente = achar_remetente()
    data_br = agora.strftime("%d/%m/%Y")

    saiu = set()          # ids que foram em pelo menos um envio que deu certo
    excluir = []          # listas que já receberam a sua versão
    pessoas, envios, falhas = 0, 0, []

    if grupos:
        id_pasta = achar_pasta()
        apagar_listas_antigas(id_pasta)
        for n, (chave, emails) in enumerate(sorted(grupos.items(), key=lambda g: -len(g[1])), 1):
            vagas_area = [por_id[i] for i in chave]
            nomes = juntar([nome_area(a) for a in areas_das_vagas(vagas_area)])
            try:
                id_grupo = criar_lista(id_pasta, f"Alerta {hoje} · grupo {n} · {nomes}", emails)
                enviar_campanha(f"Alerta de vagas {data_br} · {nomes}", assunto_para(novas_ger, vagas_area),
                                montar_html(novas_ger, vagas_area), [id_grupo], remetente)
            except RuntimeError as erro:
                falhas.append(f"grupo {n} ({nomes}): {erro}")
                so_gerais += emails   # recebem ao menos as abertas a todos
                continue
            excluir.append(id_grupo)
            saiu |= set(chave) | {v["id"] for v in novas_ger}
            pessoas += len(emails)
            envios += 1

    if novas_ger and so_gerais:
        try:
            enviar_campanha(f"Alerta de vagas {data_br}", assunto_para(novas_ger), montar_html(novas_ger),
                            [id_lista], remetente, excluir)
            saiu |= {v["id"] for v in novas_ger}
            pessoas += len(so_gerais)
            envios += 1
        except RuntimeError as erro:
            falhas.append(f"abertas a todos: {erro}")

    # O que conta como avisado. Vaga de área que não serve para nenhum
    # inscrito também conta, para não ficar esperando. Se a consulta das
    # áreas falhou, as de área ficam para o próximo envio.
    vistas |= saiu
    casadas = {i for chave in grupos for i in chave}
    if consulta == "ok":
        vistas |= {v["id"] for v in novas_esp if v["id"] not in casadas}
    elif consulta == "sem_chave":
        vistas |= {v["id"] for v in novas_esp}
    gravar_enviados(estado, vistas, no_ar, envios > 0, especificas_desde)

    de_area = len({i for i in saiu if i in por_id})
    if envios:
        print(f"  ✓ {envios} envio(s) para {pessoas} inscrito(s): {len(novas_ger)} vaga(s) aberta(s) a todos"
              f" e {de_area} de área.")
    elif not falhas:
        print(f"  ✓ {len(novas_esp)} vaga(s) de área nova(s), mas nenhuma é da área de quem está inscrito. "
              "Nada enviado.")
    if falhas:
        raise RuntimeError(f"{len(falhas)} envio(s) não saíram. " + " | ".join(falhas))


def testar(amostra, novas_esp, especificas, area_exemplo=None):
    """Manda um exemplo do e-mail com área só para o dono da conta Brevo e
    confere se a consulta das áreas funciona, sem mandar nada para a lista.
    O exemplo usa a área mais marcada pelos inscritos, se der para saber."""
    # O teste usa o mesmo caminho do envio de verdade (campanha), só que
    # com o "enviar teste" do Brevo, que manda apenas para o dono da conta.
    # Conta nova do Brevo não vem com e-mail transacional liberado, por
    # isso o teste não usa /smtp/email.
    conta = brevo("GET", "/account")
    id_lista, total = achar_lista()
    if id_lista is None:
        raise RuntimeError(f"Não achei no Brevo a lista chamada \"{NOME_DA_LISTA}\".")
    if total == 0:
        raise RuntimeError(
            f"A lista \"{NOME_DA_LISTA}\" ainda não tem nenhum inscrito, e o Brevo não "
            "monta envio para lista vazia. Inscreva um e-mail pelo campo do site, "
            "confirme pelo link que chega, e rode o teste de novo.")

    inscritos = inscritos_da_lista(id_lista)
    perfis = None
    try:
        perfis = areas_dos_inscritos(inscritos)
        if perfis is None:
            print("  (sem ALERTA_CHAVE: no envio de verdade, todo mundo recebe só as abertas a todos)")
        else:
            print(f"  ✓ Consulta das áreas funcionando: {len(inscritos)} inscrito(s), "
                  f"{len(perfis)} com conta no Hub e áreas marcadas.")
            grupos = montar_grupos(inscritos, perfis, novas_esp)
            por_id = {v["id"]: v for v in novas_esp}
            for chave, emails in grupos.items():
                if chave:
                    nomes = juntar([nome_area(a) for a in areas_das_vagas([por_id[i] for i in chave])])
                    print(f"    · {len(emails)} pessoa(s) receberiam hoje {len(chave)} vaga(s) de {nomes}")
    except RuntimeError as erro:
        _aviso(str(erro))

    if not area_exemplo and perfis:
        marcadas = {}
        for areas, _ in perfis.values():
            for a in areas:
                marcadas[a] = marcadas.get(a, 0) + 1
        com_vaga = [a for a in sorted(marcadas, key=lambda a: -marcadas[a])
                    if any(v.get("area") == a for v in especificas)]
        area_exemplo = com_vaga[0] if com_vaga else None
    fonte = [v for v in novas_esp if v.get("area") == area_exemplo] if area_exemplo else novas_esp
    amostra_area = amostra_de_area(fonte or especificas, area_exemplo)

    campanha = brevo("POST", "/emailCampaigns", {
        "name": "[TESTE] Alerta de vagas " + datetime.now().strftime("%d/%m/%Y %H:%M"),
        "subject": "[TESTE] " + assunto_para(amostra, amostra_area),
        "sender": {"name": NOME_DO_REMETENTE, "email": achar_remetente()},
        "type": "classic",
        "htmlContent": montar_html(amostra, amostra_area),
        "recipients": {"listIds": [id_lista]},
    })
    brevo("POST", f"/emailCampaigns/{campanha['id']}/sendTest", {"emailTo": [conta["email"]]})
    print(f"  ✓ Teste enviado só para o e-mail da conta Brevo: {len(amostra_area)} vaga(s) de exemplo de "
          f"{nome_area(amostra_area[0]['area']) if amostra_area else '—'} e {len(amostra)} aberta(s) a todos. "
          "A campanha de teste fica como rascunho no Brevo e não vai para a lista.")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        # Falha no e-mail nunca pode derrubar a atualização das vagas.
        print(f"  ⚠ Alerta por e-mail falhou: {erro}")
        # No GitHub, esta linha faz o motivo aparecer no resumo da execução,
        # sem precisar abrir o log. A mensagem do Brevo não contém a chave.
        if os.environ.get("GITHUB_ACTIONS") == "true":
            limpo = " ".join(str(erro).split())[:400]
            print(f"::error title=Alerta por e-mail::{limpo}")
        sys.exit(1)
