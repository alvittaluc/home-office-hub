-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — banco do Meu Controle (Supabase)
--
--  Este arquivo é a cópia do que foi rodado no SQL Editor do Supabase.
--  Não tem senha nem chave aqui: é só o desenho das tabelas e das regras.
--
--  Uma tabela só guarda tudo. Cada linha é um item do Meu Controle
--  (uma candidatura, um trabalho, um dia registrado...), no mesmo formato
--  em que ele já existia no navegador, dentro do campo "dados".
-- ══════════════════════════════════════════════════════════════

create table if not exists public.controle_itens (
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  colecao       text        not null
                            check (colecao in ('aplicacoes', 'trabalhos', 'registros',
                                               'pagamentos', 'blocos', 'config')),
  id            text        not null,
  dados         jsonb       not null default '{}'::jsonb,
  -- item apagado fica marcado em vez de sumir, para o outro aparelho da
  -- pessoa saber que deve apagar também
  apagado       boolean     not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, colecao, id)
);

create index if not exists controle_itens_por_colecao
  on public.controle_itens (colecao, atualizado_em);

-- ── Cada pessoa só enxerga e só mexe no que é dela ──
-- Quem garante isso é o banco, não a tela. Mesmo que alguém altere o código
-- da página no próprio navegador, o banco não entrega linha de outra conta.
alter table public.controle_itens enable row level security;

drop policy if exists "ler o que é meu"      on public.controle_itens;
drop policy if exists "criar o que é meu"    on public.controle_itens;
drop policy if exists "alterar o que é meu"  on public.controle_itens;
drop policy if exists "apagar o que é meu"   on public.controle_itens;

create policy "ler o que é meu" on public.controle_itens
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "criar o que é meu" on public.controle_itens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "alterar o que é meu" on public.controle_itens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "apagar o que é meu" on public.controle_itens
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Visitante sem login não tem acesso nenhum à tabela.
revoke all on public.controle_itens from anon;
grant select, insert, update, delete on public.controle_itens to authenticated;

-- ── A própria pessoa apaga a conta dela ──
-- Apaga o usuário; os itens somem juntos pelo "on delete cascade" acima.
create or replace function public.apagar_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;
