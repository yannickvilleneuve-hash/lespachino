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
      listing: {
        Row: {
          channels: string[];
          created_at: string;
          description_fr: string;
          is_published: boolean;
          price_cad: number;
          updated_at: string;
          updated_by: string | null;
          vin: string;
        };
        Insert: {
          channels?: string[];
          created_at?: string;
          description_fr?: string;
          is_published?: boolean;
          price_cad?: number;
          updated_at?: string;
          updated_by?: string | null;
          vin: string;
        };
        Update: {
          channels?: string[];
          created_at?: string;
          description_fr?: string;
          is_published?: boolean;
          price_cad?: number;
          updated_at?: string;
          updated_by?: string | null;
          vin?: string;
        };
        Relationships: [];
      };
      vehicle_photo: {
        Row: {
          id: string;
          is_hero: boolean;
          position: number;
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string | null;
          vin: string;
        };
        Insert: {
          id?: string;
          is_hero?: boolean;
          position?: number;
          storage_path: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          vin: string;
        };
        Update: {
          id?: string;
          is_hero?: boolean;
          position?: number;
          storage_path?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          vin?: string;
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
