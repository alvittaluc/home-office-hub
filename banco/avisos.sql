-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — avisos por e-mail das mentorias
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  Quando algo acontece numa mentoria, o banco anota um aviso numa
--  fila. De 15 em 15 minutos o robô do GitHub (enviar_avisos.py) pega
--  o que está na fila, manda os e-mails pelo Brevo e marca como
--  enviado. O robô usa o mesmo código do alerta por área
--  (ALERTA_CHAVE, ver banco/alerta-areas.sql).
--
--  Quem é avisado de quê:
--    · o mentor: pedido de entrada no grupo; mentoria aprovada,
--      recusada ou encerrada pela equipe
--    · quem pediu para entrar: aceito, não aceito, ou retirado do grupo
--    · quem denunciou: resposta da equipe e encerramento da denúncia
--    · a equipe: pedido novo de mentor, denúncia nova e resposta de
--      quem denunciou
--
--  Cada pessoa pode desligar os avisos no perfil. A escolha fica na
--  conta (avisos_email = false) e a fila respeita.
--
--  Os avisos guardam só o necessário para escrever o e-mail (o nome
--  da vaga e de quem fez a ação). Enviados há mais de 30 dias são
--  apagados.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  -- para quem vai; vazio = para a equipe do Hub
  para_user  uuid references auth.users (id) on delete cascade,
  dados      jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas int not null default 0,
  erro       text not null default ''
);
create index if not exists avisos_na_fila on public.avisos (criado_em) where enviado_em is null;
alter table public.avisos enable row level security;
revoke all on public.avisos from anon, authenticated;

-- ── ajudantes internos ──
create or replace function public._nome_de(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.nome from public.perfis p where p.user_id = p_user), '');
$$;

create or replace function public._exige_chave_robo(p_chave text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_chave is null or length(p_chave) <> 64 or not exists (
    select 1 from public.alerta_chave c
     where c.hash = encode(sha256(convert_to(p_chave, 'UTF8')), 'hex')
  ) then
    raise exception 'chave inválida' using errcode = '42501';
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════
--  Quem entra na fila. Os gatilhos nunca atrapalham a ação: se
--  anotar o aviso falhar, a ação da pessoa vale do mesmo jeito.
-- ══════════════════════════════════════════════════════════════

-- pedidos de entrada e a resposta do mentor
create or replace function public._avisos_membros()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  begin
    select mt.id, mt.mentor_id, mt.vaga_titulo into m from public.mentorias mt where mt.id = new.mentoria_id;
    if m.id is null then return new; end if;

    if new.status = 'pedido' and (tg_op = 'INSERT' or old.status is distinct from 'pedido') then
      insert into public.avisos (tipo, para_user, dados)
      values ('pedido_entrada', m.mentor_id,
              jsonb_build_object('mentoria', m.id, 'vaga', m.vaga_titulo, 'quem', public._nome_de(new.user_id)));
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('aprovado', 'recusado') then
      insert into public.avisos (tipo, para_user, dados)
      values (case when new.status = 'aprovado' then 'entrada_aceita'
                   when old.status = 'aprovado' then 'participacao_encerrada'
                   else 'entrada_recusada' end,
              new.user_id,
              jsonb_build_object('mentoria', m.id, 'vaga', m.vaga_titulo, 'quem', public._nome_de(m.mentor_id)));
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_membros on public.mentoria_membros;
create trigger avisos_membros after insert or update of status on public.mentoria_membros
  for each row execute function public._avisos_membros();

-- pedido novo de mentor e a decisão da equipe
create or replace function public._avisos_mentorias()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.status = 'pendente' and (tg_op = 'INSERT' or old.status is distinct from 'pendente') then
      insert into public.avisos (tipo, para_user, dados)
      values ('mentor_novo', null,
              jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo, 'empresa', new.empresa,
                                 'quem', public._nome_de(new.mentor_id), 'ator', auth.uid()));
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      if new.status = 'aprovada' then
        insert into public.avisos (tipo, para_user, dados)
        values ('mentoria_aprovada', new.mentor_id, jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo));
      elsif new.status = 'recusada' then
        insert into public.avisos (tipo, para_user, dados)
        values ('mentoria_recusada', new.mentor_id,
                jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo, 'motivo', new.motivo));
      elsif new.status = 'encerrada' and auth.uid() is distinct from new.mentor_id then
        -- só quando foi a equipe que encerrou; o mentor que encerra a própria não precisa de aviso
        insert into public.avisos (tipo, para_user, dados)
        values ('mentoria_encerrada', new.mentor_id,
                jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo, 'motivo', new.motivo));
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_mentorias on public.mentorias;
create trigger avisos_mentorias after insert or update of status on public.mentorias
  for each row execute function public._avisos_mentorias();

