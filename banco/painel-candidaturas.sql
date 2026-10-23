-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — candidaturas de cada pessoa (só para a equipe)
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  Em TESTE desde 23/10/2026, a pedido do dono: a equipe quer ver, no
--  painel, em que vaga cada pessoa se candidatou e em que etapa está, para
--  entender como o Meu Controle está sendo usado. Diferente do
--  painel_totais (banco/painel.sql), esta função devolve nome e e-mail.
--  ATENÇÃO: a página de privacidade ainda promete que a equipe vê só
--  totais. Antes de abrir o site ao público, ou essa página muda e as
--  pessoas são avisadas, ou esta função sai (drop function abaixo).
--
--  O que vai: nome do perfil, e-mail da conta, e de cada candidatura a
--  vaga, a empresa, a etapa, a data, de onde a pessoa viu a vaga e o
--  próximo passo. O que NÃO vai: observações, currículo usado, pretensão
--  de remuneração e e-mail de contato que a pessoa anotou.
--
--  Quem pode ver: só quem está na tabela "administradores". Quem recusa
--  os outros é o banco, não a tela.
--
--  Para desligar:  drop function if exists public.admin_candidaturas();
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
