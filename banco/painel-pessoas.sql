-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — painel de pessoas (só para a equipe)
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  Em TESTE desde 23/10/2026, a pedido do dono: a equipe quer ver, no
--  painel, em que vaga cada pessoa se candidatou, em que etapa está e onde
--  está trabalhando, para entender como o Meu Controle está sendo usado.
--  Diferente do painel_totais (banco/painel.sql), estas funções devolvem
--  nome e e-mail.
--  ATENÇÃO: a página de privacidade ainda promete que a equipe vê só
--  totais. Antes de abrir o site ao público, ou essa página muda e as
--  pessoas são avisadas, ou estas funções saem (drop function abaixo).
--
--  admin_candidaturas (aba Candidaturas): nome do perfil, e-mail da conta
--  e, de cada candidatura, a vaga, a empresa, a etapa, a data, onde a
--  pessoa viu a vaga e o próximo passo.
--  admin_trabalhos (aba Trabalhos): empresas e vagas com mais gente
--  trabalhando ou aprovada, e o nome de quem está em cada vaga.
--  O que NÃO vai em nenhuma: observações, currículo usado, pretensão de
--  remuneração, valor ganho e e-mail de contato que a pessoa anotou.
--
--  Quem pode ver: só quem está na tabela "administradores". Quem recusa
--  os outros é o banco, não a tela.
--
--  Para desligar:
--    drop function if exists public.admin_candidaturas();
--    drop function if exists public.admin_trabalhos();
-- ══════════════════════════════════════════════════════════════

create or replace function public.admin_candidaturas()
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
  pessoas as (
    select ap.user_id,
           max(ap.atualizado_em) as ultima,
           count(*)              as total,
           jsonb_agg(jsonb_build_object(
             'id', ap.id, 'vaga_id', ap.vaga_id, 'empresa', ap.empresa, 'titulo', ap.titulo,
             'estado', ap.estado, 'origem', ap.origem, 'data', ap.data,
             'proximo', ap.proximo, 'proximo_em', ap.proximo_em, 'atualizado_em', ap.atualizado_em)
             order by ap.data desc, ap.atualizado_em desc) as candidaturas
    from ap
    group by ap.user_id
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'contas', (select count(*) from auth.users),
    'pessoas', coalesce(jsonb_agg(jsonb_build_object(
        'id', p.user_id,
        'nome', coalesce(pf.nome, ''),
        'email', coalesce(u.email, ''),
        'conta_desde', u.created_at,
        'ultima', p.ultima,
        'total', p.total,
        'candidaturas', p.candidaturas)
      order by p.ultima desc), '[]'::jsonb))
  into resultado
  from pessoas p
  join auth.users u on u.id = p.user_id
  left join public.perfis pf on pf.user_id = p.user_id;

  return resultado;
end;
$$;

revoke all on function public.admin_candidaturas() from public, anon;
grant execute on function public.admin_candidaturas() to authenticated;


