-- Mural QGO: quadro de avisos da empresa + tarefas pessoais privadas + push notifications.
-- Roda no MESMO projeto Supabase compartilhado das outras ferramentas QGO
-- (Portal QGO Prime, Financeiro QGO, Painel Operacional QGO), reaproveitando
-- os mesmos usuários do Supabase Auth. As tabelas abaixo são próprias do
-- Mural, para não acoplar esta ferramenta ao esquema de permissões do
-- Painel Operacional.

-- ---------------------------------------------------------------
-- 1) Usuários do Mural (quem pode entrar e quem é admin)
-- ---------------------------------------------------------------
create table if not exists public.mural_usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  admin boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table public.mural_usuarios enable row level security;

-- Qualquer usuário autenticado pode ver a lista (nomes), para mostrar autor
-- dos avisos etc. Só um admin pode alterar quem tem acesso.
create policy "mural_usuarios: leitura autenticada"
  on public.mural_usuarios for select
  to authenticated
  using (true);

create policy "mural_usuarios: admin gerencia"
  on public.mural_usuarios for all
  to authenticated
  using (exists (select 1 from public.mural_usuarios mu where mu.id = auth.uid() and mu.admin and mu.ativo))
  with check (exists (select 1 from public.mural_usuarios mu where mu.id = auth.uid() and mu.admin and mu.ativo));

-- ---------------------------------------------------------------
-- 2) Mural (avisos públicos, visíveis para todos os usuários ativos)
-- ---------------------------------------------------------------
create table if not exists public.mural_avisos (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references auth.users(id) on delete cascade,
  autor_nome text not null,
  texto text not null,
  fixado boolean not null default false,
  criado_em timestamptz not null default now(),
  editado_em timestamptz
);

alter table public.mural_avisos enable row level security;

create policy "mural_avisos: leitura por usuários ativos"
  on public.mural_avisos for select
  to authenticated
  using (exists (select 1 from public.mural_usuarios mu where mu.id = auth.uid() and mu.ativo));

create policy "mural_avisos: inserir como usuário ativo"
  on public.mural_avisos for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and exists (select 1 from public.mural_usuarios mu where mu.id = auth.uid() and mu.ativo)
  );

create policy "mural_avisos: autor ou admin edita"
  on public.mural_avisos for update
  to authenticated
  using (
    autor_id = auth.uid()
    or exists (select 1 from public.mural_usuarios mu where mu.id = auth.uid() and mu.admin and mu.ativo)
  );

create policy "mural_avisos: autor ou admin apaga"
  on public.mural_avisos for delete
  to authenticated
  using (
    autor_id = auth.uid()
    or exists (select 1 from public.mural_usuarios mu where mu.id = auth.uid() and mu.admin and mu.ativo)
  );

-- ---------------------------------------------------------------
-- 3) Minhas Tarefas (privado — cada um só vê e mexe nas suas)
-- ---------------------------------------------------------------
create table if not exists public.mural_tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  texto text not null,
  feita boolean not null default false,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

alter table public.mural_tarefas enable row level security;

create policy "mural_tarefas: cada um só vê as suas"
  on public.mural_tarefas for select
  to authenticated
  using (user_id = auth.uid());

create policy "mural_tarefas: cada um só mexe nas suas"
  on public.mural_tarefas for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------
-- 4) Inscrições de push notification (Web Push)
-- ---------------------------------------------------------------
create table if not exists public.mural_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  criado_em timestamptz not null default now()
);

alter table public.mural_push_subscriptions enable row level security;

-- Cada usuário só pode criar/apagar a própria inscrição. A leitura de TODAS
-- as inscrições (para disparar o push a todo mundo) é feita só pelo server
-- com a service role key, que ignora RLS — nunca pelo navegador.
create policy "mural_push_subscriptions: cada um insere a sua"
  on public.mural_push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "mural_push_subscriptions: cada um apaga a sua"
  on public.mural_push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

create policy "mural_push_subscriptions: cada um vê a sua"
  on public.mural_push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- 5) Realtime: garante que a tabela de avisos emite eventos
-- ---------------------------------------------------------------
alter publication supabase_realtime add table public.mural_avisos;

-- ---------------------------------------------------------------
-- 5b) Função auxiliar: localizar o id de um usuário do Supabase Auth pelo
-- e-mail, para o admin poder liberar acesso ao Mural digitando só o e-mail.
-- SECURITY DEFINER para poder ler auth.users, mas só o service role pode
-- chamá-la (revogado de anon/authenticated) — nunca é exposta ao navegador.
-- ---------------------------------------------------------------
create or replace function public.mural_lookup_user_by_email(p_email text)
returns table(id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select id, email from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.mural_lookup_user_by_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 6) Seed inicial da equipe (ajuste o e-mail se algum já existir com outro).
-- Como as contas já existem no Supabase Auth compartilhado (mesmo login do
-- Painel Operacional), isto só cria a permissão de acesso ao Mural para
-- quem já tem conta — não cria usuários novos.
-- Rode este bloco manualmente depois de confirmar os e-mails corretos.
-- ---------------------------------------------------------------
-- insert into public.mural_usuarios (id, nome, admin)
-- select id, 'Letícia', true from auth.users where email = 'EMAIL_DA_LETICIA'
-- on conflict (id) do nothing;
