-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — mentorias, sexta parte: arquivos no mural
--
--  O mentor anexa PDF ou imagem a uma mensagem do mural, e quem
--  participa abre o arquivo dentro do próprio site (leitor.js).
--
--  Onde cada coisa fica:
--    · o arquivo em si, no armazenamento do Supabase, no balde
--      "mural", que é fechado: não existe endereço público;
--    · o nome, o tipo e o tamanho, na tabela mentoria_anexos, presa
--      à mensagem do mural.
--
--  Quem pode o quê. As regras valem no próprio armazenamento, não
--  só na tela:
--    · enviar: só o mentor daquela mentoria, com ela no ar;
--    · ler: o mentor, os participantes aprovados e a administração,
--      e só enquanto a mensagem do arquivo não foi apagada;
--    · apagar: o mentor (os da mentoria dele) e a administração.
--
--  Limites: PDF, PNG, JPG, WebP ou GIF; 10 MB por arquivo; 5
--  arquivos por mensagem; 300 arquivos e 200 MB por mentoria; e
--  700 MB somando todas as mentorias. Esse último existe porque o
--  plano do Supabase dá 1 GB de arquivos, e estourar o plano pode
--  travar o projeto inteiro, não só o mural.
--
--  Rodar depois do banco/mentorias-5.sql. Pode rodar mais de uma
--  vez sem estragar nada.
-- ══════════════════════════════════════════════════════════════

