-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — avisos por e-mail das mentorias
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  Quando algo acontece numa mentoria, o banco anota um aviso numa
--  fila. De minuto em minuto, o próprio banco pega o que está na fila,
--  manda os e-mails pelo Brevo e marca como enviado. Nada disto passa
--  pelo GitHub (a primeira versão passava, mas o agendador de lá
--  atrasava horas).
--
--  Quem é avisado de quê:
--    · o mentor: pedido de entrada no grupo; mentoria aprovada,
--      recusada ou encerrada pela equipe
--    · quem pediu para entrar: aceito, não aceito, ou retirado do grupo
--    · quem denunciou: resposta da equipe e encerramento da denúncia
--    · a equipe: pedido novo de mentor, denúncia nova e resposta de
--      quem denunciou
--
--  Cada pessoa pode desligar os avisos no perfil. A escolha fica na
--  conta (avisos_email = false) e a fila respeita.
--
--  A CHAVE DO BREVO fica no cofre do Supabase (Vault), com o nome
--  brevo_api_key. Quem coloca é o dono do site, pelo painel:
--  Integrations > Vault > Add new secret. Sem a chave, os avisos ficam
--  na fila e nada é enviado.
--
--  Para testar depois de pôr a chave, rode no SQL Editor:
--      select public.avisos_testar();
--  Chega um e-mail de exemplo para o dono do site, e o resultado diz
--  o que o Brevo respondeu.
--
--  Os avisos guardam só o necessário para escrever o e-mail (o nome
--  da vaga e de quem fez a ação). Enviados há mais de 30 dias são
--  apagados.
-- ══════════════════════════════════════════════════════════════

create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  -- para quem vai; vazio = para a equipe do Hub
  para_user  uuid references auth.users (id) on delete cascade,
  dados      jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas int not null default 0,
  erro       text not null default ''
);
create index if not exists avisos_na_fila on public.avisos (criado_em) where enviado_em is null;
alter table public.avisos enable row level security;
revoke all on public.avisos from anon, authenticated;

-- ── ajudantes internos ──
create or replace function public._nome_de(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.nome from public.perfis p where p.user_id = p_user), '');
$$;

-- o endereço do site, usado nos links dos e-mails (trocar quando o domínio mudar)
create or replace function public._site()
returns text language sql immutable set search_path = '' as $$
  select 'https://alvittaluc.github.io/home-office-hub/'::text;
$$;

-- texto de fora nunca entra como HTML no e-mail
create or replace function public._esc(p text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- ══════════════════════════════════════════════════════════════
--  Quem entra na fila. Os gatilhos nunca atrapalham a ação: se
--  anotar o aviso falhar, a ação da pessoa vale do mesmo jeito.
-- ══════════════════════════════════════════════════════════════

-- pedidos de entrada e a resposta do mentor
create or replace function public._avisos_membros()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  begin
    select mt.id, mt.mentor_id, mt.vaga_titulo into m from public.mentorias mt where mt.id = new.mentoria_id;
    if m.id is null then return new; end if;

    if new.status = 'pedido' and (tg_op = 'INSERT' or old.status is distinct from 'pedido') then
      insert into public.avisos (tipo, para_user, dados)
      values ('pedido_entrada', m.mentor_id,
              jsonb_build_object('mentoria', m.id, 'vaga', m.vaga_titulo, 'quem', public._nome_de(new.user_id)));
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('aprovado', 'recusado') then
      insert into public.avisos (tipo, para_user, dados)
      values (case when new.status = 'aprovado' then 'entrada_aceita'
                   when old.status = 'aprovado' then 'participacao_encerrada'
                   else 'entrada_recusada' end,
              new.user_id,
              jsonb_build_object('mentoria', m.id, 'vaga', m.vaga_titulo, 'quem', public._nome_de(m.mentor_id)));
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_membros on public.mentoria_membros;
create trigger avisos_membros after insert or update of status on public.mentoria_membros
  for each row execute function public._avisos_membros();

-- pedido novo de mentor e a decisão da equipe
create or replace function public._avisos_mentorias()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.status = 'pendente' and (tg_op = 'INSERT' or old.status is distinct from 'pendente') then
      insert into public.avisos (tipo, para_user, dados)
      values ('mentor_novo', null,
              jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo, 'empresa', new.empresa,
                                 'quem', public._nome_de(new.mentor_id), 'ator', auth.uid()));
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      if new.status = 'aprovada' then
        insert into public.avisos (tipo, para_user, dados)
        values ('mentoria_aprovada', new.mentor_id, jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo));
      elsif new.status = 'recusada' then
        insert into public.avisos (tipo, para_user, dados)
        values ('mentoria_recusada', new.mentor_id,
                jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo, 'motivo', new.motivo));
      elsif new.status = 'encerrada' and auth.uid() is distinct from new.mentor_id then
        -- só quando foi a equipe que encerrou; o mentor que encerra a própria não precisa de aviso
        insert into public.avisos (tipo, para_user, dados)
        values ('mentoria_encerrada', new.mentor_id,
                jsonb_build_object('mentoria', new.id, 'vaga', new.vaga_titulo, 'motivo', new.motivo));
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_mentorias on public.mentorias;
create trigger avisos_mentorias after insert or update of status on public.mentorias
  for each row execute function public._avisos_mentorias();

