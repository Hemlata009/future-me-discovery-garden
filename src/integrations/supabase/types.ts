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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      counsellor_request_attempts: {
        Row: {
          created_at: string
          id: string
          visitor_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          visitor_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          visitor_hash?: string
        }
        Relationships: []
      }
      counsellor_requests: {
        Row: {
          consent: boolean
          contact_name: string
          created_at: string
          delivered: boolean
          delivered_at: string | null
          generated_project_id: string
          id: string
          language: string
          parent_brief_id: string | null
          phone: string
          referral_code: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          who: string
        }
        Insert: {
          consent: boolean
          contact_name: string
          created_at?: string
          delivered?: boolean
          delivered_at?: string | null
          generated_project_id: string
          id?: string
          language: string
          parent_brief_id?: string | null
          phone: string
          referral_code?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          who: string
        }
        Update: {
          consent?: boolean
          contact_name?: string
          created_at?: string
          delivered?: boolean
          delivered_at?: string | null
          generated_project_id?: string
          id?: string
          language?: string
          parent_brief_id?: string | null
          phone?: string
          referral_code?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          who?: string
        }
        Relationships: [
          {
            foreignKeyName: "counsellor_requests_generated_project_id_fkey"
            columns: ["generated_project_id"]
            isOneToOne: false
            referencedRelation: "generated_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsellor_requests_parent_brief_id_fkey"
            columns: ["parent_brief_id"]
            isOneToOne: false
            referencedRelation: "parent_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_responses: {
        Row: {
          build_idea: string
          created_at: string
          current_status: string
          custom_idea: string
          id: string
          interest: string
          matched_project: string | null
          preferred_language: string
          source: string
          technology: string
        }
        Insert: {
          build_idea?: string
          created_at?: string
          current_status?: string
          custom_idea?: string
          id?: string
          interest: string
          matched_project?: string | null
          preferred_language?: string
          source?: string
          technology?: string
        }
        Update: {
          build_idea?: string
          created_at?: string
          current_status?: string
          custom_idea?: string
          id?: string
          interest?: string
          matched_project?: string | null
          preferred_language?: string
          source?: string
          technology?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_responses_matched_project_fkey"
            columns: ["matched_project"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_projects: {
        Row: {
          class_status: string
          created_at: string
          custom_idea: string | null
          generated_content: Json
          id: string
          input_tokens: number | null
          interest: string
          language: string
          model: string | null
          output_tokens: number | null
          owner_visitor_hash: string | null
          project_type: string
          technology: string
        }
        Insert: {
          class_status: string
          created_at?: string
          custom_idea?: string | null
          generated_content: Json
          id?: string
          input_tokens?: number | null
          interest: string
          language: string
          model?: string | null
          output_tokens?: number | null
          owner_visitor_hash?: string | null
          project_type: string
          technology: string
        }
        Update: {
          class_status?: string
          created_at?: string
          custom_idea?: string | null
          generated_content?: Json
          id?: string
          input_tokens?: number | null
          interest?: string
          language?: string
          model?: string | null
          output_tokens?: number | null
          owner_visitor_hash?: string | null
          project_type?: string
          technology?: string
        }
        Relationships: []
      }
      generation_attempts: {
        Row: {
          created_at: string
          id: string
          visitor_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          visitor_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          visitor_hash?: string
        }
        Relationships: []
      }
      growth_events: {
        Row: {
          channel: string | null
          class_status: string | null
          created_at: string
          cta: string | null
          dedupe_key: string | null
          entry_page: string | null
          event_date: string
          event_name: string
          failure_kind: string | null
          generated_project_id: string | null
          id: string
          interest: string | null
          language: string | null
          parent_brief_id: string | null
          referral_code: string | null
          technology: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_hash: string
        }
        Insert: {
          channel?: string | null
          class_status?: string | null
          created_at?: string
          cta?: string | null
          dedupe_key?: string | null
          entry_page?: string | null
          event_date?: string
          event_name: string
          failure_kind?: string | null
          generated_project_id?: string | null
          id?: string
          interest?: string | null
          language?: string | null
          parent_brief_id?: string | null
          referral_code?: string | null
          technology?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_hash: string
        }
        Update: {
          channel?: string | null
          class_status?: string | null
          created_at?: string
          cta?: string | null
          dedupe_key?: string | null
          entry_page?: string | null
          event_date?: string
          event_name?: string
          failure_kind?: string | null
          generated_project_id?: string | null
          id?: string
          interest?: string | null
          language?: string | null
          parent_brief_id?: string | null
          referral_code?: string | null
          technology?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_events_parent_brief_id_fkey"
            columns: ["parent_brief_id"]
            isOneToOne: false
            referencedRelation: "parent_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      niat_interests: {
        Row: {
          contact: string
          created_at: string
          id: string
          message: string
          project_id: string | null
        }
        Insert: {
          contact?: string
          created_at?: string
          id?: string
          message?: string
          project_id?: string | null
        }
        Update: {
          contact?: string
          created_at?: string
          id?: string
          message?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "niat_interests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_briefs: {
        Row: {
          content: Json
          created_at: string
          generated_project_id: string
          id: string
          language: string
        }
        Insert: {
          content: Json
          created_at?: string
          generated_project_id: string
          id?: string
          language: string
        }
        Update: {
          content?: Json
          created_at?: string
          generated_project_id?: string
          id?: string
          language?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_briefs_generated_project_id_fkey"
            columns: ["generated_project_id"]
            isOneToOne: false
            referencedRelation: "generated_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_question_attempts: {
        Row: {
          created_at: string
          id: string
          parent_brief_id: string
          visitor_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_brief_id: string
          visitor_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_brief_id?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_question_attempts_parent_brief_id_fkey"
            columns: ["parent_brief_id"]
            isOneToOne: false
            referencedRelation: "parent_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_shares: {
        Row: {
          channel: string
          created_at: string
          id: string
          project_id: string | null
          referrer_code: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          project_id?: string | null
          referrer_code?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          project_id?: string | null
          referrer_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          author: string
          category: string
          created_at: string
          description: string
          goal: string
          icon: string
          id: string
          image_asset: string
          initials: string
          is_published: boolean
          roadmap: string[]
          sort_order: number
          technologies: string[]
          title: string
          tone: string
          updated_at: string
        }
        Insert: {
          author?: string
          category: string
          created_at?: string
          description: string
          goal?: string
          icon?: string
          id: string
          image_asset?: string
          initials?: string
          is_published?: boolean
          roadmap?: string[]
          sort_order?: number
          technologies?: string[]
          title: string
          tone?: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          created_at?: string
          description?: string
          goal?: string
          icon?: string
          id?: string
          image_asset?: string
          initials?: string
          is_published?: boolean
          roadmap?: string[]
          sort_order?: number
          technologies?: string[]
          title?: string
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_invitations: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          project_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_links: {
        Row: {
          code: string
          created_at: string
          generated_project_id: string
          owner_visitor_hash: string
        }
        Insert: {
          code: string
          created_at?: string
          generated_project_id: string
          owner_visitor_hash: string
        }
        Update: {
          code?: string
          created_at?: string
          generated_project_id?: string
          owner_visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_links_generated_project_id_fkey"
            columns: ["generated_project_id"]
            isOneToOne: false
            referencedRelation: "generated_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_visits: {
        Row: {
          code: string
          created_at: string
          id: string
          project_id: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          project_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_attribution: {
        Row: {
          entry_page: string | null
          first_seen_at: string
          referral_code: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_hash: string
        }
        Insert: {
          entry_page?: string | null
          first_seen_at?: string
          referral_code?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_hash: string
        }
        Update: {
          entry_page?: string | null
          first_seen_at?: string
          referral_code?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_hash?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          id: string
          path: string
          referrer_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          path?: string
          referrer_code?: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          referrer_code?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_counsellor_request_slot: {
        Args: {
          _generated_project_id: string
          _global_per_day?: number
          _phone: string
          _visitor_hash: string
          _visitor_limit?: number
          _visitor_window_seconds?: number
        }
        Returns: Json
      }
      claim_generation_slot: {
        Args: {
          _daily_token_limit: number
          _global_per_day: number
          _global_per_minute: number
          _visitor_hash: string
          _visitor_limit: number
          _visitor_window_seconds: number
        }
        Returns: Json
      }
      claim_parent_question: {
        Args: { _brief_id: string; _limit?: number; _visitor_hash: string }
        Returns: Json
      }
      growth_report: {
        Args: {
          _class_status?: string
          _from: string
          _interest?: string
          _language?: string
          _technology?: string
          _to: string
          _utm_campaign?: string
          _utm_medium?: string
          _utm_source?: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_expired_growth_data: {
        Args: {
          _attempt_days?: number
          _counsellor_days?: number
          _event_days?: number
        }
        Returns: Json
      }
      record_growth_event: {
        Args: {
          _channel?: string
          _class_status?: string
          _cta?: string
          _entry_page?: string
          _event: string
          _failure_kind?: string
          _generated_project_id?: string
          _interest?: string
          _language?: string
          _parent_brief_id?: string
          _referral_code?: string
          _technology?: string
          _utm_campaign?: string
          _utm_medium?: string
          _utm_source?: string
          _visitor_hash: string
        }
        Returns: string
      }
      referral_journey_report: {
        Args: {
          _from: string
          _to: string
          _utm_campaign?: string
          _utm_medium?: string
          _utm_source?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "student"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "student"],
    },
  },
} as const
