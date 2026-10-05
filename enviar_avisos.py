#!/usr/bin/env python3
"""
HOME OFFICE HUB — Avisos por e-mail das mentorias

Roda de 15 em 15 minutos no GitHub. Pega no Supabase os avisos que estão
na fila (pedido de entrada num grupo, pedido aceito, resposta de denúncia,
pedido novo de mentor...), manda um e-mail para cada pessoa pelo Brevo e
marca como enviado. Fila vazia: não faz nada.

Quem decide quem recebe o quê é o banco (banco/avisos.sql). Este script só
escreve o e-mail e envia.

Como usar:
    python3 enviar_avisos.py            envia o que estiver na fila
    python3 enviar_avisos.py --teste    confere a conta do Brevo e manda um
                                        e-mail de exemplo só para o dono dela
    python3 enviar_avisos.py --previa   grava previa-aviso.html, sem enviar

Chaves, que no GitHub ficam em "secrets" (as mesmas do alerta de vagas):
    BREVO_API_KEY   a chave do Brevo
    ALERTA_CHAVE    o código que abre a fila no Supabase

Sem uma das duas o script não faz nada e não dá erro. Nenhum e-mail de
pessoa aparece no registro da execução, que é público.
"""

import html
import json
import os
import sys
import urllib.error
import urllib.request

from enviar_alerta import (NOME_DO_REMETENTE, SITE, SUPABASE, SUPABASE_CHAVE_PUBLICA, _SSL,
                           achar_remetente, brevo)

# Quantos avisos por rodada. O plano gratuito do Brevo manda 300 e-mails por
# dia, somando com o alerta de vagas; 40 a cada 15 minutos sobra para os dois.
POR_RODADA = 40


# ═══════════════════════════════════════════════════════════════════
#  SUPABASE
# ═══════════════════════════════════════════════════════════════════

