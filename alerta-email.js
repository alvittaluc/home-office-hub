/* ═══════════════════════════════════════════════════════════════════
   ALERTA DE VAGAS POR E-MAIL
   Desenha o campo de inscrição em todo elemento com data-alerta-email.
   A inscrição vai direto para o formulário do Brevo, que manda o e-mail de
   confirmação. O Hub não guarda o endereço de ninguém: ele fica só no Brevo.
   Para trocar de formulário, mude o FORMULARIO abaixo.

   Quem tem conta no Hub com áreas marcadas recebe também as vagas da sua
   área, desde que se inscreva com o mesmo e-mail da conta: é por ele que o
   envio (enviar_alerta.py) acha as áreas. Por isso, com a pessoa logada, o
   campo já vem com o e-mail da conta.

   A pessoa também escolhe o que receber: todas as vagas novas ou só as
   vagas em destaque do Hub (a lista "Em alta"). A escolha vai no campo
   ALERTA do formulário do Brevo ("todas" ou "destaques"). Como no site, a
   lista "Em alta" é para quem tem conta: sem login a opção fica fechada, e
   o envio confere a conta pelo e-mail antes de mandar.
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
  .ae form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; }
  .ae form > input[type=email] { grid-column:1; grid-row:1; }
  .ae form > button { grid-column:2; grid-row:1; }
  .ae-escolha { grid-column:1 / -1; grid-row:2; border:0; margin:4px 0 0; padding:0; min-width:0; }
  .ae-escolha legend { font-size:13px; font-weight:600; color:var(--ink-2,#54606F); padding:0; margin:0 0 8px; }
  .ae-escolha label { display:flex; align-items:flex-start; gap:9px; font-size:14.5px; line-height:1.4; color:var(--ink,#10203A); cursor:pointer; }
  .ae-escolha label + label { margin-top:8px; }
  .ae-escolha input { accent-color:var(--signal,#1A4893); width:17px; height:17px; margin:1px 0 0; flex:none; cursor:pointer; }
  .ae-escolha small { display:block; font-size:12.5px; color:var(--ink-3,#66717F); margin-top:1px; }
  .ae-escolha small a { color:var(--signal,#1A4893); font-weight:600; text-decoration:none; }
  .ae-escolha small a:hover { text-decoration:underline; }
  .ae-escolha .ae-fechada { cursor:default; color:var(--ink-3,#66717F); }
  .ae-escolha .ae-fechada input { cursor:default; }
  .ae input[type=email] { flex:1; min-width:0; font:inherit; font-size:15px; color:var(--ink,#10203A); background:var(--bg,#F7F4EF);
           border:1px solid var(--line,#DED7CA); border-radius:12px; padding:13px 15px; }
  .ae input[type=email]:focus { outline:2px solid var(--signal,#1A4893); outline-offset:1px; background:#fff; }
  .ae button { font-family:var(--mono,sans-serif); font-weight:600; font-size:14.5px; color:#fff; background:var(--signal,#1A4893);
           border:none; border-radius:12px; padding:13px 20px; cursor:pointer; white-space:nowrap; }
  .ae button:hover { filter:brightness(1.08); }
  .ae button[disabled] { opacity:.6; cursor:default; }
  .ae-armadilha { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
  .ae-nota { font-size:12.5px !important; color:var(--ink-3,#66717F) !important; margin-top:10px !important; }
  .ae-area { font-size:14px !important; margin-top:10px !important; }
  .ae-area a { color:var(--signal,#1A4893); font-weight:600; text-decoration:none; white-space:nowrap; }
  .ae-area a:hover { text-decoration:underline; }
  .ae-msg { font-size:14px !important; font-weight:600; margin-top:12px !important; }
  .ae-msg.ok { color:#1F7A6E !important; }
  .ae-msg.erro { color:var(--amber,#A85D24) !important; }
  @media (max-width:760px) {
    .ae { padding:0 16px; margin-top:32px; }
    .ae-cx { grid-template-columns:1fr; padding:22px 20px; }
    /* no celular a escolha fica entre o e-mail e o botão */
    .ae form { grid-template-columns:minmax(0,1fr); }
    .ae-escolha { grid-row:2; margin:6px 0 4px; }
    .ae form > button { grid-column:1; grid-row:3; }
  }`;

  const escapar = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* O recado sobre as vagas de área, e o e-mail da conta para já vir no campo. */
  function sobreAreas() {
    try {
      if (typeof Acesso === "undefined") return { email: "", texto: "" };
      if (!Acesso.logado()) {
        return { email: "", texto: "Tem conta no Hub com áreas marcadas? Inscreva o mesmo e-mail da conta e receba também as vagas da sua área." };
      }
      const minhas = Acesso.areas();
      if (minhas && minhas.length) {
        return { email: Acesso.email(), texto: "Com o e-mail da sua conta, o alerta traz também as vagas de " +
          escapar(Acesso.resumoDasAreas(minhas, Acesso.subareas())) + "." };
      }
      if (minhas === null) {
        const aqui = (location.pathname.split("/").pop() || "index.html");
        const volta = /^[a-z0-9-]+\.html$/i.test(aqui) ? aqui : "index.html";
        return { email: Acesso.email(), texto: "Marque suas áreas na conta e o alerta passa a trazer também as vagas da sua formação. " +
          `<a href="entrar.html?areas=1&amp;voltar=${volta}">Marcar minhas áreas</a>` };
      }
      return { email: Acesso.email(), texto: "" };
    } catch (e) {
      return { email: "", texto: "" };
    }
  }

  /* "Só os destaques": aberta para quem está na conta; sem login, fechada e
     com o caminho para entrar. */
  function opcaoDestaques() {
    let comConta = false, entrar = "entrar.html";
    try {
      comConta = typeof Acesso !== "undefined" && Acesso.logado();
      if (typeof Acesso !== "undefined") entrar = Acesso.linkEntrar();
    } catch (e) { /* sem o layout.js, fica fechada */ }
    if (comConta) {
      return `<label><input type="radio" name="ALERTA" value="destaques">
        <span>Só as vagas em destaque do Hub<small>As que a equipe destaca na lista Em alta.</small></span></label>`;
    }
    return `<label class="ae-fechada"><input type="radio" name="ALERTA" value="destaques" disabled>
      <span>Só as vagas em destaque do Hub<small>A lista Em alta é para quem tem conta.
      <a href="${escapar(entrar)}">Entrar na conta</a></small></span></label>`;
  }

  function montar(alvo) {
    const conta = sobreAreas();
    alvo.classList.add("ae");
    alvo.innerHTML = `
      <div class="ae-cx">
        <div>
          <div class="ae-olho">Alerta de vagas</div>
          <h2>Receba as vagas novas por e-mail</h2>
          <p>Um e-mail só nos dias em que entra vaga nova, já filtrada para quem mora no Brasil. Sem propaganda.</p>
          ${conta.texto ? `<p class="ae-area">${conta.texto}</p>` : ""}
        </div>
        <div>
          <form novalidate>
            <input type="email" name="EMAIL" required autocomplete="email"
                   placeholder="seu@email.com" aria-label="Seu e-mail">
            <button type="submit">Quero receber</button>
            <fieldset class="ae-escolha">
              <legend>O que você quer receber</legend>
              <label><input type="radio" name="ALERTA" value="todas" checked> <span>Todas as vagas novas</span></label>
              ${opcaoDestaques()}
            </fieldset>
            <span class="ae-armadilha" aria-hidden="true">
              <input type="text" name="email_address_check" tabindex="-1" autocomplete="off">
            </span>
            <input type="hidden" name="locale" value="pt">
          </form>
          <p class="ae-msg" role="status" hidden></p>
          <p class="ae-nota">Você confirma a inscrição por um link que chega no seu e-mail e pode sair quando quiser, pelo link no fim de cada mensagem.</p>
        </div>
      </div>`;

    const form = alvo.querySelector("form");
    const campo = form.querySelector("input[type=email]");
    const botao = form.querySelector("button[type=submit]");
    const msg = alvo.querySelector(".ae-msg");
    if (conta.email) campo.value = conta.email;

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
