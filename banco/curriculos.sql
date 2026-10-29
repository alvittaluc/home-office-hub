-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — o PDF do currículo em cada candidatura
--
--  No Meu Controle, a pessoa anexa à candidatura o PDF do currículo
--  que mandou, e abre ele de novo dentro do site (leitor.js).
--
--  Onde cada coisa fica:
--    · o arquivo, no armazenamento do Supabase, no balde "curriculos",
--      que é fechado: não existe endereço público;
--    · o nome, o tamanho e o caminho, dentro da própria candidatura
--      (controle_itens, campo curriculoPdf), como os outros dados.
--
--  O caminho é "CONTA/ARQUIVO.pdf": a primeira pasta é sempre a conta
--  de quem enviou, e o nome no servidor é sorteado.
--
--  Quem pode o quê. As regras valem no próprio armazenamento, não só
--  na tela:
--    · enviar, ler e apagar: a dona ou o dono da conta, só na pasta dela;
--    · ler: também a administração (o painel da equipe).
--
--  Limites: só PDF; 2 MB por arquivo; 20 arquivos por conta; e 250 MB
--  somando todas as contas. O plano do Supabase dá 1 GB de arquivos
--  para o projeto inteiro, e o mural das mentorias já reserva 700 MB.
--
--  Rodar depois do banco/painel.sql (usa a tabela administradores).
--  Pode rodar mais de uma vez sem estragar nada.
-- ══════════════════════════════════════════════════════════════

-- ── 1. O balde ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curriculos', 'curriculos', false, 2097152, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ══════════════════════════════════════════════════════════════
--  Ajudantes das regras do armazenamento
-- ══════════════════════════════════════════════════════════════

-- a conta de um caminho "CONTA/ARQUIVO.pdf"; null se o caminho não tiver esse formato
create or replace function public._cv_conta(p_caminho text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when p_caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    then split_part(p_caminho, '/', 1)::uuid
  end;
$$;

-- o tamanho que o armazenamento anotou para um arquivo; 0 se não anotou
create or replace function public._cv_tamanho(p_metadata jsonb)
returns bigint language sql immutable set search_path = '' as $$
  select case when p_metadata->>'size' ~ '^[0-9]{1,15}$' then (p_metadata->>'size')::bigint else 0 end;
$$;

-- enviar: só na própria pasta, enquanto houver espaço:
-- até 20 arquivos na conta, e 250 MB somando todas
create or replace function public._cv_pode_enviar(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public._cv_conta(p_caminho) = auth.uid()
     and (select count(*) < 20 from storage.objects o
          where o.bucket_id = 'curriculos' and o.name like auth.uid()::text || '/%')
     and (select coalesce(sum(public._cv_tamanho(o.metadata)), 0) < 262144000
          from storage.objects o where o.bucket_id = 'curriculos');
$$;

-- ler: a própria pessoa e a administração
create or replace function public._cv_pode_ler(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public._cv_conta(p_caminho) is not null and (
       public._cv_conta(p_caminho) = auth.uid()
    or exists (select 1 from public.administradores a where a.user_id = auth.uid()));
$$;

-- apagar: só a própria pessoa
create or replace function public._cv_pode_apagar(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public._cv_conta(p_caminho) = auth.uid();
$$;

-- As regras do armazenamento chamam estas funções em nome de quem está
-- logado, por isso elas precisam ser executáveis por contas logadas. O que
-- elas respondem é só sim ou não sobre um caminho que a pessoa já conhece.
revoke all on function public._cv_conta(text), public._cv_pode_enviar(text),
                       public._cv_pode_ler(text), public._cv_pode_apagar(text)
  from public, anon;
grant execute on function public._cv_conta(text), public._cv_pode_enviar(text),
                          public._cv_pode_ler(text), public._cv_pode_apagar(text)
  to authenticated;
-- esta só é usada por dentro das funções acima
revoke all on function public._cv_tamanho(jsonb) from public, anon, authenticated;

-- ── As regras em si ──
-- Não existe regra de alterar: para trocar o PDF, o site envia um arquivo novo.
drop policy if exists "curriculos: a pessoa envia" on storage.objects;
create policy "curriculos: a pessoa envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'curriculos' and public._cv_pode_enviar(name));

drop policy if exists "curriculos: a pessoa e a equipe leem" on storage.objects;
create policy "curriculos: a pessoa e a equipe leem" on storage.objects
  for select to authenticated
  using (bucket_id = 'curriculos' and public._cv_pode_ler(name));

drop policy if exists "curriculos: a pessoa apaga" on storage.objects;
create policy "curriculos: a pessoa apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'curriculos' and public._cv_pode_apagar(name));
