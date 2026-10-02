-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — mentorias (perfil, projetos, mural, avaliações)
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  Como funciona, em poucas linhas:
--    · cada conta pode ter um perfil (nome, apresentação curta, foto)
--    · quem quer ser mentor manda um pedido, com a vaga, o link de
--      indicação e uma comprovação de que trabalha lá
--    · a administração aprova ou recusa (tabela "administradores")
--    · quem quer participar pede para entrar; quem aprova é o mentor
--    · só o mentor e os participantes aprovados leem e escrevem no mural
--    · participante aprovado dá nota de 1 a 5 para a mentoria
--    · qualquer pessoa logada pode denunciar um post ou uma mentoria
--
--  Segurança: NENHUMA tabela daqui é lida ou escrita direto pelo site.
--  Elas ficam trancadas (RLS ligado, sem regra de acesso) e tudo passa
--  pelas funções abaixo, que conferem quem está pedindo antes de
--  entregar ou gravar qualquer coisa. O e-mail de ninguém sai daqui,
--  a não ser para a administração na tela de aprovar mentores.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.perfis (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  nome          text not null check (char_length(btrim(nome)) between 2 and 60),
  bio           text not null default '' check (char_length(bio) <= 600),
  -- foto pequena, já reduzida no navegador e guardada como texto (data:image/...)
  foto          text not null default '' check (char_length(foto) <= 70000),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.mentorias (
  id           uuid primary key default gen_random_uuid(),
  mentor_id    uuid not null references auth.users (id) on delete cascade,
  empresa      text not null check (char_length(btrim(empresa)) between 2 and 80),
  vaga_titulo  text not null check (char_length(btrim(vaga_titulo)) between 2 and 160),
  vaga_id      text not null default '',
  link         text not null check (link ~* '^https://' and char_length(link) <= 600),
  apresentacao text not null check (char_length(btrim(apresentacao)) between 40 and 3000),
  como_ajuda   text not null check (char_length(btrim(como_ajuda)) between 40 and 3000),
  -- só a administração e o próprio mentor leem a comprovação
  comprovacao  text not null check (char_length(btrim(comprovacao)) between 10 and 3000),
  status       text not null default 'pendente'
               check (status in ('pendente', 'aprovada', 'recusada', 'encerrada')),
  motivo       text not null default '',
  criado_em    timestamptz not null default now(),
  decidido_em  timestamptz
);
create index if not exists mentorias_por_status on public.mentorias (status, criado_em desc);

create table if not exists public.mentoria_membros (
  mentoria_id uuid not null references public.mentorias (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'pedido' check (status in ('pedido', 'aprovado', 'recusado')),
  mensagem    text not null default '' check (char_length(mensagem) <= 600),
  criado_em   timestamptz not null default now(),
  decidido_em timestamptz,
  primary key (mentoria_id, user_id)
);

create table if not exists public.mentoria_posts (
  id          uuid primary key default gen_random_uuid(),
  mentoria_id uuid not null references public.mentorias (id) on delete cascade,
  autor_id    uuid not null references auth.users (id) on delete cascade,
  pai_id      uuid references public.mentoria_posts (id) on delete cascade,
  texto       text not null check (char_length(btrim(texto)) between 1 and 4000),
  removido    boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index if not exists mentoria_posts_por_mentoria on public.mentoria_posts (mentoria_id, criado_em);

create table if not exists public.mentoria_avaliacoes (
  mentoria_id uuid not null references public.mentorias (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  nota        int  not null check (nota between 1 and 5),
  comentario  text not null default '' check (char_length(comentario) <= 600),
  criado_em   timestamptz not null default now(),
  primary key (mentoria_id, user_id)
);

create table if not exists public.denuncias (
  id        uuid primary key default gen_random_uuid(),
  autor_id  uuid not null references auth.users (id) on delete cascade,
  tipo      text not null check (tipo in ('post', 'mentoria')),
  alvo_id   uuid not null,
  motivo    text not null check (char_length(btrim(motivo)) between 3 and 600),
  resolvida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Tudo trancado: sem regra de acesso, ninguém lê nem escreve direto.
alter table public.perfis              enable row level security;
alter table public.mentorias           enable row level security;
alter table public.mentoria_membros    enable row level security;
alter table public.mentoria_posts      enable row level security;
alter table public.mentoria_avaliacoes enable row level security;
alter table public.denuncias           enable row level security;
revoke all on public.perfis, public.mentorias, public.mentoria_membros,
              public.mentoria_posts, public.mentoria_avaliacoes, public.denuncias
  from anon, authenticated;

-- ══════════════════════════════════════════════════════════════
--  Ajudantes
-- ══════════════════════════════════════════════════════════════

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.administradores a where a.user_id = auth.uid());
$$;

-- nome e foto de uma pessoa, do jeito que aparecem para os outros
create or replace function public._pessoa(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_user,
    'nome', coalesce((select p.nome from public.perfis p where p.user_id = p_user), 'Sem nome'),
    'foto', coalesce((select p.foto from public.perfis p where p.user_id = p_user), ''));
$$;

-- "mentor", "aprovado", "pedido", "recusado" ou null
create or replace function public._papel(p_mentoria uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.mentorias m where m.id = p_mentoria and m.mentor_id = auth.uid()) then 'mentor'
    else (select mm.status from public.mentoria_membros mm
          where mm.mentoria_id = p_mentoria and mm.user_id = auth.uid())
  end;
$$;

create or replace function public._exige_login()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.' using errcode = '42501';
  end if;
end;
$$;

-- os números públicos de uma mentoria
create or replace function public._resumo_mentoria(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id,
    'empresa', m.empresa,
    'vaga_titulo', m.vaga_titulo,
    'vaga_id', m.vaga_id,
    'apresentacao', m.apresentacao,
    'como_ajuda', m.como_ajuda,
    'status', m.status,
    'criado_em', m.criado_em,
    'mentor', public._pessoa(m.mentor_id),
    'mentor_bio', coalesce((select p.bio from public.perfis p where p.user_id = m.mentor_id), ''),
    'nota', (select round(avg(a.nota)::numeric, 1) from public.mentoria_avaliacoes a where a.mentoria_id = m.id),
    'avaliacoes', (select count(*) from public.mentoria_avaliacoes a where a.mentoria_id = m.id),
    'membros', (select count(*) from public.mentoria_membros mm where mm.mentoria_id = m.id and mm.status = 'aprovado'),
    'ultima_resposta', (select max(p.criado_em) from public.mentoria_posts p
                        where p.mentoria_id = m.id and p.autor_id = m.mentor_id and not p.removido))
  from public.mentorias m where m.id = p_id;
$$;

-- ══════════════════════════════════════════════════════════════
--  Perfil
-- ══════════════════════════════════════════════════════════════

create or replace function public.perfil_meu()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  return (select jsonb_build_object('nome', p.nome, 'bio', p.bio, 'foto', p.foto)
          from public.perfis p where p.user_id = auth.uid());
end;
$$;

create or replace function public.perfil_salvar(p_nome text, p_bio text, p_foto text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if p_foto is not null and p_foto <> '' and p_foto !~ '^data:image/(jpeg|png|webp);base64,' then
    raise exception 'Foto em formato inválido.';
  end if;
  insert into public.perfis (user_id, nome, bio, foto)
  values (auth.uid(), btrim(p_nome), coalesce(btrim(p_bio), ''), coalesce(p_foto, ''))
  on conflict (user_id) do update
    set nome = excluded.nome, bio = excluded.bio, foto = excluded.foto, atualizado_em = now();
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  Mentorias: listar, abrir, criar
-- ══════════════════════════════════════════════════════════════

create or replace function public.mentorias_lista()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  return coalesce((
    select jsonb_agg(public._resumo_mentoria(m.id) order by m.decidido_em desc nulls last)
    from public.mentorias m where m.status = 'aprovada'), '[]'::jsonb);
end;
$$;

-- as que eu criei (em qualquer situação) e as de que participo ou pedi para participar
create or replace function public.mentorias_minhas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  return jsonb_build_object(
    'como_mentor', coalesce((
      select jsonb_agg(public._resumo_mentoria(m.id) || jsonb_build_object(
               'motivo', m.motivo,
               'pedidos', (select count(*) from public.mentoria_membros mm
                           where mm.mentoria_id = m.id and mm.status = 'pedido'))
             order by m.criado_em desc)
      from public.mentorias m where m.mentor_id = auth.uid()), '[]'::jsonb),
    'como_membro', coalesce((
      select jsonb_agg(public._resumo_mentoria(mm.mentoria_id) || jsonb_build_object('meu_status', mm.status)
             order by mm.criado_em desc)
      from public.mentoria_membros mm
      join public.mentorias m on m.id = mm.mentoria_id and m.status in ('aprovada', 'encerrada')
      where mm.user_id = auth.uid()), '[]'::jsonb));
end;
$$;

create or replace function public.mentoria_detalhe(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.mentorias;
  papel text;
begin
  perform public._exige_login();
  select * into m from public.mentorias where id = p_id;
  if not found then
    raise exception 'Mentoria não encontrada.' using errcode = 'P0002';
  end if;
  papel := public._papel(p_id);
  -- pendente ou recusada só aparece para quem criou e para a administração
  if m.status in ('pendente', 'recusada') and papel is distinct from 'mentor' and not public.eh_admin() then
    raise exception 'Mentoria não encontrada.' using errcode = 'P0002';
  end if;
  return public._resumo_mentoria(p_id) || jsonb_build_object(
    'link', m.link,
    'motivo', case when papel = 'mentor' or public.eh_admin() then m.motivo else '' end,
    'meu_papel', papel,
    'sou_admin', public.eh_admin(),
    'minha_nota', (select a.nota from public.mentoria_avaliacoes a
                   where a.mentoria_id = p_id and a.user_id = auth.uid()),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object('nota', a.nota, 'comentario', a.comentario,
                                          'quem', public._pessoa(a.user_id), 'criado_em', a.criado_em)
             order by a.criado_em desc)
      from public.mentoria_avaliacoes a
      where a.mentoria_id = p_id and a.comentario <> ''), '[]'::jsonb));
end;
$$;

create or replace function public.mentoria_criar(
  p_empresa text, p_vaga_titulo text, p_vaga_id text, p_link text,
  p_apresentacao text, p_como_ajuda text, p_comprovacao text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  novo uuid;
begin
  perform public._exige_login();
  if not exists (select 1 from public.perfis p where p.user_id = auth.uid()) then
    raise exception 'Preencha o seu perfil antes de pedir para ser mentor.';
  end if;
  if (select count(*) from public.mentorias m
      where m.mentor_id = auth.uid() and m.status = 'pendente') >= 3 then
    raise exception 'Você já tem pedidos esperando análise. Aguarde a resposta antes de mandar outro.';
  end if;
  insert into public.mentorias (mentor_id, empresa, vaga_titulo, vaga_id, link,
                                apresentacao, como_ajuda, comprovacao)
  values (auth.uid(), btrim(p_empresa), btrim(p_vaga_titulo), coalesce(p_vaga_id, ''),
          btrim(p_link), btrim(p_apresentacao), btrim(p_como_ajuda), btrim(p_comprovacao))
  returning id into novo;
  return novo;
end;
$$;

-- o mentor encerra a própria mentoria (o mural fica só para leitura)
create or replace function public.mentoria_encerrar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  update public.mentorias set status = 'encerrada', decidido_em = now()
  where id = p_id and status = 'aprovada' and (mentor_id = auth.uid() or public.eh_admin());
  if not found then
    raise exception 'Não foi possível encerrar esta mentoria.';
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  Participantes: pedir para entrar, sair, o mentor aprovar
-- ══════════════════════════════════════════════════════════════

create or replace function public.mentoria_pedir(p_id uuid, p_mensagem text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if not exists (select 1 from public.perfis p where p.user_id = auth.uid()) then
    raise exception 'Preencha o seu perfil antes de pedir para entrar.';
  end if;
  if not exists (select 1 from public.mentorias m where m.id = p_id and m.status = 'aprovada') then
    raise exception 'Esta mentoria não está aberta.';
  end if;
  if exists (select 1 from public.mentorias m where m.id = p_id and m.mentor_id = auth.uid()) then
    raise exception 'Você é o mentor desta mentoria.';
  end if;
  insert into public.mentoria_membros (mentoria_id, user_id, mensagem)
  values (p_id, auth.uid(), coalesce(btrim(p_mensagem), ''))
  on conflict (mentoria_id, user_id) do update
    -- quem foi recusado pode pedir de novo; quem já está dentro não muda
    set status = case when public.mentoria_membros.status = 'aprovado' then 'aprovado' else 'pedido' end,
        mensagem = excluded.mensagem, criado_em = now(), decidido_em = null;
end;
$$;

create or replace function public.mentoria_sair(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  delete from public.mentoria_membros where mentoria_id = p_id and user_id = auth.uid();
end;
$$;

-- lista de quem pediu e de quem já está dentro, só para o mentor e a administração
create or replace function public.mentoria_pedidos(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if public._papel(p_id) is distinct from 'mentor' and not public.eh_admin() then
    raise exception 'Só o mentor vê os pedidos.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('quem', public._pessoa(mm.user_id), 'status', mm.status,
                                        'mensagem', mm.mensagem, 'criado_em', mm.criado_em)
           order by (mm.status = 'pedido') desc, mm.criado_em desc)
    from public.mentoria_membros mm where mm.mentoria_id = p_id), '[]'::jsonb);
end;
$$;

create or replace function public.mentoria_responder(p_id uuid, p_user uuid, p_aprovar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if public._papel(p_id) is distinct from 'mentor' then
    raise exception 'Só o mentor aprova a entrada.' using errcode = '42501';
  end if;
  update public.mentoria_membros
  set status = case when p_aprovar then 'aprovado' else 'recusado' end, decidido_em = now()
  where mentoria_id = p_id and user_id = p_user;
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  Mural
-- ══════════════════════════════════════════════════════════════

create or replace function public._pode_no_mural(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public._papel(p_id) in ('mentor', 'aprovado') or public.eh_admin();
$$;

create or replace function public.mentoria_posts_lista(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if not coalesce(public._pode_no_mural(p_id), false) then
    raise exception 'O mural é só para quem participa desta mentoria.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'pai_id', p.pai_id, 'criado_em', p.criado_em, 'removido', p.removido,
             'texto', case when p.removido then '' else p.texto end,
             'autor', public._pessoa(p.autor_id),
             'do_mentor', p.autor_id = (select m.mentor_id from public.mentorias m where m.id = p_id),
             'meu', p.autor_id = auth.uid())
           order by p.criado_em)
    from public.mentoria_posts p where p.mentoria_id = p_id), '[]'::jsonb);
end;
$$;

create or replace function public.mentoria_postar(p_id uuid, p_texto text, p_pai uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  novo uuid;
begin
  perform public._exige_login();
  if public._papel(p_id) not in ('mentor', 'aprovado') or public._papel(p_id) is null then
    raise exception 'O mural é só para quem participa desta mentoria.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mentorias m where m.id = p_id and m.status = 'aprovada') then
    raise exception 'Esta mentoria está encerrada. O mural ficou só para leitura.';
  end if;
  if (select count(*) from public.mentoria_posts p
      where p.autor_id = auth.uid() and p.criado_em > now() - interval '1 hour') >= 40 then
    raise exception 'Muitas mensagens em pouco tempo. Espere um pouco e tente de novo.';
  end if;
  -- resposta só vale para post de primeiro nível da mesma mentoria
  if p_pai is not null and not exists (
       select 1 from public.mentoria_posts p
       where p.id = p_pai and p.mentoria_id = p_id and p.pai_id is null) then
    raise exception 'Post não encontrado.';
  end if;
  insert into public.mentoria_posts (mentoria_id, autor_id, pai_id, texto)
  values (p_id, auth.uid(), p_pai, btrim(p_texto))
  returning id into novo;
  return novo;
end;
$$;

-- o autor apaga o próprio post; a administração apaga qualquer um
create or replace function public.mentoria_apagar_post(p_post uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  update public.mentoria_posts set removido = true
  where id = p_post and (autor_id = auth.uid() or public.eh_admin());
  if not found then
    raise exception 'Não foi possível apagar este post.';
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  Avaliação e denúncia
-- ══════════════════════════════════════════════════════════════

create or replace function public.mentoria_avaliar(p_id uuid, p_nota int, p_comentario text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if public._papel(p_id) is distinct from 'aprovado' then
    raise exception 'Só quem participa da mentoria pode avaliar.' using errcode = '42501';
  end if;
  insert into public.mentoria_avaliacoes (mentoria_id, user_id, nota, comentario)
  values (p_id, auth.uid(), p_nota, coalesce(btrim(p_comentario), ''))
  on conflict (mentoria_id, user_id) do update
    set nota = excluded.nota, comentario = excluded.comentario, criado_em = now();
end;
$$;

create or replace function public.denunciar(p_tipo text, p_alvo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if (select count(*) from public.denuncias d
      where d.autor_id = auth.uid() and d.criado_em > now() - interval '1 day') >= 20 then
    raise exception 'Muitas denúncias em pouco tempo.';
  end if;
  insert into public.denuncias (autor_id, tipo, alvo_id, motivo)
  values (auth.uid(), p_tipo, p_alvo, btrim(p_motivo));
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  Administração
-- ══════════════════════════════════════════════════════════════

create or replace function public.admin_mentorias()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mentorias', coalesce((
      select jsonb_agg(public._resumo_mentoria(m.id) || jsonb_build_object(
               'link', m.link, 'comprovacao', m.comprovacao, 'motivo', m.motivo,
               'mentor_email', (select u.email from auth.users u where u.id = m.mentor_id))
             order by (m.status = 'pendente') desc, m.criado_em desc)
      from public.mentorias m), '[]'::jsonb),
    'denuncias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'tipo', d.tipo, 'alvo_id', d.alvo_id, 'motivo', d.motivo,
               'criado_em', d.criado_em, 'resolvida', d.resolvida,
               'quem', public._pessoa(d.autor_id),
               'mentoria_id', case when d.tipo = 'mentoria' then d.alvo_id
                                   else (select p.mentoria_id from public.mentoria_posts p where p.id = d.alvo_id) end,
               'post', case when d.tipo = 'post' then (
                         select jsonb_build_object('texto', p.texto, 'removido', p.removido,
                                                   'autor', public._pessoa(p.autor_id))
                         from public.mentoria_posts p where p.id = d.alvo_id) end)
             order by d.resolvida, d.criado_em desc)
      from public.denuncias d), '[]'::jsonb));