def supabase(funcao, corpo):
    """Chama uma função do banco. O código vai no corpo, nunca no endereço."""
    req = urllib.request.Request(
        SUPABASE + "/rest/v1/rpc/" + funcao, data=json.dumps(corpo).encode("utf-8"), method="POST",
        headers={"apikey": SUPABASE_CHAVE_PUBLICA, "accept": "application/json", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40, context=_SSL) as r:
            texto = r.read().decode("utf-8")
        return json.loads(texto) if texto.strip() else None
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode("utf-8", errors="replace")
        motivo = ("o ALERTA_CHAVE não confere com o código do Supabase" if "chave" in detalhe
                  else f"HTTP {e.code}")
        raise RuntimeError(f"Supabase recusou {funcao}: {motivo}")
    except (urllib.error.URLError, TimeoutError) as e:
        raise RuntimeError(f"Supabase não respondeu a {funcao}: {e}")


# ═══════════════════════════════════════════════════════════════════
#  O TEXTO DE CADA AVISO
# ═══════════════════════════════════════════════════════════════════

def escrever(tipo, d):
    """Devolve (assunto, título, parágrafos em HTML, texto do botão, link do
    botão) para um aviso, ou None se o tipo não for conhecido. Tudo o que vem
    do banco passa por html.escape antes de entrar no texto."""
    e = html.escape
    quem = e(d.get("quem") or "Uma pessoa")
    vaga = e(d.get("vaga") or "")
    da_mentoria = f"{SITE}mentoria.html?id={d.get('mentoria', '')}"
    motivo = e((d.get("motivo") or "").strip())
    com_motivo = f" Motivo informado pela equipe: {motivo}" if motivo else ""
    if com_motivo and not com_motivo.rstrip().endswith((".", "!", "?")):
        com_motivo += "."

    if tipo == "pedido_entrada":
        return (f"{d.get('quem') or 'Uma pessoa'} pediu para entrar na sua mentoria",
                "Novo pedido de entrada",
                [f"<b>{quem}</b> pediu para entrar na mentoria <b>{vaga}</b>.",
                 "Na aba Participantes você lê a mensagem e aceita ou recusa."],
                "Ver o pedido", da_mentoria)
    if tipo == "entrada_aceita":
        return (f"Você entrou na mentoria {d.get('vaga') or ''}".strip(),
                "Seu pedido foi aceito",
                [f"<b>{quem}</b> aceitou você na mentoria <b>{vaga}</b>.",
                 "O mural do grupo já está aberto para você."],
                "Abrir o mural", da_mentoria)
    if tipo == "entrada_recusada":
        return (f"Seu pedido para a mentoria {d.get('vaga') or ''}".strip(),
                "Seu pedido não foi aceito desta vez",
                [f"<b>{quem}</b> não liberou a sua entrada na mentoria <b>{vaga}</b>.",
                 "Se você já se candidatou à vaga e acha que foi engano, dá para pedir de novo explicando."],
                "Ver a mentoria", da_mentoria)
    if tipo == "participacao_encerrada":
        return (f"Sua participação na mentoria {d.get('vaga') or ''}".strip(),
                "Você saiu do grupo",
                [f"<b>{quem}</b> encerrou a sua participação na mentoria <b>{vaga}</b>.",
                 "O mural desse grupo deixa de aparecer para você."],
                "Ver outras mentorias", f"{SITE}mentorias.html")
    if tipo == "mentor_novo":
        empresa = e(d.get("empresa") or "")
        return (f"Novo pedido de mentor: {d.get('vaga') or ''}".strip(),
                "Novo pedido de mentor",
                [f"<b>{quem}</b> quer abrir uma mentoria para <b>{vaga}</b>" + (f", na {empresa}." if empresa else "."),
                 "O pedido e os comprovantes estão no Painel da equipe."],
                "Abrir o painel", f"{SITE}painel.html#mentorias")
    if tipo == "mentoria_aprovada":
        return ("Sua mentoria foi aprovada",
                "Sua mentoria está no ar",
                [f"A equipe do Hub aprovou a mentoria <b>{vaga}</b>.",
                 "Quando alguém pedir para entrar no grupo, você recebe um aviso como este."],
                "Abrir a mentoria", da_mentoria)
    if tipo == "mentoria_recusada":
        return ("Seu pedido de mentoria não foi aprovado",
                "Seu pedido de mentoria não foi aprovado",
                [f"A equipe do Hub não aprovou o pedido para <b>{vaga}</b>.{com_motivo}",
                 "Você pode ajustar o que faltou e enviar um pedido novo."],
                "Ver o pedido", da_mentoria)
    if tipo == "mentoria_encerrada":
        return (f"A mentoria {d.get('vaga') or ''} foi encerrada".replace("  ", " "),
                "Sua mentoria foi encerrada pela equipe",
                [f"A equipe do Hub encerrou a mentoria <b>{vaga}</b>.{com_motivo}",
                 "O mural continua disponível, só para leitura."],
                "Abrir a mentoria", da_mentoria)
    if tipo == "denuncia_nova":
        sobre = "uma mensagem do mural" if d.get("alvo") == "post" else "uma mentoria"
        onde = f", na mentoria <b>{vaga}</b>" if vaga else ""
        return ("Nova denúncia nas mentorias",
                "Nova denúncia",
                [f"Chegou uma denúncia sobre {sobre}{onde}.",
                 "Ela está no Painel da equipe, na aba Denúncias."],
                "Abrir o painel", f"{SITE}painel.html#denuncias")
    if tipo == "denuncia_resposta_equipe":
        return ("A equipe do Hub respondeu à sua denúncia",
                "Há uma resposta na sua denúncia",
                ["A equipe do Hub escreveu na conversa da sua denúncia.",
                 "Ela aparece em Mentorias, na aba Suas denúncias."],
                "Ler a resposta", f"{SITE}mentorias.html#denuncias")
    if tipo == "denuncia_resposta_autor":
        return ("Resposta numa denúncia",
                "Resposta numa denúncia",
                ["Quem fez a denúncia respondeu à equipe.",
                 "A conversa está no Painel da equipe, na aba Denúncias."],
                "Abrir o painel", f"{SITE}painel.html#denuncias")
    if tipo == "denuncia_resolvida":
        return ("Sua denúncia foi encerrada",
                "Sua denúncia foi encerrada",
                ["A equipe do Hub encerrou a sua denúncia.",
                 "Em Mentorias, na aba Suas denúncias, você vê a conversa e pode avaliar o atendimento."],
                "Ver a denúncia", f"{SITE}mentorias.html#denuncias")
    return None


def montar_html(assunto, titulo, paragrafos, botao, link):
    """Mesmo desenho do alerta de vagas: tabela e estilo embutido."""
    e = html.escape
    corpo = "".join(
        f'<p style="font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:#54606F;margin:0 0 12px 0;">{p}</p>'
        for p in paragrafos)
    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(assunto)}</title></head>
<body style="margin:0;padding:0;background:#F7F4EF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 16px 4px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1A4893;font-weight:bold;">Home Office Hub · Mentorias</div>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #EAE4D9;border-radius:14px;padding:26px 26px 24px 26px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.22;color:#10203A;margin:0 0 14px 0;">{e(titulo)}</div>
        {corpo}
        <div style="margin-top:20px;">
          <a href="{e(link)}" style="display:inline-block;background:#1A4893;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;">{e(botao)}</a>
        </div>
      </td></tr>
      <tr><td style="padding:20px 4px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#66717F;">
        Você recebe este aviso porque usa as mentorias do Home Office Hub.
        Para parar de receber, desligue os avisos por e-mail no
        <a href="{SITE}perfil.html" style="color:#66717F;">seu perfil</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


# ═══════════════════════════════════════════════════════════════════
#  ENVIO
# ═══════════════════════════════════════════════════════════════════

def enviar_email(remetente, para, assunto, conteudo):
    brevo("POST", "/smtp/email", {
        "sender": {"name": NOME_DO_REMETENTE, "email": remetente},
        "to": [{"email": para}],
        "subject": assunto[:150],
        "htmlContent": conteudo,
        "tags": ["aviso-mentoria"],
    }, discreto=True)


