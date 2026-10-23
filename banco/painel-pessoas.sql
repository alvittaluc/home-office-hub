-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — painel de pessoas (só para a equipe)
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  A aba Pessoas do painel mostra o que cada pessoa registrou no Meu
--  Controle: as candidaturas, em que etapa cada uma está, e os trabalhos,
--  com o último dia lançado. Diferente do painel_totais
--  (banco/painel.sql), esta função devolve nome e e-mail.
--
--  O que vai: nome do perfil e e-mail da conta; de cada candidatura, a
--  vaga, a empresa, a etapa, a data, onde a pessoa viu a vaga e o próximo
--  passo; de cada trabalho, a empresa, o projeto, a situação, o início e o
--  último dia lançado. O que NÃO vai: observações, currículo usado,
--  pretensão de remuneração, e-mail de contato anotado, horas, valores e
--  pagamentos.
--
--  Quem pode ver: só quem está na tabela "administradores". Quem recusa
--  os outros é o banco, não a tela.
--
--  Para desligar:  drop function if exists public.admin_pessoas();
-- ══════════════════════════════════════════════════════════════

-- a primeira versão (23/10/2026) só tinha as candidaturas
drop function if exists public.admin_candidaturas();

create or replace function public.admin_pessoas()
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
           i.id,
           i.atualizado_em,
           nullif(i.dados->>'vagaId', '')                                    as vaga_id,
           coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)') as empresa,
           coalesce(nullif(btrim(i.dados->>'titulo'), ''), '(sem título)')   as titulo,
           coalesce(nullif(i.dados->>'estado', ''), 'aplicado')              as estado,
           coalesce(i.dados->>'origem', '')                                  as origem,
           coalesce(i.dados->>'data', '')                                    as data,
           coalesce(i.dados->>'proximo', '')                                 as proximo,
           coalesce(i.dados->>'proximoEm', '')                               as proximo_em
    from public.controle_itens i
    where i.colecao = 'aplicacoes' and not i.apagado
  ),
  tr as (
    select i.user_id,
           i.id,
           i.atualizado_em,
           coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)') as empresa,
           coalesce(btrim(i.dados->>'projeto'), '')                          as projeto,
           coalesce(nullif(i.dados->>'estado', ''), 'ativo')                 as estado,
           coalesce(i.dados->>'inicio', '')                                  as inicio
    from public.controle_itens i
    where i.colecao = 'trabalhos' and not i.apagado
  ),
  -- os dias lançados: daqui sai só a data do último de cada trabalho
  rg as (
    select i.user_id,
           i.atualizado_em,
           i.dados->>'trabalhoId'         as trabalho_id,
           coalesce(i.dados->>'data', '') as data
    from public.controle_itens i
    where i.colecao = 'registros' and not i.apagado
  ),
  uso as (
    select rg.user_id, rg.trabalho_id, max(rg.data) as ultimo_dia
    from rg
    group by rg.user_id, rg.trabalho_id
  ),
  cand as (
    select ap.user_id,
           count(*)              as total,
           max(ap.atualizado_em) as ultima,
           jsonb_agg(jsonb_build_object(
             'id', ap.id, 'vaga_id', ap.vaga_id, 'empresa', ap.empresa, 'titulo', ap.titulo,
             'estado', ap.estado, 'origem', ap.origem, 'data', ap.data,
             'proximo', ap.proximo, 'proximo_em', ap.proximo_em)
             order by ap.data desc, ap.atualizado_em desc) as candidaturas
    from ap
    group by ap.user_id
  ),
  trab as (
    select tr.user_id,
           count(*) filter (where tr.estado = 'ativo') as ativos,
           max(tr.atualizado_em)                      as ultima,
           jsonb_agg(jsonb_build_object(
             'id', tr.id, 'empresa', tr.empresa, 'projeto', tr.projeto, 'estado', tr.estado,
             'inicio', tr.inicio, 'ultimo_dia', coalesce(u.ultimo_dia, ''))
             order by (tr.estado = 'ativo') desc, u.ultimo_dia desc nulls last) as trabalhos
    from tr
    left join uso u on u.user_id = tr.user_id and u.trabalho_id = tr.id
    group by tr.user_id
  ),
  lancou as (
    select rg.user_id, max(rg.atualizado_em) as ultima from rg group by rg.user_id
  ),
  ids as (
    select user_id from ap union select user_id from tr
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'contas', (select count(*) from auth.users),
    'pessoas', coalesce(jsonb_agg(jsonb_build_object(
        'id', i.user_id,
        'nome', coalesce(pf.nome, ''),
        'email', coalesce(u.email, ''),
        'ultima', greatest(c.ultima, t.ultima, l.ultima),
        'total', coalesce(c.total, 0),
        'candidaturas', coalesce(c.candidaturas, '[]'::jsonb),
        'trabalhos_ativos', coalesce(t.ativos, 0),
        'trabalhos', coalesce(t.trabalhos, '[]'::jsonb))
      order by greatest(c.ultima, t.ultima, l.ultima) desc), '[]'::jsonb))
  into resultado
  from ids i
  join auth.users u on u.id = i.user_id
  left join public.perfis pf on pf.user_id = i.user_id
  left join cand c on c.user_id = i.user_id
  left join trab t on t.user_id = i.user_id
  left join lancou l on l.user_id = i.user_id;

  return resultado;
end;
$$;

revoke all on function public.admin_pessoas() from public, anon;
grant execute on function public.admin_pessoas() to authenticated;
