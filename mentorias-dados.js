/* ══════════════════════════════════════════════════════════════
   MENTORIAS — acesso aos dados

   Tudo o que as páginas de mentoria leem ou gravam passa por aqui.
   Do outro lado estão as funções do banco (banco/mentorias.sql), que
   conferem quem está pedindo antes de entregar qualquer coisa. Esta
   camada não decide permissão nenhuma: só chama e mostra o erro.

   Depende de: supabase-js (carregado antes) e layout.js (função esc).

   MODO DE DEMONSTRAÇÃO: só no computador de quem desenvolve
   (localhost), abrir a página com ?demo=mentor, ?demo=membro,
   ?demo=novo ou ?demo=admin troca o banco por dados de exemplo
   guardados na aba. Serve para ver as telas sem conta de verdade.
   No site publicado isso não existe.
   ══════════════════════════════════════════════════════════════ */

const MD = (function () {
  "use strict";

  const ENDERECO = "https://zrqucjktympnwilbvisw.supabase.co";
  const CHAVE_PUBLICA = "sb_publishable_4X7Cyykz9ZDMWOTvauxibA_Tpa4KtAh";

  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let papelDemo = "";
  if (LOCAL) {
    try {
      const q = new URLSearchParams(location.search).get("demo");
      if (q !== null) sessionStorage.setItem("hub-demo", q);
      papelDemo = sessionStorage.getItem("hub-demo") || "";
    } catch (e) {}
  }

  /* ── banco de verdade ── */
  let cli = null;
  function cliente() {
    if (!cli) {
      cli = supabase.createClient(ENDERECO, CHAVE_PUBLICA, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    }
    return cli;
  }

  function traduzir(e) {
    const m = (e && (e.message || String(e))) || "";
    if (/fetch|network|failed to/i.test(m)) return "Sem conexão com o servidor agora. Confira a internet e tente de novo.";
    if (/violates check constraint/i.test(m)) return "Algum campo ficou curto demais ou longo demais. Confira o que você escreveu.";
    if (/JWT|token/i.test(m)) return "A sua sessão expirou. Entre na conta de novo.";
    return m || "Não deu certo. Tente de novo em instantes.";
  }

  async function rpc(nome, args) {
    const r = await cliente().rpc(nome, args || {});
    if (r.error) throw new Error(traduzir(r.error));
    return r.data;
  }

  const real = {
    async eu() {
      const s = (await cliente().auth.getSession()).data.session;
      return s ? { id: s.user.id, email: s.user.email } : null;
    },
    /* Quem informou o nome ao criar a conta já ganha o perfil pronto na
       primeira vez que passa por aqui; depois pode completar com foto. */
    async meuPerfil() {
      const p = await rpc("perfil_meu");
      if (p) return p;
      try {
        const s = (await cliente().auth.getSession()).data.session;
        const nome = String(((s && s.user && s.user.user_metadata) || {}).nome || "").trim().slice(0, 60);
        if (nome.length >= 2) {
          await rpc("perfil_salvar", { p_nome: nome, p_bio: "", p_foto: "" });
          return { nome, bio: "", foto: "" };
        }
      } catch (e) { console.warn(e); }
      return null;
    },
    salvarPerfil: p => rpc("perfil_salvar", { p_nome: p.nome, p_bio: p.bio || "", p_foto: p.foto || "" }),
    souAdmin: () => rpc("eh_admin"),
    listar: () => rpc("mentorias_lista"),
    minhas: () => rpc("mentorias_minhas"),
    abrir: id => rpc("mentoria_detalhe", { p_id: id }),
    criar: m => rpc("mentoria_criar", {
      p_empresa: m.empresa, p_vaga_titulo: m.vaga_titulo, p_vaga_id: m.vaga_id || "", p_link: m.link,
      p_apresentacao: m.apresentacao, p_como_ajuda: m.como_ajuda, p_comprovacao: m.comprovacao }),
    encerrar: id => rpc("mentoria_encerrar", { p_id: id }),
    pedirEntrada: (id, msg) => rpc("mentoria_pedir", { p_id: id, p_mensagem: msg || "" }),
    sair: id => rpc("mentoria_sair", { p_id: id }),
    pedidos: id => rpc("mentoria_pedidos", { p_id: id }),
    responderPedido: (id, user, aprovar) => rpc("mentoria_responder", { p_id: id, p_user: user, p_aprovar: !!aprovar }),
    posts: id => rpc("mentoria_posts_lista", { p_id: id }),
    postar: (id, texto, pai) => rpc("mentoria_postar", { p_id: id, p_texto: texto, p_pai: pai || null }),
    apagarPost: id => rpc("mentoria_apagar_post", { p_post: id }),
    avaliar: (id, nota, comentario) => rpc("mentoria_avaliar", { p_id: id, p_nota: nota, p_comentario: comentario || "" }),
    denunciar: (tipo, alvo, motivo) => rpc("denunciar", { p_tipo: tipo, p_alvo: alvo, p_motivo: motivo }),
    adminTudo: () => rpc("admin_mentorias"),
    adminDecidir: (id, status, motivo) => rpc("admin_decidir", { p_id: id, p_status: status, p_motivo: motivo || "" }),
    adminResolver: id => rpc("admin_resolver_denuncia", { p_id: id }),
    /* prints de comprovação: só o mentor (dono do pedido) e a administração leem */
    anexarProva: (id, imagem) => rpc("mentoria_prova_anexar", { p_id: id, p_imagem: imagem }),
    provas: id => rpc("mentoria_provas_lista", { p_id: id }),
    provasTotal: id => rpc("mentoria_provas_total", { p_id: id }),
    /* equipe da administração */
    equipe: () => rpc("admin_equipe"),
    equipeAdicionar: email => rpc("admin_equipe_adicionar", { p_email: email }),
    equipeRemover: id => rpc("admin_equipe_remover", { p_user: id }),
  };

  /* ── dados de exemplo, só no localhost ── */
  function criarDemo(papel) {
    const CH = "hub-demo-md";
    const agora = () => new Date().toISOString();
    const dias = n => new Date(Date.now() - n * 864e5).toISOString();
    const P = {
      ana: { id: "u-ana", nome: "Ana Souza", foto: "" },
      rui: { id: "u-rui", nome: "Rui Tavares", foto: "" },
      bia: { id: "u-bia", nome: "Bia Lima", foto: "" },
      eu: { id: "u-eu", nome: papel === "novo" ? "" : "Você (teste)", foto: "" },
    };
    let S;
    try { S = JSON.parse(sessionStorage.getItem(CH) || "null"); } catch (e) { S = null; }
    if (!S || S.papel !== papel) {
      const mentorDaPrimeira = papel === "mentor" ? "u-eu" : "u-ana";
      S = {
        papel,
        perfil: papel === "novo" ? null : { nome: "Você (teste)", bio: "Trabalho com avaliação de busca desde 2024.", foto: "" },
        mentorias: [
          { id: "m1", mentor_id: mentorDaPrimeira, empresa: "Welocalize", vaga_titulo: "Search Quality Rater, português (Brasil)", vaga_id: "",
            link: "https://exemplo.com/indicacao", status: "aprovada", criado_em: dias(20), motivo: "",
            apresentacao: "Trabalho como avaliadora de busca há um ano e meio. Entrei sem experiência, reprovei na primeira prova e passei na segunda, então sei onde a maioria trava.",
            como_ajuda: "Respondo dúvidas no mural todo dia útil. Ajudo a montar o currículo em inglês, explico como estudar o guia de diretrizes e faço um simulado comentado antes da prova.",
            comprovacao: "Print do portal de trabalho e contrato." },
          { id: "m2", mentor_id: "u-rui", empresa: "micro1", vaga_titulo: "Portuguese Transcription Expert", vaga_id: "",
            link: "https://exemplo.com/indicacao2", status: "aprovada", criado_em: dias(8), motivo: "",
            apresentacao: "Faço transcrição de áudio em português para a micro1 desde março. Antes disso trabalhei com legendagem.",
            como_ajuda: "Explico como é a entrevista com IA da micro1, mando um modelo de currículo e reviso a sua primeira transcrição de teste.",
            comprovacao: "Print." },
          { id: "m3", mentor_id: "u-bia", empresa: "Alignerr", vaga_titulo: "Generalist", vaga_id: "",
            link: "https://exemplo.com/indicacao3", status: "pendente", criado_em: dias(1), motivo: "",
            apresentacao: "Sou generalista na Alignerr há quatro meses, em projetos de avaliação de texto.",
            como_ajuda: "Ajudo com o teste de qualificação e com a entrevista. Respondo no mural duas vezes por semana.",
            comprovacao: "Posso mandar o print do painel de pagamentos por e-mail." },
        ],
        membros: [
          { mentoria_id: "m1", user_id: "u-bia", status: "aprovado", mensagem: "Me candidatei ontem pelo seu link.", criado_em: dias(10) },
          { mentoria_id: "m1", user_id: "u-rui", status: "pedido", mensagem: "Usei o link, meu e-mail começa com rui.t", criado_em: dias(1) },
        ],
        posts: [
          { id: "p1", mentoria_id: "m1", autor_id: mentorDaPrimeira, pai_id: null, texto: "Bem-vindos! Comecem lendo a primeira parte do guia de diretrizes. Qualquer dúvida, escrevam aqui.", criado_em: dias(9), removido: false },
          { id: "p2", mentoria_id: "m1", autor_id: "u-bia", pai_id: "p1", texto: "Li a parte 1. A prova cobra a parte de Needs Met também?", criado_em: dias(8), removido: false },
          { id: "p3", mentoria_id: "m1", autor_id: mentorDaPrimeira, pai_id: "p1", texto: "Cobra, e é a que mais derruba. Amanhã posto um resumo.", criado_em: dias(2), removido: false },
        ],
        avaliacoes: [{ mentoria_id: "m1", user_id: "u-bia", nota: 5, comentario: "Respondeu tudo e o simulado ajudou muito.", criado_em: dias(3) }],
        denuncias: [{ id: "d1", autor_id: "u-bia", tipo: "post", alvo_id: "p2", motivo: "Exemplo de denúncia, só para ver a tela.", resolvida: false, criado_em: dias(1) }],
      };
      if (papel === "membro") S.membros.push({ mentoria_id: "m1", user_id: "u-eu", status: "aprovado", mensagem: "", criado_em: dias(5) });
    }
    const salvar = () => { try { sessionStorage.setItem(CH, JSON.stringify(S)); } catch (e) {} };
    salvar();
    const pessoa = id => {
      if (id === "u-eu") return { id, nome: (S.perfil && S.perfil.nome) || "Sem nome", foto: (S.perfil && S.perfil.foto) || "" };
      return Object.values(P).find(p => p.id === id) || { id, nome: "Sem nome", foto: "" };
    };
    const papelEm = id => {
      const m = S.mentorias.find(x => x.id === id);
      if (m && m.mentor_id === "u-eu") return "mentor";
      const mm = S.membros.find(x => x.mentoria_id === id && x.user_id === "u-eu");
      return mm ? mm.status : null;
    };
    const resumo = m => {
      const av = S.avaliacoes.filter(a => a.mentoria_id === m.id);
      const dele = S.posts.filter(p => p.mentoria_id === m.id && p.autor_id === m.mentor_id && !p.removido).map(p => p.criado_em).sort();
      return {
        id: m.id, empresa: m.empresa, vaga_titulo: m.vaga_titulo, vaga_id: m.vaga_id, apresentacao: m.apresentacao,
        como_ajuda: m.como_ajuda, status: m.status, criado_em: m.criado_em, mentor: pessoa(m.mentor_id),
        mentor_bio: m.mentor_id === "u-eu" ? ((S.perfil || {}).bio || "") : "",
        nota: av.length ? Math.round(10 * av.reduce((s, a) => s + a.nota, 0) / av.length) / 10 : null,
        avaliacoes: av.length,
        membros: S.membros.filter(x => x.mentoria_id === m.id && x.status === "aprovado").length,
        ultima_resposta: dele.length ? dele[dele.length - 1] : null,
      };
    };
    const erro = t => { throw new Error(t); };
    const admin = papel === "admin";
    const PROVAS = { m3: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="] };
    const EQUIPE = [{ id: "u-eu", dono: true, eu: true, nome: "Você (teste)", email: "teste@exemplo.com" },
                    { id: "u-ana", dono: false, eu: false, nome: "Ana Souza", email: "ana@exemplo.com" }];
    return {
      async eu() { return { id: "u-eu", email: "teste@exemplo.com" }; },
      async meuPerfil() { return S.perfil; },
      async salvarPerfil(p) { S.perfil = { nome: p.nome, bio: p.bio || "", foto: p.foto || "" }; salvar(); },
      async souAdmin() { return admin; },
      async listar() { return S.mentorias.filter(m => m.status === "aprovada").map(resumo); },
      async minhas() {
        return {
          como_mentor: S.mentorias.filter(m => m.mentor_id === "u-eu").map(m => Object.assign(resumo(m), {
            motivo: m.motivo, pedidos: S.membros.filter(x => x.mentoria_id === m.id && x.status === "pedido").length })),
          como_membro: S.membros.filter(x => x.user_id === "u-eu").map(x =>
            Object.assign(resumo(S.mentorias.find(m => m.id === x.mentoria_id)), { meu_status: x.status })),
        };
      },
      async abrir(id) {
        const m = S.mentorias.find(x => x.id === id) || erro("Mentoria não encontrada.");
        const minha = S.avaliacoes.find(a => a.mentoria_id === id && a.user_id === "u-eu");
        return Object.assign(resumo(m), {
          link: m.link, motivo: m.motivo, meu_papel: papelEm(id), sou_admin: admin, minha_nota: minha ? minha.nota : null,
          comentarios: S.avaliacoes.filter(a => a.mentoria_id === id && a.comentario).map(a => ({
            nota: a.nota, comentario: a.comentario, quem: pessoa(a.user_id), criado_em: a.criado_em })),
        });
      },
      async criar(m) {
        if (!S.perfil) erro("Preencha o seu perfil antes de pedir para ser mentor.");
        const id = "m" + Date.now();
        S.mentorias.push(Object.assign({ id, mentor_id: "u-eu", status: "pendente", criado_em: agora(), motivo: "", vaga_id: "" }, m));
        salvar(); return id;
      },
      async encerrar(id) { S.mentorias.find(m => m.id === id).status = "encerrada"; salvar(); },
      async pedirEntrada(id, msg) {
        if (!S.perfil) erro("Preencha o seu perfil antes de pedir para entrar.");
        S.membros = S.membros.filter(x => !(x.mentoria_id === id && x.user_id === "u-eu"));
        S.membros.push({ mentoria_id: id, user_id: "u-eu", status: "pedido", mensagem: msg || "", criado_em: agora() }); salvar();
      },
      async sair(id) { S.membros = S.membros.filter(x => !(x.mentoria_id === id && x.user_id === "u-eu")); salvar(); },
      async pedidos(id) {
        return S.membros.filter(x => x.mentoria_id === id).map(x => ({
          quem: pessoa(x.user_id), status: x.status, mensagem: x.mensagem, criado_em: x.criado_em }));
      },
      async responderPedido(id, user, aprovar) {
        const x = S.membros.find(y => y.mentoria_id === id && y.user_id === user);
        if (x) x.status = aprovar ? "aprovado" : "recusado"; salvar();
      },
      async posts(id) {
        const m = S.mentorias.find(x => x.id === id);
        if (["mentor", "aprovado"].indexOf(papelEm(id)) < 0 && !admin) erro("O mural é só para quem participa desta mentoria.");
        return S.posts.filter(p => p.mentoria_id === id).map(p => ({
          id: p.id, pai_id: p.pai_id, criado_em: p.criado_em, removido: p.removido, texto: p.removido ? "" : p.texto,
          autor: pessoa(p.autor_id), do_mentor: p.autor_id === m.mentor_id, meu: p.autor_id === "u-eu" }));
      },
      async postar(id, texto, pai) {
        const pid = "p" + Date.now();
        S.posts.push({ id: pid, mentoria_id: id, autor_id: "u-eu", pai_id: pai || null, texto, criado_em: agora(), removido: false });
        salvar(); return pid;
      },
      async apagarPost(id) { const p = S.posts.find(x => x.id === id); if (p) p.removido = true; salvar(); },
      async avaliar(id, nota, comentario) {
        S.avaliacoes = S.avaliacoes.filter(a => !(a.mentoria_id === id && a.user_id === "u-eu"));
        S.avaliacoes.push({ mentoria_id: id, user_id: "u-eu", nota, comentario: comentario || "", criado_em: agora() }); salvar();
      },
      async denunciar(tipo, alvo, motivo) {
        S.denuncias.push({ id: "d" + Date.now(), autor_id: "u-eu", tipo, alvo_id: alvo, motivo, resolvida: false, criado_em: agora() }); salvar();
      },
      async adminTudo() {
        if (!admin) erro("Somente a administração.");
        return {
          mentorias: S.mentorias.map(m => Object.assign(resumo(m), {
            link: m.link, comprovacao: m.comprovacao, motivo: m.motivo, provas: (PROVAS[m.id] || []).length, mentor_email: pessoa(m.mentor_id).nome.split(" ")[0].toLowerCase() + "@exemplo.com" })),
          denuncias: S.denuncias.map(d => {
            const p = d.tipo === "post" ? S.posts.find(x => x.id === d.alvo_id) : null;
            return { id: d.id, tipo: d.tipo, alvo_id: d.alvo_id, motivo: d.motivo, criado_em: d.criado_em, resolvida: d.resolvida,
                     quem: pessoa(d.autor_id), mentoria_id: p ? p.mentoria_id : d.alvo_id,
                     post: p ? { texto: p.texto, removido: p.removido, autor: pessoa(p.autor_id) } : null };
          }),
        };
      },
      async adminDecidir(id, status, motivo) { const m = S.mentorias.find(x => x.id === id); m.status = status; m.motivo = motivo || ""; salvar(); },
      async adminResolver(id) { S.denuncias.find(d => d.id === id).resolvida = true; salvar(); },
      /* no modo de demonstração os prints ficam só na memória da página */
      async anexarProva(id, imagem) { (PROVAS[id] = PROVAS[id] || []).push(imagem); },
      async provas(id) { return PROVAS[id] || []; },
      async provasTotal(id) { return (PROVAS[id] || []).length; },
      async equipe() {
        if (!admin) erro("Somente a administração.");
        return { sou_dono: true, pessoas: EQUIPE.slice() };
      },
      async equipeAdicionar(email) {
        if (!/@/.test(email)) erro("Não existe conta com este e-mail. A pessoa precisa criar a conta no site primeiro.");
        EQUIPE.push({ id: "u" + Date.now(), dono: false, eu: false, nome: "", email });
      },
      async equipeRemover(id) { const i = EQUIPE.findIndex(p => p.id === id); if (i >= 0) EQUIPE.splice(i, 1); },
    };
  }

  const api = papelDemo ? criarDemo(papelDemo) : real;

  /* ══════════════════════════════════════════════════════════
     PEÇAS DE TELA usadas pelas páginas de mentoria
     ══════════════════════════════════════════════════════════ */

  const CSS = `
  .md-foto { flex-shrink:0; border-radius:50%; object-fit:cover; background:var(--bg-soft,#F1ECE3); display:grid; place-items:center;
    font-weight:600; color:var(--signal,#1A4893); border:1px solid var(--line-soft,#EAE4D9); overflow:hidden; }
  .md-estrelas { color:#C98A1B; letter-spacing:1px; white-space:nowrap; }
  .md-estrelas .vazia { color:var(--line,#DED7CA); }
  .md-msg { font-size:13.5px; line-height:1.5; padding:10px 13px; border-radius:10px; margin:12px 0 0; }
  .md-msg.erro { background:#FBE9EB; color:#8E2233; } .md-msg.ok { background:#E4F3F0; color:#1F7A6E; }
  .md-bt { display:inline-block; font:inherit; font-size:14px; font-weight:600; color:#fff !important; background:var(--signal,#1A4893);
    border:1px solid var(--signal,#1A4893); border-radius:12px; padding:11px 18px; cursor:pointer; text-decoration:none !important; }
  .md-bt:hover { filter:brightness(1.08); } .md-bt[disabled] { opacity:.6; cursor:default; }
  .md-bt.claro { color:var(--ink,#10203A) !important; background:var(--panel,#fff); border-color:var(--line,#DED7CA); }
  .md-bt.pequeno { font-size:13px; padding:7px 13px; border-radius:99px; }
  .md-link { background:none; border:0; padding:0; font:inherit; font-size:12.5px; color:var(--ink-3,#8A94A1); cursor:pointer; text-decoration:underline; }
  .md-link:hover { color:var(--signal,#1A4893); }
  .md-campo { display:block; margin:14px 0 0; }
  .md-campo > span { display:block; font-size:13px; font-weight:600; color:var(--ink,#10203A); margin-bottom:5px; }
  .md-campo > small { display:block; font-size:12.5px; color:var(--ink-3,#8A94A1); margin:-2px 0 6px; line-height:1.45; }
  .md-campo input, .md-campo textarea { width:100%; box-sizing:border-box; font:inherit; font-size:15px; color:var(--ink,#10203A);
    background:var(--bg,#F7F4EF); border:1px solid var(--line,#DED7CA); border-radius:12px; padding:11px 13px; }
  .md-campo textarea { min-height:96px; resize:vertical; line-height:1.5; }
  .md-campo input:focus, .md-campo textarea:focus { outline:2px solid var(--signal,#1A4893); outline-offset:1px; background:#fff; }
  .md-provas { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
  .md-prova { position:relative; width:104px; height:104px; border-radius:12px; overflow:hidden; border:1px solid var(--line,#DED7CA); background:var(--bg-soft,#F1ECE3); }
  .md-prova img { width:100%; height:100%; object-fit:cover; display:block; cursor:zoom-in; }
  .md-prova button { position:absolute; top:4px; right:4px; width:24px; height:24px; border-radius:50%; border:0; cursor:pointer;
    background:rgba(16,32,58,.78); color:#fff; font-size:15px; line-height:1; }
  .md-luz { position:fixed; inset:0; z-index:200; background:rgba(10,18,32,.88); display:grid; place-items:center; padding:20px; cursor:zoom-out; overflow:auto; }
  .md-luz img { max-width:100%; max-height:none; border-radius:8px; background:#fff; }
  .md-anexar { position:relative; display:inline-block; font-size:13.5px; font-weight:600; color:var(--ink,#10203A); background:var(--panel,#fff);
    border:1px dashed var(--ink-3,#8A94A1); border-radius:12px; padding:10px 16px; cursor:pointer; margin-top:10px; }
  .md-anexar:hover { border-color:var(--signal,#1A4893); color:var(--signal,#1A4893); }
  .md-anexar input { position:absolute; width:1px; height:1px; opacity:0; }
  .md-etq { display:inline-block; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; border-radius:99px; padding:3px 9px; }
  .md-etq.pendente { color:#A85D24; background:#FBF0E4; } .md-etq.aprovada, .md-etq.aprovado { color:#1F7A6E; background:#E4F3F0; }
  .md-etq.recusada, .md-etq.recusado, .md-etq.encerrada { color:#8E2233; background:#FBE9EB; } .md-etq.pedido { color:#1A4893; background:#EAF1F8; }
  `;
  let cssPosto = false;
  function porCss() {
    if (cssPosto) return; cssPosto = true;
    const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
  }

  const e = s => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function foto(pessoa, tam) {
    porCss();
    const t = tam || 40;
    const nome = (pessoa && pessoa.nome) || "?";
    const est = `width:${t}px;height:${t}px;font-size:${Math.round(t * 0.4)}px;`;
    if (pessoa && /^data:image\/(jpeg|png|webp);base64,/.test(pessoa.foto || "")) {
      return `<img class="md-foto" style="${est}" src="${pessoa.foto}" alt="">`;
    }
    return `<span class="md-foto" style="${est}" aria-hidden="true">${e(nome.trim().charAt(0).toUpperCase())}</span>`;
  }

  function estrelas(nota) {
    porCss();
    const n = Math.round(Number(nota) || 0);
    return `<span class="md-estrelas" aria-label="${n} de 5">${"★".repeat(n)}<span class="vazia">${"★".repeat(5 - n)}</span></span>`;
  }

  /* "hoje", "ontem", "há 5 dias", "há 2 meses" */
  function haQuanto(iso) {
    if (!iso) return "";
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
    if (isNaN(d)) return "";
    if (d <= 0) return "hoje";
    if (d === 1) return "ontem";
    if (d < 30) return "há " + d + " dias";
    const m = Math.floor(d / 30);
    return m === 1 ? "há 1 mês" : "há " + m + " meses";
  }

  /* a frase sobre a última resposta do mentor, com o tom certo */
  function ultimaResposta(m) {
    if (!m.ultima_resposta) return "o mentor ainda não escreveu no mural";
    return "mentor respondeu " + haQuanto(m.ultima_resposta);
  }

  /* texto do usuário vira parágrafos, com os links clicáveis e seguros */
  function texto(t) {
    return e(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow ugc">$1</a>')
      .replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  }

  /* Reduz a foto no navegador antes de mandar: quadrada, 200 pontos, JPEG. */
  function reduzirFoto(arquivo) {
    return new Promise((ok, falha) => {
      if (!arquivo || !/^image\//.test(arquivo.type)) { falha(new Error("Escolha um arquivo de imagem.")); return; }
      const leitor = new FileReader();
      leitor.onerror = () => falha(new Error("Não deu para ler a imagem."));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => falha(new Error("Não deu para abrir a imagem."));
        img.onload = () => {
          const lado = Math.min(img.width, img.height), c = document.createElement("canvas");
          c.width = c.height = 200;
          c.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 200, 200);
          ok(c.toDataURL("image/jpeg", 0.82));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /* Reduz um print de comprovação antes de mandar: mantém a proporção, lado
     maior de até 1500 pontos, JPEG. Se ainda ficar pesado, aperta mais. */
  const LIMITE_PROVA = 880000;
  function reduzirProva(arquivo) {
    return new Promise((ok, falha) => {
      if (!arquivo || !/^image\//.test(arquivo.type)) { falha(new Error("Só dá para anexar imagem (print ou foto).")); return; }
      const leitor = new FileReader();
      leitor.onerror = () => falha(new Error("Não deu para ler a imagem."));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => falha(new Error("Não deu para abrir a imagem. Tente salvar como JPG ou PNG."));
        img.onload = () => {
          const tentativas = [[1500, 0.82], [1500, 0.65], [1100, 0.65], [800, 0.6]];
          for (let i = 0; i < tentativas.length; i++) {
            const lado = tentativas[i][0], f = Math.min(1, lado / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f));
            const x = c.getContext("2d");
            x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);   // print com fundo transparente não fica preto
            x.drawImage(img, 0, 0, c.width, c.height);
            const uri = c.toDataURL("image/jpeg", tentativas[i][1]);
            if (uri.length <= LIMITE_PROVA) { ok(uri); return; }
          }
          falha(new Error("Esta imagem é grande demais. Tente um print menor."));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }
  /* Qualquer <img data-ampliar> abre em tamanho grande ao clicar. (O navegador
     não deixa abrir uma imagem guardada como texto em outra aba.) */
  document.addEventListener("click", ev => {
    const velho = document.querySelector(".md-luz");
    if (velho) { velho.remove(); return; }
    const img = ev.target.closest && ev.target.closest("img[data-ampliar]");
    if (!img) return;
    ev.preventDefault();
    porCss();
    const luz = document.createElement("div");
    luz.className = "md-luz";
    luz.setAttribute("role", "dialog");
    luz.setAttribute("aria-label", "Imagem ampliada. Clique para fechar.");
    const grande = document.createElement("img");
    grande.src = img.src; grande.alt = img.alt || "";
    luz.appendChild(grande);
    document.body.appendChild(luz);
  });
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    const luz = document.querySelector(".md-luz"); if (luz) luz.remove();
  });

  const ehImagem = s => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s || "");

  return Object.assign({}, api, {
    demo: papelDemo,
    disponivel: !!papelDemo || (typeof supabase !== "undefined" && !!supabase.createClient),
    ui: { porCss, foto, estrelas, haQuanto, ultimaResposta, texto, reduzirFoto, reduzirProva, ehImagem, e },
  });
})();