-- denúncia nova e denúncia encerrada
create or replace function public._avisos_denuncias()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_vaga text;
begin
  begin
    if tg_op = 'INSERT' then
      select mt.vaga_titulo into v_vaga from public.mentorias mt
       where mt.id = case when new.tipo = 'mentoria' then new.alvo_id
                          else (select p.mentoria_id from public.mentoria_posts p where p.id = new.alvo_id) end;
      insert into public.avisos (tipo, para_user, dados)
      values ('denuncia_nova', null,
              jsonb_build_object('denuncia', new.id, 'alvo', new.tipo, 'vaga', coalesce(v_vaga, ''), 'ator', auth.uid()));
    elsif new.resolvida and not old.resolvida then
      insert into public.avisos (tipo, para_user, dados)
      values ('denuncia_resolvida', new.autor_id, jsonb_build_object('denuncia', new.id));
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_denuncias on public.denuncias;
create trigger avisos_denuncias after insert or update of resolvida on public.denuncias
  for each row execute function public._avisos_denuncias();

-- conversa da denúncia
create or replace function public._avisos_denuncia_mensagens()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_autor uuid;
begin
  begin
    if new.da_equipe then
      select d.autor_id into v_autor from public.denuncias d where d.id = new.denuncia_id;
      if v_autor is not null then
        insert into public.avisos (tipo, para_user, dados)
        values ('denuncia_resposta_equipe', v_autor, jsonb_build_object('denuncia', new.denuncia_id));
      end if;
    else
      insert into public.avisos (tipo, para_user, dados)
      values ('denuncia_resposta_autor', null, jsonb_build_object('denuncia', new.denuncia_id, 'ator', auth.uid()));
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists avisos_denuncia_mensagens on public.denuncia_mensagens;
create trigger avisos_denuncia_mensagens after insert on public.denuncia_mensagens
  for each row execute function public._avisos_denuncia_mensagens();

-- ══════════════════════════════════════════════════════════════
--  O texto de cada aviso
-- ══════════════════════════════════════════════════════════════

create or replace function public._aviso_email(p_tipo text, p_dados jsonb, out assunto text, out html text)
language plpgsql stable security definer set search_path = '' as $$
declare
  site    text := public._site();
  quem_c  text := coalesce(nullif(btrim(p_dados ->> 'quem'), ''), 'Uma pessoa');
  vaga_c  text := coalesce(btrim(p_dados ->> 'vaga'), '');
  quem    text := public._esc(quem_c);
  vaga    text := public._esc(vaga_c);
  empresa text := public._esc(btrim(coalesce(p_dados ->> 'empresa', '')));
  motivo  text := public._esc(btrim(coalesce(p_dados ->> 'motivo', '')));
  link_m  text := site || 'mentoria.html?id=' || coalesce(p_dados ->> 'mentoria', '');
  titulo text; p1 text; p2 text; botao text; link text;
