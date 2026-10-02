-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — mentorias, quarta parte
--    1. nota do atendimento (logo abaixo)
--    2. mural organizado pelo mentor: ele pode deixar que só ele abra
--       conversas; os participantes só respondem (no fim do arquivo)
--
--    nota do atendimento: depois que a equipe marca uma denúncia
--    como resolvida, quem denunciou dá de 1 a 5 estrelas e, se
--    quiser, escreve um comentário. Só a equipe e a pessoa veem.
--
--  Cópia do que foi rodado no SQL Editor do Supabase, depois do
--  banco/mentorias-3.sql.
-- ══════════════════════════════════════════════════════════════

alter table public.denuncias
  add column if not exists nota            smallint check (nota between 1 and 5),
  add column if not exists nota_comentario text not null default '' check (char_length(nota_comentario) <= 600),
  add column if not exists avaliada_em     timestamptz;

-- quem denunciou avalia o atendimento; pode mudar a nota depois
create or replace function public.denuncia_avaliar(p_id uuid, p_nota int, p_comentario text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'A nota vai de 1 a 5.';
  end if;
  update public.denuncias
  set nota = p_nota, nota_comentario = left(coalesce(btrim(p_comentario), ''), 600), avaliada_em = now()
  where id = p_id and autor_id = auth.uid() and resolvida;
  if not found then
    raise exception 'Só dá para avaliar uma denúncia sua que já foi resolvida.' using errcode = '42501';
  end if;
end;
$$;

-- as denúncias que a própria pessoa fez, com a conversa e a nota que ela deu
create or replace function public.denuncias_minhas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'tipo', d.tipo, 'motivo', d.motivo, 'criado_em', d.criado_em,
             'resolvida', d.resolvida, 'nota', d.nota, 'nota_comentario', d.nota_comentario,
             'mentoria', (select jsonb_build_object('id', m.id, 'vaga_titulo', m.vaga_titulo, 'empresa', m.empresa)
                          from public.mentorias m
                          where m.id = case when d.tipo = 'mentoria' then d.alvo_id
                                            else (select p.mentoria_id from public.mentoria_posts p where p.id = d.alvo_id) end),
             'mensagens', public._conversa_denuncia(d.id))
           order by d.criado_em desc)
    from public.denuncias d where d.autor_id = auth.uid()), '[]'::jsonb);
end;
$$;

-- a lista da administração passa a trazer a nota do atendimento
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
               'nota', d.nota, 'nota_comentario', d.nota_comentario, 'avaliada_em', d.avaliada_em,
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

revoke all on function public.denuncia_avaliar(uuid, int, text) from public, anon;
grant execute on function public.denuncia_avaliar(uuid, int, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
--  Mural organizado pelo mentor
--  Com so_mentor_abre = true, só o mentor publica mensagem nova no
--  mural; os participantes continuam podendo responder às que existem.
-- ══════════════════════════════════════════════════════════════

alter table public.mentorias add column if not exists so_mentor_abre boolean not null default false;

create or replace function public.mentoria_configurar(p_id uuid, p_so_mentor_abre boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  update public.mentorias set so_mentor_abre = coalesce(p_so_mentor_abre, false)
  where id = p_id and mentor_id = auth.uid();
  if not found then
    raise exception 'Só o mentor muda as regras do mural.' using errcode = '42501';
  end if;
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
  -- o mentor pode ter deixado só para ele abrir conversa
  if p_pai is null and public._papel(p_id) <> 'mentor'
     and (select m.so_mentor_abre from public.mentorias m where m.id = p_id) then
    raise exception 'Nesta mentoria só o mentor abre conversas. Você pode responder às mensagens dele.';
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
    'so_mentor_abre', m.so_mentor_abre,
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

revoke all on function public.mentoria_configurar(uuid, boolean) from public, anon;
grant execute on function public.mentoria_configurar(uuid, boolean) to authenticated;
