import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pin, PinOff, Pencil, Trash2, Send, Loader2, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { notifyNewAviso } from "@/lib/mural.functions";
import { playNotificationPing } from "@/lib/sound";
import { corDoUsuario } from "@/lib/colors";
import type { MuralAccess } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Aviso = {
  id: string;
  autor_id: string;
  autor_nome: string;
  texto: string;
  fixado: boolean;
  todos: boolean;
  criado_em: string;
  editado_em: string | null;
};

type UsuarioAtivo = { id: string; nome: string };
type Comentario = {
  id: string;
  aviso_id: string;
  autor_id: string;
  autor_nome: string;
  texto: string;
  criado_em: string;
};

function initials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || nome;
}

export function MuralTab({ access }: { access: MuralAccess }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [enviarPara, setEnviarPara] = useState<"todos" | "individual">("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Aviso | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [toDelete, setToDelete] = useState<Aviso | null>(null);
  const [comentariosAbertos, setComentariosAbertos] = useState<Set<string>>(new Set());
  const [rascunhoComentario, setRascunhoComentario] = useState<Record<string, string>>({});
  const notifyFn = useServerFn(notifyNewAviso);
  const lastSeenId = useRef<string | null>(null);

  const avisosQuery = useQuery({
    queryKey: ["mural-avisos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_avisos")
        .select("*")
        .order("fixado", { ascending: false })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as Aviso[];
    },
  });

  const avisos = avisosQuery.data ?? [];
  const avisoIdsKey = useMemo(() => avisos.map((a) => a.id).join(","), [avisos]);

  const usuariosQuery = useQuery({
    queryKey: ["mural-usuarios-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mural_usuarios").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as UsuarioAtivo[];
    },
  });

  const leiturasQuery = useQuery({
    queryKey: ["mural-leituras", avisoIdsKey],
    enabled: avisos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_aviso_leituras")
        .select("aviso_id, user_id")
        .in("aviso_id", avisos.map((a) => a.id));
      if (error) throw error;
      const map: Record<string, Set<string>> = {};
      (data ?? []).forEach((r) => {
        (map[r.aviso_id] ??= new Set()).add(r.user_id);
      });
      return map;
    },
  });

  const destinatariosQuery = useQuery({
    queryKey: ["mural-destinatarios", avisoIdsKey],
    enabled: avisos.some((a) => !a.todos),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_aviso_destinatarios")
        .select("aviso_id, user_id")
        .in("aviso_id", avisos.filter((a) => !a.todos).map((a) => a.id));
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r) => {
        (map[r.aviso_id] ??= []).push(r.user_id);
      });
      return map;
    },
  });

  const comentariosQuery = useQuery({
    queryKey: ["mural-comentarios", avisoIdsKey],
    enabled: avisos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_aviso_comentarios")
        .select("*")
        .in("aviso_id", avisos.map((a) => a.id))
        .order("criado_em", { ascending: true });
      if (error) throw error;
      const map: Record<string, Comentario[]> = {};
      (data ?? []).forEach((c) => {
        (map[c.aviso_id] ??= []).push(c as Comentario);
      });
      return map;
    },
  });

  // Marca como lidas (ao vivo, pra quem enviou ver) as mensagens que não
  // são minhas — só de abrir o Mural e a lista carregar já conta como
  // "vi a mensagem".
  useEffect(() => {
    if (!access.userId || avisos.length === 0) return;
    const linhas = avisos
      .filter((a) => a.autor_id !== access.userId)
      .map((a) => ({ aviso_id: a.id, user_id: access.userId as string }));
    if (linhas.length === 0) return;
    supabase
      .from("mural_aviso_leituras")
      .upsert(linhas, { onConflict: "aviso_id,user_id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) console.error("[mural] falha ao marcar leitura", error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisoIdsKey, access.userId]);

  // Realtime: aviso novo, comentário novo e leitura nova atualizam a tela
  // ao vivo (inclusive "quem já leu" pra quem enviou o aviso).
  useEffect(() => {
    const channel = supabase
      .channel("mural-avisos-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mural_avisos" },
        (payload) => {
          const novo = payload.new as Aviso;
          qc.invalidateQueries({ queryKey: ["mural-avisos"] });
          if (novo.id !== lastSeenId.current && novo.autor_id !== access.userId) {
            playNotificationPing();
            toast(`Novo aviso de ${novo.autor_nome}`, { description: novo.texto.slice(0, 120) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mural_avisos" },
        () => qc.invalidateQueries({ queryKey: ["mural-avisos"] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mural_aviso_leituras" },
        () => qc.invalidateQueries({ queryKey: ["mural-leituras"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mural_aviso_comentarios" },
        () => qc.invalidateQueries({ queryKey: ["mural-comentarios"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.userId]);

  function toggleSelecionado(id: string, marcado: boolean) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  const postar = useMutation({
    mutationFn: async () => {
      const conteudo = texto.trim();
      if (!conteudo) throw new Error("Escreva algo antes de publicar.");
      const todos = enviarPara === "todos";
      const destinatarios = todos ? null : Array.from(selecionados);
      if (!todos && (!destinatarios || destinatarios.length === 0)) {
        throw new Error('Selecione ao menos uma pessoa, ou marque "Enviar para todos".');
      }

      const { data, error } = await supabase
        .from("mural_avisos")
        .insert({ autor_id: access.userId as string, autor_nome: access.nome, texto: conteudo, todos })
        .select()
        .single();
      if (error) throw error;

      if (!todos && destinatarios && destinatarios.length > 0) {
        const { error: destError } = await supabase
          .from("mural_aviso_destinatarios")
          .insert(destinatarios.map((id) => ({ aviso_id: data.id, user_id: id })));
        if (destError) {
          await supabase.from("mural_avisos").delete().eq("id", data.id);
          throw destError;
        }
      }

      lastSeenId.current = data.id;
      // Dispara o push só pra quem deve ver; se falhar, não atrapalha o post.
      notifyFn({ data: { avisoId: data.id, autorNome: access.nome, texto: conteudo, destinatarios } }).catch(
        () => undefined,
      );
      return data;
    },
    onSuccess: () => {
      setTexto("");
      setSelecionados(new Set());
      setEnviarPara("todos");
      qc.invalidateQueries({ queryKey: ["mural-avisos"] });
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível publicar"),
  });

  const alternarFixado = useMutation({
    mutationFn: async (aviso: Aviso) => {
      const { error } = await supabase
        .from("mural_avisos")
        .update({ fixado: !aviso.fixado })
        .eq("id", aviso.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-avisos"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("mural_avisos")
        .update({ texto: editTexto.trim(), editado_em: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["mural-avisos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mural_avisos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["mural-avisos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const comentar = useMutation({
    mutationFn: async ({ avisoId, texto: conteudo }: { avisoId: string; texto: string }) => {
      const limpo = conteudo.trim();
      if (!limpo) return;
      const { error } = await supabase.from("mural_aviso_comentarios").insert({
        aviso_id: avisoId,
        autor_id: access.userId as string,
        autor_nome: access.nome,
        texto: limpo,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      setRascunhoComentario((s) => ({ ...s, [vars.avisoId]: "" }));
      qc.invalidateQueries({ queryKey: ["mural-comentarios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function toggleComentarios(avisoId: string) {
    setComentariosAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(avisoId)) proximo.delete(avisoId);
      else proximo.add(avisoId);
      return proximo;
    });
  }

  function alvosDoAviso(aviso: Aviso): string[] {
    if (aviso.todos) {
      return (usuariosQuery.data ?? []).map((u) => u.id).filter((id) => id !== aviso.autor_id);
    }
    return destinatariosQuery.data?.[aviso.id] ?? [];
  }

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    (usuariosQuery.data ?? []).forEach((u) => m.set(u.id, u.nome));
    return m;
  }, [usuariosQuery.data]);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <Textarea
          placeholder="Escreva um aviso, instrução ou combine uma reunião com a equipe..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
        />

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={enviarPara === "todos"}
              onCheckedChange={(v) => setEnviarPara(v ? "todos" : "individual")}
            />
            <Users className="w-4 h-4 text-muted-foreground" />
            Enviar para todos
          </label>

          {enviarPara === "individual" && (
            <div className="flex flex-wrap gap-2 pl-1">
              {(usuariosQuery.data ?? [])
                .filter((u) => u.id !== access.userId)
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-xs panel px-2 py-1 cursor-pointer">
                    <Checkbox
                      checked={selecionados.has(u.id)}
                      onCheckedChange={(v) => toggleSelecionado(u.id, !!v)}
                    />
                    {u.nome}
                  </label>
                ))}
              {(usuariosQuery.data ?? []).filter((u) => u.id !== access.userId).length === 0 && (
                <span className="text-xs text-muted-foreground">Ninguém mais ativo no Mural ainda.</span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-3">
          <Button onClick={() => postar.mutate()} disabled={postar.isPending || !texto.trim()}>
            {postar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publicar no mural
          </Button>
        </div>
      </div>

      {avisosQuery.isLoading && <p className="text-sm text-muted-foreground text-center py-8">Carregando avisos...</p>}
      {!avisosQuery.isLoading && avisos.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum aviso ainda. Seja o primeiro a postar!</p>
      )}

      <div className="space-y-3">
        {avisos.map((aviso) => {
          const podeGerenciar = aviso.autor_id === access.userId || access.admin;
          const souAutor = aviso.autor_id === access.userId;
          const alvos = alvosDoAviso(aviso);
          const lidos = leiturasQuery.data?.[aviso.id] ?? new Set<string>();
          const comentarios = comentariosQuery.data?.[aviso.id] ?? [];
          const comentariosAberto = comentariosAbertos.has(aviso.id);

          return (
            <div key={aviso.id} className={`panel p-4 ${aviso.fixado ? "border-gold" : ""}`}>
              <div className="flex items-start gap-3">
                <Avatar style={{ boxShadow: `0 0 0 2px ${corDoUsuario(aviso.autor_id)}` }}>
                  <AvatarFallback
                    className="font-semibold"
                    style={{ color: corDoUsuario(aviso.autor_id) }}
                  >
                    {initials(aviso.autor_nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold" style={{ color: corDoUsuario(aviso.autor_id) }}>
                      {aviso.autor_nome}
                    </span>
                    {aviso.fixado && (
                      <Badge variant="outline" className="text-gold border-gold gap-1">
                        <Pin className="w-3 h-3" /> Fixado
                      </Badge>
                    )}
                    {!aviso.todos && (
                      <Badge variant="outline" className="gap-1">
                        <Users className="w-3 h-3" /> Só para {alvos.length} pessoa(s)
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(aviso.criado_em), { addSuffix: true, locale: ptBR })}
                      {aviso.editado_em ? " · editado" : ""}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-foreground/80 font-normal">
                    {aviso.texto}
                  </p>

                  {souAutor && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {alvos.filter((id) => lidos.has(id)).length}/{alvos.length} leram
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {alvos.map((id) => {
                          const leu = lidos.has(id);
                          const nome = nomePorId.get(id) ?? "...";
                          return (
                            <span
                              key={id}
                              title={`${nome} ${leu ? "· leu" : "· ainda não leu"}`}
                              className={`px-1.5 py-0.5 rounded-full text-[10px] border ${
                                leu
                                  ? "bg-gold/15 border-gold text-gold"
                                  : "bg-muted border-border text-muted-foreground opacity-60"
                              }`}
                            >
                              {primeiroNome(nome)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
                    onClick={() => toggleComentarios(aviso.id)}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {comentarios.length > 0 ? `${comentarios.length} comentário(s)` : "Comentar"}
                  </button>

                  {comentariosAberto && (
                    <div className="mt-2 pl-3 border-l border-border space-y-2">
                      {comentarios.map((c) => (
                        <div key={c.id} className="text-sm">
                          <span className="font-bold" style={{ color: corDoUsuario(c.autor_id) }}>
                            {c.autor_nome}
                          </span>{" "}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(c.criado_em), { addSuffix: true, locale: ptBR })}
                          </span>
                          <p className="whitespace-pre-wrap break-words text-[13px] text-foreground/80 font-normal">
                            {c.texto}
                          </p>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Escreva um comentário..."
                          value={rascunhoComentario[aviso.id] ?? ""}
                          onChange={(e) =>
                            setRascunhoComentario((s) => ({ ...s, [aviso.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              comentar.mutate({ avisoId: aviso.id, texto: rascunhoComentario[aviso.id] ?? "" });
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            comentar.mutate({ avisoId: aviso.id, texto: rascunhoComentario[aviso.id] ?? "" })
                          }
                          disabled={!rascunhoComentario[aviso.id]?.trim()}
                        >
                          Enviar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {podeGerenciar && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {access.admin && (
                        <DropdownMenuItem onClick={() => alternarFixado.mutate(aviso)}>
                          {aviso.fixado ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                          {aviso.fixado ? "Desafixar" : "Fixar no topo"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(aviso);
                          setEditTexto(aviso.texto);
                        }}
                      >
                        <Pencil className="w-4 h-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setToDelete(aviso)} className="text-destructive">
                        <Trash2 className="w-4 h-4" /> Apagar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar aviso</AlertDialogTitle>
          </AlertDialogHeader>
          <Textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)} rows={4} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => salvarEdicao.mutate()} disabled={!editTexto.trim()}>
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este aviso?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && apagar.mutate(toDelete.id)}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