begin
  if motivo <> '' then
    motivo := ' Motivo informado pela equipe: ' || motivo
              || case when right(motivo, 1) in ('.', '!', '?') then '' else '.' end;
  end if;

  if p_tipo = 'pedido_entrada' then
    assunto := quem_c || ' pediu para entrar na sua mentoria';
    titulo := 'Novo pedido de entrada';
    p1 := '<b>' || quem || '</b> pediu para entrar na mentoria <b>' || vaga || '</b>.';
    p2 := 'Na aba Participantes você lê a mensagem e aceita ou recusa.';
    botao := 'Ver o pedido'; link := link_m;
  elsif p_tipo = 'entrada_aceita' then
    assunto := btrim('Você entrou na mentoria ' || vaga_c);
    titulo := 'Seu pedido foi aceito';
    p1 := '<b>' || quem || '</b> aceitou você na mentoria <b>' || vaga || '</b>.';
    p2 := 'O mural do grupo já está aberto para você.';
    botao := 'Abrir o mural'; link := link_m;
  elsif p_tipo = 'entrada_recusada' then
    assunto := btrim('Seu pedido para a mentoria ' || vaga_c);
    titulo := 'Seu pedido não foi aceito desta vez';
    p1 := '<b>' || quem || '</b> não liberou a sua entrada na mentoria <b>' || vaga || '</b>.';
    p2 := 'Se você já se candidatou à vaga e acha que foi engano, dá para pedir de novo explicando.';
    botao := 'Ver a mentoria'; link := link_m;
  elsif p_tipo = 'participacao_encerrada' then
    assunto := btrim('Sua participação na mentoria ' || vaga_c);
    titulo := 'Você saiu do grupo';
    p1 := '<b>' || quem || '</b> encerrou a sua participação na mentoria <b>' || vaga || '</b>.';
    p2 := 'O mural desse grupo deixa de aparecer para você.';
    botao := 'Ver outras mentorias'; link := site || 'mentorias.html';
  elsif p_tipo = 'mentor_novo' then
    assunto := btrim('Novo pedido de mentor: ' || vaga_c);
    titulo := 'Novo pedido de mentor';
    p1 := '<b>' || quem || '</b> quer abrir uma mentoria para <b>' || vaga || '</b>'
          || case when empresa <> '' then ', na ' || empresa || '.' else '.' end;
    p2 := 'O pedido e os comprovantes estão no Painel da equipe.';
    botao := 'Abrir o painel'; link := site || 'painel.html#mentorias';
  elsif p_tipo = 'mentoria_aprovada' then
    assunto := 'Sua mentoria foi aprovada';
    titulo := 'Sua mentoria está no ar';
    p1 := 'A equipe do Hub aprovou a mentoria <b>' || vaga || '</b>.';
    p2 := 'Quando alguém pedir para entrar no grupo, você recebe um aviso como este.';
    botao := 'Abrir a mentoria'; link := link_m;
  elsif p_tipo = 'mentoria_recusada' then
    assunto := 'Seu pedido de mentoria não foi aprovado';
    titulo := 'Seu pedido de mentoria não foi aprovado';
    p1 := 'A equipe do Hub não aprovou o pedido para <b>' || vaga || '</b>.' || motivo;
    p2 := 'Você pode ajustar o que faltou e enviar um pedido novo.';
    botao := 'Ver o pedido'; link := link_m;
  elsif p_tipo = 'mentoria_encerrada' then
    assunto := btrim('A mentoria ' || vaga_c) || ' foi encerrada';
    titulo := 'Sua mentoria foi encerrada pela equipe';
    p1 := 'A equipe do Hub encerrou a mentoria <b>' || vaga || '</b>.' || motivo;
    p2 := 'O mural continua disponível, só para leitura.';
    botao := 'Abrir a mentoria'; link := link_m;
  elsif p_tipo = 'denuncia_nova' then
    assunto := 'Nova denúncia nas mentorias';
    titulo := 'Nova denúncia';
    p1 := 'Chegou uma denúncia sobre '
          || case when p_dados ->> 'alvo' = 'post' then 'uma mensagem do mural' else 'uma mentoria' end
          || case when vaga <> '' then ', na mentoria <b>' || vaga || '</b>.' else '.' end;
    p2 := 'Ela está no Painel da equipe, na aba Denúncias.';
    botao := 'Abrir o painel'; link := site || 'painel.html#denuncias';
  elsif p_tipo = 'denuncia_resposta_equipe' then
    assunto := 'A equipe do Hub respondeu à sua denúncia';
    titulo := 'Há uma resposta na sua denúncia';
    p1 := 'A equipe do Hub escreveu na conversa da sua denúncia.';
    p2 := 'Ela aparece em Mentorias, na aba Suas denúncias.';
    botao := 'Ler a resposta'; link := site || 'mentorias.html#denuncias';
  elsif p_tipo = 'denuncia_resposta_autor' then
    assunto := 'Resposta numa denúncia';
    titulo := 'Resposta numa denúncia';
    p1 := 'Quem fez a denúncia respondeu à equipe.';
    p2 := 'A conversa está no Painel da equipe, na aba Denúncias.';
    botao := 'Abrir o painel'; link := site || 'painel.html#denuncias';
  elsif p_tipo = 'denuncia_resolvida' then
    assunto := 'Sua denúncia foi encerrada';
    titulo := 'Sua denúncia foi encerrada';
    p1 := 'A equipe do Hub encerrou a sua denúncia.';
    p2 := 'Em Mentorias, na aba Suas denúncias, você vê a conversa e pode avaliar o atendimento.';
    botao := 'Ver a denúncia'; link := site || 'mentorias.html#denuncias';
  else
    assunto := null; html := null;
    return;
  end if;

  assunto := left(assunto, 150);
  html := '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    || public._esc(assunto) || '</title></head><body style="margin:0;padding:0;background:#F7F4EF;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;"><tr><td align="center" style="padding:28px 14px;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">'
    || '<tr><td style="padding:0 4px 16px 4px;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1A4893;font-weight:bold;">Home Office Hub · Mentorias</div></td></tr>'
    || '<tr><td style="background:#ffffff;border:1px solid #EAE4D9;border-radius:14px;padding:26px 26px 24px 26px;">'
    || '<div style="font-family:Georgia,''Times New Roman'',serif;font-size:24px;line-height:1.22;color:#10203A;margin:0 0 14px 0;">' || public._esc(titulo) || '</div>'
    || '<p style="font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:#54606F;margin:0 0 12px 0;">' || p1 || '</p>'
    || '<p style="font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:#54606F;margin:0 0 12px 0;">' || p2 || '</p>'
    || '<div style="margin-top:20px;"><a href="' || public._esc(link) || '" style="display:inline-block;background:#1A4893;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14.5px;font-weight:bold;text-decoration:none;padding:13px 22px;border-radius:10px;">' || public._esc(botao) || '</a></div>'
    || '</td></tr>'
    || '<tr><td style="padding:20px 4px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#66717F;">Você recebe este aviso porque usa as mentorias do Home Office Hub. Para parar de receber, desligue os avisos por e-mail no <a href="'
    || site || 'perfil.html" style="color:#66717F;">seu perfil</a>.</td></tr>'
    || '</table></td></tr></table></body></html>';
