#!/usr/bin/env python3
"""
HOME OFFICE HUB — Alerta de vagas novas por e-mail

Roda uma vez por dia no GitHub, logo depois do coletor. Pega as vagas
visíveis que ainda não foram avisadas, monta um e-mail só com elas e manda
para a lista de inscritos no Brevo. Dia sem vaga nova não manda nada.

Como usar:
    python3 enviar_alerta.py              envia de verdade para a lista
    python3 enviar_alerta.py --teste      manda só para o e-mail da conta Brevo
    python3 enviar_alerta.py --previa     grava previa-alerta.html, sem enviar

A chave do Brevo vem da variável de ambiente BREVO_API_KEY (no GitHub, um
"secret" com esse nome). Sem a chave o script não faz nada e não dá erro,
para o robô de vagas continuar funcionando normalmente.

Os e-mails dos inscritos ficam SÓ no Brevo. Nada deles passa por este
repositório, que é público.
"""

import html
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SITE = "https://alvittaluc.github.io/home-office-hub/"
API = "https://api.brevo.com/v3"

# Nome da lista de contatos no Brevo. O script procura por este nome, então
# não precisa anotar número de lista em lugar nenhum.
NOME_DA_LISTA = "Alertas de vagas"
NOME_DO_REMETENTE = "Home Office Hub"

# Guarda quais vagas já foram avisadas. Sem ele, todo dia iria tudo de novo.
ARQUIVO_ENVIADOS = "alertas-enviados.json"

# Acima disso o e-mail mostra as primeiras e manda ver o resto no site.
MAXIMO_NO_EMAIL = 15

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


def brevo(metodo, caminho, corpo=None):
    """Chama a API do Brevo e devolve o JSON da resposta (ou {} se vazia)."""
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    ultimo = None
    for tentativa, identificacao in enumerate(_IDENTIFICACOES):
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
            ultimo = RuntimeError(f"Brevo recusou {metodo} {caminho}: HTTP {e.code} — {detalhe}")
            barrado_na_porta = e.code == 403 and "1010" in detalhe
            if not barrado_na_porta:
                break
            time.sleep(3)
    raise ultimo


def achar_lista():
    """Devolve (id, inscritos) da lista de alertas, ou (None, 0)."""
    resposta = brevo("GET", "/contacts/lists?limit=50&offset=0")
    for lista in resposta.get("lists", []):
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


# ═══════════════════════════════════════════════════════════════════
#  VAGAS
# ═══════════════════════════════════════════════════════════════════

def ler_json(caminho, padrao):
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def carregar_vagas():
    vagas = ler_json("vagas.json", {}).get("vagas", [])
    nomes = {e["id"]: e.get("nome", e["id"])
             for e in ler_json("empresas.json", {}).get("empresas", [])}
    for v in vagas:
        v["_empresa"] = nomes.get(v.get("empresa"), v.get("empresa", ""))
    # mais nova primeiro, pelo dia em que entrou no hub
    return sorted(vagas, key=lambda v: v.get("data_vista") or "", reverse=True)


def encurtar(texto, limite=230):
    texto = " ".join((texto or "").split())
    if len(texto) <= limite:
        return texto
    corte = texto[:limite].rsplit(" ", 1)[0].rstrip(",;:")
    return corte + "…"


# ═══════════════════════════════════════════════════════════════════
#  O E-MAIL
# ═══════════════════════════════════════════════════════════════════

def assunto_para(novas):
    if len(novas) == 1:
        return f"Vaga nova: {novas[0].get('titulo', '')}"[:120]
    return f"{len(novas)} vagas novas no Home Office Hub"


def montar_html(novas):
    """E-mail em tabela e estilo embutido, que é o que os programas de e-mail
    entendem. Cores e tom iguais aos do site."""
    e = html.escape
    mostradas = novas[:MAXIMO_NO_EMAIL]
    resto = len(novas) - len(mostradas)

    blocos = []
    for v in mostradas:
        link = f"{SITE}vaga.html?id={v.get('id', '')}"
        resumo = encurtar((v.get("resumo") or {}).get("o_que_faz", ""))
        linha_meta = " · ".join(p for p in (v["_empresa"], v.get("local")) if p)
        blocos.append(f"""
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
          </td></tr>""")

    if resto > 0:
        blocos.append(f"""
          <tr><td style="padding:2px 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;color:#54606F;">
            E mais {resto} {'vaga nova' if resto == 1 else 'vagas novas'} na
            <a href="{SITE}vagas.html" style="color:#1A4893;">lista completa</a>.
          </td></tr>""")

    quantas = ("1 vaga nova" if len(novas) == 1 else f"{len(novas)} vagas novas")
    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(assunto_para(novas))}</title></head>
<body style="margin:0;padding:0;background:#F7F4EF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding:0 4px 20px 4px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1A4893;font-weight:bold;">Home Office Hub</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#10203A;margin-top:8px;">{quantas} para quem mora no Brasil</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#54606F;margin-top:8px;">
          Trabalho remoto com IA, dados e tradução. Estas entraram no hub desde o último aviso.
        </div>
      </td></tr>
      {''.join(blocos)}
      <tr><td style="padding:6px 4px 0 4px;">
        <a href="{SITE}vagas.html" style="display:inline-block;background:#1A4893;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;">Ver todas as vagas abertas</a>
      </td></tr>
      <tr><td style="padding:26px 4px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8A94A1;">
        Você recebe este e-mail porque se inscreveu nos alertas de vagas do Home Office Hub.
        Alguns links de vaga são de indicação: se você for contratado, a empresa paga uma comissão
        ao Hub, sem nenhum custo para você.<br>
        <a href="{{{{ unsubscribe }}}}" style="color:#8A94A1;">Parar de receber</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


