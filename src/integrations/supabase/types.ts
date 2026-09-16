export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      mural_usuarios: {
        Row: {
          id: string;
          nome: string;
          ativo: boolean;
          admin: boolean;
          criado_em: string;
        };
        Insert: {
          id: string;
          nome: string;
          ativo?: boolean;
          admin?: boolean;
          criado_em?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          ativo?: boolean;
          admin?: boolean;
          criado_em?: string;
        };
        Relationships: [];
      };
      mural_avisos: {
        Row: {
          id: string;
          autor_id: string;
          autor_nome: string;
          texto: string;
          fixado: boolean;
          todos: boolean;
          criado_em: string;
          editado_em: string | null;
        };
        Insert: {
          id?: string;
          autor_id: string;
          autor_nome: string;
          texto: string;
          fixado?: boolean;
          todos?: boolean;
          criado_em?: string;
          editado_em?: string | null;
        };
        Update: {
          id?: string;
          autor_id?: string;
          autor_nome?: string;
          texto?: string;
          fixado?: boolean;
          todos?: boolean;
          criado_em?: string;
          editado_em?: string | null;
        };
        Relationships: [];
      };
      mural_aviso_destinatarios: {
        Row: {
          aviso_id: string;
          user_id: string;
        };
        Insert: {
          aviso_id: string;
          user_id: string;
        };
        Update: {
          aviso_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      mural_aviso_leituras: {
        Row: {
          aviso_id: string;
          user_id: string;
          lida_em: string;
        };
        Insert: {
          aviso_id: string;
          user_id: string;
          lida_em?: string;
        };
        Update: {
          aviso_id?: string;
          user_id?: string;
          lida_em?: string;
        };
        Relationships: [];
      };
      mural_aviso_comentarios: {
        Row: {
          id: string;
          aviso_id: string;
          autor_id: string;
          autor_nome: string;
          texto: string;
          criado_em: string;
        };
        Insert: {
          id?: string;
          aviso_id: string;
          autor_id: string;
          autor_nome: string;
          texto: string;
          criado_em?: string;
        };
        Update: {
          id?: string;
          aviso_id?: string;
          autor_id?: string;
          autor_nome?: string;
          texto?: string;
          criado_em?: string;
        };
        Relationships: [];
      };
      mural_tarefas: {
        Row: {
          id: string;
          user_id: string;
          texto: string;
          feita: boolean;
          ordem: number;
          notas: string | null;
          etapas: Json;
          criado_em: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          texto: string;
          feita?: boolean;
          ordem?: number;
          notas?: string | null;
          etapas?: Json;
          criado_em?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          texto?: string;
          feita?: boolean;
          ordem?: number;
          notas?: string | null;
          etapas?: Json;
          criado_em?: string;
        };
        Relationships: [];
      };
      mural_push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          criado_em: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          criado_em?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          criado_em?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
