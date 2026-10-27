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
    PostgrestVersion: "13.0.5"
  }
  app: {
    Tables: {
      account_negative_periods: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_type"]
          days_count: number
          ended_on: string | null
          id: string
          min_balance: number | null
          project_id: string
          started_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: Database["public"]["Enums"]["currency_type"]
          days_count?: number
          ended_on?: string | null
          id?: string
          min_balance?: number | null
          project_id: string
          started_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_type"]
          days_count?: number
          ended_on?: string | null
          id?: string
          min_balance?: number | null
          project_id?: string
          started_on?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_negative_periods: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_type"]
          days_count: number
          ended_on: string | null
          id: string
          min_balance: number | null
          project_id: string
          started_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: Database["public"]["Enums"]["currency_type"]
          days_count?: number
          ended_on?: string | null
          id?: string
          min_balance?: number | null
          project_id: string
          started_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_type"]
          days_count?: number
          ended_on?: string | null
          id?: string
          min_balance?: number | null
          project_id?: string
          started_on?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          app_id: string
          app_version: string
          build_number: string | null
          created_at: string
          device_id: string | null
          device_model: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          locale: string | null
          os_version: string | null
          platform: string
          user_id: string
        }
        Insert: {
          app_id: string
          app_version: string
          build_number?: string | null
          created_at?: string
          device_id?: string | null
          device_model?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          locale?: string | null
          os_version?: string | null
          platform: string
          user_id: string
        }
        Update: {
          app_id?: string
          app_version?: string
          build_number?: string | null
          created_at?: string
          device_id?: string | null
          device_model?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          locale?: string | null
          os_version?: string | null
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_account_sums: {
        Row: {
          balance: number | null
          currency: Database["public"]["Enums"]["currency_type"] | null
          project_id: string | null
        }
        Relationships: []
      }
      v_accounts_in_minus: {
        Row: {
          currency: Database["public"]["Enums"]["currency_type"] | null
          days_in_minus: number | null
          min_balance: number | null
          project_id: string | null
          started_on: string | null
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_type"] | null
          days_in_minus?: never
          min_balance?: number | null
          project_id?: string | null
          started_on?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_type"] | null
          days_in_minus?: never
          min_balance?: number | null
          project_id?: string | null
          started_on?: string | null
        }
        Relationships: []
      }
      v_projects_in_minus: {
        Row: {
          currency: Database["public"]["Enums"]["currency_type"] | null
          days_in_minus: number | null
          min_balance: number | null
          project_id: string | null
          started_on: string | null
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_type"] | null
          days_in_minus?: never
          min_balance?: number | null
          project_id?: string | null
          started_on?: string | null
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_type"] | null
          days_in_minus?: never
          min_balance?: number | null
          project_id?: string | null
          started_on?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      tick_account_negative_periods: { Args: never; Returns: undefined }
      tick_negative_periods: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  boq: {
    Tables: {
      items: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          quantity: number
          sort_order: number
          unit: string
          unit_price: number | null
          work_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          quantity?: number
          sort_order?: number
          unit: string
          unit_price?: number | null
          work_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          quantity?: number
          sort_order?: number
          unit?: string
          unit_price?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      template_items: {
        Row: {
          created_at: string
          default_quantity: number
          default_unit_price: number | null
          id: string
          name: string
          sort_order: number
          template_work_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          default_quantity?: number
          default_unit_price?: number | null
          id?: string
          name: string
          sort_order?: number
          template_work_id: string
          unit: string
        }
        Update: {
          created_at?: string
          default_quantity?: number
          default_unit_price?: number | null
          id?: string
          name?: string
          sort_order?: number
          template_work_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_items_template_work_id_fkey"
            columns: ["template_work_id"]
            isOneToOne: false
            referencedRelation: "template_works"
            referencedColumns: ["id"]
          },
        ]
      }
      template_types: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      template_works: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          template_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          template_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          template_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_works_template_type_id_fkey"
            columns: ["template_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      types: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          sort_order: number
          template_type_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          sort_order?: number
          template_type_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
          template_type_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "types_template_type_id_fkey"
            columns: ["template_type_id"]
            isOneToOne: false
            referencedRelation: "template_types"
            referencedColumns: ["id"]
          },
        ]
      }
      works: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          template_work_id: string | null
          type_id: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          template_work_id?: string | null
          type_id: string
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          template_work_id?: string | null
          type_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "works_template_work_id_fkey"
            columns: ["template_work_id"]
            isOneToOne: false
            referencedRelation: "template_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "works_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_type_from_template: {
        Args: {
          p_created_by: string
          p_project_id: string
          p_template_item_ids?: string[]
          p_template_type_id: string
          p_template_work_ids?: string[]
          p_use_template: boolean
          p_version: number
          p_zone_ids: string[]
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  contracts: {
    Tables: {
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_holder_name: string | null
          bank_name: string | null
          bank_number: string | null
          contractor_id: string | null
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"]
          expense_id: string | null
          grand_total: number | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          new_contractor_name: string | null
          payments_number: string
          payments_reason: string | null
          penalty_amount: number
          penalty_reason: string | null
          prev_amount: number
          project_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_holder_name?: string | null
          bank_name?: string | null
          bank_number?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"]
          expense_id?: string | null
          grand_total?: number | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          new_contractor_name?: string | null
          payments_number: string
          payments_reason?: string | null
          penalty_amount?: number
          penalty_reason?: string | null
          prev_amount?: number
          project_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_holder_name?: string | null
          bank_name?: string | null
          bank_number?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_type"]
          expense_id?: string | null
          grand_total?: number | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          new_contractor_name?: string | null
          payments_number?: string
          payments_reason?: string | null
          penalty_amount?: number
          penalty_reason?: string | null
          prev_amount?: number
          project_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_quote: {
        Args: {
          p_advance?: number
          p_created_by: string
          p_days?: number
          p_delay_penalty?: number
          p_insurance?: number
          p_milestones?: Json
          p_push_extras?: boolean
          p_quote_id: string
          p_start?: string
          p_terms?: string
        }
        Returns: string
      }
    }
    Enums: {
      contract_status: "draft" | "active" | "completed" | "cancelled"
      milestone_status: "pending" | "in_progress" | "done"
      payment_status: "pending" | "approved" | "rejected" | "paid"
      round_status: "draft" | "pricing" | "awarded" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  drawings: {
    Tables: {
      access: {
        Row: {
          can_download: boolean
          can_edit: boolean
          can_upload: boolean
          folder_id: string
          granted_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_download?: boolean
          can_edit?: boolean
          can_upload?: boolean
          folder_id: string
          granted_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_download?: boolean
          can_edit?: boolean
          can_upload?: boolean
          folder_id?: string
          granted_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      default_folders: {
        Row: {
          map_type_id: string
          position: number
        }
        Insert: {
          map_type_id: string
          position: number
        }
        Update: {
          map_type_id?: string
          position?: number
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          map_type_id: string
          next_version: number
          position: number
          project_id: string
          status: string
          status_at: string | null
          status_by: string | null
          status_note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          map_type_id: string
          next_version?: number
          position?: number
          project_id: string
          status?: string
          status_at?: string | null
          status_by?: string | null
          status_note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          map_type_id?: string
          next_version?: number
          position?: number
          project_id?: string
          status?: string
          status_at?: string | null
          status_by?: string | null
          status_note?: string | null
        }
        Relationships: []
      }
      notices: {
        Row: {
          created_at: string
          from_folder_id: string
          id: string
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          state: string
          to_folder_id: string
          version_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          from_folder_id: string
          id?: string
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          to_folder_id: string
          version_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          from_folder_id?: string
          id?: string
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          to_folder_id?: string
          version_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "notices_from_folder_id_fkey"
            columns: ["from_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_to_folder_id_fkey"
            columns: ["to_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      seeded_projects: {
        Row: {
          project_id: string
          seeded_at: string
        }
        Insert: {
          project_id: string
          seeded_at?: string
        }
        Update: {
          project_id?: string
          seeded_at?: string
        }
        Relationships: []
      }
      versions: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          folder_id: string
          id: string
          mime_type: string | null
          original_file_name: string | null
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          folder_id: string
          id?: string
          mime_type?: string | null
          original_file_name?: string | null
          uploaded_by?: string | null
          version: number
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          folder_id?: string
          id?: string
          mime_type?: string | null
          original_file_name?: string | null
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "versions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_version: {
        Args: {
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_folder_id: string
          p_mime_type: string
          p_notify_folder_ids?: string[]
        }
        Returns: {
          id: string
          version: number
        }[]
      }
      assert_files_service: { Args: never; Returns: undefined }
      can: { Args: { p_cap: string; p_folder_id: string }; Returns: boolean }
      delete_folder: { Args: { p_folder_id: string }; Returns: string[] }
      delete_version: { Args: { p_version_id: string }; Returns: string }
      file_for_download: {
        Args: { p_version_id: string }
        Returns: {
          file_name: string
          file_path: string
          file_size: number
          mime_type: string
        }[]
      }
      file_name_part: {
        Args: { p: string; p_fallback: string }
        Returns: string
      }
      is_manager: { Args: { p_project_id: string }; Returns: boolean }
      is_participant: { Args: { p_project_id: string }; Returns: boolean }
      mark_complied: { Args: { p_notice_id: string }; Returns: undefined }
      my_caps: { Args: { p_project_id: string }; Returns: Json }
      on_team: { Args: { p_project_id: string }; Returns: boolean }
      seed_project_defaults: { Args: { p_project_id: string }; Returns: number }
      set_access: {
        Args: { p_entries: Json; p_folder_id: string }
        Returns: undefined
      }
      set_status: {
        Args: { p_folder_id: string; p_note?: string; p_status: string }
        Returns: undefined
      }
      standard_file_name: {
        Args: {
          p_ext: string
          p_project: string
          p_section: string
          p_version: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  hr: {
    Tables: {
      applicant_answers: {
        Row: {
          answer_text: string | null
          applicant_id: string
          created_at: string
          id: string
          job_request_question_id: string
          score: number | null
          selected_option_ids: string[] | null
        }
        Insert: {
          answer_text?: string | null
          applicant_id: string
          created_at?: string
          id?: string
          job_request_question_id: string
          score?: number | null
          selected_option_ids?: string[] | null
        }
        Update: {
          answer_text?: string | null
          applicant_id?: string
          created_at?: string
          id?: string
          job_request_question_id?: string
          score?: number | null
          selected_option_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "applicant_answers_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicant_scores"
            referencedColumns: ["applicant_id"]
          },
          {
            foreignKeyName: "applicant_answers_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_answers_job_request_question_id_fkey"
            columns: ["job_request_question_id"]
            isOneToOne: false
            referencedRelation: "job_request_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      applicants: {
        Row: {
          application_source: string | null
          application_status: string
          applied_position: string | null
          birth_date: string | null
          created_at: string
          current_employment_status: string | null
          cv_file_url: string | null
          experience_level: string | null
          full_name: string
          gender: string | null
          general_notes: string | null
          gpa_grade: string | null
          gpa_tier_id: string | null
          graduation_year: number | null
          hired_employee_id: string | null
          id: string
          job_request_id: string | null
          phone_whatsapp: string | null
          specialization: string | null
          university: string | null
          university_id: string | null
          updated_at: string
        }
        Insert: {
          application_source?: string | null
          application_status?: string
          applied_position?: string | null
          birth_date?: string | null
          created_at?: string
          current_employment_status?: string | null
          cv_file_url?: string | null
          experience_level?: string | null
          full_name: string
          gender?: string | null
          general_notes?: string | null
          gpa_grade?: string | null
          gpa_tier_id?: string | null
          graduation_year?: number | null
          hired_employee_id?: string | null
          id?: string
          job_request_id?: string | null
          phone_whatsapp?: string | null
          specialization?: string | null
          university?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          application_source?: string | null
          application_status?: string
          applied_position?: string | null
          birth_date?: string | null
          created_at?: string
          current_employment_status?: string | null
          cv_file_url?: string | null
          experience_level?: string | null
          full_name?: string
          gender?: string | null
          general_notes?: string | null
          gpa_grade?: string | null
          gpa_tier_id?: string | null
          graduation_year?: number | null
          hired_employee_id?: string | null
          id?: string
          job_request_id?: string | null
          phone_whatsapp?: string | null
          specialization?: string | null
          university?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicants_gpa_tier_id_fkey"
            columns: ["gpa_tier_id"]
            isOneToOne: false
            referencedRelation: "gpa_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicants_job_request_id_fkey"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "job_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicants_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criteria: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
        }
        Relationships: []
      }
      experience_level_scores: {
        Row: {
          level: string
          score: number
        }
        Insert: {
          level: string
          score: number
        }
        Update: {
          level?: string
          score?: number
        }
        Relationships: []
      }
      gpa_tiers: {
        Row: {
          id: string
          is_active: boolean
          label: string
          score: number
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          label: string
          score: number
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          label?: string
          score?: number
          sort_order?: number
        }
        Relationships: []
      }
      interview_evaluation_ratings: {
        Row: {
          committee_notes: string | null
          criteria_id: string
          evaluation_id: string
          id: string
          rating_id: string
        }
        Insert: {
          committee_notes?: string | null
          criteria_id: string
          evaluation_id: string
          id?: string
          rating_id: string
        }
        Update: {
          committee_notes?: string | null
          criteria_id?: string
          evaluation_id?: string
          id?: string
          rating_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_evaluation_ratings_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluation_ratings_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "interview_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluation_ratings_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "rating_scale"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_evaluations: {
        Row: {
          additional_notes: string | null
          applicant_id: string
          created_at: string
          evaluated_at: string
          evaluator_employee_id: string | null
          id: string
          interview_round_id: string | null
          recommendation: string | null
        }
        Insert: {
          additional_notes?: string | null
          applicant_id: string
          created_at?: string
          evaluated_at?: string
          evaluator_employee_id?: string | null
          id?: string
          interview_round_id?: string | null
          recommendation?: string | null
        }
        Update: {
          additional_notes?: string | null
          applicant_id?: string
          created_at?: string
          evaluated_at?: string
          evaluator_employee_id?: string | null
          id?: string
          interview_round_id?: string | null
          recommendation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_evaluations_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicant_scores"
            referencedColumns: ["applicant_id"]
          },
          {
            foreignKeyName: "interview_evaluations_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluations_interview_round_id_fkey"
            columns: ["interview_round_id"]
            isOneToOne: false
            referencedRelation: "interview_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_rounds: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          interview_type: string | null
          interviewer_employee_id: string | null
          location: string | null
          round_number: number
          scheduled_at: string | null
          status: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          interview_type?: string | null
          interviewer_employee_id?: string | null
          location?: string | null
          round_number?: number
          scheduled_at?: string | null
          status?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          interview_type?: string | null
          interviewer_employee_id?: string | null
          location?: string | null
          round_number?: number
          scheduled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_rounds_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicant_scores"
            referencedColumns: ["applicant_id"]
          },
          {
            foreignKeyName: "interview_rounds_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_request_question_options: {
        Row: {
          id: string
          job_request_question_id: string
          option_text: string
          score: number
          sort_order: number
        }
        Insert: {
          id?: string
          job_request_question_id: string
          option_text: string
          score?: number
          sort_order?: number
        }
        Update: {
          id?: string
          job_request_question_id?: string
          option_text?: string
          score?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_request_question_options_job_request_question_id_fkey"
            columns: ["job_request_question_id"]
            isOneToOne: false
            referencedRelation: "job_request_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_request_questions: {
        Row: {
          bank_question_id: string | null
          config: Json
          created_at: string
          id: string
          is_required: boolean
          job_request_id: string
          question_text: string
          question_type: string
          sort_order: number
          weight: number
        }
        Insert: {
          bank_question_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          is_required?: boolean
          job_request_id: string
          question_text: string
          question_type: string
          sort_order?: number
          weight?: number
        }
        Update: {
          bank_question_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          is_required?: boolean
          job_request_id?: string
          question_text?: string
          question_type?: string
          sort_order?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_request_questions_bank_question_id_fkey"
            columns: ["bank_question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_request_questions_job_request_id_fkey"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "job_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requests: {
        Row: {
          created_at: string
          department: string | null
          id: string
          justification: string | null
          position_title: string
          positions_count: number
          requested_by_employee_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id?: string
          justification?: string | null
          position_title: string
          positions_count?: number
          requested_by_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          justification?: string | null
          position_title?: string
          positions_count?: number
          requested_by_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_review_ratings: {
        Row: {
          criteria_id: string
          id: string
          notes: string | null
          rating_id: string
          review_id: string
        }
        Insert: {
          criteria_id: string
          id?: string
          notes?: string | null
          rating_id: string
          review_id: string
        }
        Update: {
          criteria_id?: string
          id?: string
          notes?: string | null
          rating_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_review_ratings_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_review_ratings_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "rating_scale"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_review_ratings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          overall_notes: string | null
          overall_recommendation: string | null
          reviewed_at: string
          reviewer_employee_id: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          overall_notes?: string | null
          overall_recommendation?: string | null
          reviewed_at?: string
          reviewer_employee_id?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          overall_notes?: string | null
          overall_recommendation?: string | null
          reviewed_at?: string
          reviewer_employee_id?: string | null
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          config: Json
          created_at: string
          department: string | null
          id: string
          is_active: boolean
          is_required_default: boolean
          question_text: string
          question_type: string
          sort_order: number
          weight: number
        }
        Insert: {
          config?: Json
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean
          is_required_default?: boolean
          question_text: string
          question_type: string
          sort_order?: number
          weight?: number
        }
        Update: {
          config?: Json
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean
          is_required_default?: boolean
          question_text?: string
          question_type?: string
          sort_order?: number
          weight?: number
        }
        Relationships: []
      }
      question_bank_options: {
        Row: {
          bank_question_id: string
          id: string
          option_text: string
          score: number
          sort_order: number
        }
        Insert: {
          bank_question_id: string
          id?: string
          option_text: string
          score?: number
          sort_order?: number
        }
        Update: {
          bank_question_id?: string
          id?: string
          option_text?: string
          score?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_options_bank_question_id_fkey"
            columns: ["bank_question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_scale: {
        Row: {
          category: string
          id: string
          is_active: boolean
          label_ar: string
          score: number
          sort_order: number
        }
        Insert: {
          category: string
          id?: string
          is_active?: boolean
          label_ar: string
          score: number
          sort_order?: number
        }
        Update: {
          category?: string
          id?: string
          is_active?: boolean
          label_ar?: string
          score?: number
          sort_order?: number
        }
        Relationships: []
      }
      universities: {
        Row: {
          id: string
          name: string
          sort_order: number
          tier_id: string | null
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          tier_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "universities_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "university_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      university_tiers: {
        Row: {
          id: string
          is_active: boolean
          score: number
          sort_order: number
          tier_name: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          score: number
          sort_order?: number
          tier_name: string
        }
        Update: {
          id?: string
          is_active?: boolean
          score?: number
          sort_order?: number
          tier_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      applicant_scores: {
        Row: {
          applicant_id: string | null
          experience_score: number | null
          full_name: string | null
          gpa_score: number | null
          job_request_id: string | null
          questionnaire_score: number | null
          total_score: number | null
          university_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "applicants_job_request_id_fkey"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "job_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      copy_bank_question_to_job_request: {
        Args: {
          p_bank_question_id: string
          p_job_request_id: string
          p_sort_order?: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  lookups: {
    Tables: {
      banks: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          currency: Database["public"]["Enums"]["currency_type"]
          id: string
          maps: number
          owner_id: string
          owner_type: Database["public"]["Enums"]["owner_type"]
          refund: number
          total_expense: number
          total_percentage: number
          total_transactions: number
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          balance?: number
          currency: Database["public"]["Enums"]["currency_type"]
          id?: string
          maps?: number
          owner_id: string
          owner_type: Database["public"]["Enums"]["owner_type"]
          refund?: number
          total_expense?: number
          total_percentage?: number
          total_transactions?: number
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          balance?: number
          currency?: Database["public"]["Enums"]["currency_type"]
          id?: string
          maps?: number
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["owner_type"]
          refund?: number
          total_expense?: number
          total_percentage?: number
          total_transactions?: number
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          title: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          title: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          title?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          code: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string | null
          phone_number: string
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name?: string | null
          phone_number: string
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string | null
          phone_number?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          created_at: string
          id: string
          name: string
          projects_counter: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          projects_counter?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          projects_counter?: number
        }
        Relationships: []
      }
      company_account: {
        Row: {
          bank_balance: number
          cash_balance: number
          created_at: string
          id: string
          status: string
          type: string
        }
        Insert: {
          bank_balance?: number
          cash_balance?: number
          created_at?: string
          id?: string
          status?: string
          type: string
        }
        Update: {
          bank_balance?: number
          cash_balance?: number
          created_at?: string
          id?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      company_discounts: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string
          period_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note: string
          period_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string
          period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_discounts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "project_percentage_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      company_expense: {
        Row: {
          amount: number
          amount_paid: number
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          serial_number: string | null
          status: Database["public"]["Enums"]["expense_status"] | null
          type: string
        }
        Insert: {
          amount: number
          amount_paid?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          serial_number?: string | null
          status?: Database["public"]["Enums"]["expense_status"] | null
          type: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          serial_number?: string | null
          status?: Database["public"]["Enums"]["expense_status"] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_expense_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_expense_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string | null
          expense_id: string
          id: string
          payment_method: Database["public"]["Enums"]["account_type"]
          serial_number: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date?: string | null
          expense_id: string
          id?: string
          payment_method: Database["public"]["Enums"]["account_type"]
          serial_number: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string | null
          expense_id?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["account_type"]
          serial_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_expense_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "company_expense"
            referencedColumns: ["id"]
          },
        ]
      }
      company_held: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          note: string
          period_id: string
          type: Database["public"]["Enums"]["payment_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          employee_id: string
          id?: string
          note: string
          period_id: string
          type: Database["public"]["Enums"]["payment_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          note?: string
          period_id?: string
          type?: Database["public"]["Enums"]["payment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "compan_ hed_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compan_ hed_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "project_percentage_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_specialities: {
        Row: {
          contractor_id: string
          created_at: string
          speciality_id: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          speciality_id: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          speciality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_specialities_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_specialities_speciality_id_fkey"
            columns: ["speciality_id"]
            isOneToOne: false
            referencedRelation: "specialities"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          bank_account_aproved: boolean | null
          bank_approved_at: string | null
          bank_approved_by: string | null
          bank_holder_name: string | null
          bank_id: string | null
          bank_name: string | null
          bank_number: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          merged_at: string | null
          merged_by: string | null
          merged_into_id: string | null
          phone_number: string | null
          status: string
          updated_at: string
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          bank_account_aproved?: boolean | null
          bank_approved_at?: string | null
          bank_approved_by?: string | null
          bank_holder_name?: string | null
          bank_id?: string | null
          bank_name?: string | null
          bank_number?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          bank_account_aproved?: boolean | null
          bank_approved_at?: string | null
          bank_approved_by?: string | null
          bank_holder_name?: string | null
          bank_id?: string | null
          bank_name?: string | null
          bank_number?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_bank_approved_by_fkey"
            columns: ["bank_approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      department_permission_grants: {
        Row: {
          allowed: boolean
          department_id: string
          granted_at: string
          granted_by: string | null
          note: string | null
          permission_id: string
          scope: Database["public"]["Enums"]["grant_scope_enum"]
        }
        Insert: {
          allowed: boolean
          department_id: string
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id: string
          scope?: Database["public"]["Enums"]["grant_scope_enum"]
        }
        Update: {
          allowed?: boolean
          department_id?: string
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id?: string
          scope?: Database["public"]["Enums"]["grant_scope_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "department_permission_grants_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_permission_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_permission_grants_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_ar: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_ar?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_ar?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_account: {
        Row: {
          bank_balance: number
          bank_held: number
          cash_balance: number
          cash_held: number
          created_at: string
          id: string
          loan_debt: number
          status: string
        }
        Insert: {
          bank_balance?: number
          bank_held?: number
          cash_balance?: number
          cash_held?: number
          created_at?: string
          id?: string
          loan_debt?: number
          status?: string
        }
        Update: {
          bank_balance?: number
          bank_held?: number
          cash_balance?: number
          cash_held?: number
          created_at?: string
          id?: string
          loan_debt?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "emplyee_accounts_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_certifications: {
        Row: {
          certification: string
          created_at: string
          employee_id: string
          id: string
        }
        Insert: {
          certification: string
          created_at?: string
          employee_id: string
          id?: string
        }
        Update: {
          certification?: string
          created_at?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_certifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string
          doc_type: string
          employee_id: string
          id: string
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          employee_id: string
          id?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          employee_id?: string
          id?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_specialities: {
        Row: {
          created_at: string
          employee_id: string
          speciality_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          speciality_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          speciality_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_specialities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_specialities_speciality_id_fkey"
            columns: ["speciality_id"]
            isOneToOne: false
            referencedRelation: "specialities"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          alternate_phone: string | null
          bank_account_number: string | null
          bank_name: string | null
          base_salary: number
          blood_type: string | null
          created_at: string
          date_of_joining: string | null
          department_id: string | null
          dob: string | null
          email: string
          emergency_contact: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id: string
          employee_type: Database["public"]["Enums"]["employee_type"] | null
          first_name: string
          gender: string | null
          gpa: number | null
          graduation_year: number | null
          highest_qualification: string | null
          id: string
          id_proof_url: string | null
          last_name: string | null
          manager_id: string | null
          nationality: string | null
          personal_email: string | null
          personal_photo_url: string | null
          phone_number: string
          place_of_birth: string | null
          resume_url: string | null
          salary_type: string | null
          status: string | null
          university: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          base_salary?: number
          blood_type?: string | null
          created_at?: string
          date_of_joining?: string | null
          department_id?: string | null
          dob?: string | null
          email: string
          emergency_contact?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id: string
          employee_type?: Database["public"]["Enums"]["employee_type"] | null
          first_name: string
          gender?: string | null
          gpa?: number | null
          graduation_year?: number | null
          highest_qualification?: string | null
          id?: string
          id_proof_url?: string | null
          last_name?: string | null
          manager_id?: string | null
          nationality?: string | null
          personal_email?: string | null
          personal_photo_url?: string | null
          phone_number: string
          place_of_birth?: string | null
          resume_url?: string | null
          salary_type?: string | null
          status?: string | null
          university?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          base_salary?: number
          blood_type?: string | null
          created_at?: string
          date_of_joining?: string | null
          department_id?: string | null
          dob?: string | null
          email?: string
          emergency_contact?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id?: string
          employee_type?: Database["public"]["Enums"]["employee_type"] | null
          first_name?: string
          gender?: string | null
          gpa?: number | null
          graduation_year?: number | null
          highest_qualification?: string | null
          id?: string
          id_proof_url?: string | null
          last_name?: string | null
          manager_id?: string | null
          nationality?: string | null
          personal_email?: string | null
          personal_photo_url?: string | null
          phone_number?: string
          place_of_birth?: string | null
          resume_url?: string | null
          salary_type?: string | null
          status?: string | null
          university?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          expense_id: string
          expense_no: number | null
          id: string
          invoice_no: number | null
          payment_method: Database["public"]["Enums"]["account_type"] | null
          payment_no: number | null
          serial_number: number | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          expense_id: string
          expense_no?: number | null
          id?: string
          invoice_no?: number | null
          payment_method?: Database["public"]["Enums"]["account_type"] | null
          payment_no?: number | null
          serial_number?: number | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_id?: string
          expense_no?: number | null
          id?: string
          invoice_no?: number | null
          payment_method?: Database["public"]["Enums"]["account_type"] | null
          payment_no?: number | null
          serial_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "project_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          created_at: string
          id: string
          name: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          usage_count?: number
        }
        Relationships: []
      }
      map_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payroll: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_amount: number
          basic_salary: number | null
          cash_amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          pay_date: string
          percentage_salary: number | null
          project_id: string | null
          status: string
          total_salary: number
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_amount?: number
          basic_salary?: number | null
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          pay_date: string
          percentage_salary?: number | null
          project_id?: string | null
          status?: string
          total_salary?: number
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_amount?: number
          basic_salary?: number | null
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          pay_date?: string
          percentage_salary?: number | null
          project_id?: string | null
          status?: string
          total_salary?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_catalog: {
        Row: {
          area: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_project_scoped: boolean
          name: string
          parent_permission_id: string | null
        }
        Insert: {
          area: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          is_project_scoped: boolean
          name: string
          parent_permission_id?: string | null
        }
        Update: {
          area?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_project_scoped?: boolean
          name?: string
          parent_permission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_catalog_parent_permission_id_fkey"
            columns: ["parent_permission_id"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      project_balances: {
        Row: {
          balance: number
          currency: Database["public"]["Enums"]["currency_type"]
          id: string
          maps: number
          project_id: string
          refund: number
          total_expense: number
          total_percentage: number
          total_transactions: number
        }
        Insert: {
          balance?: number
          currency: Database["public"]["Enums"]["currency_type"]
          id?: string
          maps?: number
          project_id: string
          refund?: number
          total_expense?: number
          total_percentage?: number
          total_transactions?: number
        }
        Update: {
          balance?: number
          currency?: Database["public"]["Enums"]["currency_type"]
          id?: string
          maps?: number
          project_id?: string
          refund?: number
          total_expense?: number
          total_percentage?: number
          total_transactions?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_balances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contractor_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          contractor_id: string
          id: string
          project_id: string
          project_role_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          contractor_id: string
          id?: string
          project_id: string
          project_role_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          contractor_id?: string
          id?: string
          project_id?: string
          project_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contractor_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contractor_roles_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contractor_roles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contractor_roles_project_role_id_fkey"
            columns: ["project_role_id"]
            isOneToOne: false
            referencedRelation: "project_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_distributions: {
        Row: {
          created_at: string
          id: string
          percentage: number
          person_id: string
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          percentage: number
          person_id: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          percentage?: number
          person_id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_distributions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_distributions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_distributions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_expenses: {
        Row: {
          amount_paid: number
          contractor_id: string | null
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"]
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          discounting: number | null
          expense_date: string
          expense_id: string | null
          expense_type: Database["public"]["Enums"]["expense_type"]
          id: string
          is_edited: boolean | null
          is_percentage: boolean | null
          payment_counter: number
          phase: Database["public"]["Enums"]["phase_type"]
          project_id: string
          serial_number: number | null
          status: Database["public"]["Enums"]["expense_status"] | null
          total_amount: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount_paid?: number
          contractor_id?: string | null
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"]
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discounting?: number | null
          expense_date?: string
          expense_id?: string | null
          expense_type: Database["public"]["Enums"]["expense_type"]
          id?: string
          is_edited?: boolean | null
          is_percentage?: boolean | null
          payment_counter?: number
          phase: Database["public"]["Enums"]["phase_type"]
          project_id: string
          serial_number?: number | null
          status?: Database["public"]["Enums"]["expense_status"] | null
          total_amount: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount_paid?: number
          contractor_id?: string | null
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_type"]
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discounting?: number | null
          expense_date?: string
          expense_id?: string | null
          expense_type?: Database["public"]["Enums"]["expense_type"]
          id?: string
          is_edited?: boolean | null
          is_percentage?: boolean | null
          payment_counter?: number
          phase?: Database["public"]["Enums"]["phase_type"]
          project_id?: string
          serial_number?: number | null
          status?: Database["public"]["Enums"]["expense_status"] | null
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_expenses_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      project_incomes: {
        Row: {
          amount: number
          client_name: string | null
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"] | null
          description: string | null
          fund: Database["public"]["Enums"]["fund_type"]
          id: string
          income_date: string
          payment_method: Database["public"]["Enums"]["account_type"]
          project_id: string
          ref_number: string | null
          serial_number: number
          updated_at: string
        }
        Insert: {
          amount: number
          client_name?: string | null
          created_at?: string
          created_by: string
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          fund: Database["public"]["Enums"]["fund_type"]
          id?: string
          income_date?: string
          payment_method: Database["public"]["Enums"]["account_type"]
          project_id: string
          ref_number?: string | null
          serial_number: number
          updated_at?: string
        }
        Update: {
          amount?: number
          client_name?: string | null
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          fund?: Database["public"]["Enums"]["fund_type"]
          id?: string
          income_date?: string
          payment_method?: Database["public"]["Enums"]["account_type"]
          project_id?: string
          ref_number?: string | null
          serial_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_incomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_incomes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_maps: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          invoice_number: number | null
          map_id: string
          payment_method: Database["public"]["Enums"]["account_type"] | null
          project_id: string
          serial_number: number
          status: Database["public"]["Enums"]["expense_status"] | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date: string
          description: string
          id?: string
          invoice_number?: number | null
          map_id: string
          payment_method?: Database["public"]["Enums"]["account_type"] | null
          project_id: string
          serial_number: number
          status?: Database["public"]["Enums"]["expense_status"] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          invoice_number?: number | null
          map_id?: string
          payment_method?: Database["public"]["Enums"]["account_type"] | null
          project_id?: string
          serial_number?: number
          status?: Database["public"]["Enums"]["expense_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_maps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_maps_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "map_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_maps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_percentage: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_type"] | null
          id: string
          percentage: number
          period_percentage: number
          period_start: string
          project_id: string
          total_percentage: number
          type: Database["public"]["Enums"]["account_type"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_type"] | null
          id?: string
          percentage?: number
          period_percentage?: number
          period_start: string
          project_id: string
          total_percentage?: number
          type?: Database["public"]["Enums"]["account_type"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_type"] | null
          id?: string
          percentage?: number
          period_percentage?: number
          period_start?: string
          project_id?: string
          total_percentage?: number
          type?: Database["public"]["Enums"]["account_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_percentage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_percentage_logs: {
        Row: {
          amount: number
          created_at: string | null
          distributed: boolean
          expense_id: string | null
          id: string
          payment_id: string | null
          percentage: number
          project_id: string
          refund_id: string | null
          type: Database["public"]["Enums"]["percentage_log_type"]
        }
        Insert: {
          amount: number
          created_at?: string | null
          distributed?: boolean
          expense_id?: string | null
          id?: string
          payment_id?: string | null
          percentage: number
          project_id: string
          refund_id?: string | null
          type?: Database["public"]["Enums"]["percentage_log_type"]
        }
        Update: {
          amount?: number
          created_at?: string | null
          distributed?: boolean
          expense_id?: string | null
          id?: string
          payment_id?: string | null
          percentage?: number
          project_id?: string
          refund_id?: string | null
          type?: Database["public"]["Enums"]["percentage_log_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_percentage_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "project_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "expense_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_logs_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "project_refund"
            referencedColumns: ["id"]
          },
        ]
      }
      project_percentage_period_items: {
        Row: {
          bank_amount: number
          bank_held: number
          cash_amount: number
          cash_held: number
          created_at: string
          discount: number
          id: string
          item_type: string
          note: string | null
          percentage: number
          period_id: string
          total: number
          user_id: string | null
        }
        Insert: {
          bank_amount: number
          bank_held: number
          cash_amount: number
          cash_held: number
          created_at?: string
          discount: number
          id?: string
          item_type: string
          note?: string | null
          percentage: number
          period_id: string
          total: number
          user_id?: string | null
        }
        Update: {
          bank_amount?: number
          bank_held?: number
          cash_amount?: number
          cash_held?: number
          created_at?: string
          discount?: number
          id?: string
          item_type?: string
          note?: string | null
          percentage?: number
          period_id?: string
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_percentage_period_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "project_percentage_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_period_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      project_percentage_periods: {
        Row: {
          bank_percentage: number
          company_percentage: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"] | null
          end_date: string
          id: string
          project_id: string
          reversal_note: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_percentage_id: string | null
          start_date: string
          status: string
          total_amount: number
          type: Database["public"]["Enums"]["payment_type"]
        }
        Insert: {
          bank_percentage?: number
          company_percentage?: number
          created_at?: string
          created_by: string
          currency?: Database["public"]["Enums"]["currency_type"] | null
          end_date: string
          id?: string
          project_id: string
          reversal_note?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_percentage_id?: string | null
          start_date: string
          status?: string
          total_amount: number
          type: Database["public"]["Enums"]["payment_type"]
        }
        Update: {
          bank_percentage?: number
          company_percentage?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_type"] | null
          end_date?: string
          id?: string
          project_id?: string
          reversal_note?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_percentage_id?: string | null
          start_date?: string
          status?: string
          total_amount?: number
          type?: Database["public"]["Enums"]["payment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_percentage_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_periods_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_percentage_periods_source_percentage_id_fkey"
            columns: ["source_percentage_id"]
            isOneToOne: false
            referencedRelation: "project_percentage"
            referencedColumns: ["id"]
          },
        ]
      }
      project_permission_defaults: {
        Row: {
          allowed: boolean
          granted_at: string
          granted_by: string | null
          note: string | null
          permission_id: string
          project_id: string
        }
        Insert: {
          allowed: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id: string
          project_id: string
        }
        Update: {
          allowed?: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_permission_defaults_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_permission_defaults_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_permission_defaults_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_refund: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"]
          description: string | null
          expense_id: string | null
          id: string
          income_date: string
          invoice_number: number | null
          payment_method: Database["public"]["Enums"]["account_type"]
          project_id: string
          serial_number: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_type"]
          description?: string | null
          expense_id?: string | null
          id?: string
          income_date?: string
          invoice_number?: number | null
          payment_method: Database["public"]["Enums"]["account_type"]
          project_id: string
          serial_number: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_type"]
          description?: string | null
          expense_id?: string | null
          id?: string
          income_date?: string
          invoice_number?: number | null
          payment_method?: Database["public"]["Enums"]["account_type"]
          project_id?: string
          serial_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_refund_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_refund_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_refund_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_roles: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          address: string | null
          client_id: string
          code: string
          created_at: string
          default_bank_percentage: number
          default_company_percentage: number
          description: string | null
          end_date: string | null
          estimated_due_date: string | null
          expense_counter: number
          id: string
          income_counter: number
          invoice_counter: number
          latitude: number | null
          longitude: number | null
          map_counter: number
          name: string
          refund_counter: number
          serial_number: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status_enum"]
        }
        Insert: {
          address?: string | null
          client_id: string
          code: string
          created_at?: string
          default_bank_percentage?: number
          default_company_percentage?: number
          description?: string | null
          end_date?: string | null
          estimated_due_date?: string | null
          expense_counter?: number
          id?: string
          income_counter?: number
          invoice_counter?: number
          latitude?: number | null
          longitude?: number | null
          map_counter?: number
          name: string
          refund_counter?: number
          serial_number?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status_enum"]
        }
        Update: {
          address?: string | null
          client_id?: string
          code?: string
          created_at?: string
          default_bank_percentage?: number
          default_company_percentage?: number
          description?: string | null
          end_date?: string | null
          estimated_due_date?: string | null
          expense_counter?: number
          id?: string
          income_counter?: number
          invoice_counter?: number
          latitude?: number | null
          longitude?: number | null
          map_counter?: number
          name?: string
          refund_counter?: number
          serial_number?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission_grants: {
        Row: {
          allowed: boolean
          granted_at: string
          granted_by: string | null
          note: string | null
          permission_id: string
          role_id: string
          scope: Database["public"]["Enums"]["grant_scope_enum"]
        }
        Insert: {
          allowed: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id: string
          role_id: string
          scope?: Database["public"]["Enums"]["grant_scope_enum"]
        }
        Update: {
          allowed?: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id?: string
          role_id?: string
          scope?: Database["public"]["Enums"]["grant_scope_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_grants_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_grants_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          id: string
          name: string
          number: number
        }
        Insert: {
          code: string
          id?: string
          name: string
          number?: number
        }
        Update: {
          code?: string
          id?: string
          name?: string
          number?: number
        }
        Relationships: []
      }
      shop_cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          notes: string | null
          product_size_id: string
          quantity: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_size_id: string
          quantity?: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_size_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "shop_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_cart_items_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "shop_product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_carts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_carts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_carts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_categories: {
        Row: {
          created_at: string
          description: string | null
          division_id: string
          icon_path: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          division_id: string
          icon_path?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          division_id?: string
          icon_path?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_categories_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "shop_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_divisions: {
        Row: {
          created_at: string
          expense_id: string | null
          icon_path: string | null
          id: string
          is_active: boolean
          name: string
          specialization_id: string | null
        }
        Insert: {
          created_at?: string
          expense_id?: string | null
          icon_path?: string | null
          id?: string
          is_active?: boolean
          name: string
          specialization_id?: string | null
        }
        Update: {
          created_at?: string
          expense_id?: string | null
          icon_path?: string | null
          id?: string
          is_active?: boolean
          name?: string
          specialization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_divisions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_divisions_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "specialities"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_items: {
        Row: {
          available_quantity: number | null
          created_at: string
          id: string
          name: string | null
          notes: string | null
          order_id: string
          product_size_id: string | null
          quantity: number
          quoted_total: number | null
          quoted_unit_price: number | null
        }
        Insert: {
          available_quantity?: number | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          order_id: string
          product_size_id?: string | null
          quantity: number
          quoted_total?: number | null
          quoted_unit_price?: number | null
        }
        Update: {
          available_quantity?: number | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          order_id?: string
          product_size_id?: string | null
          quantity?: number
          quoted_total?: number | null
          quoted_unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "shop_product_sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_vendor_quote_items: {
        Row: {
          id: string
          notes: string | null
          order_item_id: string
          quantity: number
          quote_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          notes?: string | null
          order_item_id: string
          quantity: number
          quote_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          id?: string
          notes?: string | null
          order_item_id?: string
          quantity?: number
          quote_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_vendor_quote_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "shop_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_vendor_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "shop_order_vendor_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_vendor_quotes: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          ref_number: string | null
          responded_at: string | null
          status: string
          total_price: number
          vendor_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          ref_number?: string | null
          responded_at?: string | null
          status?: string
          total_price?: number
          vendor_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          ref_number?: string | null
          responded_at?: string | null
          status?: string
          total_price?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_vendor_quotes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_vendor_quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          arrived_at: string | null
          arrived_marked_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          expense_id: string | null
          finance_entered: boolean
          finance_entered_at: string | null
          finance_entered_by: string | null
          id: string
          note: string | null
          project_id: string
          quoted_at: string | null
          rejected_at: string | null
          rejected_by: string | null
          requires_senior_review: boolean
          senior_reviewed_at: string | null
          senior_reviewed_by: string | null
          specialization_id: string | null
          status: string
          total_price: number | null
          vendor_id: string | null
          vendor_ref: string | null
          vendor_seen_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          arrived_at?: string | null
          arrived_marked_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          expense_id?: string | null
          finance_entered?: boolean
          finance_entered_at?: string | null
          finance_entered_by?: string | null
          id?: string
          note?: string | null
          project_id: string
          quoted_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requires_senior_review?: boolean
          senior_reviewed_at?: string | null
          senior_reviewed_by?: string | null
          specialization_id?: string | null
          status?: string
          total_price?: number | null
          vendor_id?: string | null
          vendor_ref?: string | null
          vendor_seen_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          arrived_at?: string | null
          arrived_marked_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          expense_id?: string | null
          finance_entered?: boolean
          finance_entered_at?: string | null
          finance_entered_by?: string | null
          id?: string
          note?: string | null
          project_id?: string
          quoted_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requires_senior_review?: boolean
          senior_reviewed_at?: string | null
          senior_reviewed_by?: string | null
          specialization_id?: string | null
          status?: string
          total_price?: number | null
          vendor_id?: string | null
          vendor_ref?: string | null
          vendor_seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_arrived_marked_by_fkey"
            columns: ["arrived_marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "project_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_finance_entered_by_fkey"
            columns: ["finance_entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_senior_reviewed_by_fkey"
            columns: ["senior_reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "specialities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_product_sizes: {
        Row: {
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          price: number
          product_id: string
          sku: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          price?: number
          product_id: string
          sku: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          price?: number
          product_id?: string
          sku?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          subcategory_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          subcategory_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          subcategory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "shop_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_subcategories: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shop_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      specialities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      team_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          person_id: string
          project_id: string
          project_role_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          person_id: string
          project_id: string
          project_role_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          person_id?: string
          project_id?: string
          project_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_project_role_id_fkey"
            columns: ["project_role_id"]
            isOneToOne: false
            referencedRelation: "project_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_permission_grants: {
        Row: {
          allowed: boolean
          granted_at: string
          granted_by: string | null
          note: string | null
          permission_id: string
          project_id: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id: string
          project_id: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_permission_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_permission_grants_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_permission_grants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_permission_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      update: {
        Row: {
          android_url: string | null
          created_at: string
          id: string
          ios_url: string | null
          is_must: boolean
          type: string
          version: string
        }
        Insert: {
          android_url?: string | null
          created_at?: string
          id?: string
          ios_url?: string | null
          is_must?: boolean
          type: string
          version: string
        }
        Update: {
          android_url?: string | null
          created_at?: string
          id?: string
          ios_url?: string | null
          is_must?: boolean
          type?: string
          version?: string
        }
        Relationships: []
      }
      user_permission_grants: {
        Row: {
          allowed: boolean
          granted_at: string
          granted_by: string | null
          note: string | null
          permission_id: string
          scope: Database["public"]["Enums"]["grant_scope_enum"]
          user_id: string
        }
        Insert: {
          allowed: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id: string
          scope?: Database["public"]["Enums"]["grant_scope_enum"]
          user_id: string
        }
        Update: {
          allowed?: boolean
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          permission_id?: string
          scope?: Database["public"]["Enums"]["grant_scope_enum"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_grants_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string | null
          id: string
          push_token: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          push_token?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          push_token?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          change_password_at: string | null
          created_at: string
          dob: string | null
          email: string
          first_login: boolean
          first_name: string
          id: string
          last_name: string | null
          party_type: Database["public"]["Enums"]["party_type_enum"]
          phone: string | null
          role_id: string
          status: Database["public"]["Enums"]["user_status_enum"]
          updated_at: string | null
        }
        Insert: {
          change_password_at?: string | null
          created_at?: string
          dob?: string | null
          email: string
          first_login?: boolean
          first_name: string
          id?: string
          last_name?: string | null
          party_type: Database["public"]["Enums"]["party_type_enum"]
          phone?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["user_status_enum"]
          updated_at?: string | null
        }
        Update: {
          change_password_at?: string | null
          created_at?: string
          dob?: string | null
          email?: string
          first_login?: boolean
          first_name?: string
          id?: string
          last_name?: string | null
          party_type?: Database["public"]["Enums"]["party_type_enum"]
          phone?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["user_status_enum"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_specialities: {
        Row: {
          created_at: string
          speciality_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          speciality_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          speciality_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_specialities_speciality_id_fkey"
            columns: ["speciality_id"]
            isOneToOne: false
            referencedRelation: "specialities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_specialities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          alt_phone_number: string | null
          bank_account_approved: boolean
          bank_approved_at: string | null
          bank_approved_by: string | null
          bank_holder_name: string | null
          bank_id: string | null
          bank_name: string | null
          bank_number: string | null
          city: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          email: string | null
          flow: number | null
          id: string
          is_shop: boolean
          merged_at: string | null
          merged_by: string | null
          merged_into_id: string | null
          phone_number: string | null
          price_limit: number | null
          status: string
          updated_at: string
          user_id: string | null
          vendor_name: string
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          alt_phone_number?: string | null
          bank_account_approved?: boolean
          bank_approved_at?: string | null
          bank_approved_by?: string | null
          bank_holder_name?: string | null
          bank_id?: string | null
          bank_name?: string | null
          bank_number?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          flow?: number | null
          id?: string
          is_shop?: boolean
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          phone_number?: string | null
          price_limit?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vendor_name: string
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          alt_phone_number?: string | null
          bank_account_approved?: boolean
          bank_approved_at?: string | null
          bank_approved_by?: string | null
          bank_holder_name?: string | null
          bank_id?: string | null
          bank_name?: string | null
          bank_number?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          flow?: number | null
          id?: string
          is_shop?: boolean
          merged_at?: string | null
          merged_by?: string | null
          merged_into_id?: string | null
          phone_number?: string | null
          price_limit?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vendor_name?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_bank_approved_by_fkey"
            columns: ["bank_approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      assignable_people: {
        Row: {
          first_name: string | null
          id: string | null
          last_name: string | null
          person_type: string | null
        }
        Relationships: []
      }
      project_role_holders: {
        Row: {
          assigned_at: string | null
          assignment_id: string | null
          contractor_id: string | null
          email: string | null
          first_name: string | null
          last_name: string | null
          person_type: string | null
          project_id: string | null
          project_role_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_do: {
        Args: {
          p_permission_name: string
          p_project_id?: string
          p_user_id: string
        }
        Returns: boolean
      }
      can_i: {
        Args: { p_permission_name: string; p_project_id?: string }
        Returns: boolean
      }
      delete_own_account: { Args: never; Returns: undefined }
      effective_permissions: {
        Args: { p_project_id?: string; p_user_id: string }
        Returns: {
          allowed: boolean
          area: string
          is_project_scoped: boolean
          permission_name: string
          source_layer: string
        }[]
      }
      get_activity: {
        Args: {
          p_actor_id?: string
          p_before?: string
          p_from?: string
          p_groups?: string[]
          p_limit?: number
          p_log_names?: string[]
          p_project_id?: string
          p_to?: string
        }
        Returns: {
          action: string
          action_label: string
          actor_id: string
          actor_name: string
          actor_party: string
          amount: number
          currency: string
          detail: Json
          from_label: string
          from_value: string
          id: number
          log_group: string
          log_label: string
          log_name: string
          occurred_at: string
          project_id: string
          project_name: string
          reason: string
          source: string
          subject_id: string
          subject_type: string
          to_label: string
          to_value: string
          tx_id: number
        }[]
      }
      get_contractors_expenses: {
        Args: { p_project_id: string }
        Returns: {
          contractor_id: string
          first_name: string
          last_name: string
          latest_expense_date: string
          total_amount: number
        }[]
      }
      get_history: {
        Args: {
          p_before?: string
          p_limit?: number
          p_ref_id: string
          p_ref_type: string
        }
        Returns: {
          action: string
          action_label: string
          actor_id: string
          actor_name: string
          actor_party: string
          amount: number
          currency: string
          detail: Json
          from_label: string
          from_value: string
          id: number
          log_group: string
          log_label: string
          log_name: string
          occurred_at: string
          project_id: string
          project_name: string
          reason: string
          source: string
          subject_id: string
          subject_type: string
          to_label: string
          to_value: string
          tx_id: number
        }[]
      }
      get_log_health: {
        Args: never
        Returns: {
          errors_7d: number
          last_error_at: string
          last_log_name: string
          last_message: string
        }[]
      }
      get_my_contractor_project_expenses: {
        Args: { p_contractor_id: string }
        Returns: {
          amount_paid: number
          not_paid: number
          project_code: string
          project_id: string
          project_name: string
          total_amount: number
        }[]
      }
      get_my_vendor_project_expenses: {
        Args: { p_vendor_id: string }
        Returns: {
          amount_paid: number
          not_paid: number
          project_code: string
          project_id: string
          project_name: string
          total_amount: number
        }[]
      }
      get_role_by_email: { Args: { p_email: string }; Returns: string }
      get_task_activity: {
        Args: {
          p_actions?: string[]
          p_actor_id?: string
          p_before?: string
          p_from?: string
          p_limit?: number
          p_project_id?: string
          p_space_id?: string
          p_to?: string
        }
        Returns: {
          action: string
          action_label: string
          actor_id: string
          actor_name: string
          actor_party: string
          amount: number
          currency: string
          detail: Json
          from_label: string
          from_value: string
          id: string
          log_group: string
          log_label: string
          log_name: string
          occurred_at: string
          project_id: string
          project_name: string
          reason: string
          source: string
          subject_id: string
          subject_type: string
          to_label: string
          to_value: string
          tx_id: number
        }[]
      }
      get_vendor_expenses: {
        Args: { p_project_id: string }
        Returns: {
          contact_name: string
          latest_expense_date: string
          total_amount: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      merge_contractors: {
        Args: {
          p_bank_holder_name?: string
          p_bank_id?: string
          p_bank_number?: string
          p_created_by: string
          p_email?: string
          p_first_name: string
          p_last_name?: string
          p_loser_id: string
          p_phone_number?: string
          p_specialization_id?: string
          p_survivor_id: string
          p_whatsapp_number?: string
        }
        Returns: Json
      }
      merge_vendors: {
        Args: {
          p_address?: string
          p_alt_phone_number?: string
          p_bank_holder_name?: string
          p_bank_id?: string
          p_bank_number?: string
          p_city?: string
          p_contact_name?: string
          p_country?: string
          p_created_by: string
          p_email?: string
          p_loser_id: string
          p_phone_number?: string
          p_specialization_id?: string
          p_survivor_id: string
          p_vendor_name: string
          p_whatsapp_number?: string
        }
        Returns: Json
      }
      my_effective_permissions: {
        Args: { p_project_id?: string }
        Returns: {
          allowed: boolean
          area: string
          is_project_scoped: boolean
          permission_name: string
          source_layer: string
        }[]
      }
      notify_admin_attach: { Args: { p_table: string }; Returns: undefined }
      notify_admin_delete: {
        Args: { p_id: string; p_kind: string }
        Returns: undefined
      }
      notify_admin_detach: { Args: { p_table: string }; Returns: undefined }
      notify_admin_history: {
        Args: { p_key?: string; p_kind?: string; p_limit?: number }
        Returns: Json
      }
      notify_admin_list: { Args: { p_kind: string }; Returns: Json }
      notify_admin_preview: {
        Args: { p_kind: string; p_row: Json; p_sample_id?: string }
        Returns: Json
      }
      notify_admin_save: {
        Args: { p_confirm?: boolean; p_kind: string; p_row: Json }
        Returns: Json
      }
      notify_admin_simulations: { Args: { p_limit?: number }; Returns: Json }
      notify_admin_tables: { Args: never; Returns: Json }
      notify_admin_test: { Args: { p_event_key: string }; Returns: number }
      notify_archive: { Args: { p_ids: string[] }; Returns: number }
      notify_get_settings: { Args: never; Returns: Json }
      notify_list: {
        Args: {
          p_app?: string
          p_before?: string
          p_category?: string
          p_limit?: number
          p_unread_only?: boolean
        }
        Returns: {
          body: string
          category: string
          created_at: string
          entity_id: string
          entity_type: string
          event_key: string
          group_count: number
          id: string
          link: string
          priority: string
          project_id: string
          read_at: string
          title: string
        }[]
      }
      notify_log_deliveries: {
        Args: {
          p_event_key?: string
          p_from?: string
          p_limit?: number
          p_status?: string
          p_to?: string
          p_user_id?: string
        }
        Returns: Json
      }
      notify_log_errors: { Args: { p_limit?: number }; Returns: Json }
      notify_log_stats: { Args: { p_days?: number }; Returns: Json }
      notify_log_user: {
        Args: { p_days?: number; p_user_id: string }
        Returns: Json
      }
      notify_mark_all_read: { Args: never; Returns: number }
      notify_mark_read: { Args: { p_ids: string[] }; Returns: number }
      notify_push_claim: { Args: { p_limit?: number }; Returns: Json }
      notify_push_result: { Args: { p_results: Json }; Returns: number }
      notify_receipt_claim: { Args: { p_limit?: number }; Returns: Json }
      notify_receipt_result: { Args: { p: Json }; Returns: number }
      notify_register_device: {
        Args: {
          p_app_id: string
          p_device_id: string
          p_platform: string
          p_token: string
        }
        Returns: string
      }
      notify_send_overdue_nudge: {
        Args: { p_message: string; p_task_ids: string[]; p_title: string }
        Returns: Json
      }
      notify_set_preference: {
        Args: { p_category: string; p_mode: string }
        Returns: undefined
      }
      notify_set_settings: { Args: { p_settings: Json }; Returns: Json }
      notify_subscribe: {
        Args: { p_entity_id: string; p_entity_type: string; p_mode: string }
        Returns: undefined
      }
      notify_unread_count: { Args: never; Returns: number }
      notify_unregister_device: {
        Args: { p_app_id: string; p_device_id: string }
        Returns: undefined
      }
      resolve_permission_ladder: {
        Args: {
          p_permission_id?: string
          p_project_id?: string
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          area: string
          is_project_scoped: boolean
          permission_id: string
          permission_name: string
          source_layer: string
        }[]
      }
    }
    Enums: {
      account_type: "cash" | "bank"
      bid_status: "pending" | "accepted" | "rejected" | "withdrawn"
      contract_status: "active" | "completed" | "terminated" | "on_hold"
      currency_type: "LYD" | "USD" | "EUR"
      employee_type: "intern" | "contractor" | "part-time" | "full-time"
      expense_status:
        | "pending"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
        | "unpaid"
        | "deleted"
      expense_type: "material" | "labor" | "maps"
      fund_type: "client" | "internal" | "sale" | "refund" | "other"
      grant_scope_enum: "all_projects" | "team_projects_only"
      milestone_status: "pending" | "in_progress" | "completed" | "approved"
      owner_type: "employee" | "project" | "company" | "contractor"
      party_type_enum: "company" | "vendor" | "contractor" | "client"
      payment_method: "cash" | "bank"
      payment_request_status: "pending" | "approved" | "declined" | "paid"
      payment_type: "cash" | "cheque" | "transfer" | "deposit" | "bank"
      percentage_log_type: "expense" | "refund"
      phase_type: "construction" | "finishing" | "initial"
      project_status_enum: "active" | "paused" | "completed" | "cancelled"
      projects_type: "construction" | "consulting"
      transaction_type: "debit" | "credit"
      user_status_enum: "active" | "inactive" | "on leave" | "on holiday"
      work_request_mode: "open" | "direct"
      work_request_status:
        | "draft"
        | "open"
        | "bidding"
        | "awarded"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  tasks: {
    Tables: {
      _template_migration_map: {
        Row: {
          kind: string
          new_id: string
          old_id: string
        }
        Insert: {
          kind: string
          new_id: string
          old_id: string
        }
        Update: {
          kind?: string
          new_id?: string
          old_id?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string | null
          error: string | null
          id: string
          ran_at: string
          rule_key: string | null
          status: Database["tasks"]["Enums"]["automation_run_status"]
          task_id: string | null
        }
        Insert: {
          automation_id?: string | null
          error?: string | null
          id?: string
          ran_at?: string
          rule_key?: string | null
          status: Database["tasks"]["Enums"]["automation_run_status"]
          task_id?: string | null
        }
        Update: {
          automation_id?: string | null
          error?: string | null
          id?: string
          ran_at?: string
          rule_key?: string | null
          status?: Database["tasks"]["Enums"]["automation_run_status"]
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          action_config: Json
          action_type: Database["tasks"]["Enums"]["automation_action_type"]
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          scope_id: string
          scope_type: Database["tasks"]["Enums"]["automation_scope_type"]
          trigger_config: Json
          trigger_type: Database["tasks"]["Enums"]["automation_trigger_type"]
        }
        Insert: {
          action_config?: Json
          action_type: Database["tasks"]["Enums"]["automation_action_type"]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          scope_id: string
          scope_type: Database["tasks"]["Enums"]["automation_scope_type"]
          trigger_config?: Json
          trigger_type: Database["tasks"]["Enums"]["automation_trigger_type"]
        }
        Update: {
          action_config?: Json
          action_type?: Database["tasks"]["Enums"]["automation_action_type"]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          scope_id?: string
          scope_type?: Database["tasks"]["Enums"]["automation_scope_type"]
          trigger_config?: Json
          trigger_type?: Database["tasks"]["Enums"]["automation_trigger_type"]
        }
        Relationships: []
      }
      board_columns: {
        Row: {
          board_id: string
          field_definition_id: string
          id: string
          is_visible: boolean
          sort_order: number
          width: number | null
        }
        Insert: {
          board_id: string
          field_definition_id: string
          id?: string
          is_visible?: boolean
          sort_order?: number
          width?: number | null
        }
        Update: {
          board_id?: string
          field_definition_id?: string
          id?: string
          is_visible?: boolean
          sort_order?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_columns_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          created_at: string
          created_by: string | null
          default_view: Database["tasks"]["Enums"]["board_view"]
          department_id: string | null
          description: string | null
          folder_id: string | null
          id: string
          is_archived: boolean
          is_template: boolean
          name: string
          sort_order: number
          space_id: string
          status_set_id: string | null
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_view?: Database["tasks"]["Enums"]["board_view"]
          department_id?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_template?: boolean
          name: string
          sort_order?: number
          space_id: string
          status_set_id?: string | null
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_view?: Database["tasks"]["Enums"]["board_view"]
          department_id?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_template?: boolean
          name?: string
          sort_order?: number
          space_id?: string
          status_set_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boards_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_status_set_id_fkey"
            columns: ["status_set_id"]
            isOneToOne: false
            referencedRelation: "status_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          assignee_user_id: string | null
          checklist_id: string
          content: string
          id: string
          is_checked: boolean
          sort_order: number
        }
        Insert: {
          assignee_user_id?: string | null
          checklist_id: string
          content: string
          id?: string
          is_checked?: boolean
          sort_order?: number
        }
        Update: {
          assignee_user_id?: string | null
          checklist_id?: string
          content?: string
          id?: string
          is_checked?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          id: string
          name: string
          sort_order: number
          task_id: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          task_id: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean
          name: string
          name_ar: string
          type: Database["tasks"]["Enums"]["field_type"]
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          name: string
          name_ar: string
          type: Database["tasks"]["Enums"]["field_type"]
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean
          name?: string
          name_ar?: string
          type?: Database["tasks"]["Enums"]["field_type"]
        }
        Relationships: []
      }
      folders: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          name: string
          sort_order: number
          space_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          name: string
          sort_order?: number
          space_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          sort_order?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recurrence_rules: {
        Row: {
          board_id: string
          create_mode: Database["tasks"]["Enums"]["recurrence_create_mode"]
          created_at: string
          created_by: string | null
          day_of_month: number | null
          days_of_week: number[] | null
          ends_on: string | null
          frequency: Database["tasks"]["Enums"]["recurrence_frequency"]
          id: string
          interval: number
          is_active: boolean
          max_occurrences: number | null
          missed_run_behavior: Database["tasks"]["Enums"]["missed_run_behavior"]
          next_run_at: string | null
          source_task_id: string
          starts_on: string
        }
        Insert: {
          board_id: string
          create_mode: Database["tasks"]["Enums"]["recurrence_create_mode"]
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          ends_on?: string | null
          frequency: Database["tasks"]["Enums"]["recurrence_frequency"]
          id?: string
          interval?: number
          is_active?: boolean
          max_occurrences?: number | null
          missed_run_behavior?: Database["tasks"]["Enums"]["missed_run_behavior"]
          next_run_at?: string | null
          source_task_id: string
          starts_on: string
        }
        Update: {
          board_id?: string
          create_mode?: Database["tasks"]["Enums"]["recurrence_create_mode"]
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          ends_on?: string | null
          frequency?: Database["tasks"]["Enums"]["recurrence_frequency"]
          id?: string
          interval?: number
          is_active?: boolean
          max_occurrences?: number | null
          missed_run_behavior?: Database["tasks"]["Enums"]["missed_run_behavior"]
          next_run_at?: string | null
          source_task_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurrence_rules_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrence_rules_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          access_level: Database["tasks"]["Enums"]["access_level"]
          added_at: string
          added_by: string | null
          id: string
          space_id: string
          user_id: string
        }
        Insert: {
          access_level?: Database["tasks"]["Enums"]["access_level"]
          added_at?: string
          added_by?: string | null
          id?: string
          space_id: string
          user_id: string
        }
        Update: {
          access_level?: Database["tasks"]["Enums"]["access_level"]
          added_at?: string
          added_by?: string | null
          id?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          icon: string | null
          id: string
          is_archived: boolean
          is_template: boolean
          manager_user_id: string | null
          name: string
          owner_user_id: string | null
          project_id: string | null
          settings: Json
          space_type: Database["tasks"]["Enums"]["space_type"]
          status_set_id: string | null
          visibility: Database["tasks"]["Enums"]["visibility"]
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_template?: boolean
          manager_user_id?: string | null
          name: string
          owner_user_id?: string | null
          project_id?: string | null
          settings?: Json
          space_type: Database["tasks"]["Enums"]["space_type"]
          status_set_id?: string | null
          visibility?: Database["tasks"]["Enums"]["visibility"]
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_template?: boolean
          manager_user_id?: string | null
          name?: string
          owner_user_id?: string | null
          project_id?: string | null
          settings?: Json
          space_type?: Database["tasks"]["Enums"]["space_type"]
          status_set_id?: string | null
          visibility?: Database["tasks"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "spaces_status_set_id_fkey"
            columns: ["status_set_id"]
            isOneToOne: false
            referencedRelation: "status_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      status_sets: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          space_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          space_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_sets_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      statuses: {
        Row: {
          category: Database["tasks"]["Enums"]["status_category"]
          color: string | null
          created_at: string
          id: string
          label: string
          label_ar: string
          sort_order: number
          status_set_id: string
        }
        Insert: {
          category: Database["tasks"]["Enums"]["status_category"]
          color?: string | null
          created_at?: string
          id?: string
          label: string
          label_ar: string
          sort_order?: number
          status_set_id: string
        }
        Update: {
          category?: Database["tasks"]["Enums"]["status_category"]
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          label_ar?: string
          sort_order?: number
          status_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statuses_status_set_id_fkey"
            columns: ["status_set_id"]
            isOneToOne: false
            referencedRelation: "status_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          task_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          task_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_user_id: string
          body: Json
          created_at: string
          id: string
          is_resolved: boolean
          parent_comment_id: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: Json
          created_at?: string
          id?: string
          is_resolved?: boolean
          parent_comment_id?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: Json
          created_at?: string
          id?: string
          is_resolved?: boolean
          parent_comment_id?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          blocked_task_id: string
          blocking_task_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          blocked_task_id: string
          blocking_task_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          blocked_task_id?: string
          blocking_task_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_blocked_task_id_fkey"
            columns: ["blocked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_blocking_task_id_fkey"
            columns: ["blocking_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link_mode: Database["tasks"]["Enums"]["link_mode"]
          record_id: string
          record_type: Database["tasks"]["Enums"]["link_record_type"]
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_mode: Database["tasks"]["Enums"]["link_mode"]
          record_id: string
          record_type: Database["tasks"]["Enums"]["link_record_type"]
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_mode?: Database["tasks"]["Enums"]["link_mode"]
          record_id?: string
          record_type?: Database["tasks"]["Enums"]["link_record_type"]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          field_definition_id: string | null
          id: string
          related_task_id: string
          relationship_type: Database["tasks"]["Enums"]["relationship_type"]
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_definition_id?: string | null
          id?: string
          related_task_id: string
          relationship_type: Database["tasks"]["Enums"]["relationship_type"]
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_definition_id?: string | null
          id?: string
          related_task_id?: string
          relationship_type?: Database["tasks"]["Enums"]["relationship_type"]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_relationships_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_relationships_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_requirements: {
        Row: {
          config: Json
          id: string
          is_satisfied: boolean
          requirement_type: Database["tasks"]["Enums"]["requirement_type"]
          satisfied_at: string | null
          satisfied_by: string | null
          task_id: string
        }
        Insert: {
          config?: Json
          id?: string
          is_satisfied?: boolean
          requirement_type: Database["tasks"]["Enums"]["requirement_type"]
          satisfied_at?: string | null
          satisfied_by?: string | null
          task_id: string
        }
        Update: {
          config?: Json
          id?: string
          is_satisfied?: boolean
          requirement_type?: Database["tasks"]["Enums"]["requirement_type"]
          satisfied_at?: string | null
          satisfied_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_requirements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_role_assignees: {
        Row: {
          created_at: string
          created_by: string | null
          project_role_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          project_role_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          project_role_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_role_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          tag_id: string
          task_id: string
        }
        Insert: {
          tag_id: string
          task_id: string
        }
        Update: {
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          color: string | null
          icon: string | null
          id: string
          is_system: boolean
          name: string
          name_ar: string
        }
        Insert: {
          color?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          name_ar: string
        }
        Update: {
          color?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          name_ar?: string
        }
        Relationships: []
      }
      task_values: {
        Row: {
          field_definition_id: string
          id: string
          task_id: string
          value: Json
        }
        Insert: {
          field_definition_id: string
          id?: string
          task_id: string
          value?: Json
        }
        Update: {
          field_definition_id?: string
          id?: string
          task_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_values_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          board_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: Json
          due_date: string | null
          duration_days: number | null
          earliest_start: string | null
          id: string
          is_archived: boolean
          is_overdue: boolean
          is_summary: boolean
          is_template: boolean
          occurrence_date: string | null
          parent_task_id: string | null
          priority: Database["tasks"]["Enums"]["priority"] | null
          project_id: string | null
          recurrence_rule_id: string | null
          sort_order: number
          source_template_task_id: string | null
          start_date: string | null
          start_lag_days: number
          status_id: string
          task_type_id: string
          template_push_dismissed: boolean
          time_estimate_minutes: number | null
          title: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          board_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: Json
          due_date?: string | null
          duration_days?: number | null
          earliest_start?: string | null
          id?: string
          is_archived?: boolean
          is_overdue?: boolean
          is_summary?: boolean
          is_template?: boolean
          occurrence_date?: string | null
          parent_task_id?: string | null
          priority?: Database["tasks"]["Enums"]["priority"] | null
          project_id?: string | null
          recurrence_rule_id?: string | null
          sort_order?: number
          source_template_task_id?: string | null
          start_date?: string | null
          start_lag_days?: number
          status_id: string
          task_type_id?: string
          template_push_dismissed?: boolean
          time_estimate_minutes?: number | null
          title: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          board_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: Json
          due_date?: string | null
          duration_days?: number | null
          earliest_start?: string | null
          id?: string
          is_archived?: boolean
          is_overdue?: boolean
          is_summary?: boolean
          is_template?: boolean
          occurrence_date?: string | null
          parent_task_id?: string | null
          priority?: Database["tasks"]["Enums"]["priority"] | null
          project_id?: string | null
          recurrence_rule_id?: string | null
          sort_order?: number
          source_template_task_id?: string | null
          start_date?: string | null
          start_lag_days?: number
          status_id?: string
          task_type_id?: string
          template_push_dismissed?: boolean
          time_estimate_minutes?: number | null
          title?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_rule_id_fkey"
            columns: ["recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_template_task_id_fkey"
            columns: ["source_template_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      template_checklist_items: {
        Row: {
          content: string
          id: string
          sort_order: number
          template_checklist_id: string
        }
        Insert: {
          content: string
          id?: string
          sort_order?: number
          template_checklist_id: string
        }
        Update: {
          content?: string
          id?: string
          sort_order?: number
          template_checklist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_checklist_items_template_checklist_id_fkey"
            columns: ["template_checklist_id"]
            isOneToOne: false
            referencedRelation: "template_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      template_checklists: {
        Row: {
          id: string
          name: string
          sort_order: number
          template_task_id: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          template_task_id: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          template_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_checklists_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_copy_state: {
        Row: {
          c: Json
          copy_task_id: string
          removal_dismissed: boolean
          t: Json
          template_board_id: string
          updated_at: string
        }
        Insert: {
          c: Json
          copy_task_id: string
          removal_dismissed?: boolean
          t: Json
          template_board_id: string
          updated_at?: string
        }
        Update: {
          c?: Json
          copy_task_id?: string
          removal_dismissed?: boolean
          t?: Json
          template_board_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_copy_state_copy_task_id_fkey"
            columns: ["copy_task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field_definitions: {
        Row: {
          field_definition_id: string
          sort_order: number
          template_id: string
        }
        Insert: {
          field_definition_id: string
          sort_order?: number
          template_id: string
        }
        Update: {
          field_definition_id?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_field_definitions_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_field_definitions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_removed_tasks: {
        Row: {
          copy_task_id: string
          id: string
          removed_at: string
          template_board_id: string
          template_title: string
        }
        Insert: {
          copy_task_id: string
          id?: string
          removed_at?: string
          template_board_id: string
          template_title: string
        }
        Update: {
          copy_task_id?: string
          id?: string
          removed_at?: string
          template_board_id?: string
          template_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_removed_tasks_copy_task_id_fkey"
            columns: ["copy_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_requirements: {
        Row: {
          config: Json
          id: string
          requirement_type: Database["tasks"]["Enums"]["requirement_type"]
          template_task_id: string
        }
        Insert: {
          config?: Json
          id?: string
          requirement_type: Database["tasks"]["Enums"]["requirement_type"]
          template_task_id: string
        }
        Update: {
          config?: Json
          id?: string
          requirement_type?: Database["tasks"]["Enums"]["requirement_type"]
          template_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_requirements_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_tasks: {
        Row: {
          default_values: Json
          department_id: string | null
          description: Json
          id: string
          is_selected_by_default: boolean
          parent_template_task_id: string | null
          priority: Database["tasks"]["Enums"]["priority"] | null
          relative_due_offset_days: number | null
          relative_start_offset_days: number | null
          sort_order: number
          task_type_id: string
          template_id: string
          time_estimate_minutes: number | null
          title: string
          title_ar: string
        }
        Insert: {
          default_values?: Json
          department_id?: string | null
          description?: Json
          id?: string
          is_selected_by_default?: boolean
          parent_template_task_id?: string | null
          priority?: Database["tasks"]["Enums"]["priority"] | null
          relative_due_offset_days?: number | null
          relative_start_offset_days?: number | null
          sort_order?: number
          task_type_id?: string
          template_id: string
          time_estimate_minutes?: number | null
          title: string
          title_ar: string
        }
        Update: {
          default_values?: Json
          department_id?: string | null
          description?: Json
          id?: string
          is_selected_by_default?: boolean
          parent_template_task_id?: string | null
          priority?: Database["tasks"]["Enums"]["priority"] | null
          relative_due_offset_days?: number | null
          relative_start_offset_days?: number | null
          sort_order?: number
          task_type_id?: string
          template_id?: string
          time_estimate_minutes?: number | null
          title?: string
          title_ar?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_tasks_parent_template_task_id_fkey"
            columns: ["parent_template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_tasks_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          applies_to: string | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          name_ar: string
          template_scope: Database["tasks"]["Enums"]["template_scope"]
        }
        Insert: {
          applies_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          name_ar: string
          template_scope: Database["tasks"]["Enums"]["template_scope"]
        }
        Update: {
          applies_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          name_ar?: string
          template_scope?: Database["tasks"]["Enums"]["template_scope"]
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_billable: boolean
          started_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_billable?: boolean
          started_at: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_billable?: boolean
          started_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assign_roles: {
        Args: {
          p_created_by: string
          p_role_overrides: Json
          p_target_board_id: string
        }
        Returns: undefined
      }
      _copy_task_extras: {
        Args: {
          p_all_columns: boolean
          p_created_by: string
          p_shift_days: number
          p_source_board_id: string
          p_target_board_id: string
        }
        Returns: undefined
      }
      _has_ancestor_in: {
        Args: { p_ids: string[]; p_task_id: string }
        Returns: boolean
      }
      _inferred_anchor: {
        Args: { p_template_side_is_old: boolean }
        Returns: string
      }
      add_tasks_to_template: {
        Args: {
          p_created_by: string
          p_task_ids: string[]
          p_template_board_id: string
        }
        Returns: {
          source_task_id: string
          template_task_id: string
        }[]
      }
      add_working_days: {
        Args: { p_days: number; p_start: string }
        Returns: string
      }
      advance_recurrence_next_run: {
        Args: { p_rule: Database["tasks"]["Tables"]["recurrence_rules"]["Row"] }
        Returns: string
      }
      apply_template_board: {
        Args: {
          p_anchor_date: string
          p_created_by: string
          p_excluded_ids?: string[]
          p_role_overrides?: Json
          p_target_board_id: string
          p_template_board_id: string
        }
        Returns: {
          new_task_id: string
        }[]
      }
      assert_requirements_satisfied: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      automation_close_tasks_on_linked_record: {
        Args: {
          p_record_id: string
          p_record_type: Database["tasks"]["Enums"]["link_record_type"]
        }
        Returns: undefined
      }
      automation_guard_enter: {
        Args: { p_key: string; p_task_id: string }
        Returns: boolean
      }
      copy_task_tree: {
        Args: {
          p_anchor_date: string
          p_created_by: string
          p_excluded_ids?: string[]
          p_parent_task_id?: string
          p_source_root_id: string
          p_source_type: Database["tasks"]["Enums"]["copy_source_type"]
          p_target_board_id: string
        }
        Returns: {
          new_id: string
          old_id: string
        }[]
      }
      create_scheduled_task: {
        Args: {
          p_anchor_task_id?: string
          p_board_id: string
          p_dry_run?: boolean
          p_duration_days: number
          p_lag_days?: number
          p_mode?: string
          p_parent_task_id?: string
          p_push_successors?: boolean
          p_start_date?: string
          p_title: string
        }
        Returns: Json
      }
      dashboard_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      default_task_type_id: { Args: never; Returns: string }
      dependency_problem: {
        Args: { p_blocked_task_id: string; p_blocking_task_id: string }
        Returns: string
      }
      dependency_would_cycle: {
        Args: { p_blocked_task_id: string; p_blocking_task_id: string }
        Returns: boolean
      }
      dismiss_template_changes: {
        Args: {
          p_removed_ids?: string[]
          p_task_ids: string[]
          p_template_board_id: string
        }
        Returns: number
      }
      generate_recurrence_occurrences: { Args: never; Returns: undefined }
      is_off_day: { Args: { p_day: string }; Returns: boolean }
      local_today: { Args: never; Returns: string }
      my_access: { Args: never; Returns: Json }
      next_working_day: { Args: { p_day: string }; Returns: string }
      performance_person_tasks: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: {
          completed_at: string
          due_date: string
          kind: string
          lateness_ratio: number
          multiplier: number
          on_time: boolean
          planned_days: number
          points: number
          scored: boolean
          share: number
          task_id: string
          title: string
          weight: number
        }[]
      }
      performance_summary: {
        Args: {
          p_department_id?: string
          p_from: string
          p_person_type?: string
          p_to: string
        }
        Returns: {
          avg_late_ratio: number
          department_id: string
          efficiency: number
          first_name: string
          is_contractor: boolean
          is_eligible: boolean
          last_name: string
          max_points: number
          on_time_rate: number
          open_overdue: number
          points: number
          scored_tasks: number
          unscored_tasks: number
          user_id: string
        }[]
      }
      performance_trend: {
        Args: {
          p_department_id?: string
          p_from: string
          p_person_type?: string
          p_to: string
        }
        Returns: {
          efficiency: number
          max_points: number
          month: string
          points: number
          scored_tasks: number
        }[]
      }
      push_template_tasks: {
        Args: {
          p_created_by: string
          p_default_anchor: string
          p_role_overrides?: Json
          p_target_board_ids: string[]
          p_task_ids: string[]
          p_template_board_id: string
        }
        Returns: {
          new_task_id: string
        }[]
      }
      recompute_overdue_flags: { Args: never; Returns: undefined }
      resolve_status_set: { Args: { p_board_id: string }; Returns: string }
      run_due_date_automations: { Args: never; Returns: undefined }
      sync_template_changes: {
        Args: {
          p_removed_ids?: string[]
          p_role_overrides?: Json
          p_target_board_ids: string[]
          p_task_ids: string[]
          p_template_board_id: string
        }
        Returns: Json
      }
      task_caps: {
        Args: { p_ids: string[] }
        Returns: {
          can_comment: boolean
          can_delete: boolean
          can_edit: boolean
          can_status: boolean
          can_view: boolean
          is_assignee: boolean
          level: number
          task_id: string
        }[]
      }
      template_changes: { Args: { p_template_board_id: string }; Returns: Json }
      template_epoch: { Args: never; Returns: string }
      template_space_id: { Args: never; Returns: string }
      template_sync_status: { Args: { p_board_id: string }; Returns: Json }
      update_task_schedule: {
        Args: {
          p_dry_run?: boolean
          p_due_date?: string
          p_duration_days?: number
          p_lag_days?: number
          p_start_date?: string
          p_task_id: string
        }
        Returns: Json
      }
      working_day_on_or_after: { Args: { p_day: string }; Returns: string }
      working_days_between: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
    }
    Enums: {
      access_level: "view" | "comment" | "edit" | "full"
      automation_action_type:
        | "set_status"
        | "set_assignee"
        | "set_priority"
        | "post_comment"
        | "move_task"
        | "create_task"
        | "send_notification"
        | "apply_template"
      automation_run_status: "success" | "failed" | "skipped"
      automation_scope_type: "space" | "folder" | "board"
      automation_trigger_type:
        | "status_changed"
        | "task_created"
        | "due_date_arrives"
        | "field_changed"
        | "assignee_changed"
        | "all_subtasks_complete"
        | "dependency_cleared"
        | "linked_record_changed"
      board_view: "list" | "board"
      copy_source_type: "template" | "task"
      field_type:
        | "text"
        | "long_text"
        | "number"
        | "currency"
        | "date"
        | "select"
        | "multi_select"
        | "user"
        | "checkbox"
        | "url"
        | "email"
        | "phone"
        | "formula"
        | "relationship"
      link_mode: "produces" | "references"
      link_record_type:
        | "shop_order"
        | "work_request"
        | "contract_round"
        | "contract"
        | "payment_request"
        | "expense"
        | "project_map"
      missed_run_behavior: "backfill" | "skip"
      priority: "urgent" | "high" | "normal" | "low"
      recurrence_create_mode: "on_schedule" | "after_completion"
      recurrence_frequency: "daily" | "weekly" | "monthly" | "yearly"
      relationship_type: "relates_to" | "duplicate_of" | "reference"
      requirement_type:
        | "attachment"
        | "report"
        | "approval"
        | "checklist_complete"
        | "subtasks_complete"
        | "linked_record"
      space_type: "project" | "department" | "company" | "personal"
      status_category: "not_started" | "active" | "done" | "closed"
      template_scope: "board" | "task"
      visibility: "public" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  website: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          alt_ar: string
          alt_en: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_ar: string
          alt_en: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_ar?: string
          alt_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          storage_path?: string
        }
        Relationships: []
      }
      project_images: {
        Row: {
          alt_ar: string
          alt_en: string
          created_at: string
          id: string
          is_cover: boolean
          original_filename: string | null
          project_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_ar: string
          alt_en: string
          created_at?: string
          id?: string
          is_cover?: boolean
          original_filename?: string | null
          project_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_ar?: string
          alt_en?: string
          created_at?: string
          id?: string
          is_cover?: boolean
          original_filename?: string | null
          project_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category_id: string
          client_ar: string | null
          client_en: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          location_ar: string | null
          location_en: string | null
          slug: string
          sort_order: number
          status_ar: string | null
          status_en: string | null
          title_ar: string
          title_en: string
          updated_at: string
          year: string | null
        }
        Insert: {
          category_id: string
          client_ar?: string | null
          client_en?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          location_ar?: string | null
          location_en?: string | null
          slug: string
          sort_order?: number
          status_ar?: string | null
          status_en?: string | null
          title_ar: string
          title_en: string
          updated_at?: string
          year?: string | null
        }
        Update: {
          category_id?: string
          client_ar?: string | null
          client_en?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          location_ar?: string | null
          location_en?: string | null
          slug?: string
          sort_order?: number
          status_ar?: string | null
          status_en?: string | null
          title_ar?: string
          title_en?: string
          updated_at?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  app: {
    Enums: {},
  },
  boq: {
    Enums: {},
  },
  contracts: {
    Enums: {
      contract_status: ["draft", "active", "completed", "cancelled"],
      milestone_status: ["pending", "in_progress", "done"],
      payment_status: ["pending", "approved", "rejected", "paid"],
      round_status: ["draft", "pricing", "awarded", "cancelled"],
    },
  },
  drawings: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  hr: {
    Enums: {},
  },
  lookups: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["cash", "bank"],
      bid_status: ["pending", "accepted", "rejected", "withdrawn"],
      contract_status: ["active", "completed", "terminated", "on_hold"],
      currency_type: ["LYD", "USD", "EUR"],
      employee_type: ["intern", "contractor", "part-time", "full-time"],
      expense_status: [
        "pending",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
        "unpaid",
        "deleted",
      ],
      expense_type: ["material", "labor", "maps"],
      fund_type: ["client", "internal", "sale", "refund", "other"],
      grant_scope_enum: ["all_projects", "team_projects_only"],
      milestone_status: ["pending", "in_progress", "completed", "approved"],
      owner_type: ["employee", "project", "company", "contractor"],
      party_type_enum: ["company", "vendor", "contractor", "client"],
      payment_method: ["cash", "bank"],
      payment_request_status: ["pending", "approved", "declined", "paid"],
      payment_type: ["cash", "cheque", "transfer", "deposit", "bank"],
      percentage_log_type: ["expense", "refund"],
      phase_type: ["construction", "finishing", "initial"],
      project_status_enum: ["active", "paused", "completed", "cancelled"],
      projects_type: ["construction", "consulting"],
      transaction_type: ["debit", "credit"],
      user_status_enum: ["active", "inactive", "on leave", "on holiday"],
      work_request_mode: ["open", "direct"],
      work_request_status: ["draft", "open", "bidding", "awarded", "cancelled"],
    },
  },
  tasks: {
    Enums: {
      access_level: ["view", "comment", "edit", "full"],
      automation_action_type: [
        "set_status",
        "set_assignee",
        "set_priority",
        "post_comment",
        "move_task",
        "create_task",
        "send_notification",
        "apply_template",
      ],
      automation_run_status: ["success", "failed", "skipped"],
      automation_scope_type: ["space", "folder", "board"],
      automation_trigger_type: [
        "status_changed",
        "task_created",
        "due_date_arrives",
        "field_changed",
        "assignee_changed",
        "all_subtasks_complete",
        "dependency_cleared",
        "linked_record_changed",
      ],
      board_view: ["list", "board"],
      copy_source_type: ["template", "task"],
      field_type: [
        "text",
        "long_text",
        "number",
        "currency",
        "date",
        "select",
        "multi_select",
        "user",
        "checkbox",
        "url",
        "email",
        "phone",
        "formula",
        "relationship",
      ],
      link_mode: ["produces", "references"],
      link_record_type: [
        "shop_order",
        "work_request",
        "contract_round",
        "contract",
        "payment_request",
        "expense",
        "project_map",
      ],
      missed_run_behavior: ["backfill", "skip"],
      priority: ["urgent", "high", "normal", "low"],
      recurrence_create_mode: ["on_schedule", "after_completion"],
      recurrence_frequency: ["daily", "weekly", "monthly", "yearly"],
      relationship_type: ["relates_to", "duplicate_of", "reference"],
      requirement_type: [
        "attachment",
        "report",
        "approval",
        "checklist_complete",
        "subtasks_complete",
        "linked_record",
      ],
      space_type: ["project", "department", "company", "personal"],
      status_category: ["not_started", "active", "done", "closed"],
      template_scope: ["board", "task"],
      visibility: ["public", "private"],
    },
  },
  website: {
    Enums: {},
  },
} as const
