-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — o painel da equipe (abas Geral, Alunos,
--  Empresas e Vagas)
--
--  A equipe acompanha cada aluno: vê o que ele lançou no Meu
--  Controle, preenche um perfil curto dele e registra cada conversa.
--
--  O que fica guardado aqui:
--    · painel_perfis: cidade, inglês, área de foco, disponibilidade, telefone e
--      observações da equipe sobre o aluno. O aluno não vê;
--    · painel_contatos: cada contato da equipe com o aluno (mensagem,
--      chamada ou revisão de currículo), com data e quem registrou.
--
--  O que a função admin_painel() entrega à equipe:
--    · de cada conta que não é da equipe: nome, e-mail, o perfil e os
--      contatos acima;
--    · as candidaturas inteiras, como o aluno preencheu nas abas
--      "A vaga" e "Editar" do Meu Controle (etapas, recusa, o que
--      aconteceu, currículo e PDF, observações);
--    · os trabalhos só com empresa, projeto, situação, início e o
--      último dia lançado. Horas, valores e pagamentos NÃO vão.
--
--  Quem pode ver e mexer: só quem está na tabela "administradores".
--  Quem recusa os outros é o banco, não a tela.
--
--  Rodar depois do banco/painel.sql e do banco/painel-pessoas.sql.
--  Pode rodar mais de uma vez sem estragar nada.
-- ══════════════════════════════════════════════════════════════

-- ── 1. As duas tabelas ──
create table if not exists public.painel_perfis (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  cidade         text not null default '' check (char_length(cidade) <= 80),
  ingles         text not null default '' check (char_length(ingles) <= 60),
  foco           text not null default '' check (char_length(foco) <= 80),
  horas          text not null default '' check (char_length(horas) <= 60),
  obs            text not null default '' check (char_length(obs) <= 2000),
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.painel_contatos (
  id        uuid primary key default gen_random_uuid(),
  aluno_id  uuid not null references auth.users (id) on delete cascade,
  autor_id  uuid references auth.users (id) on delete set null,
  tipo      text not null check (tipo in ('Mensagem', 'Chamada', 'Revisão de currículo')),
  texto     text not null check (char_length(btrim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now()
);
create index if not exists painel_contatos_por_aluno on public.painel_contatos (aluno_id, criado_em desc);

-- segunda versão (01/11/2026): o telefone do aluno no perfil da equipe
alter table public.painel_perfis add column if not exists telefone text not null default '' check (char_length(telefone) <= 30);

-- Ninguém lê nem escreve nelas pelo site. Só as funções abaixo.
alter table public.painel_perfis enable row level security;
alter table public.painel_contatos enable row level security;
revoke all on public.painel_perfis, public.painel_contatos from anon, authenticated;

-- ── 2. A leitura do painel ──
create or replace function public.admin_painel()
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

  with alunos as (
    select u.id, u.email, u.created_at
    from auth.users u
    where not exists (select 1 from public.administradores a where a.user_id = u.id)
  ),
  ap as (
    select i.user_id,
           jsonb_agg(i.dados || jsonb_build_object('id', i.id, 'atualizado_em', i.atualizado_em)
                     order by i.dados->>'data' desc, i.atualizado_em desc) as candidaturas,
           max(i.atualizado_em) as ultima
    from public.controle_itens i
    where i.colecao = 'aplicacoes' and not i.apagado
    group by i.user_id
  ),
  rg as (
    select i.user_id, i.dados->>'trabalhoId' as trabalho_id, max(coalesce(i.dados->>'data', '')) as ultimo_dia,
           max(i.atualizado_em) as ultima
    from public.controle_itens i
    where i.colecao = 'registros' and not i.apagado
    group by i.user_id, i.dados->>'trabalhoId'
  ),
  tr as (
    select i.user_id,
           jsonb_agg(jsonb_build_object(
             'id', i.id,
             'empresa', coalesce(nullif(btrim(i.dados->>'empresa'), ''), '(sem empresa)'),
             'projeto', coalesce(btrim(i.dados->>'projeto'), ''),
             'estado', coalesce(nullif(i.dados->>'estado', ''), 'ativo'),
             'inicio', coalesce(i.dados->>'inicio', ''),
             'ultimo_dia', coalesce(r.ultimo_dia, ''))
             order by (coalesce(nullif(i.dados->>'estado', ''), 'ativo') = 'ativo') desc, i.dados->>'inicio' desc) as trabalhos,
           max(greatest(i.atualizado_em, r.ultima)) as ultima
    from public.controle_itens i
    left join rg r on r.user_id = i.user_id and r.trabalho_id = i.id
    where i.colecao = 'trabalhos' and not i.apagado
    group by i.user_id
  ),
  ct as (
    select c.aluno_id,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'tipo', c.tipo, 'texto', c.texto, 'criado_em', c.criado_em,
             'por', coalesce(nullif((select p.nome from public.perfis p where p.user_id = c.autor_id), ''),
                             (select split_part(u.email, '@', 1) from auth.users u where u.id = c.autor_id), 'equipe'))
             order by c.criado_em desc) as contatos
    from public.painel_contatos c
    group by c.aluno_id
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'alunos', coalesce(jsonb_agg(jsonb_build_object(
        'id', al.id,
        'nome', coalesce(pf.nome, ''),
        'email', coalesce(al.email, ''),
        'criado_em', al.created_at,
        'ultima', greatest(ap.ultima, tr.ultima),
        'perfil', case when pp.user_id is null then '{}'::jsonb else jsonb_build_object(
            'cidade', pp.cidade, 'ingles', pp.ingles, 'foco', pp.foco, 'horas', pp.horas, 'telefone', pp.telefone, 'obs', pp.obs) end,
        'tem_foto', coalesce(pf.foto, '') <> '',
        'contatos', coalesce(ct.contatos, '[]'::jsonb),
        'candidaturas', coalesce(ap.candidaturas, '[]'::jsonb),
        'trabalhos', coalesce(tr.trabalhos, '[]'::jsonb))
      order by al.created_at), '[]'::jsonb))
  into resultado
  from alunos al
  left join public.perfis pf on pf.user_id = al.id
  left join public.painel_perfis pp on pp.user_id = al.id
  left join ap on ap.user_id = al.id
  left join tr on tr.user_id = al.id
  left join ct on ct.aluno_id = al.id;

  return resultado;
end;
$$;

-- as fotos vêm à parte, porque cada uma pesa até 70 KB: o painel abre sem
-- esperar por elas e troca as iniciais pela foto quando chegam
create or replace function public.admin_painel_fotos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.administradores a where a.user_id = auth.uid()) then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(p.user_id, p.foto) from public.perfis p
                   where p.foto <> ''
                     and not exists (select 1 from public.administradores a where a.user_id = p.user_id)), '{}'::jsonb);
