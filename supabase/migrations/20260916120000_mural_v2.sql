-- Mural QGO v2:
--  - corrige a recursão infinita da política de admin (bug da v1)
--  - avisos direcionados (todos, ou uma lista de destinatários)
--  - confirmação de leitura ao vivo (quem abriu e viu a mensagem)
--  - comentários nos avisos
--  - notas e etapas nas tarefas pessoais

-- ---------------------------------------------------------------
-- 0) Corrige a recursão infinita em mural_usuarios: a política de admin
--    consultava a própria tabela dentro do USING, o que travava até a
--    leitura simples da própria linha com erro 500. Agora usa uma
--    função SECURITY DEFINER, que não reaciona as políticas de novo.
-- ---------------------------------------------------------------
create or replace function public.mural_is_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.mural_usuarios
    where id = p_user_id and admin and ativo
  );
$$;

revoke all on function public.mural_is_admin(uuid) from public, anon;
grant execute on function public.mural_is_admin(uuid) to authenticated;

drop policy if exists "mural_usuarios: admin gerencia" on public.mural_usuarios;
create policy "mural_usuarios: admin gerencia"
  on public.mural_usuarios for all
  to authenticated
  using (public.mural_is_admin(auth.uid()))
  with check (public.mural_is_admin(auth.uid()));

-- ---------------------------------------------------------------
-- 1) Tarefas pessoais: notas e etapas (com marcação de "etapa atual")
-- ---------------------------------------------------------------
alter table public.mural_tarefas
  add column if not exists notas text,
  add column if not exists etapas jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------
-- 2) Avisos: quem pode ver (todos, ou uma lista de destinatários)
-- ---------------------------------------------------------------
alter table public.mural_avisos
  add column if not exists todos boolean not null default true;

create table if not exists public.mural_aviso_destinatarios (
  aviso_id uuid not null references public.mural_avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (aviso_id, user_id)
);

alter table public.mural_aviso_destinatarios enable row level security;

-- ---------------------------------------------------------------
-- 3) Função central: "fulano pode ver este aviso?" — reaproveitada nas
--    políticas de avisos, destinatários, leituras e comentários.
--    SECURITY DEFINER pra nunca criar recursão de RLS entre essas
--    tabelas (mesmo problema do item 0, evitado por construção).
-- ---------------------------------------------------------------
create or replace function public.mural_pode_ver_aviso(p_aviso_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.mural_avisos a
    where a.id = p_aviso_id
      and exists (select 1 from public.mural_usuarios mu where mu.id = p_user_id and mu.ativo)
      and (
        a.autor_id = p_user_id
        or a.todos
        or exists (
          select 1 from public.mural_aviso_destinatarios d
          where d.aviso_id = a.id and d.user_id = p_user_id
        )
      )
  );
$$;

revoke all on function public.mural_pode_ver_aviso(uuid, uuid) from public, anon;
grant execute on function public.mural_pode_ver_aviso(uuid, uuid) to authenticated;

-- Troca a política antiga de leitura ("todo mundo ativo vê tudo") pela
-- nova, baseada em destinatário.
drop policy if exists "mural_avisos: leitura por usuários ativos" on public.mural_avisos;
create policy "mural_avisos: leitura por destinatario"
  on public.mural_avisos for select
  to authenticated
  using (public.mural_pode_ver_aviso(id, auth.uid()));

-- Reaproveita a função de admin (mesmo padrão do item 0) nas políticas
-- de editar/apagar aviso.
drop policy if exists "mural_avisos: autor ou admin edita" on public.mural_avisos;
create policy "mural_avisos: autor ou admin edita"
  on public.mural_avisos for update
  to authenticated
  using (autor_id = auth.uid() or public.mural_is_admin(auth.uid()));

drop policy if exists "mural_avisos: autor ou admin apaga" on public.mural_avisos;
create policy "mural_avisos: autor ou admin apaga"
  on public.mural_avisos for delete
  to authenticated
  using (autor_id = auth.uid() or public.mural_is_admin(auth.uid()));

-- Destinatários: o autor do aviso define/gerencia a lista; cada um
-- consegue ver em quais avisos foi colocado como destinatário.
create policy "mural_aviso_destinatarios: autor gerencia"
  on public.mural_aviso_destinatarios for all
  to authenticated
  using (exists (select 1 from public.mural_avisos a where a.id = aviso_id and a.autor_id = auth.uid()))
  with check (exists (select 1 from public.mural_avisos a where a.id = aviso_id and a.autor_id = auth.uid()));

create policy "mural_aviso_destinatarios: destinatario ve a si mesmo"
  on public.mural_aviso_destinatarios for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- 4) Confirmação de leitura (quem abriu e viu a mensagem)
-- ---------------------------------------------------------------
create table if not exists public.mural_aviso_leituras (
  aviso_id uuid not null references public.mural_avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (aviso_id, user_id)
);

alter table public.mural_aviso_leituras enable row level security;

create policy "mural_aviso_leituras: autor ve tudo, cada um ve a sua"
  on public.mural_aviso_leituras for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.mural_avisos a where a.id = aviso_id and a.autor_id = auth.uid())
  );

create policy "mural_aviso_leituras: marcar a propria leitura"
  on public.mural_aviso_leituras for insert
  to authenticated
  with check (user_id = auth.uid() and public.mural_pode_ver_aviso(aviso_id, auth.uid()));

-- ---------------------------------------------------------------
-- 5) Comentários nos avisos
-- ---------------------------------------------------------------
create table if not exists public.mural_aviso_comentarios (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.mural_avisos(id) on delete cascade,
  autor_id uuid not null references auth.users(id) on delete cascade,
  autor_nome text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);

alter table public.mural_aviso_comentarios enable row level security;

create policy "mural_aviso_comentarios: leitura por quem ve o aviso"
  on public.mural_aviso_comentarios for select
  to authenticated
  using (public.mural_pode_ver_aviso(aviso_id, auth.uid()));

create policy "mural_aviso_comentarios: comentar quem ve o aviso"
  on public.mural_aviso_comentarios for insert
  to authenticated
  with check (autor_id = auth.uid() and public.mural_pode_ver_aviso(aviso_id, auth.uid()));

create policy "mural_aviso_comentarios: autor ou admin apaga"
  on public.mural_aviso_comentarios for delete
  to authenticated
  using (autor_id = auth.uid() or public.mural_is_admin(auth.uid()));

-- ---------------------------------------------------------------
-- 6) Realtime para as tabelas novas (pra "quem leu" e comentários
--    atualizarem ao vivo na tela de quem enviou o aviso)
-- ---------------------------------------------------------------
alter publication supabase_realtime add table public.mural_aviso_leituras;
alter publication supabase_realtime add table public.mural_aviso_comentarios;
alter publication supabase_realtime add table public.mural_aviso_destinatarios;
