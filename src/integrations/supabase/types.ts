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
        }
        Insert: {
          account_type?: string
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
        }
        Update: {
          account_type?: string
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
        }
        Relationships: [
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
      forecast_expenses: {
        Row: {
          amount: number
          category_id: string | null
          confidence: string
          created_at: string
          currency: string
          end_date: string | null
          frequency: string
          household_id: string
          id: string
          inflation_rate: number
          label: string
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
          frequency?: string
          household_id: string
          id?: string
          inflation_rate?: number
          label: string
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
          frequency?: string
          household_id?: string
          id?: string
          inflation_rate?: number
          label?: string
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
          exchange: string | null
          falsification: string | null
          household_id: string
          id: string
          name: string | null
          notes: string | null
          opened_at: string | null
          owner_profile_id: string | null
          quantity: number
          realised_pnl: number
          security_type: string
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
          exchange?: string | null
          falsification?: string | null
          household_id: string
          id?: string
          name?: string | null
          notes?: string | null
          opened_at?: string | null
          owner_profile_id?: string | null
          quantity?: number
          realised_pnl?: number
          security_type?: string
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
          exchange?: string | null
          falsification?: string | null
          household_id?: string
          id?: string
          name?: string | null
          notes?: string | null
          opened_at?: string | null
          owner_profile_id?: string | null
          quantity?: number
          realised_pnl?: number
          security_type?: string
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
          created_at: string
          currency: string
          end_date: string | null
          frequency: string
          gross_amount: number
          household_id: string
          id: string
          income_type: string
          label: string
          net_amount: number | null
          owner_profile_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          annual_growth_rate?: number
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          gross_amount?: number
          household_id: string
          id?: string
          income_type?: string
          label: string
          net_amount?: number | null
          owner_profile_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          annual_growth_rate?: number
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          gross_amount?: number
          household_id?: string
          id?: string
          income_type?: string
          label?: string
          net_amount?: number | null
          owner_profile_id?: string | null
          start_date?: string | null
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
          role: string
          updated_at: string
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
          id: string
          role?: string
          updated_at?: string
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
          role?: string
          updated_at?: string
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
          created_at: string
          employer_match_secured: boolean
          household_id: string
          id: string
          isa_used: number
          jisa_used: number
          lisa_used: number
          notes: string | null
          pension_used: number
          profile_id: string | null
          tax_year: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employer_match_secured?: boolean
          household_id: string
          id?: string
          isa_used?: number
          jisa_used?: number
          lisa_used?: number
          notes?: string | null
          pension_used?: number
          profile_id?: string | null
          tax_year: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employer_match_secured?: boolean
          household_id?: string
          id?: string
          isa_used?: number
          jisa_used?: number
          lisa_used?: number
          notes?: string | null
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
      trades: {
        Row: {
          account_id: string | null
          created_at: string
          currency: string
          fees: number
          holding_id: string
          household_id: string
          id: string
          notes: string | null
          price: number
          quantity: number
          side: string
          trade_date: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          currency: string
          fees?: number
          holding_id: string
          household_id: string
          id?: string
          notes?: string | null
          price: number
          quantity: number
          side: string
          trade_date?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          currency?: string
          fees?: number
          holding_id?: string
          household_id?: string
          id?: string
          notes?: string | null
          price?: number
          quantity?: number
          side?: string
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