end;
$$;

-- ── 3. O que a equipe grava ──
-- a primeira versão, sem o telefone, sai
drop function if exists public.admin_perfil_salvar(uuid, text, text, text, text, text);
create or replace function public.admin_perfil_salvar(p_aluno uuid, p_cidade text, p_ingles text, p_foco text, p_horas text, p_telefone text, p_obs text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.administradores a where a.user_id = auth.uid()) then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  insert into public.painel_perfis (user_id, cidade, ingles, foco, horas, telefone, obs, atualizado_por, atualizado_em)
  values (p_aluno, btrim(coalesce(p_cidade, '')), btrim(coalesce(p_ingles, '')), btrim(coalesce(p_foco, '')),
          btrim(coalesce(p_horas, '')), btrim(coalesce(p_telefone, '')), btrim(coalesce(p_obs, '')), auth.uid(), now())
  on conflict (user_id) do update
    set cidade = excluded.cidade, ingles = excluded.ingles, foco = excluded.foco, horas = excluded.horas,
        telefone = excluded.telefone, obs = excluded.obs, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em;
end;
$$;

create or replace function public.admin_contato_registrar(p_aluno uuid, p_tipo text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo public.painel_contatos;
begin
  if auth.uid() is null
     or not exists (select 1 from public.administradores a where a.user_id = auth.uid()) then
    raise exception 'Somente a administração.' using errcode = '42501';
  end if;
  insert into public.painel_contatos (aluno_id, autor_id, tipo, texto)
  values (p_aluno, auth.uid(), p_tipo, btrim(coalesce(p_texto, '')))
  returning * into novo;
  return jsonb_build_object('id', novo.id, 'criado_em', novo.criado_em);
end;
$$;

revoke all on function public.admin_painel(), public.admin_painel_fotos(), public.admin_perfil_salvar(uuid, text, text, text, text, text, text),
                       public.admin_contato_registrar(uuid, text, text) from public, anon;
grant execute on function public.admin_painel(), public.admin_painel_fotos(), public.admin_perfil_salvar(uuid, text, text, text, text, text, text),
                          public.admin_contato_registrar(uuid, text, text) to authenticated;
