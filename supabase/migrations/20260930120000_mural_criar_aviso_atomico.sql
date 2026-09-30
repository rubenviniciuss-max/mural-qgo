-- Corrige um bug de notificação em avisos "só para algumas pessoas": antes,
-- postar um aviso assim fazia DOIS inserts separados (1º o aviso, 2º os
-- destinatários). O Realtime do Supabase dispara o evento de "aviso novo"
-- assim que o 1º insert é confirmado — nesse instante, os destinatários
-- ainda não existiam, então a política de segurança (RLS) checava
-- "essa pessoa pode ver esse aviso?" e a resposta ainda era "não", mesmo
-- ela sendo destinatária. Resultado: quem devia receber o aviso não
-- recebia o evento em tempo real (sem som, sem toast na hora) e só via o
-- aviso no próximo refresh automático (até 20s depois) — exatamente o
-- "as vezes demora, as vezes não notifica" que foi reportado.
--
-- Esta função cria o aviso E os destinatários dentro de UMA transação só —
-- o Realtime só vê (e só dispara) a mudança depois que os dois já existem
-- juntos, pra quem tem permissão de ver o aviso já poder vê-lo de cara.
-- Avisos "para todos" não dependem de destinatário nenhum, então não
-- sofriam desse atraso — daí o bug ser só "de vez em quando".

create or replace function public.mural_criar_aviso(
  p_texto text,
  p_autor_nome text,
  p_todos boolean,
  p_destinatarios uuid[]
)
returns public.mural_avisos
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_aviso public.mural_avisos;
begin
  insert into public.mural_avisos (autor_id, autor_nome, texto, todos)
  values (auth.uid(), p_autor_nome, p_texto, p_todos)
  returning * into v_aviso;

  if not p_todos and p_destinatarios is not null and array_length(p_destinatarios, 1) > 0 then
    insert into public.mural_aviso_destinatarios (aviso_id, user_id)
    select v_aviso.id, d
    from unnest(p_destinatarios) as d;
  end if;

  return v_aviso;
end;
$$;

revoke all on function public.mural_criar_aviso(text, text, boolean, uuid[]) from public, anon;
grant execute on function public.mural_criar_aviso(text, text, boolean, uuid[]) to authenticated;
