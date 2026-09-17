-- Mural QGO: cada pessoa escolhe seu próprio som de notificação (sino,
-- sirene ou bipe). Isso só controla o som tocado com o Mural ABERTO na
-- tela (Web Audio, ver src/lib/sound.ts) e o padrão de vibração das
-- notificações em segundo plano no Android — nenhum navegador permite
-- escolher um arquivo de som para tocar com o app fechado, em nenhuma
-- plataforma (limitação do próprio sistema operacional, não do Mural).

alter table public.mural_usuarios
  add column if not exists som_preferido text not null default 'sino';

alter table public.mural_usuarios
  drop constraint if exists mural_usuarios_som_preferido_check;
alter table public.mural_usuarios
  add constraint mural_usuarios_som_preferido_check
  check (som_preferido in ('sino', 'sirene', 'bipe'));

-- Deixa qualquer usuário autenticado atualizar a PRÓPRIA linha (antes só
-- admin podia atualizar qualquer linha, via "mural_usuarios: admin
-- gerencia"). Sozinha essa política deixaria a pessoa mudar seu próprio
-- "admin"/"ativo" também — o gatilho abaixo fecha essa brecha.
drop policy if exists "mural_usuarios: cada um atualiza a propria linha" on public.mural_usuarios;
create policy "mural_usuarios: cada um atualiza a propria linha"
  on public.mural_usuarios for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Trava: se quem está alterando é a própria pessoa (não um admin mexendo
-- em outra linha) e essa pessoa não é admin, só "som_preferido" pode
-- mudar — nome/ativo/admin continuam só nas mãos de um admin de verdade.
create or replace function public.mural_usuarios_protect_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.mural_is_admin(auth.uid()) then
    if new.nome is distinct from old.nome
       or new.ativo is distinct from old.ativo
       or new.admin is distinct from old.admin then
      raise exception 'Você só pode alterar sua preferência de som.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mural_usuarios_protect_self_update on public.mural_usuarios;
create trigger mural_usuarios_protect_self_update
  before update on public.mural_usuarios
  for each row
  execute function public.mural_usuarios_protect_self_update();
