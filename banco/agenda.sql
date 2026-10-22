-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — Agenda do Meu Controle na nuvem
--
--  A tabela controle_itens só aceita as coleções listadas na regra
--  "colecao in (...)". Este arquivo acrescenta "agenda" a essa lista.
--  Depois de rodar no SQL Editor do Supabase, "agenda" entra em
--  NA_NUVEM no controle-dados.js e passa a ir para a conta da pessoa.
-- ══════════════════════════════════════════════════════════════

do $$
declare
  regra text;
begin
  -- o nome da regra foi dado pelo próprio Postgres; procura em vez de adivinhar
  select c.conname into regra
    from pg_constraint c
   where c.conrelid = 'public.controle_itens'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%colecao%';
  if regra is not null then
    execute format('alter table public.controle_itens drop constraint %I', regra);
  end if;
end $$;

alter table public.controle_itens
  add constraint controle_itens_colecao_check
  check (colecao in ('aplicacoes', 'trabalhos', 'registros',
                     'pagamentos', 'blocos', 'config', 'agenda'));
