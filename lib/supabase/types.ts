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
      activity_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json;
          id: string;
          target_id: string | null;
          target_type: string | null;
          user_email: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json;
          id?: string;
          target_id?: string | null;
          target_type?: string | null;
          user_email?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json;
          id?: string;
          target_id?: string | null;
          target_type?: string | null;
          user_email?: string | null;
        };
        Relationships: [];
      };
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
          assigned_to_email: string | null;
          closed_at: string | null;
          email: string | null;
          id: string;
          ip_hash: string | null;
          last_contacted_at: string | null;
          message: string;
          name: string;
          next_follow_up_at: string | null;
          notes: string;
          phone: string | null;
          status: string;
          unit: string;
          updated_at: string;
          user_agent: string | null;
        };
        Insert: {
          assigned_to_email?: string | null;
          closed_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          ip_hash?: string | null;
          last_contacted_at?: string | null;
          message?: string;
          name: string;
          next_follow_up_at?: string | null;
          notes?: string;
          phone?: string | null;
          status?: string;
          unit: string;
          updated_at?: string;
          user_agent?: string | null;
        };
        Update: {
          assigned_to_email?: string | null;
          closed_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          ip_hash?: string | null;
          last_contacted_at?: string | null;
          message?: string;
          name?: string;
          next_follow_up_at?: string | null;
          notes?: string;
          phone?: string | null;
          status?: string;
          unit?: string;
          updated_at?: string;
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
      listing_channel_state: {
        Row: {
          channel: string;
          external_id: string | null;
          external_url: string | null;
          last_error: string | null;
          last_status: string | null;
          last_synced_at: string | null;
          unit: string;
        };
        Insert: {
          channel: string;
          external_id?: string | null;
          external_url?: string | null;
          last_error?: string | null;
          last_status?: string | null;
          last_synced_at?: string | null;
          unit: string;
        };
        Update: {
          channel?: string;
          external_id?: string | null;
          external_url?: string | null;
          last_error?: string | null;
          last_status?: string | null;
          last_synced_at?: string | null;
          unit?: string;
        };
        Relationships: [];
      };
      photo_session: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string;
          max_uploads: number;
          token: string;
          unit: string;
          used_count: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          max_uploads?: number;
          token: string;
          unit: string;
          used_count?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          max_uploads?: number;
          token?: string;
          unit?: string;
          used_count?: number;
        };
        Relationships: [];
      };
      publication_job: {
        Row: {
          action: string;
          attempts: number;
          channel: string;
          completed_at: string | null;
          created_at: string;
          created_by_email: string | null;
          id: string;
          last_error: string | null;
          max_attempts: number;
          next_retry_at: string | null;
          payload: Json;
          started_at: string | null;
          status: string;
          unit: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          attempts?: number;
          channel: string;
          completed_at?: string | null;
          created_at?: string;
          created_by_email?: string | null;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_retry_at?: string | null;
          payload?: Json;
          started_at?: string | null;
          status?: string;
          unit: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          attempts?: number;
          channel?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by_email?: string | null;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_retry_at?: string | null;
          payload?: Json;
          started_at?: string | null;
          status?: string;
          unit?: string;
          updated_at?: string;
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
      claim_photo_session_upload: {
        Args: { p_token: string };
        Returns: {
          unit: string;
          expires_at: string;
          max_uploads: number;
          used_count: number;
          created_by: string | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
