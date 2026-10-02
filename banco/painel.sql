-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — painel de totais (só para a administração)
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  A regra do painel: só TOTAIS. A função abaixo nunca devolve e-mail,
--  nome, id de conta nem valor ganho por ninguém. Ela conta contas,
--  candidaturas e trabalhos, e agrupa por vaga e por empresa.
--
--  Quem pode ver: só quem está na tabela "administradores". A tela
--  (painel.html) não decide nada; quem recusa os outros é o banco.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Ninguém lê nem escreve nesta tabela pelo site. Só a função abaixo a consulta.
alter table public.administradores enable row level security;
revoke all on public.administradores from anon, authenticated;

-- Para incluir alguém na administração, rode no SQL Editor (trocando o e-mail):
--   insert into public.administradores (user_id)
--   select id from auth.users where email = 'E-MAIL-DA-PESSOA'
--   on conflict do nothing;

create or replace function public.painel_totais()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if auth.uid() is null
     or not exists (select 1 from public.administradores a where a.user_id = auth.uid()) then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;

  with ap as (
    select i.user_id,
           nullif(i.dados->>'vagaId', '')                                   as vaga_id,
           coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)') as empresa,
           coalesce(nullif(btrim(i.dados->>'titulo'), ''), '(sem título)')   as titulo,
           coalesce(nullif(i.dados->>'estado', ''), 'aplicado')              as estado,
           coalesce(nullif(i.dados->>'origem', ''), 'Não informado')         as origem,
           coalesce(i.dados->>'data', '')                                    as data
    from public.controle_itens i
    where i.colecao = 'aplicacoes' and not i.apagado
  ),
  tr as (
    select i.user_id,
           coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)') as empresa,
           coalesce(nullif(i.dados->>'estado', ''), 'ativo')                 as estado
    from public.controle_itens i
    where i.colecao = 'trabalhos' and not i.apagado
  )
  select jsonb_build_object(
    'gerado_em', now(),

    'contas', (
      select jsonb_build_object(
        'total',       count(*),
        'confirmadas', count(*) filter (where u.email_confirmed_at is not null),
        'novas_7d',    count(*) filter (where u.created_at > now() - interval '7 days'),
        'novas_30d',   count(*) filter (where u.created_at > now() - interval '30 days'),
        'ativas_7d',   count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
        'ativas_30d',  count(*) filter (where u.last_sign_in_at > now() - interval '30 days'))
      from auth.users u),

    'contas_por_semana', (
      select coalesce(jsonb_agg(jsonb_build_object('semana', x.semana, 'n', x.n) order by x.semana), '[]'::jsonb)
      from (select date_trunc('week', u.created_at)::date as semana, count(*) as n
            from auth.users u
            where u.created_at > now() - interval '12 weeks'
            group by 1) x),

    'uso', (
      select jsonb_build_object(
        'com_candidaturas', count(distinct i.user_id) filter (where i.colecao = 'aplicacoes'),
        'com_trabalhos',    count(distinct i.user_id) filter (where i.colecao = 'trabalhos'),
        'com_registros',    count(distinct i.user_id) filter (where i.colecao = 'registros'),
        'com_algum_dado',   count(distinct i.user_id) filter (where i.colecao <> 'config'))
      from public.controle_itens i
      where not i.apagado),

    'candidaturas', (
      select jsonb_build_object(
        'total',     count(*),
        'do_hub',    count(*) filter (where ap.vaga_id is not null),
        'positivas', count(*) filter (where ap.estado in ('teste', 'entrevista', 'aprovado')),
        'aprovadas', count(*) filter (where ap.estado = 'aprovado'))
      from ap),

    'por_estado', (
      select coalesce(jsonb_object_agg(x.estado, x.n), '{}'::jsonb)
      from (select ap.estado, count(*) as n from ap group by 1) x),

    'por_origem', (
      select coalesce(jsonb_agg(jsonb_build_object('origem', x.origem, 'n', x.n) order by x.n desc), '[]'::jsonb)
      from (select ap.origem, count(*) as n from ap group by 1) x),

    'por_mes', (
      select coalesce(jsonb_agg(jsonb_build_object('mes', x.mes, 'n', x.n) order by x.mes), '[]'::jsonb)
      from (select left(ap.data, 7) as mes, count(*) as n
            from ap
            where ap.data ~ '^[0-9]{4}-[0-9]{2}'
            group by 1
            order by 1 desc
            limit 12) x),

    'vagas', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.pessoas desc, x.candidaturas desc), '[]'::jsonb)
      from (select max(ap.vaga_id)  as vaga_id,
                   max(ap.empresa)  as empresa,
                   max(ap.titulo)   as titulo,
                   count(*)                 as candidaturas,
                   count(distinct ap.user_id) as pessoas,
                   count(*) filter (where ap.estado in ('teste', 'entrevista', 'aprovado')) as positivas,
                   count(*) filter (where ap.estado = 'aprovado')                           as aprovadas
            from ap
            group by coalesce(ap.vaga_id, lower(ap.empresa) || '|' || lower(ap.titulo))
            order by count(distinct ap.user_id) desc, count(*) desc
            limit 40) x),

    'empresas', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.candidaturas desc), '[]'::jsonb)
      from (select max(ap.empresa) as empresa,
                   count(*)                 as candidaturas,
                   count(distinct ap.user_id) as pessoas,
                   count(*) filter (where ap.estado in ('teste', 'entrevista', 'aprovado')) as positivas,
                   count(*) filter (where ap.estado = 'aprovado')                           as aprovadas,
                   count(*) filter (where ap.estado = 'recusado')                           as recusadas
            from ap
            group by lower(ap.empresa)
            order by count(*) desc
            limit 30) x),

    'trabalhos', (
      select jsonb_build_object(
        'total',  count(*),
        'ativos', count(*) filter (where tr.estado = 'ativo'))
      from tr),

    'trabalhos_por_empresa', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.pessoas desc, x.trabalhos desc), '[]'::jsonb)
      from (select max(tr.empresa) as empresa,
                   count(*)                   as trabalhos,
                   count(distinct tr.user_id) as pessoas,
                   count(*) filter (where tr.estado = 'ativo') as ativos
            from tr
            group by lower(tr.empresa)
            order by count(distinct tr.user_id) desc, count(*) desc
            limit 20) x)
  ) into resultado;

  return resultado;
end;
$$;

revoke all on function public.painel_totais() from public, anon;
grant execute on function public.painel_totais() to authenticated;
