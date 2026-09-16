import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Settings, Trash2, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { adminAddUsuario } from "@/lib/mural.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Usuario = {
  id: string;
  nome: string;
  ativo: boolean;
  admin: boolean;
};

export function AdminUsuariosDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [comoAdmin, setComoAdmin] = useState(false);
  const addUsuarioFn = useServerFn(adminAddUsuario);

  const usuariosQuery = useQuery({
    queryKey: ["mural-usuarios"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("mural_usuarios").select("*").order("nome");
      if (error) throw error;
      return data as Usuario[];
    },
  });

  const adicionar = useMutation({
    mutationFn: async () => {
      await addUsuarioFn({ data: { email, nome, admin: comoAdmin } });
    },
    onSuccess: () => {
      toast.success("Pessoa adicionada ao Mural!");
      setEmail("");
      setNome("");
      setComoAdmin(false);
      qc.invalidateQueries({ queryKey: ["mural-usuarios"] });
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível adicionar"),
  });

  const alternarAtivo = useMutation({
    mutationFn: async (u: Usuario) => {
      const { error } = await supabase.from("mural_usuarios").update({ ativo: !u.ativo }).eq("id", u.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-usuarios"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const alternarAdmin = useMutation({
    mutationFn: async (u: Usuario) => {
      const { error } = await supabase.from("mural_usuarios").update({ admin: !u.admin }).eq("id", u.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-usuarios"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mural_usuarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mural-usuarios"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4" /> Gerenciar acesso
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quem tem acesso ao Mural</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {usuariosQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {(usuariosQuery.data ?? []).map((u) => (
            <div key={u.id} className="flex items-center gap-2 panel p-2">
              <span className="flex-1 text-sm">{u.nome}</span>
              {u.admin && <Badge variant="outline" className="text-gold border-gold">admin</Badge>}
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox checked={u.admin} onCheckedChange={() => alternarAdmin.mutate(u)} /> admin
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox checked={u.ativo} onCheckedChange={() => alternarAtivo.mutate(u)} /> ativo
              </label>
              <Button variant="ghost" size="icon" onClick={() => remover.mutate(u.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-sm font-medium">Adicionar pessoa (precisa já ter login em alguma ferramenta QGO)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="admin-email">E-mail</Label>
              <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="admin-nome">Nome a exibir</Label>
              <Input id="admin-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={comoAdmin} onCheckedChange={(v) => setComoAdmin(!!v)} /> Também é administrador do Mural
          </label>
          <Button
            className="w-full"
            onClick={() => adicionar.mutate()}
            disabled={adicionar.isPending || !email.trim() || !nome.trim()}
          >
            {adicionar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Adicionar ao Mural
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