# ═══════════════════════════════════════════════════════════════════
#  PROGRAMA
# ═══════════════════════════════════════════════════════════════════

def gravar_enviados(ids_antigos, vagas, enviou):
    """Guarda os ids avisados. Mantém os das vagas que ainda existem e mais um
    histórico recente, para a vaga que some e volta não ser avisada de novo."""
    atuais = [v["id"] for v in vagas if v.get("id")]
    historico = [i for i in ids_antigos if i not in set(atuais)][-1500:]
    anterior = ler_json(ARQUIVO_ENVIADOS, {})
    agora = datetime.now(timezone.utc).isoformat()
    with open(ARQUIVO_ENVIADOS, "w", encoding="utf-8") as f:
        json.dump({
            "nota": ("Vagas que já foram avisadas por e-mail. Mantido pelo "
                     "enviar_alerta.py. Não edite à mão."),
            "ultimo_envio": agora if enviou else anterior.get("ultimo_envio"),
            "conferido_em": agora,
            "ids": historico + atuais,
        }, f, ensure_ascii=False, indent=2)


def main():
    modo_teste = "--teste" in sys.argv
    modo_previa = "--previa" in sys.argv

    print("\n  ALERTA DE VAGAS POR E-MAIL")
    vagas = carregar_vagas()
    if not vagas:
        print("  ⚠ vagas.json vazio ou ilegível. Nada a fazer.")
        return

    estado = ler_json(ARQUIVO_ENVIADOS, None)
    ja_avisadas = set((estado or {}).get("ids", []))
    novas = [v for v in vagas if v.get("id") and v["id"] not in ja_avisadas]

    # Prévia e teste usam as vagas novas ou, se não houver, as 5 mais recentes.
    amostra = novas if (estado is not None and novas) else vagas[:5]

    if modo_previa:
        with open("previa-alerta.html", "w", encoding="utf-8") as f:
            f.write(montar_html(amostra).replace("{{ unsubscribe }}", "#"))
        print(f"  ✓ previa-alerta.html gravado com {len(amostra)} vaga(s). Nada foi enviado.")
        return

    if not os.environ.get("BREVO_API_KEY"):
        print("  (sem BREVO_API_KEY: alerta por e-mail desligado, nada foi enviado)")
        return

    if modo_teste:
        # O teste usa o mesmo caminho do envio de verdade (campanha), só que
        # com o "enviar teste" do Brevo, que manda apenas para o dono da conta.
        # Conta nova do Brevo não vem com e-mail transacional liberado, por
        # isso o teste não usa /smtp/email.
        conta = brevo("GET", "/account")
        id_lista, inscritos = achar_lista()
        if id_lista is None:
            raise RuntimeError(f"Não achei no Brevo a lista chamada \"{NOME_DA_LISTA}\".")
        if inscritos == 0:
            raise RuntimeError(
                f"A lista \"{NOME_DA_LISTA}\" ainda não tem nenhum inscrito, e o Brevo não "
                "monta envio para lista vazia. Inscreva um e-mail pelo campo do site, "
                "confirme pelo link que chega, e rode o teste de novo.")
        campanha = brevo("POST", "/emailCampaigns", {
            "name": "[TESTE] Alerta de vagas " + datetime.now().strftime("%d/%m/%Y %H:%M"),
            "subject": "[TESTE] " + assunto_para(amostra),
            "sender": {"name": NOME_DO_REMETENTE, "email": achar_remetente()},
            "type": "classic",
            "htmlContent": montar_html(amostra),
            "recipients": {"listIds": [id_lista]},
        })
        brevo("POST", f"/emailCampaigns/{campanha['id']}/sendTest",
              {"emailTo": [conta["email"]]})
        print(f"  ✓ Teste enviado só para o e-mail da conta Brevo, com {len(amostra)} vaga(s). "
              "A campanha de teste fica como rascunho no Brevo e não vai para a lista.")
        return

    # Primeira vez: ninguém recebe o catálogo inteiro. Só marca o ponto de
    # partida, e o primeiro e-mail sai quando entrar vaga nova de verdade.
    if estado is None:
        gravar_enviados([], vagas, enviou=False)
        print(f"  ✓ Primeira rodada: {len(vagas)} vaga(s) marcadas como ponto de partida. "
              "O primeiro e-mail sai quando entrar vaga nova.")
        return

    if not novas:
        gravar_enviados(estado.get("ids", []), vagas, enviou=False)
        print("  ✓ Nenhuma vaga nova desde o último aviso. Nada enviado.")
        return

    id_lista, inscritos = achar_lista()
    if id_lista is None:
        raise RuntimeError(f"Não achei no Brevo a lista chamada \"{NOME_DA_LISTA}\".")

    if inscritos == 0:
        gravar_enviados(estado.get("ids", []), vagas, enviou=False)
        print(f"  ✓ {len(novas)} vaga(s) nova(s), mas a lista ainda não tem inscritos. Nada enviado.")
        return

    hoje = datetime.now().strftime("%d/%m/%Y")
    campanha = brevo("POST", "/emailCampaigns", {
        "name": f"Alerta de vagas {hoje}",
        "subject": assunto_para(novas),
        "sender": {"name": NOME_DO_REMETENTE, "email": achar_remetente()},
        "type": "classic",
        "htmlContent": montar_html(novas),
        "recipients": {"listIds": [id_lista]},
    })
    brevo("POST", f"/emailCampaigns/{campanha['id']}/sendNow")

    # Só marca como avisadas depois que o Brevo aceitou o envio. Se falhar
    # antes, as mesmas vagas entram na tentativa de amanhã.
    gravar_enviados(estado.get("ids", []), vagas, enviou=True)
    print(f"  ✓ E-mail enviado para {inscritos} inscrito(s), com {len(novas)} vaga(s) nova(s).")


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