end $$;

-- ══════════════════════════════════════════════════════════════
--  O envio. Roda de minuto em minuto pelo agendador do banco.
-- ══════════════════════════════════════════════════════════════

create or replace function public.avisos_enviar()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_chave text; v_remetente text; v_emails text[]; v_para text;
  v_assunto text; v_html text; v_status int; v_resposta text;
  a record; cab extensions.http_header[];
  certos int; enviados int := 0; falhas int := 0;
begin
  -- aviso velho demais, ou que falhou muitas vezes, sai da fila; enviado há mais de 30 dias é apagado
  update public.avisos set enviado_em = now(), erro = 'desistiu'
   where enviado_em is null and (tentativas >= 5 or criado_em < now() - interval '3 days');
  delete from public.avisos where enviado_em < now() - interval '30 days';

  if not exists (select 1 from public.avisos where enviado_em is null) then
    return 'fila vazia';
  end if;

  select s.decrypted_secret into v_chave from vault.decrypted_secrets s where s.name = 'brevo_api_key' limit 1;
  if v_chave is null or btrim(v_chave) = '' then
    return 'falta a chave do Brevo no cofre (brevo_api_key)';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  -- a proteção do Brevo recusa quem se apresenta como programa; por isso a identificação de navegador
  cab := array[
    extensions.http_header('api-key', btrim(v_chave)),
    extensions.http_header('accept', 'application/json'),
    extensions.http_header('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')];

  -- o remetente é o primeiro ativo da conta do Brevo, o mesmo do alerta de vagas
  begin
    select r.status, r.content into v_status, v_resposta
      from extensions.http(('GET', 'https://api.brevo.com/v3/senders', cab, null, null)::extensions.http_request) r;
    if v_status = 200 then
      select s ->> 'email' into v_remetente
        from jsonb_array_elements((v_resposta::jsonb) -> 'senders') s
       where coalesce((s ->> 'active')::boolean, false)
       limit 1;
    end if;
  exception when others then
    v_remetente := null;
  end;
  if v_remetente is null then
    return 'o Brevo não informou o remetente (resposta ' || coalesce(v_status::text, 'nenhuma') || ')';
  end if;

  for a in
    select * from public.avisos where enviado_em is null order by criado_em limit 15 for update skip locked
  loop
    -- a equipe respondeu e encerrou a denúncia de uma vez: vai só o aviso do encerramento
    if a.tipo = 'denuncia_resposta_equipe' and exists (
         select 1 from public.avisos o
          where o.tipo = 'denuncia_resolvida' and o.para_user = a.para_user
            and o.dados ->> 'denuncia' = a.dados ->> 'denuncia'
            and (o.enviado_em is null or o.enviado_em > now() - interval '10 minutes')) then
      update public.avisos set enviado_em = now(), erro = 'junto com o encerramento' where id = a.id;
      continue;
    end if;

    -- para quem vai: a pessoa do aviso, ou toda a equipe menos quem fez a ação; fora quem desligou
    select array(
      select lower(u.email)::text
        from auth.users u
       where u.email_confirmed_at is not null
         and u.deleted_at is null
         and coalesce(u.raw_user_meta_data ->> 'avisos_email', 'true') <> 'false'
         and ( (a.para_user is not null and u.id = a.para_user)
            or (a.para_user is null
                and u.id in (select ad.user_id from public.administradores ad)
                and u.id::text is distinct from (a.dados ->> 'ator')) )
    ) into v_emails;

    select e.assunto, e.html into v_assunto, v_html from public._aviso_email(a.tipo, a.dados) e;

    if v_assunto is null or coalesce(array_length(v_emails, 1), 0) = 0 then
      update public.avisos set enviado_em = now(),
             erro = case when v_assunto is null then 'tipo desconhecido' else 'sem destinatário' end
       where id = a.id;
      continue;
    end if;

    certos := 0; v_status := null; v_resposta := null;
    foreach v_para in array v_emails loop
      begin
        select r.status, r.content into v_status, v_resposta
          from extensions.http((
            'POST', 'https://api.brevo.com/v3/smtp/email', cab, 'application/json',
            jsonb_build_object(
              'sender', jsonb_build_object('name', 'Home Office Hub', 'email', v_remetente),
              'to', jsonb_build_array(jsonb_build_object('email', v_para)),
              'subject', v_assunto,
              'htmlContent', v_html,
              'tags', jsonb_build_array('aviso-mentoria'))::text
          )::extensions.http_request) r;
        if v_status between 200 and 299 then certos := certos + 1; end if;
      exception when others then
        v_resposta := sqlerrm;
      end;
    end loop;

    if certos > 0 then
      update public.avisos set enviado_em = now(), erro = '' where id = a.id;
      enviados := enviados + 1;
    else
      -- o motivo fica anotado, sem nenhum e-mail de pessoa
      update public.avisos
         set tentativas = tentativas + 1,
             erro = left('HTTP ' || coalesce(v_status::text, '?') || ': '
                    || regexp_replace(coalesce(v_resposta, 'sem resposta'), '[[:alnum:]._+-]+@[[:alnum:]-]+(\.[[:alnum:]-]+)+', '[e-mail]', 'g'), 300)
       where id = a.id;
      falhas := falhas + 1;
    end if;
  end loop;

  return enviados || ' aviso(s) enviado(s), ' || falhas || ' com falha';
