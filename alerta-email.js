/* ═══════════════════════════════════════════════════════════════════
   ALERTA DE VAGAS POR E-MAIL
   Desenha o campo de inscrição em todo elemento com data-alerta-email.
   A inscrição vai direto para o formulário do Brevo, que manda o e-mail de
   confirmação. O Hub não guarda o endereço de ninguém: ele fica só no Brevo.
   Para trocar de formulário, mude o FORMULARIO abaixo.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const FORMULARIO = "https://f2d48e62.sibforms.com/serve/MUIFAMP3LuONZxFckWTq9zdbQHBWi7cpmCxp99WQCZBE5b62k7NvQPkSbhCnaPtZczj2xMxBZQvPAqdYX7ezoqEAeZKXkhauNLI7K4dH8mSFOgyUb6PgmE1WFWbtN2wJq1RGLCYdgHGeiqbcH0KfspvVOy2yzR4N-Y3RXTUC2K27K-z5Db_Y-Hy3cOcxMyhMfRwRxs7k7uHjuCWrDg==";

  const CSS = `
  .ae { max-width:var(--wrap,1180px); margin:44px auto 0; padding:0 24px; box-sizing:border-box; }
  .ae-cx { background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9); border-radius:var(--raio,18px);
           box-shadow:var(--sombra,none); padding:26px 28px; display:grid; grid-template-columns:1.1fr 1fr; gap:22px 34px; align-items:center; }
  .ae-olho { font-family:var(--mono,sans-serif); font-size:11.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--signal,#1A4893); }
  .ae h2 { font-family:var(--display,Georgia,serif); font-weight:400; font-size:25px; line-height:1.2; color:var(--ink,#10203A); margin:8px 0 8px; }
  .ae p { font-size:15px; line-height:1.55; color:var(--ink-2,#54606F); margin:0; }
  .ae form { display:flex; gap:10px; }
  .ae input[type=email] { flex:1; min-width:0; font:inherit; font-size:15px; color:var(--ink,#10203A); background:var(--bg,#F7F4EF);
           border:1px solid var(--line,#DED7CA); border-radius:12px; padding:13px 15px; }
  .ae input[type=email]:focus { outline:2px solid var(--signal,#1A4893); outline-offset:1px; background:#fff; }
  .ae button { font-family:var(--mono,sans-serif); font-weight:600; font-size:14.5px; color:#fff; background:var(--signal,#1A4893);
           border:none; border-radius:12px; padding:13px 20px; cursor:pointer; white-space:nowrap; }
  .ae button:hover { filter:brightness(1.08); }
  .ae button[disabled] { opacity:.6; cursor:default; }
  .ae-armadilha { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
  .ae-nota { font-size:12.5px !important; color:var(--ink-3,#8A94A1) !important; margin-top:10px !important; }
  .ae-msg { font-size:14px !important; font-weight:600; margin-top:12px !important; }
  .ae-msg.ok { color:#1F7A6E !important; }
  .ae-msg.erro { color:var(--amber,#A85D24) !important; }
  @media (max-width:760px) {
    .ae { padding:0 16px; margin-top:32px; }
    .ae-cx { grid-template-columns:1fr; padding:22px 20px; }
    .ae form { flex-direction:column; }
  }`;

  function montar(alvo) {
    alvo.classList.add("ae");
    alvo.innerHTML = `
      <div class="ae-cx">
        <div>
          <div class="ae-olho">Alerta de vagas</div>
          <h2>Receba as vagas novas por e-mail</h2>
          <p>Um e-mail só nos dias em que entra vaga nova, já filtrada para quem mora no Brasil. Sem propaganda.</p>
        </div>
        <div>
          <form novalidate>
            <input type="email" name="EMAIL" required autocomplete="email"
                   placeholder="seu@email.com" aria-label="Seu e-mail">
            <span class="ae-armadilha" aria-hidden="true">
              <input type="text" name="email_address_check" tabindex="-1" autocomplete="off">
            </span>
            <input type="hidden" name="locale" value="pt">
            <button type="submit">Quero receber</button>
          </form>
          <p class="ae-msg" role="status" hidden></p>
          <p class="ae-nota">Você confirma a inscrição por um link que chega no seu e-mail e pode sair quando quiser, pelo link no fim de cada mensagem.</p>
        </div>
      </div>`;

    const form = alvo.querySelector("form");
    const campo = form.querySelector("input[type=email]");
    const botao = form.querySelector("button");
    const msg = alvo.querySelector(".ae-msg");

    function avisar(texto, tipo) {
      msg.textContent = texto;
      msg.className = "ae-msg " + tipo;
      msg.hidden = false;
    }

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      const email = campo.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        avisar("Confira o e-mail: parece que falta alguma parte.", "erro");
        campo.focus();
        return;
      }
      botao.disabled = true;
      botao.textContent = "Enviando…";
      try {
        const r = await fetch(FORMULARIO + "?isAjax=1", { method: "POST", body: new FormData(form) });
        let resposta = {};
        try { resposta = await r.json(); } catch (e) { /* resposta sem corpo */ }
        if (r.ok && resposta.success !== false) {
          form.hidden = true;
          avisar("Quase lá. Enviamos um e-mail para " + email + ". Clique no link dele para confirmar a inscrição. Se não achar, olhe a caixa de spam.", "ok");
        } else {
          avisar("Não foi possível inscrever este e-mail. Confira o endereço e tente de novo.", "erro");
        }
      } catch (e) {
        avisar("Sem conexão com o serviço de e-mail agora. Tente de novo em alguns minutos.", "erro");
      }
      botao.disabled = false;
      botao.textContent = "Quero receber";
    });
  }

  function iniciar() {
    const alvos = document.querySelectorAll("[data-alerta-email]");
    if (!alvos.length) return;
    const estilo = document.createElement("style");
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
    alvos.forEach(montar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
