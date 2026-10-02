-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — mentorias, terceira parte
--    conversa entre a equipe e quem fez uma denúncia
--
--  Cópia do que foi rodado no SQL Editor do Supabase, depois do
--  banco/mentorias-2.sql. Mesma regra das outras: tabela trancada,
--  tudo passa por função que confere quem está pedindo.
--
--  Quem lê a conversa de uma denúncia: a equipe e quem denunciou.
--  O denunciado e o mentor não leem. Quem denunciou vê a equipe
--  como "Equipe do Hub", sem o nome de quem respondeu.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.denuncia_mensagens (
  id          uuid primary key default gen_random_uuid(),
  denuncia_id uuid not null references public.denuncias (id) on delete cascade,
  autor_id    uuid not null references auth.users (id) on delete cascade,
  da_equipe   boolean not null,
  texto       text not null check (char_length(btrim(texto)) between 1 and 2000),
  criado_em   timestamptz not null default now()
);
create index if not exists denuncia_mensagens_por_denuncia on public.denuncia_mensagens (denuncia_id, criado_em);
alter table public.denuncia_mensagens enable row level security;
revoke all on public.denuncia_mensagens from anon, authenticated;

-- a conversa de uma denúncia, na ordem (uso interno)
create or replace function public._conversa_denuncia(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'da_equipe', m.da_equipe, 'texto', m.texto, 'criado_em', m.criado_em)
         order by m.criado_em), '[]'::jsonb)
  from public.denuncia_mensagens m where m.denuncia_id = p_id;
$$;

-- p_como_equipe = true: a equipe escreve para quem denunciou
-- p_como_equipe = false: quem denunciou responde à equipe
create or replace function public.denuncia_responder(p_id uuid, p_texto text, p_como_equipe boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.denuncias%rowtype;
begin
  perform public._exige_login();
  select * into d from public.denuncias where id = p_id;
  if not found then
    raise exception 'Denúncia não encontrada.' using errcode = 'P0002';
  end if;
  if p_como_equipe then
    if not public.eh_admin() then
      raise exception 'Somente a administração.' using errcode = '42501';
    end if;
  else
    if d.autor_id is distinct from auth.uid() then
      raise exception 'Só quem fez a denúncia pode responder.' using errcode = '42501';
    end if;
    if d.resolvida then
      raise exception 'Esta denúncia já foi encerrada pela equipe.';
    end if;
    if (select count(*) from public.denuncia_mensagens m
        where m.autor_id = auth.uid() and not m.da_equipe
          and m.criado_em > now() - interval '1 day') >= 30 then
      raise exception 'Muitas mensagens em pouco tempo. Tente de novo amanhã.';
    end if;
  end if;
  insert into public.denuncia_mensagens (denuncia_id, autor_id, da_equipe, texto)
  values (p_id, auth.uid(), p_como_equipe, btrim(p_texto));
end;
$$;

-- as denúncias que a própria pessoa fez, com a conversa
create or replace function public.denuncias_minhas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'tipo', d.tipo, 'motivo', d.motivo, 'criado_em', d.criado_em,
             'resolvida', d.resolvida,
             'mentoria', (select jsonb_build_object('id', m.id, 'vaga_titulo', m.vaga_titulo, 'empresa', m.empresa)
                          from public.mentorias m
                          where m.id = case when d.tipo = 'mentoria' then d.alvo_id
                                            else (select p.mentoria_id from public.mentoria_posts p where p.id = d.alvo_id) end),
             'mensagens', public._conversa_denuncia(d.id))
           order by d.criado_em desc)
    from public.denuncias d where d.autor_id = auth.uid()), '[]'::jsonb);
end;
$$;

-- a lista da administração passa a trazer a conversa de cada denúncia
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
               'provas', (select count(*) from public.mentoria_provas p where p.mentoria_id = m.id),
               'mentor_email', (select u.email from auth.users u where u.id = m.mentor_id))
             order by (m.status = 'pendente') desc, m.criado_em desc)
      from public.mentorias m), '[]'::jsonb),
    'denuncias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'tipo', d.tipo, 'alvo_id', d.alvo_id, 'motivo', d.motivo,
               'criado_em', d.criado_em, 'resolvida', d.resolvida,
               'quem', public._pessoa(d.autor_id),
               'mensagens', public._conversa_denuncia(d.id),
               'mentoria_id', case when d.tipo = 'mentoria' then d.alvo_id
                                   else (select p.mentoria_id from public.mentoria_posts p where p.id = d.alvo_id) end,
               'mentoria_titulo', (select m.vaga_titulo from public.mentorias m
                                   where m.id = case when d.tipo = 'mentoria' then d.alvo_id
                                                     else (select p.mentoria_id from public.mentoria_posts p where p.id = d.alvo_id) end),
               'post', case when d.tipo = 'post' then (
                         select jsonb_build_object('texto', p.texto, 'removido', p.removido,
                                                   'autor', public._pessoa(p.autor_id))
                         from public.mentoria_posts p where p.id = d.alvo_id) end)
             order by d.resolvida, d.criado_em desc)
      from public.denuncias d), '[]'::jsonb));
end;
$$;

revoke all on function public._conversa_denuncia(uuid) from public, anon, authenticated;
revoke all on function public.denuncia_responder(uuid, text, boolean), public.denuncias_minhas()
  from public, anon;
grant execute on function public.denuncia_responder(uuid, text, boolean), public.denuncias_minhas()
  to authenticated;
