-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — alerta de vagas por área
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  O alerta por e-mail (enviar_alerta.py, que roda no GitHub) manda a
--  cada inscrito as vagas abertas a todos e, se ele tiver conta no Hub
--  com o mesmo e-mail e áreas marcadas, também as da área dele. Para
--  isso o script pergunta aqui quais inscritos têm áreas marcadas.
--
--  O script não tem a chave secreta do Supabase. Ele usa a chave
--  pública, que sozinha não lê nada, mais um código próprio
--  (ALERTA_CHAVE, um "secret" no GitHub) que só abre esta consulta.
--  O banco guarda apenas o resumo (hash) do código, nunca o código.
--
--  Para criar ou trocar o código, rode no SQL Editor:
--      select public.alerta_gerar_chave();
--  copie o texto que aparecer e cole no GitHub, em Settings > Secrets
--  and variables > Actions, num secret chamado ALERTA_CHAVE. Gerar de
--  novo invalida o código anterior.
-- ══════════════════════════════════════════════════════════════

-- ── o resumo do código (uma linha só) ──
create table if not exists public.alerta_chave (
  id smallint primary key default 1 check (id = 1),
  hash text not null,
  criada_em timestamptz not null default now()
);
alter table public.alerta_chave enable row level security;
revoke all on public.alerta_chave from anon, authenticated;

-- ── gera um código novo e mostra uma vez só ──
-- Só roda no SQL Editor: visitante e conta logada não conseguem chamar.
create or replace function public.alerta_gerar_chave()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.alerta_chave (id, hash)
  values (1, encode(sha256(convert_to(k, 'UTF8')), 'hex'))
  on conflict (id) do update set hash = excluded.hash, criada_em = now();
  return k;
end $$;
revoke execute on function public.alerta_gerar_chave() from public, anon, authenticated;

-- ── as áreas de quem está inscrito no alerta ──
-- Recebe os e-mails da lista do Brevo e devolve só os que têm conta
-- confirmada no Hub e pelo menos uma área marcada. Quem não tem conta
-- não aparece. Sem o código certo, recusa tudo.
-- O script manda o código no corpo do pedido (POST), nunca no endereço,
-- para ele não ficar em registro de acesso.
create or replace function public.alerta_areas(p_chave text, p_emails text[])
returns table (email text, areas jsonb, subareas jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_chave is null or length(p_chave) <> 64 or not exists (
    select 1 from public.alerta_chave c
     where c.hash = encode(sha256(convert_to(p_chave, 'UTF8')), 'hex')
  ) then
    raise exception 'chave inválida' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_emails), 0) > 5000 then
    raise exception 'lista grande demais' using errcode = '22023';
  end if;

  return query
    select lower(u.email)::text,
           u.raw_user_meta_data -> 'areas',
           case when jsonb_typeof(u.raw_user_meta_data -> 'subareas') = 'array'
                then u.raw_user_meta_data -> 'subareas'
                else '[]'::jsonb end
      from auth.users u
     where lower(u.email) in (select lower(trim(x)) from unnest(p_emails) as x)
       and u.email_confirmed_at is not null
       and u.deleted_at is null
       and jsonb_typeof(u.raw_user_meta_data -> 'areas') = 'array'
       and jsonb_array_length(u.raw_user_meta_data -> 'areas') > 0;
end $$;
revoke execute on function public.alerta_areas(text, text[]) from public, authenticated;
grant execute on function public.alerta_areas(text, text[]) to anon;