-- denúncia nova e denúncia encerrada
create or replace function public._avisos_denuncias()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_vaga text;
begin
  begin
    if tg_op = 'INSERT' then
      select mt.vaga_titulo into v_vaga from public.mentorias mt
       where mt.id = case when new.tipo = 'mentoria' then new.alvo_id
                          else (select p.mentoria_id from public.mentoria_posts p where p.id = new.alvo_id) end;
      insert into public.avisos (tipo, para_user, dados)
      values ('denuncia_nova', null,
              jsonb_build_object('denuncia', new.id, 'alvo', new.tipo, 'vaga', coalesce(v_vaga, ''), 'ator', auth.uid()));
    elsif new.resolvida and not old.resolvida then
      insert into public.avisos (tipo, para_user, dados)
      values ('denuncia_resolvida', new.autor_id, jsonb_build_object('denuncia', new.id));
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_denuncias on public.denuncias;
create trigger avisos_denuncias after insert or update of resolvida on public.denuncias
  for each row execute function public._avisos_denuncias();

-- conversa da denúncia
create or replace function public._avisos_denuncia_mensagens()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_autor uuid;
begin
  begin
    if new.da_equipe then
      select d.autor_id into v_autor from public.denuncias d where d.id = new.denuncia_id;
      if v_autor is not null then
        insert into public.avisos (tipo, para_user, dados)
        values ('denuncia_resposta_equipe', v_autor, jsonb_build_object('denuncia', new.denuncia_id));
      end if;
    else
      insert into public.avisos (tipo, para_user, dados)
      values ('denuncia_resposta_autor', null, jsonb_build_object('denuncia', new.denuncia_id, 'ator', auth.uid()));
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_denuncia_mensagens on public.denuncia_mensagens;
create trigger avisos_denuncia_mensagens after insert on public.denuncia_mensagens
  for each row execute function public._avisos_denuncia_mensagens();

-- ══════════════════════════════════════════════════════════════
--  O que o robô chama (com o código; visitante sem código não passa)
-- ══════════════════════════════════════════════════════════════

-- A fila, com os e-mails de quem recebe cada aviso. Aviso para a equipe vai
-- para todos da equipe, menos para quem fez a ação. Quem desligou os avisos
-- no perfil fica de fora (o aviso volta com a lista de e-mails vazia).
create or replace function public.avisos_pendentes(p_chave text, p_limite int default 40)
returns table (id uuid, tipo text, dados jsonb, emails text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._exige_chave_robo(p_chave);

  -- aviso velho demais, ou que falhou muitas vezes, sai da fila
  update public.avisos a set enviado_em = now(), erro = 'desistiu'
   where a.enviado_em is null and (a.tentativas >= 5 or a.criado_em < now() - interval '3 days');
  -- e o que já foi enviado há mais de 30 dias é apagado
  delete from public.avisos a where a.enviado_em < now() - interval '30 days';

  return query
    select f.id, f.tipo, f.dados,
           array(
             select lower(u.email)::text
               from auth.users u
              where u.email_confirmed_at is not null
                and u.deleted_at is null
                and coalesce(u.raw_user_meta_data ->> 'avisos_email', 'true') <> 'false'
                and ( (f.para_user is not null and u.id = f.para_user)
                   or (f.para_user is null
                       and u.id in (select ad.user_id from public.administradores ad)
                       and u.id::text is distinct from (f.dados ->> 'ator')) )
           )
      from (
        select a.id, a.tipo, a.dados, a.para_user
          from public.avisos a
         where a.enviado_em is null
         order by a.criado_em
         limit greatest(1, least(coalesce(p_limite, 40), 100))
      ) f;
end $$;

-- O robô devolve o resultado: o que foi enviado e o que falhou.
create or replace function public.avisos_marcar(p_chave text, p_enviados uuid[], p_falhas uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exige_chave_robo(p_chave);
  update public.avisos set enviado_em = now(), erro = ''
   where id = any (coalesce(p_enviados, '{}'::uuid[])) and enviado_em is null;
  update public.avisos set tentativas = tentativas + 1, erro = 'falhou ao enviar'
   where id = any (coalesce(p_falhas, '{}'::uuid[])) and enviado_em is null;
end $$;

revoke execute on function public._nome_de(uuid) from public, anon, authenticated;
revoke execute on function public._exige_chave_robo(text) from public, anon, authenticated;
revoke execute on function public._avisos_membros() from public, anon, authenticated;
revoke execute on function public._avisos_mentorias() from public, anon, authenticated;
revoke execute on function public._avisos_denuncias() from public, anon, authenticated;
revoke execute on function public._avisos_denuncia_mensagens() from public, anon, authenticated;
revoke execute on function public.avisos_pendentes(text, int) from public, authenticated;
revoke execute on function public.avisos_marcar(text, uuid[], uuid[]) from public, authenticated;
grant execute on function public.avisos_pendentes(text, int) to anon;
grant execute on function public.avisos_marcar(text, uuid[], uuid[]) to anon;
