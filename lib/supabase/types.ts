export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
          user_email: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_email?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      app_user: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          invited_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          invited_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          invited_by?: string | null
        }
        Relationships: []
      }
      bot_event: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          lespac_id: string | null
          outcome: string
          platform: string | null
          screenshot_path: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          lespac_id?: string | null
          outcome: string
          platform?: string | null
          screenshot_path?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          lespac_id?: string | null
          outcome?: string
          platform?: string | null
          screenshot_path?: string | null
        }
        Relationships: []
      }
      bot_setting: {
        Row: {
          enabled_platforms: string[]
          id: number
          max_jobs_per_cycle: number
          operator_email: string
          pace_max_ms: number
          pace_min_ms: number
          sync_interval_sec: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled_platforms?: string[]
          id?: number
          max_jobs_per_cycle?: number
          operator_email?: string
          pace_max_ms?: number
          pace_min_ms?: number
          sync_interval_sec?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled_platforms?: string[]
          id?: number
          max_jobs_per_cycle?: number
          operator_email?: string
          pace_max_ms?: number
          pace_min_ms?: number
          sync_interval_sec?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      catalog_photo: {
        Row: {
          position: number
          source_url: string
          storage_path: string | null
          vehicle_id: string
        }
        Insert: {
          position: number
          source_url: string
          storage_path?: string | null
          vehicle_id: string
        }
        Update: {
          position?: number
          source_url?: string
          storage_path?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_photo_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "catalog_vehicle"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sync: {
        Row: {
          count: number
          error: string | null
          id: number
          ok: boolean
          ran_at: string
        }
        Insert: {
          count?: number
          error?: string | null
          id?: number
          ok?: boolean
          ran_at?: string
        }
        Update: {
          count?: number
          error?: string | null
          id?: number
          ok?: boolean
          ran_at?: string
        }
        Relationships: []
      }
      catalog_vehicle: {
        Row: {
          detail_fetched_at: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          payload: Json
          sold_at: string | null
          status: string
        }
        Insert: {
          detail_fetched_at?: string | null
          first_seen_at?: string
          id: string
          last_seen_at?: string
          payload: Json
          sold_at?: string | null
          status?: string
        }
        Update: {
          detail_fetched_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          payload?: Json
          sold_at?: string | null
          status?: string
        }
        Relationships: []
      }
      lead: {
        Row: {
          assigned_to_email: string | null
          closed_at: string | null
          created_at: string
          email: string | null
          id: string
          ip_hash: string | null
          last_contacted_at: string | null
          message: string
          name: string
          next_follow_up_at: string | null
          notes: string
          phone: string | null
          status: string
          unit: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          assigned_to_email?: string | null
          closed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_hash?: string | null
          last_contacted_at?: string | null
          message?: string
          name: string
          next_follow_up_at?: string | null
          notes?: string
          phone?: string | null
          status?: string
          unit: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          assigned_to_email?: string | null
          closed_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_hash?: string | null
          last_contacted_at?: string | null
          message?: string
          name?: string
          next_follow_up_at?: string | null
          notes?: string
          phone?: string | null
          status?: string
          unit?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      lespac_listing: {
        Row: {
          content_hash: string
          created_at: string
          description: string
          first_seen: string
          last_seen: string
          lespac_id: string
          photo_urls: string[]
          price_cad: number | null
          raw: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          description?: string
          first_seen?: string
          last_seen?: string
          lespac_id: string
          photo_urls?: string[]
          price_cad?: number | null
          raw?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          description?: string
          first_seen?: string
          last_seen?: string
          lespac_id?: string
          photo_urls?: string[]
          price_cad?: number | null
          raw?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing: {
        Row: {
          channels: string[]
          created_at: string
          description_fr: string
          hidden: boolean
          is_published: boolean
          price_cad: number
          unit: string
          updated_at: string
          updated_by: string | null
          walkaround_video_url: string | null
        }
        Insert: {
          channels?: string[]
          created_at?: string
          description_fr?: string
          hidden?: boolean
          is_published?: boolean
          price_cad?: number
          unit: string
          updated_at?: string
          updated_by?: string | null
          walkaround_video_url?: string | null
        }
        Update: {
          channels?: string[]
          created_at?: string
          description_fr?: string
          hidden?: boolean
          is_published?: boolean
          price_cad?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
          walkaround_video_url?: string | null
        }
        Relationships: []
      }
      listing_channel_state: {
        Row: {
          channel: string
          external_id: string | null
          external_url: string | null
          last_error: string | null
          last_status: string | null
          last_synced_at: string | null
          unit: string
        }
        Insert: {
          channel: string
          external_id?: string | null
          external_url?: string | null
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          unit: string
        }
        Update: {
          channel?: string
          external_id?: string | null
          external_url?: string | null
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          unit?: string
        }
        Relationships: []
      }
      photo_session: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          max_uploads: number
          token: string
          unit: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          max_uploads?: number
          token: string
          unit: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          max_uploads?: number
          token?: string
          unit?: string
          used_count?: number
        }
        Relationships: []
      }
      platform_publication: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          external_id: string | null
          external_url: string | null
          id: string
          last_action: string | null
          last_attempt_at: string | null
          last_success_at: string | null
          lespac_id: string
          platform: string
          published_hash: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          last_action?: string | null
          last_attempt_at?: string | null
          last_success_at?: string | null
          lespac_id: string
          platform: string
          published_hash?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          last_action?: string | null
          last_attempt_at?: string | null
          last_success_at?: string | null
          lespac_id?: string
          platform?: string
          published_hash?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_publication_lespac_id_fkey"
            columns: ["lespac_id"]
            isOneToOne: false
            referencedRelation: "lespac_listing"
            referencedColumns: ["lespac_id"]
          },
        ]
      }
      platform_session: {
        Row: {
          created_at: string
          health: string
          last_error: string | null
          last_validated_at: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          health?: string
          last_error?: string | null
          last_validated_at?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          health?: string
          last_error?: string | null
          last_validated_at?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      publication_job: {
        Row: {
          action: string
          attempts: number
          channel: string
          completed_at: string | null
          created_at: string
          created_by_email: string | null
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          started_at: string | null
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          action: string
          attempts?: number
          channel: string
          completed_at?: string | null
          created_at?: string
          created_by_email?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          started_at?: string | null
          status?: string
          unit: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by_email?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          started_at?: string | null
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_photo: {
        Row: {
          id: string
          is_hero: boolean
          position: number
          storage_path: string
          unit: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          id?: string
          is_hero?: boolean
          position?: number
          storage_path: string
          unit: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          id?: string
          is_hero?: boolean
          position?: number
          storage_path?: string
          unit?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      view_event: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          referrer: string | null
          unit: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          referrer?: string | null
          unit: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          referrer?: string | null
          unit?: string
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_photo_session_upload: {
        Args: { p_token: string }
        Returns: {
          created_by: string
          expires_at: string
          max_uploads: number
          unit: string
          used_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