def sem_repetir(avisos):
    """Quando a equipe responde e encerra uma denúncia de uma vez, saem dois
    avisos para a mesma pessoa. Fica só o do encerramento; o outro é marcado
    como enviado sem mandar nada."""
    encerradas = {(tuple(a.get("emails") or []), (a.get("dados") or {}).get("denuncia"))
                  for a in avisos if a.get("tipo") == "denuncia_resolvida"}
    mandar, pular = [], []
    for a in avisos:
        chave = (tuple(a.get("emails") or []), (a.get("dados") or {}).get("denuncia"))
        if a.get("tipo") == "denuncia_resposta_equipe" and chave in encerradas:
            pular.append(a)
        else:
            mandar.append(a)
    return mandar, pular


def exemplo():
    return escrever("pedido_entrada", {"quem": "Bia Lima", "vaga": "Search Quality Rater, português (Brasil)",
                                       "mentoria": "exemplo"})


def main():
    print("\n  AVISOS DAS MENTORIAS POR E-MAIL")

    if "--previa" in sys.argv:
        with open("previa-aviso.html", "w", encoding="utf-8") as f:
            f.write(montar_html(*exemplo()))
        print("  ✓ previa-aviso.html gravado. Nada foi enviado.")
        return

    if not os.environ.get("BREVO_API_KEY"):
        print("  (sem BREVO_API_KEY: avisos por e-mail desligados, nada foi enviado)")
        return

    if "--teste" in sys.argv:
        conta = brevo("GET", "/account")
        liberado = bool(((conta.get("relay") or {}).get("enabled")))
        print(f"  E-mail um a um (transacional) no Brevo: {'liberado' if liberado else 'NÃO liberado'}")
        assunto, titulo, paragrafos, botao, link = exemplo()
        enviar_email(achar_remetente(), conta["email"], "[TESTE] " + assunto,
                     montar_html(assunto, titulo, paragrafos, botao, link))
        print("  ✓ E-mail de exemplo enviado só para o dono da conta Brevo.")
        if os.environ.get("ALERTA_CHAVE"):
            fila = supabase("avisos_pendentes", {"p_chave": os.environ["ALERTA_CHAVE"].strip(), "p_limite": 1})
            print(f"  ✓ Fila do Supabase respondendo ({len(fila or [])} aviso(s) esperando, no mínimo).")
        else:
            print("  (sem ALERTA_CHAVE: a fila do Supabase não foi conferida)")
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print("::notice title=Avisos das mentorias::Teste concluído: e-mail de exemplo aceito pelo Brevo.")
        return

    chave = (os.environ.get("ALERTA_CHAVE") or "").strip()
    if not chave:
        print("  (sem ALERTA_CHAVE: não dá para ler a fila de avisos, nada foi enviado)")
        return

    avisos = supabase("avisos_pendentes", {"p_chave": chave, "p_limite": POR_RODADA}) or []
    if not avisos:
        print("  ✓ Nenhum aviso na fila.")
        return

    mandar, pular = sem_repetir(avisos)
    enviados = [a["id"] for a in pular]
    falhas, emails_enviados, sem_envio = [], 0, len(pular)
    remetente = None

    for a in mandar:
        texto = escrever(a.get("tipo"), a.get("dados") or {})
        destinos = a.get("emails") or []
        if texto is None or not destinos:
            enviados.append(a["id"])     # tipo desconhecido, ou a pessoa desligou os avisos
            sem_envio += 1
            continue
        assunto, titulo, paragrafos, botao, link = texto
        conteudo = montar_html(assunto, titulo, paragrafos, botao, link)
        deu_certo = 0
        for para in destinos:
            try:
                if remetente is None:
                    remetente = achar_remetente()
                enviar_email(remetente, para, assunto, conteudo)
                deu_certo += 1
            except RuntimeError as erro:
                print(f"  ⚠ um e-mail do tipo {a.get('tipo')} não saiu: {erro}")
        emails_enviados += deu_certo
        # basta um destinatário ter recebido para o aviso não voltar (senão a equipe receberia em dobro)
        (enviados if deu_certo else falhas).append(a["id"])

    supabase("avisos_marcar", {"p_chave": chave, "p_enviados": enviados, "p_falhas": falhas})
    print(f"  ✓ {len(avisos)} aviso(s) na fila: {emails_enviados} e-mail(s) enviado(s), "
          f"{sem_envio} que não precisavam de envio, {len(falhas)} com falha.")
    if falhas:
        raise RuntimeError(f"{len(falhas)} aviso(s) não saíram e voltam na próxima rodada.")


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(f"  ⚠ Avisos das mentorias falharam: {erro}")
        if os.environ.get("GITHUB_ACTIONS") == "true":
            limpo = " ".join(str(erro).split())[:400]
            print(f"::error title=Avisos das mentorias::{limpo}")
        sys.exit(1)