end $$;

-- Teste: põe um aviso de exemplo para o dono do site e manda na hora.
-- Só roda no SQL Editor.
create or replace function public.avisos_testar()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_dono uuid; v_id uuid; v_resultado text; v_erro text;
begin
  select ad.user_id into v_dono from public.administradores ad order by ad.dono desc nulls last limit 1;
  if v_dono is null then return 'não há ninguém na equipe para receber o teste'; end if;
  insert into public.avisos (tipo, para_user, dados)
  values ('pedido_entrada', v_dono, jsonb_build_object('mentoria', '', 'vaga', 'Mentoria de exemplo (teste)', 'quem', 'Pessoa de Teste'))
  returning id into v_id;
  v_resultado := public.avisos_enviar();
  select a.erro into v_erro from public.avisos a where a.id = v_id and a.enviado_em is null;
  if v_erro is not null then
    delete from public.avisos where id = v_id;
    return 'NÃO SAIU. ' || v_resultado || coalesce(' | ' || nullif(v_erro, ''), '');
  end if;
  return 'ENVIADO para o dono do site. ' || v_resultado;
end $$;

-- ── a primeira versão usava o robô do GitHub; estas duas funções saem ──
drop function if exists public.avisos_pendentes(text, int);
drop function if exists public.avisos_marcar(text, uuid[], uuid[]);
drop function if exists public._exige_chave_robo(text);

revoke execute on function public._nome_de(uuid) from public, anon, authenticated;
revoke execute on function public._site() from public, anon, authenticated;
revoke execute on function public._esc(text) from public, anon, authenticated;
revoke execute on function public._aviso_email(text, jsonb) from public, anon, authenticated;
revoke execute on function public._avisos_membros() from public, anon, authenticated;
revoke execute on function public._avisos_mentorias() from public, anon, authenticated;
revoke execute on function public._avisos_denuncias() from public, anon, authenticated;
revoke execute on function public._avisos_denuncia_mensagens() from public, anon, authenticated;
revoke execute on function public.avisos_enviar() from public, anon, authenticated;
revoke execute on function public.avisos_testar() from public, anon, authenticated;

-- ── o agendador do banco: envio de minuto em minuto, e a faxina do próprio registro ──
select cron.unschedule(jobid) from cron.job where jobname in ('avisos-das-mentorias', 'avisos-limpar-registro');
select cron.schedule('avisos-das-mentorias', '* * * * *', $$select public.avisos_enviar()$$);
select cron.schedule('avisos-limpar-registro', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);
