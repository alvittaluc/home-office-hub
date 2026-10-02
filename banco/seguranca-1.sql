-- ══════════════════════════════════════════════════════════════
--  HOME OFFICE HUB — reforços de segurança (revisão de 02/10/2026)
--
--  Cópia do que foi rodado no SQL Editor do Supabase.
--
--  1. Foto de perfil e print de comprovação: o banco passa a exigir
--     que o texto INTEIRO seja uma imagem. Antes ele só conferia o
--     começo, e dava para mandar código escondido depois da imagem,
--     que rodaria no navegador de quem visse a foto.
--  2. Meu Controle: tira das contas logadas permissões que elas não
--     usam (esvaziar a tabela, criar gatilho, criar referência).
--  3. Função interna do Supabase que estava chamável por visitante.
-- ══════════════════════════════════════════════════════════════

-- ── 1. imagem de verdade, do começo ao fim ──
alter table public.perfis drop constraint if exists perfis_foto_imagem;
alter table public.perfis add constraint perfis_foto_imagem
  check (foto = '' or foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$');

alter table public.mentoria_provas drop constraint if exists mentoria_provas_imagem_inteira;
alter table public.mentoria_provas add constraint mentoria_provas_imagem_inteira
  check (imagem ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$');

-- ── 2. Meu Controle: só ler, criar, alterar e apagar o que é da própria pessoa ──
revoke truncate, references, trigger on public.controle_itens from authenticated;
revoke all on public.controle_itens from anon;

-- ── 3. função interna que não é para ninguém chamar pelo site ──
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