end;
$$;

create or replace function public.admin_decidir(p_id uuid, p_status text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  if p_status not in ('aprovada', 'recusada', 'encerrada', 'pendente') then
    raise exception 'Situação inválida.';
  end if;
  update public.mentorias
  set status = p_status, motivo = coalesce(btrim(p_motivo), ''), decidido_em = now()
  where id = p_id;
end;
$$;

create or replace function public.admin_resolver_denuncia(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  update public.denuncias set resolvida = true where id = p_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════
--  Quem pode chamar cada função
--  As que começam com "_" são internas: ninguém chama pelo site.
-- ══════════════════════════════════════════════════════════════

revoke all on function
  public._pessoa(uuid), public._papel(uuid), public._exige_login(),
  public._resumo_mentoria(uuid), public._pode_no_mural(uuid)
  from public, anon, authenticated;

revoke all on function
  public.eh_admin(), public.perfil_meu(), public.perfil_salvar(text, text, text),
  public.mentorias_lista(), public.mentorias_minhas(), public.mentoria_detalhe(uuid),
  public.mentoria_criar(text, text, text, text, text, text, text), public.mentoria_encerrar(uuid),
  public.mentoria_pedir(uuid, text), public.mentoria_sair(uuid), public.mentoria_pedidos(uuid),
  public.mentoria_responder(uuid, uuid, boolean), public.mentoria_posts_lista(uuid),
  public.mentoria_postar(uuid, text, uuid), public.mentoria_apagar_post(uuid),
  public.mentoria_avaliar(uuid, int, text), public.denunciar(text, uuid, text),
  public.admin_mentorias(), public.admin_decidir(uuid, text, text),
  public.admin_resolver_denuncia(uuid)
  from public, anon;

grant execute on function
  public.eh_admin(), public.perfil_meu(), public.perfil_salvar(text, text, text),
  public.mentorias_lista(), public.mentorias_minhas(), public.mentoria_detalhe(uuid),
  public.mentoria_criar(text, text, text, text, text, text, text), public.mentoria_encerrar(uuid),
  public.mentoria_pedir(uuid, text), public.mentoria_sair(uuid), public.mentoria_pedidos(uuid),
  public.mentoria_responder(uuid, uuid, boolean), public.mentoria_posts_lista(uuid),
  public.mentoria_postar(uuid, text, uuid), public.mentoria_apagar_post(uuid),
  public.mentoria_avaliar(uuid, int, text), public.denunciar(text, uuid, text),
  public.admin_mentorias(), public.admin_decidir(uuid, text, text),
  public.admin_resolver_denuncia(uuid)
  to authenticated;
