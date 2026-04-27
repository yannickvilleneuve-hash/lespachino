export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_user: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          invited_by: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          invited_by?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          invited_by?: string | null;
        };
        Relationships: [];
      };
      lead: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          ip_hash: string | null;
          message: string;
          name: string;
          phone: string | null;
          unit: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          ip_hash?: string | null;
          message?: string;
          name: string;
          phone?: string | null;
          unit: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          ip_hash?: string | null;
          message?: string;
          name?: string;
          phone?: string | null;
          unit?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      listing: {
        Row: {
          channels: string[];
          created_at: string;
          description_fr: string;
          hidden: boolean;
          is_published: boolean;
          price_cad: number;
          unit: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          channels?: string[];
          created_at?: string;
          description_fr?: string;
          hidden?: boolean;
          is_published?: boolean;
          price_cad?: number;
          unit: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          channels?: string[];
          created_at?: string;
          description_fr?: string;
          hidden?: boolean;
          is_published?: boolean;
          price_cad?: number;
          unit?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      view_event: {
        Row: {
          created_at: string;
          id: string;
          ip_hash: string | null;
          referrer: string | null;
          unit: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          referrer?: string | null;
          unit: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          referrer?: string | null;
          unit?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      vehicle_photo: {
        Row: {
          id: string;
          is_hero: boolean;
          position: number;
          storage_path: string;
          unit: string;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          id?: string;
          is_hero?: boolean;
          position?: number;
          storage_path: string;
          unit: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          id?: string;
          is_hero?: boolean;
          position?: number;
          storage_path?: string;
          unit?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
