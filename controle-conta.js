/* ══════════════════════════════════════════════════════════════
   MEU CONTROLE — conta e sincronização

   Login por convite (Supabase) e cópia dos dados do Meu Controle
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
    if (/Email not confirmed/i.test(m)) return "Este e-mail ainda não foi confirmado. Abra o convite que chegou no seu e-mail.";
    if (/expired|invalid.*(token|link)|otp/i.test(m)) return "Este link já foi usado ou expirou. Peça um novo convite, ou use \"Esqueci a senha\".";
    if (/should be different/i.test(m)) return "A senha nova precisa ser diferente da anterior.";
    if (/at least|weak|should contain|characters/i.test(m)) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    if (/rate limit|too many|security purposes/i.test(m)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if (/signups? not allowed|not allowed/i.test(m)) return "O acesso é só por convite. Este e-mail ainda não foi convidado.";
    if (/fetch|network|failed/i.test(m)) return "Sem conexão com o servidor agora. Confira a internet e tente de novo.";
    return "Não deu certo: " + m;
  }

  function telaEntrar(avisoInicial) {
    return new Promise(resolver => {
      const p = porta();
      p.innerHTML = `
        <div class="cp-cx">
          <div class="cp-olho">Meu Controle</div>
          <h1>Entrar na sua conta</h1>
          <p>O acesso é por convite. Se você recebeu o convite por e-mail, abra o link dele primeiro para criar a sua senha.</p>
          <form novalidate>
            <label for="cp-email">E-mail</label>
            <input id="cp-email" type="email" autocomplete="username" required>
            <label for="cp-senha">Senha</label>
            <input id="cp-senha" type="password" autocomplete="current-password" required>
            <button class="cp-bt" type="submit">Entrar</button>
          </form>
          <button class="cp-link" type="button" data-esqueci>Esqueci a senha</button>
          <div class="cp-msg" role="status" hidden></div>
        </div>${RODAPE}`;

      const form = p.querySelector("form"), msg = p.querySelector(".cp-msg"), bt = p.querySelector(".cp-bt");
      const dizer = (texto, tipo) => { msg.textContent = texto; msg.className = "cp-msg " + tipo; msg.hidden = false; };
      if (avisoInicial) dizer(avisoInicial.texto, avisoInicial.tipo || "erro");

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
     ENTRADA

     Chamado pelo controle.html antes de abrir a ferramenta.
     Devolve o usuário logado, ou null quando o login não é
     obrigatório e a pessoa está sem conta.
     ══════════════════════════════════════════════════════════ */

  async function entrar(opcoes) {
    const forcar = !!(opcoes && opcoes.forcar);   // a página entrar.html sempre pede login
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
      const aviso = erroDoLink ? { texto: traduzir({ message: erroDoLink }) } : null;
      usuario = await telaEntrar(aviso);
    } else {
      usuario = sessao.user;
      // Veio pelo convite ou pelo "esqueci a senha": a pessoa ainda não tem
      // senha (ou quer trocar), então pede antes de abrir a ferramenta.
      if (chegouPorLink && (tipoDoLink === "invite" || tipoDoLink === "recovery")) {
        await telaCriarSenha(usuario.email, tipoDoLink === "invite");
      }
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
    entrar, sincronizar, empurrar, sair, apagarConta, traduzir,
    get usuario() { return usuario; },
    get obrigatorio() { return loginObrigatorio(); },
    get disponivel() { return disponivel(); },
  };
})();