-- ── 1. O balde ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mural', 'mural', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. A lista dos arquivos de cada mensagem ──
create table if not exists public.mentoria_anexos (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.mentoria_posts (id) on delete cascade,
  mentoria_id uuid not null references public.mentorias (id) on delete cascade,
  -- "MENTORIA/ARQUIVO.ext": o nome no servidor é sorteado, nunca o nome que a pessoa deu
  caminho     text not null unique
              check (caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp|gif)$'),
  nome        text not null check (char_length(btrim(nome)) between 1 and 120),
  tipo        text not null check (tipo in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  tamanho     int  not null check (tamanho between 1 and 10485760),
  criado_em   timestamptz not null default now()
);
create index if not exists mentoria_anexos_por_post on public.mentoria_anexos (post_id);

alter table public.mentoria_anexos enable row level security;
revoke all on public.mentoria_anexos from anon, authenticated;

-- ── 3. Mensagem só com arquivo, sem texto ──
-- A tabela exigia de 1 a 4000 letras. Agora o texto pode vir vazio, e quem
-- confere se a mensagem tem texto ou arquivo é a função mentoria_postar.
do $$
declare
  c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.mentoria_posts'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%texto%'
  loop
    execute format('alter table public.mentoria_posts drop constraint %I', c);
  end loop;
end $$;
alter table public.mentoria_posts
  add constraint mentoria_posts_texto_tamanho check (char_length(texto) <= 4000);

-- ══════════════════════════════════════════════════════════════
--  Ajudantes das regras do armazenamento
-- ══════════════════════════════════════════════════════════════

-- a mentoria de um caminho "MENTORIA/ARQUIVO.ext"; null se o caminho não tiver esse formato
create or replace function public._mural_mentoria(p_caminho text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when p_caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp|gif)$'
    then split_part(p_caminho, '/', 1)::uuid
  end;
$$;

-- o tamanho que o armazenamento anotou para um arquivo; 0 se não anotou
create or replace function public._mural_tamanho(p_metadata jsonb)
returns bigint language sql immutable set search_path = '' as $$
  select case when p_metadata->>'size' ~ '^[0-9]{1,15}$' then (p_metadata->>'size')::bigint else 0 end;
$$;

-- enviar: o mentor daquela mentoria, com ela no ar, enquanto houver espaço:
-- até 300 arquivos e 200 MB na mentoria, e 700 MB somando todas
create or replace function public._mural_pode_enviar(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.mentorias m
                 where m.id = public._mural_mentoria(p_caminho)
                   and m.mentor_id = auth.uid() and m.status = 'aprovada')
     and (select count(*) < 300 and coalesce(sum(public._mural_tamanho(o.metadata)), 0) < 209715200
          from storage.objects o
          where o.bucket_id = 'mural'
            and o.name like public._mural_mentoria(p_caminho)::text || '/%')
     and (select coalesce(sum(public._mural_tamanho(o.metadata)), 0) < 734003200
          from storage.objects o where o.bucket_id = 'mural');
$$;

-- ler: a administração; o mentor daquela mentoria; e quem está no mural,
-- enquanto a mensagem do arquivo existir
create or replace function public._mural_pode_ler(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public._mural_mentoria(p_caminho) is not null and (
       public.eh_admin()
    or exists (select 1 from public.mentorias m
               where m.id = public._mural_mentoria(p_caminho) and m.mentor_id = auth.uid())
    or (coalesce(public._papel(public._mural_mentoria(p_caminho)), '') = 'aprovado'
        and exists (select 1 from public.mentoria_anexos a
                    join public.mentoria_posts p on p.id = a.post_id
                    where a.caminho = p_caminho and not p.removido)));
$$;

-- apagar: a administração e o mentor daquela mentoria
create or replace function public._mural_pode_apagar(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public._mural_mentoria(p_caminho) is not null and (
       public.eh_admin()
    or exists (select 1 from public.mentorias m
               where m.id = public._mural_mentoria(p_caminho) and m.mentor_id = auth.uid()));
$$;

-- As regras do armazenamento chamam estas funções em nome de quem está
-- logado, por isso elas precisam ser executáveis por contas logadas. O que
-- elas respondem é só sim ou não sobre um caminho que a pessoa já conhece.
revoke all on function public._mural_mentoria(text), public._mural_pode_enviar(text),
                       public._mural_pode_ler(text), public._mural_pode_apagar(text)
  from public, anon;
grant execute on function public._mural_mentoria(text), public._mural_pode_enviar(text),
                          public._mural_pode_ler(text), public._mural_pode_apagar(text)
  to authenticated;
-- esta só é usada por dentro das funções acima
revoke all on function public._mural_tamanho(jsonb) from public, anon, authenticated;

-- ── As regras em si ──
-- Não existe regra de alterar: arquivo publicado não é trocado por outro.
drop policy if exists "mural: o mentor envia" on storage.objects;
create policy "mural: o mentor envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mural' and public._mural_pode_enviar(name));

drop policy if exists "mural: o grupo lê" on storage.objects;
create policy "mural: o grupo lê" on storage.objects
  for select to authenticated
  using (bucket_id = 'mural' and public._mural_pode_ler(name));

drop policy if exists "mural: o mentor e a equipe apagam" on storage.objects;
create policy "mural: o mentor e a equipe apagam" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mural' and public._mural_pode_apagar(name));

-- ══════════════════════════════════════════════════════════════
--  Mural: publicar com arquivos e listar com arquivos
-- ══════════════════════════════════════════════════════════════

-- A função ganha um quarto parâmetro. A antiga, de três, sai: com as duas
-- no banco, a chamada do site ficaria ambígua. Quem chamar com três
-- parâmetros continua sendo atendido, porque o quarto tem valor padrão.
drop function if exists public.mentoria_postar(uuid, text, uuid);

create or replace function public.mentoria_postar(
  p_id uuid, p_texto text, p_pai uuid, p_anexos jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  novo    uuid;
  papel   text  := public._papel(p_id);
  texto   text  := btrim(coalesce(p_texto, ''));
  anexos  jsonb := coalesce(p_anexos, '[]'::jsonb);
  quantos int;
  a       jsonb;
  obj     record;
begin
  perform public._exige_login();
  if papel is null or papel not in ('mentor', 'aprovado') then
    raise exception 'O mural é só para quem participa desta mentoria.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mentorias m where m.id = p_id and m.status = 'aprovada') then
    raise exception 'Esta mentoria está encerrada. O mural ficou só para leitura.';
  end if;
  -- o mentor pode ter deixado só para ele abrir conversa
  if p_pai is null and papel <> 'mentor'
     and (select m.so_mentor_abre from public.mentorias m where m.id = p_id) then
    raise exception 'Nesta mentoria só o mentor abre conversas. Você pode responder às mensagens dele.';
  end if;
  if (select count(*) from public.mentoria_posts p
      where p.autor_id = auth.uid() and p.criado_em > now() - interval '1 hour') >= 40 then
    raise exception 'Muitas mensagens em pouco tempo. Espere um pouco e tente de novo.';
  end if;
  -- resposta só vale para post de primeiro nível da mesma mentoria
  if p_pai is not null and not exists (
       select 1 from public.mentoria_posts p
       where p.id = p_pai and p.mentoria_id = p_id and p.pai_id is null) then
    raise exception 'Post não encontrado.';
  end if;

  if jsonb_typeof(anexos) <> 'array' then
    raise exception 'Os arquivos chegaram em formato inválido.';
  end if;
  quantos := jsonb_array_length(anexos);
  if quantos > 0 and papel <> 'mentor' then
    raise exception 'Só o mentor anexa arquivos no mural.' using errcode = '42501';
  end if;
  if quantos > 0 and p_pai is not null then
    raise exception 'Arquivo só entra em mensagem nova, não em resposta.';
  end if;
  if quantos > 5 then
    raise exception 'O limite é de 5 arquivos por mensagem.';
  end if;
  if texto = '' and quantos = 0 then
    raise exception 'Escreva alguma coisa antes de publicar.';
  end if;
  if char_length(texto) > 4000 then
    raise exception 'A mensagem passou de 4000 letras.';
  end if;

  insert into public.mentoria_posts (mentoria_id, autor_id, pai_id, texto)
  values (p_id, auth.uid(), p_pai, texto)
  returning id into novo;

  for a in select * from jsonb_array_elements(anexos) loop
    -- O arquivo precisa estar no armazenamento, na pasta desta mentoria, e
    -- ter sido enviado por quem está publicando. Tipo e tamanho saem do que
    -- o armazenamento registrou, não do que o navegador diz.
    select o.metadata->>'mimetype' as tipo, public._mural_tamanho(o.metadata) as tamanho
      into obj
      from storage.objects o
     where o.bucket_id = 'mural' and o.name = a->>'caminho'
       and o.owner_id = auth.uid()::text;
    if not found or public._mural_mentoria(a->>'caminho') is distinct from p_id then
      raise exception 'Um dos arquivos não chegou ao servidor. Anexe de novo.';
    end if;
    if exists (select 1 from public.mentoria_anexos x where x.caminho = a->>'caminho') then
      raise exception 'Um dos arquivos já está em outra mensagem. Anexe de novo.';
    end if;
    if obj.tipo is null
       or obj.tipo not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif')
       or obj.tamanho not between 1 and 10485760 then
      raise exception 'Um dos arquivos não pode ser publicado. O mural aceita PDF ou imagem, de até 10 MB.';
    end if;
    insert into public.mentoria_anexos (post_id, mentoria_id, caminho, nome, tipo, tamanho)
    values (novo, p_id, a->>'caminho',
            left(coalesce(nullif(btrim(a->>'nome'), ''), 'arquivo'), 120),
            obj.tipo, obj.tamanho::int);
  end loop;
  return novo;
end;
$$;

create or replace function public.mentoria_posts_lista(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._exige_login();
  if not coalesce(public._pode_no_mural(p_id), false) then
    raise exception 'O mural é só para quem participa desta mentoria.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'pai_id', p.pai_id, 'criado_em', p.criado_em, 'removido', p.removido,
             'texto', case when p.removido then '' else p.texto end,
             'autor', public._pessoa(p.autor_id),
             'do_mentor', p.autor_id = (select m.mentor_id from public.mentorias m where m.id = p_id),
             'meu', p.autor_id = auth.uid(),
             'anexos', case when p.removido then '[]'::jsonb else coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', x.id, 'caminho', x.caminho, 'nome', x.nome, 'tipo', x.tipo, 'tamanho', x.tamanho)
                      order by x.criado_em, x.id)
               from public.mentoria_anexos x where x.post_id = p.id), '[]'::jsonb) end)
           order by p.criado_em)
    from public.mentoria_posts p where p.mentoria_id = p_id), '[]'::jsonb);
end;
$$;

revoke all on function public.mentoria_postar(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.mentoria_postar(uuid, text, uuid, jsonb) to authenticated;
