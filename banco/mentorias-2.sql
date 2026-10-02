-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — mentorias, segunda parte
--    1. prints de comprovação anexados ao pedido de mentor
--    2. equipe da administração: quem entra no painel
--
--  Cópia do que foi rodado no SQL Editor do Supabase, depois do
--  banco/mentorias.sql. Segue a mesma regra: tabela trancada, tudo
--  passa por função que confere quem está pedindo.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Prints de comprovação ──
-- A imagem chega já reduzida pelo navegador e fica guardada como texto.
-- Só o próprio mentor e a administração conseguem ler.
create table if not exists public.mentoria_provas (
  id          uuid primary key default gen_random_uuid(),
  mentoria_id uuid not null references public.mentorias (id) on delete cascade,
  imagem      text not null check (imagem ~ '^data:image/(jpeg|png|webp);base64,'
                                   and char_length(imagem) <= 900000),
  criado_em   timestamptz not null default now()
);
create index if not exists mentoria_provas_por_mentoria on public.mentoria_provas (mentoria_id);
alter table public.mentoria_provas enable row level security;
revoke all on public.mentoria_provas from anon, authenticated;

create or replace function public.mentoria_prova_anexar(p_id uuid, p_imagem text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if not exists (select 1 from public.mentorias m
                 where m.id = p_id and m.mentor_id = auth.uid() and m.status = 'pendente') then
    raise exception 'Só dá para anexar comprovante enquanto o pedido está em análise.';
  end if;
  if (select count(*) from public.mentoria_provas p where p.mentoria_id = p_id) >= 6 then
    raise exception 'O limite é de 6 imagens por pedido.';
  end if;
  insert into public.mentoria_provas (mentoria_id, imagem) values (p_id, p_imagem);
end;
$$;

create or replace function public.mentoria_provas_lista(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if not public.eh_admin()
     and not exists (select 1 from public.mentorias m where m.id = p_id and m.mentor_id = auth.uid()) then
    raise exception 'Só a administração e o próprio mentor veem os comprovantes.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(p.imagem order by p.criado_em)
                   from public.mentoria_provas p where p.mentoria_id = p_id), '[]'::jsonb);
end;
$$;

-- quantos comprovantes tem o pedido (o mentor vê o dele; a administração, todos)
create or replace function public.mentoria_provas_total(p_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when public.eh_admin()
                or exists (select 1 from public.mentorias m where m.id = p_id and m.mentor_id = auth.uid())
              then (select count(*)::int from public.mentoria_provas p where p.mentoria_id = p_id)
              else 0 end;
$$;

-- ── 2. Equipe da administração ──
-- Quem está em "administradores" entra no painel, aprova mentor e cuida das
-- denúncias. Só quem tem dono = true inclui ou tira gente da equipe.
alter table public.administradores add column if not exists dono boolean not null default false;

-- Quando isto foi rodado só havia uma pessoa na administração, e ela virou o dono:
--   update public.administradores set dono = true
--   where (select count(*) from public.administradores) = 1;
-- Para passar o posto de dono a outra pessoa, troque o e-mail e rode:
--   update public.administradores set dono = true
--   where user_id = (select id from auth.users where email = 'E-MAIL-DO-DONO');

create or replace function public.eh_dono()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.administradores a where a.user_id = auth.uid() and a.dono);
$$;

create or replace function public.admin_equipe()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'sou_dono', public.eh_dono(),
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.user_id, 'dono', a.dono, 'eu', a.user_id = auth.uid(),
               'nome', coalesce((select p.nome from public.perfis p where p.user_id = a.user_id), ''),
               'email', (select u.email from auth.users u where u.id = a.user_id))
             order by a.dono desc)
      from public.administradores a), '[]'::jsonb));
end;
$$;

create or replace function public.admin_equipe_adicionar(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  quem uuid;
begin
  if not public.eh_dono() then
    raise exception 'Só o dono do site inclui pessoas na equipe.' using errcode = '42501';
  end if;
  select u.id into quem from auth.users u where lower(u.email) = lower(btrim(p_email));
  if quem is null then
    raise exception 'Não existe conta com este e-mail. A pessoa precisa criar a conta no site primeiro.';
  end if;
  insert into public.administradores (user_id) values (quem) on conflict do nothing;
end;
$$;

create or replace function public.admin_equipe_remover(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_dono() then
    raise exception 'Só o dono do site tira pessoas da equipe.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode tirar a si mesmo da equipe.';
  end if;
  delete from public.administradores where user_id = p_user and not dono;
end;
$$;

-- a lista da administração passa a dizer quantos comprovantes cada pedido tem
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

revoke all on function
  public.mentoria_prova_anexar(uuid, text), public.mentoria_provas_lista(uuid),
  public.mentoria_provas_total(uuid), public.eh_dono(), public.admin_equipe(),
  public.admin_equipe_adicionar(text), public.admin_equipe_remover(uuid)
  from public, anon;
grant execute on function
  public.mentoria_prova_anexar(uuid, text), public.mentoria_provas_lista(uuid),
  public.mentoria_provas_total(uuid), public.eh_dono(), public.admin_equipe(),
  public.admin_equipe_adicionar(text), public.admin_equipe_remover(uuid)
  to authenticated;
