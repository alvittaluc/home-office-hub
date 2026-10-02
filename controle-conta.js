/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — conta e sincronização

   Conta com cadastro aberto (Supabase) e cópia dos dados do Meu Controle
   para a conta da pessoa.

   Como funciona, em uma frase: o navegador continua guardando tudo,
   como sempre guardou, e este arquivo mantém a conta igual a ele.
     · ao entrar, traz da conta o que falta aqui  (puxar)
     · a cada mudança, manda para a conta           (empurrar)
   A fila do que falta mandar mora no controle-dados.js.

   A chave abaixo é a PUBLICÁVEL do Supabase: foi feita para ficar no
   código do site. Quem protege os dados é o banco, que só entrega a
   cada pessoa as linhas dela (banco/esquema.sql).

   Depende de: supabase-js (carregado antes) e controle-dados.js.
   ══════════════════════════════════════════════════════════════ */

const Conta = (function () {
  "use strict";

  const ENDERECO = "https://zrqucjktympnwilbvisw.supabase.co";
  const CHAVE_PUBLICA = "sb_publishable_4X7Cyykz9ZDMWOTvauxibA_Tpa4KtAh";

  /* O login é obrigatório no Meu Controle quando as portas do site estão
     ligadas (Acesso, no layout.js). Com elas desligadas, a ferramenta abre
     sem login, como antes, e a conta é opcional. Um interruptor só manda
     em tudo, para o site não ficar meio fechado e meio aberto. */
  const loginObrigatorio = () => typeof Acesso !== "undefined" && Acesso.portasLigadas;

  const CHAVE_DONO = "hub-controle:dono";
  const PAGINA = location.origin + location.pathname;

  let cli = null;
  let usuario = null;

  const esc = s => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function disponivel() { return typeof supabase !== "undefined" && !!supabase.createClient; }

  function cliente() {
    if (!cli) {
      cli = supabase.createClient(ENDERECO, CHAVE_PUBLICA, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return cli;
  }

  /* ══════════════════════════════════════════════════════════
     O QUE VEIO NO ENDEREÇO

     O link do convite e o de "esqueci a senha" voltam para cá com os
     dados na parte depois do #. O Meu Controle usa essa mesma parte
     para saber em que tela está, então isto é lido ANTES de tudo e o
     endereço é limpo logo depois.
     ══════════════════════════════════════════════════════════ */

  const fragmento = new URLSearchParams(location.hash.replace(/^#/, ""));
  const consulta = new URLSearchParams(location.search);
  const chegouPorLink = fragmento.has("access_token") || fragmento.has("error") || fragmento.has("error_code");
  const tipoDoLink = fragmento.get("type") || "";            // invite, recovery, signup...
  const erroDoLink = fragmento.get("error_description") || "";
  const pediuEntrar = consulta.has("entrar");

  function limparEndereco() {
    if (chegouPorLink || pediuEntrar) history.replaceState(null, "", location.pathname);
  }

  /* ══════════════════════════════════════════════════════════
     A PORTA: telas de entrar e de criar senha
     ══════════════════════════════════════════════════════════ */

  const CSS = `
  main.conta-fechada > *:not(#conta-porta) { display:none !important; }
  #conta-porta { max-width:440px; margin:48px auto 80px; padding:0 18px; }
  .cp-cx { background:var(--panel,#fff); border:1px solid var(--line-soft,#EAE4D9); border-radius:var(--raio,18px);
           box-shadow:var(--sombra,none); padding:30px 30px 26px; }
  .cp-olho { font-size:11.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--signal,#1A4893); }
  .cp-cx h1 { font-family:var(--display,Georgia,serif); font-weight:400; font-size:27px; line-height:1.15; color:var(--ink,#10203A); margin:8px 0 8px; }
  .cp-cx p { font-size:14.5px; line-height:1.55; color:var(--ink-2,#54606F); margin:0 0 18px; }
  .cp-cx label { display:block; font-size:12.5px; font-weight:600; color:var(--ink,#10203A); margin:14px 0 6px; }
  .cp-cx input { width:100%; box-sizing:border-box; font:inherit; font-size:15px; color:var(--ink,#10203A); background:var(--bg,#F7F4EF);
           border:1px solid var(--line,#DED7CA); border-radius:12px; padding:12px 14px; }
  .cp-cx input:focus { outline:2px solid var(--signal,#1A4893); outline-offset:1px; background:#fff; }
  .cp-bt { width:100%; margin-top:20px; font:inherit; font-weight:600; font-size:15px; color:#fff; background:var(--signal,#1A4893);
           border:none; border-radius:12px; padding:13px 18px; cursor:pointer; }
  .cp-bt:hover { filter:brightness(1.08); } .cp-bt[disabled] { opacity:.6; cursor:default; }
  .cp-link { background:none; border:0; padding:0; margin-top:16px; font:inherit; font-size:13.5px; color:var(--signal,#1A4893); cursor:pointer; text-decoration:underline; }
  .cp-msg { font-size:13.5px; line-height:1.5; margin-top:14px; padding:10px 13px; border-radius:10px; }
  .cp-msg.erro { background:#FBE9EB; color:#8E2233; } .cp-msg.ok { background:#E4F3F0; color:#1F7A6E; }
  .cp-rodape { font-size:11.5px; line-height:1.55; color:var(--ink-3,#8A94A1); margin:16px 6px 0; text-align:center; }
  `;

  function porta() {
    let p = document.getElementById("conta-porta");
    if (!p) {
      const estilo = document.createElement("style");
      estilo.textContent = CSS;
      document.head.appendChild(estilo);
      p = document.createElement("div");
      p.id = "conta-porta";
      const main = document.querySelector("main") || document.body;
      main.appendChild(p);
    }
    (document.querySelector("main") || document.body).classList.add("conta-fechada");
    return p;
  }

  function fecharPorta() {
    const p = document.getElementById("conta-porta");
    if (p) p.remove();
    (document.querySelector("main") || document.body).classList.remove("conta-fechada");
  }

  const RODAPE = `<p class="cp-rodape">Seus registros ficam guardados na sua conta, protegidos por senha, e só você tem acesso a eles.
    Você pode apagar a conta e tudo o que há nela a qualquer momento, em Seus dados.</p>`;

  /* Mensagens do Supabase vêm em inglês. Estas são as que aparecem na prática. */
  function traduzir(erro) {
    const m = (erro && (erro.message || erro.error_description || String(erro))) || "";
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Este e-mail ainda não foi confirmado. Abra o e-mail de confirmação que enviamos e clique no link dele.";
    if (/expired|invalid.*(token|link)|otp/i.test(m)) return "Este link já foi usado ou expirou. Use \"Esqueci a senha\" para receber um novo.";
    if (/should be different/i.test(m)) return "A senha nova precisa ser diferente da anterior.";
    if (/at least|weak|should contain|characters/i.test(m)) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    if (/rate limit|too many|security purposes/i.test(m)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if (/already registered|already exists/i.test(m)) return "Já existe uma conta com este e-mail. Use \"Já tenho conta\" e, se precisar, \"Esqueci a senha\".";
    if (/signups? not allowed|not allowed/i.test(m)) return "O cadastro está fechado no momento. Tente de novo mais tarde.";
    if (/sending.*email|email.*send|smtp/i.test(m)) return "Não conseguimos enviar o e-mail de confirmação agora. Tente de novo em alguns minutos.";
    if (/fetch|network|failed/i.test(m)) return "Sem conexão com o servidor agora. Confira a internet e tente de novo.";
    return "Não deu certo: " + m;
  }

  /* Tela de criar conta. O cadastro é aberto: a pessoa informa e-mail e
     senha, recebe um e-mail de confirmação e, ao clicar no link dele, cai
     no Meu Controle já logada. Esta tela não "resolve": ela termina com o
     aviso para a pessoa abrir o e-mail, ou volta para a tela de entrar. */
  function telaCriarConta(resolver) {
    const p = porta();
    p.innerHTML = `
      <div class="cp-cx">
        <div class="cp-olho">Home Office Hub</div>
        <h1>Criar a sua conta</h1>
        <p>É grátis. Com a conta você usa as ferramentas, continua os cursos e vê as vagas em movimento.</p>
        <form novalidate>
          <label for="cp-nome">Seu nome</label>
          <input id="cp-nome" type="text" autocomplete="name" maxlength="60" required>
          <label for="cp-email">E-mail</label>
          <input id="cp-email" type="email" autocomplete="username" required>
          <label for="cp-nova">Senha</label>
          <input id="cp-nova" type="password" autocomplete="new-password" minlength="8" required>
          <label for="cp-nova2">Repita a senha</label>
          <input id="cp-nova2" type="password" autocomplete="new-password" minlength="8" required>
          <button class="cp-bt" type="submit">Criar conta</button>
        </form>
        <button class="cp-link" type="button" data-ja-tenho>Já tenho conta</button>
        <div class="cp-msg" role="status" hidden></div>
      </div>${RODAPE}`;

    const form = p.querySelector("form"), msg = p.querySelector(".cp-msg"), bt = p.querySelector(".cp-bt");
    const dizer = (texto, tipo) => { msg.textContent = texto; msg.className = "cp-msg " + tipo; msg.hidden = false; };

    p.querySelector("[data-ja-tenho]").addEventListener("click", () => telaEntrar(null, resolver));

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const email = p.querySelector("#cp-email").value.trim();
      const a = p.querySelector("#cp-nova").value, b = p.querySelector("#cp-nova2").value;
      const nome = p.querySelector("#cp-nome").value.trim();
      if (nome.length < 2) { dizer("Escreva o seu nome ou o apelido pelo qual quer ser chamado.", "erro"); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { dizer("Confira o e-mail: parece que falta alguma parte.", "erro"); return; }
      if (a.length < 8) { dizer("A senha precisa ter pelo menos 8 caracteres.", "erro"); return; }
      if (a !== b) { dizer("As duas senhas estão diferentes.", "erro"); return; }
      bt.disabled = true; bt.textContent = "Criando…";

      // o link de confirmação leva ao Meu Controle, que sabe receber a pessoa
      const destino = location.origin + location.pathname.replace(/[^\/]*$/, "") + "controle.html";
      // o nome vai junto com a conta e vira o perfil das mentorias (mentorias-dados.js)
      const r = await cliente().auth.signUp({ email, password: a, options: { emailRedirectTo: destino, data: { nome: nome } } });
      bt.disabled = false; bt.textContent = "Criar conta";
      if (r.error) { dizer(traduzir(r.error), "erro"); return; }

      // Quando o e-mail já tem conta, o Supabase responde "deu certo" sem
      // criar nada, para não revelar quem é cadastrado. Dá para perceber
      // porque o usuário vem sem nenhuma identidade.
      const u = r.data && r.data.user;
      if (u && Array.isArray(u.identities) && u.identities.length === 0) {
        dizer("Já existe uma conta com este e-mail. Use \"Já tenho conta\" e, se precisar, \"Esqueci a senha\".", "erro");
        return;
      }
      if (r.data && r.data.session) { resolver(r.data.user); return; }   // confirmação por e-mail desligada

      form.hidden = true;
      dizer("Quase lá. Enviamos um e-mail para " + email + ". Clique no link dele para confirmar e entrar. Se não achar, olhe a caixa de spam.", "ok");
    });
  }

  /* resolverDeFora: usado quando esta tela é aberta a partir da de criar
     conta, para as duas terminarem na mesma promessa. */
  function telaEntrar(avisoInicial, resolverDeFora) {
    return new Promise(resolverDaqui => {
      const resolver = resolverDeFora || resolverDaqui;
      const p = porta();
      p.innerHTML = `
        <div class="cp-cx">
          <div class="cp-olho">Home Office Hub</div>
          <h1>Entrar na sua conta</h1>
          <p>Use o e-mail e a senha que você cadastrou.</p>
          <form novalidate>
            <label for="cp-email">E-mail</label>
            <input id="cp-email" type="email" autocomplete="username" required>
            <label for="cp-senha">Senha</label>
            <input id="cp-senha" type="password" autocomplete="current-password" required>
            <button class="cp-bt" type="submit">Entrar</button>
          </form>
          <button class="cp-link" type="button" data-esqueci>Esqueci a senha</button>
          <span style="color:var(--ink-3,#8A94A1);margin:0 6px;">·</span>
          <button class="cp-link" type="button" data-criar>Criar conta grátis</button>
          <div class="cp-msg" role="status" hidden></div>
        </div>${RODAPE}`;

      const form = p.querySelector("form"), msg = p.querySelector(".cp-msg"), bt = p.querySelector(".cp-bt");
      const dizer = (texto, tipo) => { msg.textContent = texto; msg.className = "cp-msg " + tipo; msg.hidden = false; };
      if (avisoInicial) dizer(avisoInicial.texto, avisoInicial.tipo || "erro");

      p.querySelector("[data-criar]").addEventListener("click", () => telaCriarConta(resolver));

      form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const email = p.querySelector("#cp-email").value.trim();
        const senha = p.querySelector("#cp-senha").value;
        if (!email || !senha) { dizer("Preencha o e-mail e a senha.", "erro"); return; }
        bt.disabled = true; bt.textContent = "Entrando…";
        const r = await cliente().auth.signInWithPassword({ email, password: senha });
        if (r.error) { dizer(traduzir(r.error), "erro"); bt.disabled = false; bt.textContent = "Entrar"; return; }
        resolver(r.data.user);
      });

      p.querySelector("[data-esqueci]").addEventListener("click", async () => {
        const email = p.querySelector("#cp-email").value.trim();
        if (!email) { dizer("Escreva o seu e-mail no campo acima e clique de novo em \"Esqueci a senha\".", "erro"); return; }
        const r = await cliente().auth.resetPasswordForEmail(email, { redirectTo: PAGINA });
        if (r.error) { dizer(traduzir(r.error), "erro"); return; }
        dizer("Se este e-mail tiver conta, chegou nele um link para criar uma senha nova. Olhe também o spam.", "ok");
      });
    });
  }

  function telaCriarSenha(email, convite) {
    return new Promise(resolver => {
      const p = porta();
      p.innerHTML = `
        <div class="cp-cx">
          <div class="cp-olho">Meu Controle</div>
          <h1>${convite ? "Crie a sua senha" : "Crie uma senha nova"}</h1>
          <p>${convite ? "Seu convite foi aceito. " : ""}Esta é a senha que você vai usar para entrar com o e-mail <b>${esc(email)}</b>.</p>
          <form novalidate>
            <input type="email" autocomplete="username" value="${esc(email)}" hidden>
            <label for="cp-nova">Senha</label>
            <input id="cp-nova" type="password" autocomplete="new-password" minlength="8" required>
            <label for="cp-nova2">Repita a senha</label>
            <input id="cp-nova2" type="password" autocomplete="new-password" minlength="8" required>
            <button class="cp-bt" type="submit">Salvar e entrar</button>
          </form>
          <div class="cp-msg" role="status" hidden></div>
        </div>${RODAPE}`;

      const form = p.querySelector("form"), msg = p.querySelector(".cp-msg"), bt = p.querySelector(".cp-bt");
      const dizer = (texto, tipo) => { msg.textContent = texto; msg.className = "cp-msg " + tipo; msg.hidden = false; };

      form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const a = p.querySelector("#cp-nova").value, b = p.querySelector("#cp-nova2").value;
        if (a.length < 8) { dizer("A senha precisa ter pelo menos 8 caracteres.", "erro"); return; }
        if (a !== b) { dizer("As duas senhas estão diferentes.", "erro"); return; }
        bt.disabled = true; bt.textContent = "Salvando…";
        const r = await cliente().auth.updateUser({ password: a });
        if (r.error) { dizer(traduzir(r.error), "erro"); bt.disabled = false; bt.textContent = "Salvar e entrar"; return; }
        resolver();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     ÁREAS DE FORMAÇÃO

     Uma pergunta só, opcional, feita uma vez depois do primeiro login:
     em que áreas a pessoa tem formação ou experiência. A resposta fica na
     própria conta (user_metadata do Supabase) e serve para a aba Vagas
     montar a lista "Para você". Pular também conta como resposta: a
     pergunta não volta sozinha, mas dá para mudar em Minha conta.
     ══════════════════════════════════════════════════════════ */

  const CSS_AREAS = `
  #conta-porta.cp-larga { max-width:560px; }
  .cp-areas { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:6px 0 4px; }
  .cp-cx label.cp-area { display:flex; align-items:center; gap:10px; margin:0 !important; padding:11px 13px; border:1px solid var(--line,#DED7CA);
             border-radius:12px; background:var(--bg,#F7F4EF); font-size:14px !important; font-weight:500 !important;
             color:var(--ink,#10203A); cursor:pointer; line-height:1.3; }
  .cp-cx label.cp-area input { width:17px !important; margin:0; height:17px; flex-shrink:0; padding:0 !important; accent-color:var(--signal,#1A4893); }
  .cp-cx label.cp-area:has(input:checked) { background:var(--signal-suave,#EAF1F8); border-color:var(--signal,#1A4893); }
  .cp-pular { display:block; width:100%; text-align:center; }
  /* especialidades: aparecem embaixo da área, só quando ela está marcada */
  .cp-bloco { display:contents; }
  .cp-subs { grid-column:1 / -1; margin:-2px 0 6px; padding:11px 13px 12px; border:1px dashed var(--line,#DED7CA); border-radius:12px; }
  .cp-subs-tit { font-size:12.5px; color:var(--ink-2,#54606F); margin:0 0 8px; line-height:1.45; }
  .cp-subs-lista { display:flex; flex-wrap:wrap; gap:7px; }
  .cp-cx label.cp-sub { display:inline-flex; align-items:center; gap:7px; margin:0; padding:7px 11px; border:1px solid var(--line,#DED7CA);
             border-radius:99px; font-size:13px; font-weight:500; color:var(--ink,#10203A); cursor:pointer; background:var(--panel,#fff); }
  .cp-cx label.cp-sub input { width:15px !important; height:15px; margin:0; padding:0 !important; accent-color:var(--signal,#1A4893); }
  .cp-cx label.cp-sub:has(input:checked) { background:var(--signal-suave,#EAF1F8); border-color:var(--signal,#1A4893); }
  @media (max-width:520px){ .cp-areas { grid-template-columns:1fr; } }
  `;

  function areasRespondidas(u) {
    const m = (u && u.user_metadata) || {};
    return m.areas_respondido === true;
  }

  function telaAreas() {
    return new Promise(resolver => {
      const lista = (typeof Acesso !== "undefined" && Acesso.AREAS) || [];
      if (!lista.length || !usuario) { resolver(); return; }
      const minhas = ((usuario.user_metadata || {}).areas) || [];
      const minhasSubs = ((usuario.user_metadata || {}).subareas) || [];
      const SUBS = (typeof Acesso !== "undefined" && Acesso.SUBAREAS) || {};

      const p = porta();
      p.classList.add("cp-larga");
      if (!document.getElementById("cp-css-areas")) {
        const s = document.createElement("style");
        s.id = "cp-css-areas"; s.textContent = CSS_AREAS;
        document.head.appendChild(s);
      }
      p.innerHTML = `
        <div class="cp-cx">
          <div class="cp-olho">Para as vagas combinarem com você</div>
          <h1>Você tem formação ou experiência em alguma destas áreas?</h1>
          <p>É opcional, e você pode marcar quantas quiser. As vagas abertas a todos aparecem sempre.
             Marcando uma área, as vagas que pedem essa formação passam a aparecer junto, na aba Vagas.</p>
          <form novalidate>
            <div class="cp-areas">
              ${lista.map(a => {
                const marcada = minhas.indexOf(a[0]) >= 0;
                const subs = SUBS[a[0]] || [];
                const caixa = `<label class="cp-area"><input type="checkbox" data-area value="${esc(a[0])}"${marcada ? " checked" : ""}> ${esc(a[1])}</label>`;
                if (!subs.length) return caixa;
                return `<div class="cp-bloco">${caixa}
                  <div class="cp-subs" data-subs-de="${esc(a[0])}"${marcada ? "" : " hidden"}>
                    <p class="cp-subs-tit">Qual é a sua especialidade em ${esc(a[1])}? Se não marcar nenhuma, você vê todas as vagas da área.</p>
                    <div class="cp-subs-lista">${subs.map(s => {
                      const id = a[0] + "/" + s[0];
                      return `<label class="cp-sub"><input type="checkbox" data-sub value="${esc(id)}"${minhasSubs.indexOf(id) >= 0 ? " checked" : ""}> ${esc(s[1])}</label>`;
                    }).join("")}</div>
                  </div></div>`;
              }).join("")}
            </div>
            <button class="cp-bt" type="submit">Salvar</button>
          </form>
          <button class="cp-link cp-pular" type="button" data-pular>${areasRespondidas(usuario) ? "Voltar sem mudar" : "Pular por enquanto"}</button>
          <div class="cp-msg" role="status" hidden></div>
        </div>
        <p class="cp-rodape">Dá para mudar a qualquer momento em Minha conta. Só você vê as áreas que marcou.</p>`;

      const form = p.querySelector("form"), msg = p.querySelector(".cp-msg"), bt = p.querySelector(".cp-bt");
      const fim = () => { p.classList.remove("cp-larga"); resolver(); };

      // marcar a área abre as especialidades dela; desmarcar fecha
      p.querySelectorAll("input[data-area]").forEach(c => c.addEventListener("change", () => {
        const cx = p.querySelector('[data-subs-de="' + c.value.replace(/"/g, "") + '"]');
        if (cx) cx.hidden = !c.checked;
      }));

      async function gravar(areas, subs) {
        bt.disabled = true;
        try {
          const r = await cliente().auth.updateUser({ data: { areas: areas, subareas: subs || [], areas_respondido: true } });
          if (r.error) throw r.error;
          if (r.data && r.data.user) usuario = r.data.user;
          fim();
        } catch (e) {
          // sem internet: não segura a pessoa; a pergunta volta na próxima vez
          console.warn("Conta: não deu para salvar as áreas.", e);
          msg.textContent = "Não deu para salvar agora. Você pode tentar de novo depois, em Minha conta.";
          msg.className = "cp-msg erro"; msg.hidden = false;
          bt.disabled = false;
          setTimeout(fim, 2600);
        }
      }

      form.addEventListener("submit", ev => {
        ev.preventDefault();
        bt.textContent = "Salvando…";
        const areas = [].slice.call(p.querySelectorAll("input[data-area]:checked")).map(c => c.value);
        // só valem as especialidades de área que continua marcada
        const subs = [].slice.call(p.querySelectorAll("input[data-sub]:checked")).map(c => c.value)
          .filter(s => areas.indexOf(s.split("/")[0]) >= 0);
        gravar(areas, subs);
      });
      p.querySelector("[data-pular]").addEventListener("click", () => {
        if (areasRespondidas(usuario)) fim();
        else gravar(minhas, minhasSubs);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     ENTRADA

     Chamado pelo controle.html antes de abrir a ferramenta.
     Devolve o usuário logado, ou null quando o login não é
     obrigatório e a pessoa está sem conta.
     ══════════════════════════════════════════════════════════ */

  async function entrar(opcoes) {
    const forcar = !!(opcoes && opcoes.forcar);   // a página entrar.html sempre pede login
    const criar = !!(opcoes && opcoes.criar);     // abre direto na tela de criar conta
    if (!disponivel()) {
      // A biblioteca não carregou (sem internet, bloqueador). Sem login
      // obrigatório a ferramenta segue só com o que está no navegador.
      if (forcar || loginObrigatorio()) throw new Error("Não deu para falar com o servidor de contas. Confira a internet e recarregue a página.");
      return null;
    }

    let sessao = null;
    try { sessao = (await cliente().auth.getSession()).data.session; }
    catch (e) { console.warn("Conta: sessão não pôde ser lida.", e); }
    limparEndereco();

    if (!sessao) {
      if (!forcar && !loginObrigatorio() && !chegouPorLink && !pediuEntrar) return null;
      // Quem chega sem conta vê o mesmo aviso das outras páginas fechadas
      // (o da Transcrição), e o login acontece na página entrar.html. A tela
      // de e-mail e senha só abre direto aqui para quem veio por um link de
      // e-mail ou pela própria entrar.html.
      if (!forcar && !chegouPorLink && !pediuEntrar && typeof Acesso !== "undefined" && Acesso.htmlAviso) {
        const p = porta();
        p.style.cssText = "max-width:none;margin:0;padding:0 18px;";
        p.innerHTML = Acesso.htmlAviso("O Meu Controle é para quem tem conta", "Entre na sua conta para usar a ferramenta.");
        return new Promise(() => {});   // a página fica no aviso; o login recarrega tudo
      }
      const aviso = erroDoLink ? { texto: traduzir({ message: erroDoLink }) } : null;
      usuario = criar && !aviso
        ? await new Promise(resolver => telaCriarConta(resolver))
        : await telaEntrar(aviso);
    } else {
      usuario = sessao.user;
      // Veio pelo convite ou pelo "esqueci a senha": a pessoa ainda não tem
      // senha (ou quer trocar), então pede antes de abrir a ferramenta.
      if (chegouPorLink && (tipoDoLink === "invite" || tipoDoLink === "recovery")) {
        await telaCriarSenha(usuario.email, tipoDoLink === "invite");
      }
    }

    // a pergunta das áreas: uma vez só, ou quando a pessoa pede para mudar
    if (usuario && ((opcoes && opcoes.areas) || !areasRespondidas(usuario))) {
      try { await telaAreas(); } catch (e) { console.warn(e); }
    }

    fecharPorta();
    return usuario;
  }

  /* ══════════════════════════════════════════════════════════
     SINCRONIZAÇÃO
     ══════════════════════════════════════════════════════════ */

  const N = () => Dados.nuvem;

  /* Traz da conta o que falta aqui. Roda uma vez, na abertura. */
  async function puxar() {
    if (!usuario) return { trouxe: 0 };
    const dono = localStorage.getItem(CHAVE_DONO);

    // Outra pessoa usava este navegador: o que ficou aqui não é desta conta.
    if (dono && dono !== usuario.id) await N().limparLocal();
    const primeiraVezAqui = dono !== usuario.id;

    // lê tudo da conta, de mil em mil
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      const r = await cliente().from("controle_itens")
        .select("colecao,id,dados,apagado,atualizado_em")
        .order("colecao").order("id").range(de, de + 999);
      if (r.error) throw r.error;
      linhas.push(...r.data);
      if (r.data.length < 1000) break;
    }

    const fila = N().fila();
    const naConta = new Set();
    let trouxe = 0;

    for (const l of linhas) {
      const chave = l.colecao + "|" + l.id;
      naConta.add(chave);
      if (N().COLECOES.indexOf(l.colecao) < 0) continue;
      const local = await N().um(l.colecao, l.id);
      const pendente = fila[chave];

      if (l.apagado) {
        // apagado em outro aparelho. Só não apaga aqui se este aparelho mexeu
        // no item DEPOIS disso e ainda não avisou a conta.
        const mexeuDepois = pendente && !pendente.apagado && pendente.em > new Date(l.atualizado_em).toISOString();
        if (local && !mexeuDepois) { await N().tira(l.colecao, l.id); trouxe++; }
        continue;
      }

      const daConta = l.dados || {};
      // Configuração num aparelho novo: vale a da conta, mesmo que a daqui
      // tenha data mais nova (ela acabou de ser criada vazia).
      const contaGanha = !local
        || (l.colecao === "config" && primeiraVezAqui)
        || (local.atualizadoEm || "") < (daConta.atualizadoEm || "");
      if (contaGanha && !(pendente && pendente.apagado)) {
        await N().por(l.colecao, daConta);
        trouxe++;
      }
    }

    // O que existe aqui e não existe na conta sobe. É o que acontece no
    // primeiro login de quem já usava a ferramenta sem conta.
    for (const col of N().COLECOES) {
      for (const item of await N().todos(col)) {
        if (!item || !item.id) continue;
        if (col === "config" && primeiraVezAqui && naConta.has("config|config")) continue;
        if (!naConta.has(col + "|" + item.id)) N().anotar(col, item.id, false);
      }
    }

    localStorage.setItem(CHAVE_DONO, usuario.id);
    return { trouxe };
  }

  /* Manda para a conta o que está na fila. */
  let enviando = false, pedirDeNovo = false;

  async function empurrar() {
    if (!usuario) return;
    if (enviando) { pedirDeNovo = true; return; }
    enviando = true;
    try {
      const fila = N().fila();
      const chaves = Object.keys(fila);
      if (!chaves.length) return;

      const linhas = [], enviadas = [];
      for (const chave of chaves) {
        const f = fila[chave];
        if (N().COLECOES.indexOf(f.colecao) < 0) { enviadas.push({ chave, em: f.em }); continue; }
        let linha;
        if (f.apagado) {
          linha = { user_id: usuario.id, colecao: f.colecao, id: f.id, dados: {}, apagado: true, atualizado_em: f.em };
        } else {
          const item = await N().um(f.colecao, f.id);
          if (!item) { enviadas.push({ chave, em: f.em }); continue; }   // sumiu daqui antes de subir
          linha = { user_id: usuario.id, colecao: f.colecao, id: f.id, dados: item, apagado: false,
                    atualizado_em: item.atualizadoEm || f.em };
        }
        linhas.push(linha);
        enviadas.push({ chave, em: f.em });
      }

      for (let i = 0; i < linhas.length; i += 200) {
        const r = await cliente().from("controle_itens")
          .upsert(linhas.slice(i, i + 200), { onConflict: "user_id,colecao,id" });
        if (r.error) throw r.error;
      }
      N().tirarDaFila(enviadas);
    } catch (e) {
      // Sem internet ou servidor fora: a fila fica guardada e sobe depois.
      console.warn("Conta: não deu para enviar agora, fica na fila.", e);
    } finally {
      enviando = false;
      if (pedirDeNovo) { pedirDeNovo = false; empurrar(); }
    }
  }

  let relogio = null;
  function agendarEnvio() {
    clearTimeout(relogio);
    relogio = setTimeout(empurrar, 1200);   // junta vários cliques num envio só
  }

  /* Chamado pelo controle.html logo depois do entrar(). */
  async function sincronizar() {
    if (!usuario) return { trouxe: 0 };
    const r = await puxar();
    N().aoMudar(agendarEnvio);
    await empurrar();
    // garante o envio do que ficou pendente quando a pessoa sai da página
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") empurrar(); });
    window.addEventListener("online", empurrar);
    return r;
  }

  /* ══════════════════════════════════════════════════════════
     SAIR E APAGAR A CONTA
     ══════════════════════════════════════════════════════════ */

  async function sair() {
    await empurrar();
    if (Object.keys(N().fila()).length) {
      throw new Error("Ainda há mudanças que não subiram para a conta. Confira a internet e tente sair de novo, para não perder nada.");
    }
    await cliente().auth.signOut();
    await N().limparLocal();
    localStorage.removeItem(CHAVE_DONO);
    usuario = null;
  }

  async function apagarConta() {
    const r = await cliente().rpc("apagar_minha_conta");
    if (r.error) throw r.error;
    try { await cliente().auth.signOut({ scope: "local" }); } catch (e) { /* a conta já não existe */ }
    await N().limparLocal();
    localStorage.removeItem(CHAVE_DONO);
    usuario = null;
  }

  return {
    entrar, sincronizar, empurrar, sair, apagarConta, traduzir, telaAreas,
    get usuario() { return usuario; },
    get obrigatorio() { return loginObrigatorio(); },
    get disponivel() { return disponivel(); },
  };
})();