-- ── aba Trabalhos ──
-- Um trabalho fica ligado à vaga pela candidatura de onde nasceu (o campo
-- aplicacaoId, gravado quando a pessoa marca a candidatura como aprovada e
-- cria o trabalho na hora). Sem essa ligação, a "vaga" é o nome que a
-- pessoa deu ao projeto, e a tela marca como "de fora".
-- Trabalhando = trabalho ativo. Pausado ou encerrado conta como "parou".
create or replace function public.admin_trabalhos()
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
           nullif(i.dados->>'vagaId', '')                                    as vaga_id,
           coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)') as empresa,
           coalesce(nullif(btrim(i.dados->>'titulo'), ''), '(sem título)')   as titulo,
           coalesce(nullif(i.dados->>'estado', ''), 'aplicado')              as estado
    from public.controle_itens i
    where i.colecao = 'aplicacoes' and not i.apagado
  ),
  tr as (
    select i.user_id,
           coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)') as empresa,
           coalesce(nullif(btrim(i.dados->>'projeto'), ''),
                    nullif(btrim(i.dados->>'empresa'), ''), '(sem nome)')    as projeto,
           coalesce(nullif(i.dados->>'estado', ''), 'ativo')                 as estado,
           nullif(i.dados->>'aplicacaoId', '')                               as aplicacao_id
    from public.controle_itens i
    where i.colecao = 'trabalhos' and not i.apagado
  ),
  juntos as (
    -- os trabalhos, cada um com a vaga de onde veio
    select tr.user_id,
           a.vaga_id,
           coalesce(a.empresa, tr.empresa) as empresa,
           coalesce(a.titulo, tr.projeto)  as titulo,
           tr.estado = 'ativo'             as trabalhando,
           tr.estado <> 'ativo'            as parou,
           false                           as aprovado
    from tr
    left join ap a on a.user_id = tr.user_id and a.id = tr.aplicacao_id
    union all
    -- e as candidaturas aprovadas
    select ap.user_id, ap.vaga_id, ap.empresa, ap.titulo, false, false, true
    from ap
    where ap.estado = 'aprovado'
  ),
  por_vaga as (
    select coalesce(j.vaga_id, lower(j.empresa) || '|' || lower(j.titulo)) as chave,
           j.user_id,
           max(j.vaga_id) as vaga_id, max(j.empresa) as empresa, max(j.titulo) as titulo,
           bool_or(j.trabalhando) as trabalhando, bool_or(j.parou) as parou, bool_or(j.aprovado) as aprovado
    from juntos j
    group by 1, 2
  ),
  por_empresa as (
    select lower(j.empresa) as chave,
           j.user_id,
           max(j.empresa) as empresa,
           bool_or(j.trabalhando) as trabalhando, bool_or(j.parou) as parou, bool_or(j.aprovado) as aprovado
    from juntos j
    group by 1, 2
  ),
  nomes as (
    select u.id, coalesce(nullif(btrim(pf.nome), ''), u.email, '') as nome
    from auth.users u
    left join public.perfis pf on pf.user_id = u.id
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'resumo', jsonb_build_object(
      'pessoas_trabalhando', (select count(distinct j.user_id) from juntos j where j.trabalhando),
      'trabalhos_ativos',    (select count(*) from tr where tr.estado = 'ativo'),
      'empresas',            (select count(distinct e.chave) from por_empresa e where e.trabalhando),
      'aprovacoes',          (select count(*) from ap where ap.estado = 'aprovado'),
      'pessoas_aprovadas',   (select count(distinct ap.user_id) from ap where ap.estado = 'aprovado')),
    'empresas', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.trabalhando desc, x.aprovadas desc, x.empresa), '[]'::jsonb)
      from (select max(e.empresa) as empresa,
                   count(*) filter (where e.trabalhando)                 as trabalhando,
                   count(*) filter (where e.aprovado)                    as aprovadas,
                   count(*) filter (where e.parou and not e.trabalhando) as pararam
            from por_empresa e
            group by e.chave
            order by 2 desc, 3 desc
            limit 40) x),
    'vagas', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.trabalhando desc, x.aprovadas desc, x.titulo), '[]'::jsonb)
      from (select max(v.vaga_id) as vaga_id, max(v.empresa) as empresa, max(v.titulo) as titulo,
                   count(*) filter (where v.trabalhando)                 as trabalhando,
                   count(*) filter (where v.aprovado)                    as aprovadas,
                   count(*) filter (where v.parou and not v.trabalhando) as pararam,
                   jsonb_agg(jsonb_build_object('nome', n.nome,
                       'situacao', case when v.trabalhando then 'trabalhando'
                                        when v.parou then 'parou' else 'aprovada' end)
                     order by v.trabalhando desc, n.nome) as pessoas
            from por_vaga v
            join nomes n on n.id = v.user_id
            group by v.chave
            order by 4 desc, 5 desc
            limit 60) x)
  ) into resultado;

  return resultado;
end;
$$;

revoke all on function public.admin_trabalhos() from public, anon;
grant execute on function public.admin_trabalhos() to authenticated;
