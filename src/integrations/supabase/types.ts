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
      account_identifiers: {
        Row: {
          account_id: string
          created_at: string
          household_id: string
          id: string
          identifier_hash: string
          kind: string
          last4: string | null
          source: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          household_id: string
          id?: string
          identifier_hash: string
          kind?: string
          last4?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          household_id?: string
          id?: string
          identifier_hash?: string
          kind?: string
          last4?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_identifiers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_identifiers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      account_proposals: {
        Row: {
          account_type: string | null
          closing_balance: number | null
          closing_balance_date: string | null
          country: string | null
          created_at: string
          currency: string | null
          fingerprint: string
          holder: string | null
          household_id: string
          id: string
          identifier_hash: string | null
          identifier_kind: string | null
          identifier_last4: string | null
          institution: string | null
          institution_domain: string | null
          match_confidence: number
          match_reason: string | null
          matched_account_id: string | null
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
          resolved_account_id: string | null
          resolved_at: string | null
          statement_count: number
          status: string
          suggested_nickname: string
          updated_at: string
        }
        Insert: {
          account_type?: string | null
          closing_balance?: number | null
          closing_balance_date?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          fingerprint: string
          holder?: string | null
          household_id: string
          id?: string
          identifier_hash?: string | null
          identifier_kind?: string | null
          identifier_last4?: string | null
          institution?: string | null
          institution_domain?: string | null
          match_confidence?: number
          match_reason?: string | null
          matched_account_id?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          resolved_account_id?: string | null
          resolved_at?: string | null
          statement_count?: number
          status?: string
          suggested_nickname: string
          updated_at?: string
        }
        Update: {
          account_type?: string | null
          closing_balance?: number | null
          closing_balance_date?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          fingerprint?: string
          holder?: string | null
          household_id?: string
          id?: string
          identifier_hash?: string | null
          identifier_kind?: string | null
          identifier_last4?: string | null
          institution?: string | null
          institution_domain?: string | null
          match_confidence?: number
          match_reason?: string | null
          matched_account_id?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          resolved_account_id?: string | null
          resolved_at?: string | null
          statement_count?: number
          status?: string
          suggested_nickname?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_proposals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_proposals_matched_account_id_fkey"
            columns: ["matched_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_proposals_resolved_account_id_fkey"
            columns: ["resolved_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string
          balance_source: string
          balance_statement_id: string | null
          country: string
          created_at: string
          currency: string
          current_balance: number
          discovered_from: string
          household_id: string
          id: string
          identifier_mask: string | null
          institution: string | null
          institution_domain: string | null
          is_active: boolean
          is_joint: boolean
          last_balance_update: string | null
          nickname: string
          owner_profile_id: string | null
          statement_holder: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          account_type?: string
          balance_source?: string
          balance_statement_id?: string | null
          country?: string
          created_at?: string
          currency?: string
          current_balance?: number
          discovered_from?: string
          household_id: string
          id?: string
          identifier_mask?: string | null
          institution?: string | null
          institution_domain?: string | null
          is_active?: boolean
          is_joint?: boolean
          last_balance_update?: string | null
          nickname: string
          owner_profile_id?: string | null
          statement_holder?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          account_type?: string
          balance_source?: string
          balance_statement_id?: string | null
          country?: string
          created_at?: string
          currency?: string
          current_balance?: number
          discovered_from?: string
          household_id?: string
          id?: string
          identifier_mask?: string | null
          institution?: string | null
          institution_domain?: string | null
          is_active?: boolean
          is_joint?: boolean
          last_balance_update?: string | null
          nickname?: string
          owner_profile_id?: string | null
          statement_holder?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_balance_statement_id_fkey"
            columns: ["balance_statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_chat: {
        Row: {
          content: string
          context_snapshot: Json | null
          created_at: string
          household_id: string
          id: string
          model: string | null
          profile_id: string | null
          reasoning: string | null
          role: string
          updated_at: string
        }
        Insert: {
          content: string
          context_snapshot?: Json | null
          created_at?: string
          household_id: string
          id?: string
          model?: string | null
          profile_id?: string | null
          reasoning?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          content?: string
          context_snapshot?: Json | null
          created_at?: string
          household_id?: string
          id?: string
          model?: string | null
          profile_id?: string | null
          reasoning?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_chat_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_chat_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_notes: {
        Row: {
          body: string | null
          created_at: string
          fingerprint: string | null
          generated_at: string
          household_id: string
          id: string
          is_read: boolean
          kind: string
          related_goal_id: string | null
          related_ticker: string | null
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          fingerprint?: string | null
          generated_at?: string
          household_id: string
          id?: string
          is_read?: boolean
          kind?: string
          related_goal_id?: string | null
          related_ticker?: string | null
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          fingerprint?: string | null
          generated_at?: string
          household_id?: string
          id?: string
          is_read?: boolean
          kind?: string
          related_goal_id?: string | null
          related_ticker?: string | null
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_notes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_notes_related_goal_id_fkey"
            columns: ["related_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_emails: {
        Row: {
          claimed_at: string | null
          created_at: string
          email: string
          household_id: string | null
          id: string
          invited_by: string | null
          role: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          email: string
          household_id?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          email?: string
          household_id?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowed_emails_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acquisition_cost: number | null
          acquisition_date: string | null
          asset_class: string
          country: string | null
          created_at: string
          currency: string
          current_value: number
          household_id: string
          id: string
          is_liquid: boolean
          last_valued_at: string | null
          metadata: Json
          name: string
          notes: string | null
          owner_profile_id: string | null
          ownership_pct: number
          updated_at: string
          valuation_method: string | null
        }
        Insert: {
          acquisition_cost?: number | null
          acquisition_date?: string | null
          asset_class?: string
          country?: string | null
          created_at?: string
          currency?: string
          current_value?: number
          household_id: string
          id?: string
          is_liquid?: boolean
          last_valued_at?: string | null
          metadata?: Json
          name: string
          notes?: string | null
          owner_profile_id?: string | null
          ownership_pct?: number
          updated_at?: string
          valuation_method?: string | null
        }
        Update: {
          acquisition_cost?: number | null
          acquisition_date?: string | null
          asset_class?: string
          country?: string | null
          created_at?: string
          currency?: string
          current_value?: number
          household_id?: string
          id?: string
          is_liquid?: boolean
          last_valued_at?: string | null
          metadata?: Json
          name?: string
          notes?: string | null
          owner_profile_id?: string | null
          ownership_pct?: number
          updated_at?: string
          valuation_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          created_at: string
          detail: Json | null
          duration_ms: number | null
          households: number
          id: string
          job: string
          message: string | null
          ran_at: string
          status: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          households?: number
          id?: string
          job: string
          message?: string | null
          ran_at?: string
          status: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          households?: number
          id?: string
          job?: string
          message?: string | null
          ran_at?: string
          status?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_group: string
          colour: string | null
          created_at: string
          household_id: string
          icon: string | null
          id: string
          is_essential: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category_group: string
          colour?: string | null
          created_at?: string
          household_id: string
          icon?: string | null
          id?: string
          is_essential?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category_group?: string
          colour?: string | null
          created_at?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_essential?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          applied_count: number
          category_id: string
          created_at: string
          created_by: string | null
          created_from_transaction_id: string | null
          household_id: string
          id: string
          is_active: boolean
          match_pattern: string
          match_type: string
          updated_at: string
        }
        Insert: {
          applied_count?: number
          category_id: string
          created_at?: string
          created_by?: string | null
          created_from_transaction_id?: string | null
          household_id: string
          id?: string
          is_active?: boolean
          match_pattern: string
          match_type?: string
          updated_at?: string
        }
        Update: {
          applied_count?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          created_from_transaction_id?: string | null
          household_id?: string
          id?: string
          is_active?: boolean
          match_pattern?: string
          match_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_rules_created_from_transaction_id_fkey"
            columns: ["created_from_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      childcare_plans: {
        Row: {
          created_at: string
          currency: string
          funded_eligible: boolean
          funded_hours_per_week: number
          funded_hours_start: string | null
          funded_weeks_per_year: number
          hourly_rate: number
          hours_per_week: number
          household_id: string
          id: string
          life_event_id: string
          monthly_extras: number
          notes: string | null
          provider_type: string
          starts_on: string | null
          tax_free_childcare: boolean
          updated_at: string
          weeks_per_year: number
        }
        Insert: {
          created_at?: string
          currency?: string
          funded_eligible?: boolean
          funded_hours_per_week?: number
          funded_hours_start?: string | null
          funded_weeks_per_year?: number
          hourly_rate?: number
          hours_per_week?: number
          household_id: string
          id?: string
          life_event_id: string
          monthly_extras?: number
          notes?: string | null
          provider_type?: string
          starts_on?: string | null
          tax_free_childcare?: boolean
          updated_at?: string
          weeks_per_year?: number
        }
        Update: {
          created_at?: string
          currency?: string
          funded_eligible?: boolean
          funded_hours_per_week?: number
          funded_hours_start?: string | null
          funded_weeks_per_year?: number
          hourly_rate?: number
          hours_per_week?: number
          household_id?: string
          id?: string
          life_event_id?: string
          monthly_extras?: number
          notes?: string | null
          provider_type?: string
          starts_on?: string | null
          tax_free_childcare?: boolean
          updated_at?: string
          weeks_per_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "childcare_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "childcare_plans_life_event_id_fkey"
            columns: ["life_event_id"]
            isOneToOne: false
            referencedRelation: "life_events"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          attempts: number
          confidence: number | null
          created_at: string
          detected_type: string | null
          doc_type: string | null
          error_message: string | null
          extracted: Json | null
          extracted_at: string | null
          file_hash: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          household_id: string
          id: string
          import_batch_id: string | null
          locked_at: string | null
          mime_type: string | null
          next_attempt_at: string | null
          owner_profile_id: string | null
          period_end: string | null
          period_start: string | null
          record_id: string | null
          source_format: string | null
          statement_id: string | null
          status: string
          storage_bucket: string
          type_confidence: number | null
          type_hint: string | null
          type_reason: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          attempts?: number
          confidence?: number | null
          created_at?: string
          detected_type?: string | null
          doc_type?: string | null
          error_message?: string | null
          extracted?: Json | null
          extracted_at?: string | null
          file_hash?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          household_id: string
          id?: string
          import_batch_id?: string | null
          locked_at?: string | null
          mime_type?: string | null
          next_attempt_at?: string | null
          owner_profile_id?: string | null
          period_end?: string | null
          period_start?: string | null
          record_id?: string | null
          source_format?: string | null
          statement_id?: string | null
          status?: string
          storage_bucket?: string
          type_confidence?: number | null
          type_hint?: string | null
          type_reason?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          attempts?: number
          confidence?: number | null
          created_at?: string
          detected_type?: string | null
          doc_type?: string | null
          error_message?: string | null
          extracted?: Json | null
          extracted_at?: string | null
          file_hash?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          household_id?: string
          id?: string
          import_batch_id?: string | null
          locked_at?: string | null
          mime_type?: string | null
          next_attempt_at?: string | null
          owner_profile_id?: string | null
          period_end?: string | null
          period_start?: string | null
          record_id?: string | null
          source_format?: string | null
          statement_id?: string | null
          status?: string
          storage_bucket?: string
          type_confidence?: number | null
          type_hint?: string | null
          type_reason?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_expenses: {
        Row: {
          amount: number
          category_id: string | null
          confidence: string
          created_at: string
          currency: string
          end_date: string | null
          event_offset_months: number | null
          frequency: string
          household_id: string
          id: string
          inflation_rate: number
          label: string
          life_event_id: string | null
          notes: string | null
          owner_profile_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          confidence?: string
          created_at?: string
          currency?: string
          end_date?: string | null
          event_offset_months?: number | null
          frequency?: string
          household_id: string
          id?: string
          inflation_rate?: number
          label: string
          life_event_id?: string | null
          notes?: string | null
          owner_profile_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          confidence?: string
          created_at?: string
          currency?: string
          end_date?: string | null
          event_offset_months?: number | null
          frequency?: string
          household_id?: string
          id?: string
          inflation_rate?: number
          label?: string
          life_event_id?: string | null
          notes?: string | null
          owner_profile_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_expenses_life_event_id_fkey"
            columns: ["life_event_id"]
            isOneToOne: false
            referencedRelation: "life_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_expenses_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          as_of: string
          base_ccy: string
          created_at: string
          id: string
          quote_ccy: string
          rate: number
          updated_at: string
        }
        Insert: {
          as_of?: string
          base_ccy: string
          created_at?: string
          id?: string
          quote_ccy: string
          rate: number
          updated_at?: string
        }
        Update: {
          as_of?: string
          base_ccy?: string
          created_at?: string
          id?: string
          quote_ccy?: string
          rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      goal_line_items: {
        Row: {
          created_at: string
          currency: string
          estimated_cost: number
          goal_id: string
          household_id: string
          id: string
          is_purchased: boolean
          kind: string
          label: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          estimated_cost?: number
          goal_id: string
          household_id: string
          id?: string
          is_purchased?: boolean
          kind?: string
          label: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          estimated_cost?: number
          goal_id?: string
          household_id?: string
          id?: string
          is_purchased?: boolean
          kind?: string
          label?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_line_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_line_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          additional_property: boolean
          country: string | null
          created_at: string
          currency: string
          description: string | null
          financed_amount: number
          financed_rate: number | null
          financed_term_years: number | null
          first_time_buyer: boolean
          funded_amount: number
          goal_category: string
          household_id: string
          id: string
          image_path: string | null
          life_event_id: string | null
          non_uk_resident: boolean
          notes: string | null
          owner_profile_id: string | null
          priority: string
          sort_order: number
          status: string
          target_amount: number
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          additional_property?: boolean
          country?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          financed_amount?: number
          financed_rate?: number | null
          financed_term_years?: number | null
          first_time_buyer?: boolean
          funded_amount?: number
          goal_category?: string
          household_id: string
          id?: string
          image_path?: string | null
          life_event_id?: string | null
          non_uk_resident?: boolean
          notes?: string | null
          owner_profile_id?: string | null
          priority?: string
          sort_order?: number
          status?: string
          target_amount?: number
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          additional_property?: boolean
          country?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          financed_amount?: number
          financed_rate?: number | null
          financed_term_years?: number | null
          first_time_buyer?: boolean
          funded_amount?: number
          goal_category?: string
          household_id?: string
          id?: string
          image_path?: string | null
          life_event_id?: string | null
          non_uk_resident?: boolean
          notes?: string | null
          owner_profile_id?: string | null
          priority?: string
          sort_order?: number
          status?: string
          target_amount?: number
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_life_event_id_fkey"
            columns: ["life_event_id"]
            isOneToOne: false
            referencedRelation: "life_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          account_id: string | null
          avg_cost: number | null
          created_at: string
          currency: string
          discovered_from: string
          exchange: string | null
          falsification: string | null
          household_id: string
          id: string
          name: string | null
          notes: string | null
          opened_at: string | null
          opening_cost: number | null
          opening_quantity: number
          owner_profile_id: string | null
          position_evidence: Json | null
          quantity: number
          realised_pnl: number | null
          security_type: string
          shariah_note: string | null
          shariah_status: string
          sleeve: string
          target_price: number | null
          thesis: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          avg_cost?: number | null
          created_at?: string
          currency?: string
          discovered_from?: string
          exchange?: string | null
          falsification?: string | null
          household_id: string
          id?: string
          name?: string | null
          notes?: string | null
          opened_at?: string | null
          opening_cost?: number | null
          opening_quantity?: number
          owner_profile_id?: string | null
          position_evidence?: Json | null
          quantity?: number
          realised_pnl?: number | null
          security_type?: string
          shariah_note?: string | null
          shariah_status?: string
          sleeve?: string
          target_price?: number | null
          thesis?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          avg_cost?: number | null
          created_at?: string
          currency?: string
          discovered_from?: string
          exchange?: string | null
          falsification?: string | null
          household_id?: string
          id?: string
          name?: string | null
          notes?: string | null
          opened_at?: string | null
          opening_cost?: number | null
          opening_quantity?: number
          owner_profile_id?: string | null
          position_evidence?: Json | null
          quantity?: number
          realised_pnl?: number | null
          security_type?: string
          shariah_note?: string | null
          shariah_status?: string
          sleeve?: string
          target_price?: number | null
          thesis?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          base_currency: string
          created_at: string
          id: string
          income_replacement_years: number
          name: string
          onboarding_completed_at: string | null
          onboarding_step: number
          partner_display_name: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          id?: string
          income_replacement_years?: number
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          partner_display_name?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          id?: string
          income_replacement_years?: number
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          partner_display_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          accounts_proposed: number
          created_at: string
          created_by: string | null
          duplicate_files: number
          duplicates_skipped: number
          failed_files: number
          finished_at: string | null
          finished_files: number
          household_id: string
          id: string
          message: string | null
          started_at: string | null
          status: string
          total_files: number
          transactions_imported: number
          updated_at: string
        }
        Insert: {
          accounts_proposed?: number
          created_at?: string
          created_by?: string | null
          duplicate_files?: number
          duplicates_skipped?: number
          failed_files?: number
          finished_at?: string | null
          finished_files?: number
          household_id: string
          id?: string
          message?: string | null
          started_at?: string | null
          status?: string
          total_files?: number
          transactions_imported?: number
          updated_at?: string
        }
        Update: {
          accounts_proposed?: number
          created_at?: string
          created_by?: string | null
          duplicate_files?: number
          duplicates_skipped?: number
          failed_files?: number
          finished_at?: string | null
          finished_files?: number
          household_id?: string
          id?: string
          message?: string | null
          started_at?: string | null
          status?: string
          total_files?: number
          transactions_imported?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      income_streams: {
        Row: {
          annual_growth_rate: number
          country: string | null
          created_at: string
          currency: string
          end_date: string | null
          frequency: string
          gross_amount: number
          household_id: string
          id: string
          income_type: string
          label: string
          last_observed_at: string | null
          net_amount: number | null
          owner_profile_id: string | null
          source: string
          start_date: string | null
          taxed_at_source: boolean
          uk_self_assessment: boolean
          updated_at: string
        }
        Insert: {
          annual_growth_rate?: number
          country?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          gross_amount?: number
          household_id: string
          id?: string
          income_type?: string
          label: string
          last_observed_at?: string | null
          net_amount?: number | null
          owner_profile_id?: string | null
          source?: string
          start_date?: string | null
          taxed_at_source?: boolean
          uk_self_assessment?: boolean
          updated_at?: string
        }
        Update: {
          annual_growth_rate?: number
          country?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          gross_amount?: number
          household_id?: string
          id?: string
          income_type?: string
          label?: string
          last_observed_at?: string | null
          net_amount?: number | null
          owner_profile_id?: string | null
          source?: string
          start_date?: string | null
          taxed_at_source?: boolean
          uk_self_assessment?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_streams_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_streams_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          beneficiaries: string | null
          benefit_amount: number | null
          benefit_frequency: string | null
          benefit_period_months: number | null
          confidence: number | null
          created_at: string
          currency: string
          deferred_period_weeks: number | null
          document_id: string | null
          end_date: string | null
          exclusions: string | null
          household_id: string
          id: string
          in_trust: boolean | null
          insured_person: string | null
          insurer: string
          insurer_domain: string | null
          needs_review: boolean
          notes: string | null
          owner_profile_id: string | null
          policy_number_last4: string | null
          policy_type: string
          premium_amount: number | null
          premium_frequency: string
          renewal_date: string | null
          source: string
          start_date: string | null
          status: string
          sum_assured: number | null
          updated_at: string
        }
        Insert: {
          beneficiaries?: string | null
          benefit_amount?: number | null
          benefit_frequency?: string | null
          benefit_period_months?: number | null
          confidence?: number | null
          created_at?: string
          currency?: string
          deferred_period_weeks?: number | null
          document_id?: string | null
          end_date?: string | null
          exclusions?: string | null
          household_id: string
          id?: string
          in_trust?: boolean | null
          insured_person?: string | null
          insurer: string
          insurer_domain?: string | null
          needs_review?: boolean
          notes?: string | null
          owner_profile_id?: string | null
          policy_number_last4?: string | null
          policy_type?: string
          premium_amount?: number | null
          premium_frequency?: string
          renewal_date?: string | null
          source?: string
          start_date?: string | null
          status?: string
          sum_assured?: number | null
          updated_at?: string
        }
        Update: {
          beneficiaries?: string | null
          benefit_amount?: number | null
          benefit_frequency?: string | null
          benefit_period_months?: number | null
          confidence?: number | null
          created_at?: string
          currency?: string
          deferred_period_weeks?: number | null
          document_id?: string | null
          end_date?: string | null
          exclusions?: string | null
          household_id?: string
          id?: string
          in_trust?: boolean | null
          insured_person?: string | null
          insurer?: string
          insurer_domain?: string | null
          needs_review?: boolean
          notes?: string | null
          owner_profile_id?: string | null
          policy_number_last4?: string | null
          policy_type?: string
          premium_amount?: number | null
          premium_frequency?: string
          renewal_date?: string | null
          source?: string
          start_date?: string | null
          status?: string
          sum_assured?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_mandates: {
        Row: {
          additional_constraints: string | null
          created_at: string
          crypto_cap_pct: number
          household_id: string
          id: string
          mandate_type: string
          notes: string | null
          profile_id: string
          single_name_cap_pct: number
          speculative_cap_pct: number
          target_core_pct: number
          target_income_pct: number
          target_satellite_pct: number
          target_thematic_pct: number
          updated_at: string
        }
        Insert: {
          additional_constraints?: string | null
          created_at?: string
          crypto_cap_pct?: number
          household_id: string
          id?: string
          mandate_type?: string
          notes?: string | null
          profile_id: string
          single_name_cap_pct?: number
          speculative_cap_pct?: number
          target_core_pct?: number
          target_income_pct?: number
          target_satellite_pct?: number
          target_thematic_pct?: number
          updated_at?: string
        }
        Update: {
          additional_constraints?: string | null
          created_at?: string
          crypto_cap_pct?: number
          household_id?: string
          id?: string
          mandate_type?: string
          notes?: string | null
          profile_id?: string
          single_name_cap_pct?: number
          speculative_cap_pct?: number
          target_core_pct?: number
          target_income_pct?: number
          target_satellite_pct?: number
          target_thematic_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_mandates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_mandates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          created_at: string
          currency: string
          end_date: string | null
          household_id: string
          id: string
          interest_rate: number | null
          liability_type: string
          linked_asset_id: string | null
          monthly_payment: number | null
          name: string
          notes: string | null
          original_amount: number | null
          outstanding_balance: number
          owner_profile_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          end_date?: string | null
          household_id: string
          id?: string
          interest_rate?: number | null
          liability_type?: string
          linked_asset_id?: string | null
          monthly_payment?: number | null
          name: string
          notes?: string | null
          original_amount?: number | null
          outstanding_balance?: number
          owner_profile_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          end_date?: string | null
          household_id?: string
          id?: string
          interest_rate?: number | null
          liability_type?: string
          linked_asset_id?: string | null
          monthly_payment?: number | null
          name?: string
          notes?: string | null
          original_amount?: number | null
          outstanding_balance?: number
          owner_profile_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liabilities_linked_asset_id_fkey"
            columns: ["linked_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liabilities_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      life_event_tasks: {
        Row: {
          category: string
          completed_at: string | null
          created_at: string
          detail: string | null
          due_date: string | null
          household_id: string
          id: string
          is_legal_deadline: boolean
          life_event_id: string
          offset_days: number
          sort_order: number
          status: string
          task_key: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          due_date?: string | null
          household_id: string
          id?: string
          is_legal_deadline?: boolean
          life_event_id: string
          offset_days?: number
          sort_order?: number
          status?: string
          task_key: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          due_date?: string | null
          household_id?: string
          id?: string
          is_legal_deadline?: boolean
          life_event_id?: string
          offset_days?: number
          sort_order?: number
          status?: string
          task_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_event_tasks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "life_event_tasks_life_event_id_fkey"
            columns: ["life_event_id"]
            isOneToOne: false
            referencedRelation: "life_events"
            referencedColumns: ["id"]
          },
        ]
      }
      life_events: {
        Row: {
          child_count: number
          created_at: string
          event_type: string
          expected_date: string
          household_id: string
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          child_count?: number
          created_at?: string
          event_type?: string
          expected_date: string
          household_id: string
          id?: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          child_count?: number
          created_at?: string
          event_type?: string
          expected_date?: string
          household_id?: string
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_snapshots: {
        Row: {
          as_of: string
          base_currency: string
          breakdown: Json | null
          created_at: string
          household_id: string
          id: string
          liquid_net_worth: number
          net_worth: number
          total_assets: number
          total_liabilities: number
          updated_at: string
        }
        Insert: {
          as_of?: string
          base_currency?: string
          breakdown?: Json | null
          created_at?: string
          household_id: string
          id?: string
          liquid_net_worth?: number
          net_worth?: number
          total_assets?: number
          total_liabilities?: number
          updated_at?: string
        }
        Update: {
          as_of?: string
          base_currency?: string
          breakdown?: Json | null
          created_at?: string
          household_id?: string
          id?: string
          liquid_net_worth?: number
          net_worth?: number
          total_assets?: number
          total_liabilities?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      parental_leave_plans: {
        Row: {
          average_weekly_earnings: number | null
          created_at: string
          employer_enhanced: boolean
          enhanced_full_pay_weeks: number
          enhanced_half_pay_weeks: number
          household_id: string
          id: string
          income_stream_id: string | null
          keeps_pension_contributions: boolean
          leave_start_date: string
          leave_weeks: number
          life_event_id: string
          notes: string | null
          profile_id: string | null
          scheme: string
          updated_at: string
        }
        Insert: {
          average_weekly_earnings?: number | null
          created_at?: string
          employer_enhanced?: boolean
          enhanced_full_pay_weeks?: number
          enhanced_half_pay_weeks?: number
          household_id: string
          id?: string
          income_stream_id?: string | null
          keeps_pension_contributions?: boolean
          leave_start_date: string
          leave_weeks?: number
          life_event_id: string
          notes?: string | null
          profile_id?: string | null
          scheme?: string
          updated_at?: string
        }
        Update: {
          average_weekly_earnings?: number | null
          created_at?: string
          employer_enhanced?: boolean
          enhanced_full_pay_weeks?: number
          enhanced_half_pay_weeks?: number
          household_id?: string
          id?: string
          income_stream_id?: string | null
          keeps_pension_contributions?: boolean
          leave_start_date?: string
          leave_weeks?: number
          life_event_id?: string
          notes?: string | null
          profile_id?: string | null
          scheme?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parental_leave_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parental_leave_plans_income_stream_id_fkey"
            columns: ["income_stream_id"]
            isOneToOne: false
            referencedRelation: "income_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parental_leave_plans_life_event_id_fkey"
            columns: ["life_event_id"]
            isOneToOne: false
            referencedRelation: "life_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parental_leave_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          benefits_in_kind: number | null
          confidence: number | null
          created_at: string
          currency: string
          document_id: string | null
          employee_name: string | null
          employee_pension: number | null
          employer: string | null
          employer_pension: number | null
          gross_pay: number | null
          household_id: string
          id: string
          income_tax: number | null
          matched_transaction_id: string | null
          national_insurance: number | null
          needs_review: boolean
          net_pay: number | null
          notes: string | null
          other_deductions: number | null
          pay_date: string
          pay_frequency: string | null
          payroll_ref_last4: string | null
          period_end: string | null
          period_start: string | null
          profile_id: string | null
          reconciliation: string
          reconciliation_delta: number | null
          salary_sacrifice: boolean
          source: string
          student_loan: number | null
          tax_code: string | null
          tax_year: string | null
          updated_at: string
          ytd_benefits_in_kind: number | null
          ytd_employee_pension: number | null
          ytd_employer_pension: number | null
          ytd_gross: number | null
          ytd_income_tax: number | null
          ytd_national_insurance: number | null
          ytd_net_pay: number | null
          ytd_student_loan: number | null
        }
        Insert: {
          benefits_in_kind?: number | null
          confidence?: number | null
          created_at?: string
          currency?: string
          document_id?: string | null
          employee_name?: string | null
          employee_pension?: number | null
          employer?: string | null
          employer_pension?: number | null
          gross_pay?: number | null
          household_id: string
          id?: string
          income_tax?: number | null
          matched_transaction_id?: string | null
          national_insurance?: number | null
          needs_review?: boolean
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          pay_date: string
          pay_frequency?: string | null
          payroll_ref_last4?: string | null
          period_end?: string | null
          period_start?: string | null
          profile_id?: string | null
          reconciliation?: string
          reconciliation_delta?: number | null
          salary_sacrifice?: boolean
          source?: string
          student_loan?: number | null
          tax_code?: string | null
          tax_year?: string | null
          updated_at?: string
          ytd_benefits_in_kind?: number | null
          ytd_employee_pension?: number | null
          ytd_employer_pension?: number | null
          ytd_gross?: number | null
          ytd_income_tax?: number | null
          ytd_national_insurance?: number | null
          ytd_net_pay?: number | null
          ytd_student_loan?: number | null
        }
        Update: {
          benefits_in_kind?: number | null
          confidence?: number | null
          created_at?: string
          currency?: string
          document_id?: string | null
          employee_name?: string | null
          employee_pension?: number | null
          employer?: string | null
          employer_pension?: number | null
          gross_pay?: number | null
          household_id?: string
          id?: string
          income_tax?: number | null
          matched_transaction_id?: string | null
          national_insurance?: number | null
          needs_review?: boolean
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          pay_date?: string
          pay_frequency?: string | null
          payroll_ref_last4?: string | null
          period_end?: string | null
          period_start?: string | null
          profile_id?: string | null
          reconciliation?: string
          reconciliation_delta?: number | null
          salary_sacrifice?: boolean
          source?: string
          student_loan?: number | null
          tax_code?: string | null
          tax_year?: string | null
          updated_at?: string
          ytd_benefits_in_kind?: number | null
          ytd_employee_pension?: number | null
          ytd_employer_pension?: number | null
          ytd_gross?: number | null
          ytd_income_tax?: number | null
          ytd_national_insurance?: number | null
          ytd_net_pay?: number | null
          ytd_student_loan?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_snapshots: {
        Row: {
          as_of: string
          change_pct: number | null
          created_at: string
          currency: string
          id: string
          market_cap: number | null
          previous_close: number | null
          price: number
          ticker: string
          updated_at: string
        }
        Insert: {
          as_of?: string
          change_pct?: number | null
          created_at?: string
          currency?: string
          id?: string
          market_cap?: number | null
          previous_close?: number | null
          price: number
          ticker: string
          updated_at?: string
        }
        Update: {
          as_of?: string
          change_pct?: number | null
          created_at?: string
          currency?: string
          id?: string
          market_cap?: number | null
          previous_close?: number | null
          price?: number
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          briefing_day: number
          briefing_email_enabled: boolean
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          household_id: string
          id: string
          invited_at: string | null
          invited_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
          weekly_briefing_enabled: boolean
        }
        Insert: {
          avatar_url?: string | null
          briefing_day?: number
          briefing_email_enabled?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          household_id: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_briefing_enabled?: boolean
        }
        Update: {
          avatar_url?: string | null
          briefing_day?: number
          briefing_email_enabled?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          household_id?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_briefing_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          assumptions: Json
          created_at: string
          description: string | null
          household_id: string
          id: string
          is_baseline: boolean
          name: string
          preset_key: string | null
          results: Json | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          assumptions?: Json
          created_at?: string
          description?: string | null
          household_id: string
          id?: string
          is_baseline?: boolean
          name: string
          preset_key?: string | null
          results?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          assumptions?: Json
          created_at?: string
          description?: string | null
          household_id?: string
          id?: string
          is_baseline?: boolean
          name?: string
          preset_key?: string | null
          results?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      security_profiles: {
        Row: {
          country: string | null
          created_at: string
          currency: string | null
          exchange: string | null
          id: string
          industry: string | null
          logo: string | null
          market_cap: number | null
          metrics: Json | null
          metrics_as_of: string | null
          name: string | null
          news: Json | null
          news_as_of: string | null
          profile: Json | null
          profile_as_of: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string | null
          exchange?: string | null
          id?: string
          industry?: string | null
          logo?: string | null
          market_cap?: number | null
          metrics?: Json | null
          metrics_as_of?: string | null
          name?: string | null
          news?: Json | null
          news_as_of?: string | null
          profile?: Json | null
          profile_as_of?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string | null
          exchange?: string | null
          id?: string
          industry?: string | null
          logo?: string | null
          market_cap?: number | null
          metrics?: Json | null
          metrics_as_of?: string | null
          name?: string | null
          news?: Json | null
          news_as_of?: string | null
          profile?: Json | null
          profile_as_of?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      statements: {
        Row: {
          account_id: string | null
          attempts: number
          closing_balance: number | null
          created_at: string
          currency: string | null
          detected_account_type: string | null
          detected_country: string | null
          detected_holder: string | null
          detected_identifier_kind: string | null
          detected_institution: string | null
          detected_institution_domain: string | null
          detected_last4: string | null
          discrepancy: number | null
          duplicate_count: number
          error_message: string | null
          file_hash: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          format_version: string | null
          household_id: string
          id: string
          import_batch_id: string | null
          locked_at: string | null
          match_confidence: number | null
          match_reason: string | null
          next_attempt_at: string | null
          opening_balance: number | null
          parsed_at: string | null
          period_end: string | null
          period_start: string | null
          proposal_id: string | null
          source_format: string | null
          statement_count: number
          statement_index: number
          status: string
          storage_bucket: string
          summary: Json | null
          transaction_count: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          closing_balance?: number | null
          created_at?: string
          currency?: string | null
          detected_account_type?: string | null
          detected_country?: string | null
          detected_holder?: string | null
          detected_identifier_kind?: string | null
          detected_institution?: string | null
          detected_institution_domain?: string | null
          detected_last4?: string | null
          discrepancy?: number | null
          duplicate_count?: number
          error_message?: string | null
          file_hash?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          format_version?: string | null
          household_id: string
          id?: string
          import_batch_id?: string | null
          locked_at?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          next_attempt_at?: string | null
          opening_balance?: number | null
          parsed_at?: string | null
          period_end?: string | null
          period_start?: string | null
          proposal_id?: string | null
          source_format?: string | null
          statement_count?: number
          statement_index?: number
          status?: string
          storage_bucket?: string
          summary?: Json | null
          transaction_count?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string | null
          attempts?: number
          closing_balance?: number | null
          created_at?: string
          currency?: string | null
          detected_account_type?: string | null
          detected_country?: string | null
          detected_holder?: string | null
          detected_identifier_kind?: string | null
          detected_institution?: string | null
          detected_institution_domain?: string | null
          detected_last4?: string | null
          discrepancy?: number | null
          duplicate_count?: number
          error_message?: string | null
          file_hash?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          format_version?: string | null
          household_id?: string
          id?: string
          import_batch_id?: string | null
          locked_at?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          next_attempt_at?: string | null
          opening_balance?: number | null
          parsed_at?: string | null
          period_end?: string | null
          period_start?: string | null
          proposal_id?: string | null
          source_format?: string | null
          statement_count?: number
          statement_index?: number
          status?: string
          storage_bucket?: string
          summary?: Json | null
          transaction_count?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "account_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_allowances: {
        Row: {
          adjusted_net_income: number | null
          bonus: number
          created_at: string
          employer_match_secured: boolean
          gift_aid: number
          gross_salary: number
          household_id: string
          id: string
          isa_used: number
          jisa_used: number
          lisa_used: number
          notes: string | null
          other_taxable_income: number
          pension_sacrifice: number
          pension_used: number
          profile_id: string | null
          tax_year: string
          updated_at: string
        }
        Insert: {
          adjusted_net_income?: number | null
          bonus?: number
          created_at?: string
          employer_match_secured?: boolean
          gift_aid?: number
          gross_salary?: number
          household_id: string
          id?: string
          isa_used?: number
          jisa_used?: number
          lisa_used?: number
          notes?: string | null
          other_taxable_income?: number
          pension_sacrifice?: number
          pension_used?: number
          profile_id?: string | null
          tax_year: string
          updated_at?: string
        }
        Update: {
          adjusted_net_income?: number | null
          bonus?: number
          created_at?: string
          employer_match_secured?: boolean
          gift_aid?: number
          gross_salary?: number
          household_id?: string
          id?: string
          isa_used?: number
          jisa_used?: number
          lisa_used?: number
          notes?: string | null
          other_taxable_income?: number
          pension_sacrifice?: number
          pension_used?: number
          profile_id?: string | null
          tax_year?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_allowances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_allowances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenancies: {
        Row: {
          agent_name: string | null
          break_clause_date: string | null
          break_clause_notes: string | null
          confidence: number | null
          council_tax_responsibility: string | null
          created_at: string
          currency: string
          deposit_amount: number | null
          deposit_scheme: string | null
          document_id: string | null
          household_id: string
          id: string
          landlord_name: string | null
          linked_asset_id: string | null
          linked_expense_id: string | null
          linked_goal_id: string | null
          linked_income_id: string | null
          needs_review: boolean
          notes: string | null
          notice_period_months: number | null
          owner_profile_id: string | null
          permitted_occupiers: string | null
          property_address: string
          reference_last4: string | null
          rent_amount: number | null
          rent_frequency: string
          rent_review_terms: string | null
          repairs_responsibility: string | null
          role: string
          source: string
          status: string
          tenant_names: string | null
          term_end: string | null
          term_start: string | null
          updated_at: string
          utilities_responsibility: string | null
        }
        Insert: {
          agent_name?: string | null
          break_clause_date?: string | null
          break_clause_notes?: string | null
          confidence?: number | null
          council_tax_responsibility?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number | null
          deposit_scheme?: string | null
          document_id?: string | null
          household_id: string
          id?: string
          landlord_name?: string | null
          linked_asset_id?: string | null
          linked_expense_id?: string | null
          linked_goal_id?: string | null
          linked_income_id?: string | null
          needs_review?: boolean
          notes?: string | null
          notice_period_months?: number | null
          owner_profile_id?: string | null
          permitted_occupiers?: string | null
          property_address: string
          reference_last4?: string | null
          rent_amount?: number | null
          rent_frequency?: string
          rent_review_terms?: string | null
          repairs_responsibility?: string | null
          role?: string
          source?: string
          status?: string
          tenant_names?: string | null
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
          utilities_responsibility?: string | null
        }
        Update: {
          agent_name?: string | null
          break_clause_date?: string | null
          break_clause_notes?: string | null
          confidence?: number | null
          council_tax_responsibility?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number | null
          deposit_scheme?: string | null
          document_id?: string | null
          household_id?: string
          id?: string
          landlord_name?: string | null
          linked_asset_id?: string | null
          linked_expense_id?: string | null
          linked_goal_id?: string | null
          linked_income_id?: string | null
          needs_review?: boolean
          notes?: string | null
          notice_period_months?: number | null
          owner_profile_id?: string | null
          permitted_occupiers?: string | null
          property_address?: string
          reference_last4?: string | null
          rent_amount?: number | null
          rent_frequency?: string
          rent_review_terms?: string | null
          repairs_responsibility?: string | null
          role?: string
          source?: string
          status?: string
          tenant_names?: string | null
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
          utilities_responsibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenancies_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_linked_asset_id_fkey"
            columns: ["linked_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "forecast_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_linked_goal_id_fkey"
            columns: ["linked_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_linked_income_id_fkey"
            columns: ["linked_income_id"]
            isOneToOne: false
            referencedRelation: "income_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          account_id: string | null
          created_at: string
          currency: string
          external_ref: string | null
          fees: number
          holding_id: string
          household_id: string
          id: string
          notes: string | null
          price: number
          quantity: number
          side: string
          statement_id: string | null
          trade_date: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          currency: string
          external_ref?: string | null
          fees?: number
          holding_id: string
          household_id: string
          id?: string
          notes?: string | null
          price: number
          quantity: number
          side: string
          statement_id?: string | null
          trade_date?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          currency?: string
          external_ref?: string | null
          fees?: number
          holding_id?: string
          household_id?: string
          id?: string
          notes?: string | null
          price?: number
          quantity?: number
          side?: string
          statement_id?: string | null
          trade_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_holding_household_fk"
            columns: ["holding_id", "household_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "trades_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_splits: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          household_id: string
          id: string
          note: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          note?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          note?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_splits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          ai_confidence: number | null
          amount: number
          amount_base: number | null
          balance_after: number | null
          bank_reference: string | null
          bank_tx_code: string | null
          booked_date: string
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          direction: string
          fx_rate: number | null
          household_id: string
          id: string
          import_fingerprint: string | null
          is_recurring: boolean
          is_reviewed: boolean
          is_transfer: boolean
          merchant: string | null
          notes: string | null
          original_amount: number | null
          original_currency: string | null
          raw_description: string | null
          statement_id: string | null
          updated_at: string
          value_date: string | null
        }
        Insert: {
          account_id?: string | null
          ai_confidence?: number | null
          amount: number
          amount_base?: number | null
          balance_after?: number | null
          bank_reference?: string | null
          bank_tx_code?: string | null
          booked_date: string
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction: string
          fx_rate?: number | null
          household_id: string
          id?: string
          import_fingerprint?: string | null
          is_recurring?: boolean
          is_reviewed?: boolean
          is_transfer?: boolean
          merchant?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          raw_description?: string | null
          statement_id?: string | null
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          account_id?: string | null
          ai_confidence?: number | null
          amount?: number
          amount_base?: number | null
          balance_after?: number | null
          bank_reference?: string | null
          bank_tx_code?: string | null
          booked_date?: string
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          fx_rate?: number | null
          household_id?: string
          id?: string
          import_fingerprint?: string | null
          is_recurring?: boolean
          is_reviewed?: boolean
          is_transfer?: boolean
          merchant?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          raw_description?: string | null
          statement_id?: string | null
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          added_by: string | null
          conviction: string | null
          created_at: string
          falsification: string
          household_id: string
          id: string
          name: string | null
          security_type: string | null
          shariah_note: string | null
          shariah_status: string
          target_price: number | null
          thesis: string
          ticker: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          conviction?: string | null
          created_at?: string
          falsification: string
          household_id: string
          id?: string
          name?: string | null
          security_type?: string | null
          shariah_note?: string | null
          shariah_status?: string
          target_price?: number | null
          thesis: string
          ticker: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          conviction?: string | null
          created_at?: string
          falsification?: string
          household_id?: string
          id?: string
          name?: string | null
          security_type?: string | null
          shariah_note?: string | null
          shariah_status?: string
          target_price?: number | null
          thesis?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recalc_holding: { Args: { target: string }; Returns: undefined }
      verify_job_secret: { Args: { token: string }; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const
