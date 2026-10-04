-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — mentorias, quinta parte
--    "No ar desde": o resumo público de cada mentoria passa a dizer
--    quando a equipe do Hub aprovou o mentor. Vale só enquanto a
--    mentoria está no ar; encerrada ou em análise, volta vazio.
--
--  Cópia do que foi rodado no SQL Editor do Supabase, depois do
--  banco/mentorias-4.sql.
-- ══════════════════════════════════════════════════════════════

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
    'aprovada_em', case when m.status = 'aprovada' then m.decidido_em end,
    'mentor', public._pessoa(m.mentor_id),
    'mentor_bio', coalesce((select p.bio from public.perfis p where p.user_id = m.mentor_id), ''),
    'nota', (select round(avg(a.nota)::numeric, 1) from public.mentoria_avaliacoes a where a.mentoria_id = m.id),
    'avaliacoes', (select count(*) from public.mentoria_avaliacoes a where a.mentoria_id = m.id),
    'membros', (select count(*) from public.mentoria_membros mm where mm.mentoria_id = m.id and mm.status = 'aprovado'),
    'ultima_resposta', (select max(p.criado_em) from public.mentoria_posts p
                        where p.mentoria_id = m.id and p.autor_id = m.mentor_id and not p.removido))
  from public.mentorias m where m.id = p_id;
$$;

revoke all on function public._resumo_mentoria(uuid) from public, anon, authenticated;
