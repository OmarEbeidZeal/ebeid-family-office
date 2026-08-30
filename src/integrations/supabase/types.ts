export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string;
          country: string;
          created_at: string;
          currency: string;
          current_balance: number;
          household_id: string;
          id: string;
          institution: string | null;
          is_active: boolean;
          is_joint: boolean;
          last_balance_update: string | null;
          nickname: string;
          owner_profile_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_type?: string;
          country?: string;
          created_at?: string;
          currency?: string;
          current_balance?: number;
          household_id: string;
          id?: string;
          institution?: string | null;
          is_active?: boolean;
          is_joint?: boolean;
          last_balance_update?: string | null;
          nickname: string;
          owner_profile_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_type?: string;
          country?: string;
          created_at?: string;
          currency?: string;
          current_balance?: number;
          household_id?: string;
          id?: string;
          institution?: string | null;
          is_active?: boolean;
          is_joint?: boolean;
          last_balance_update?: string | null;
          nickname?: string;
          owner_profile_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      advisor_chat: {
        Row: {
          content: string;
          context_snapshot: Json | null;
          created_at: string;
          household_id: string;
          id: string;
          profile_id: string | null;
          role: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          context_snapshot?: Json | null;
          created_at?: string;
          household_id: string;
          id?: string;
          profile_id?: string | null;
          role: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          context_snapshot?: Json | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          profile_id?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "advisor_chat_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "advisor_chat_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      advisor_notes: {
        Row: {
          body: string | null;
          created_at: string;
          generated_at: string;
          household_id: string;
          id: string;
          is_read: boolean;
          kind: string;
          related_goal_id: string | null;
          related_ticker: string | null;
          severity: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          generated_at?: string;
          household_id: string;
          id?: string;
          is_read?: boolean;
          kind?: string;
          related_goal_id?: string | null;
          related_ticker?: string | null;
          severity?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          generated_at?: string;
          household_id?: string;
          id?: string;
          is_read?: boolean;
          kind?: string;
          related_goal_id?: string | null;
          related_ticker?: string | null;
          severity?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "advisor_notes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "advisor_notes_related_goal_id_fkey";
            columns: ["related_goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      allowed_emails: {
        Row: {
          claimed_at: string | null;
          created_at: string;
          email: string;
          household_id: string | null;
          id: string;
          invited_by: string | null;
          role: string;
          updated_at: string;
        };
        Insert: {
          claimed_at?: string | null;
          created_at?: string;
          email: string;
          household_id?: string | null;
          id?: string;
          invited_by?: string | null;
          role?: string;
          updated_at?: string;
        };
        Update: {
          claimed_at?: string | null;
          created_at?: string;
          email?: string;
          household_id?: string | null;
          id?: string;
          invited_by?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "allowed_emails_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          acquisition_cost: number | null;
          acquisition_date: string | null;
          asset_class: string;
          country: string | null;
          created_at: string;
          currency: string;
          current_value: number;
          household_id: string;
          id: string;
          is_liquid: boolean;
          last_valued_at: string | null;
          name: string;
          notes: string | null;
          owner_profile_id: string | null;
          ownership_pct: number;
          updated_at: string;
          valuation_method: string | null;
        };
        Insert: {
          acquisition_cost?: number | null;
          acquisition_date?: string | null;
          asset_class?: string;
          country?: string | null;
          created_at?: string;
          currency?: string;
          current_value?: number;
          household_id: string;
          id?: string;
          is_liquid?: boolean;
          last_valued_at?: string | null;
          name: string;
          notes?: string | null;
          owner_profile_id?: string | null;
          ownership_pct?: number;
          updated_at?: string;
          valuation_method?: string | null;
        };
        Update: {
          acquisition_cost?: number | null;
          acquisition_date?: string | null;
          asset_class?: string;
          country?: string | null;
          created_at?: string;
          currency?: string;
          current_value?: number;
          household_id?: string;
          id?: string;
          is_liquid?: boolean;
          last_valued_at?: string | null;
          name?: string;
          notes?: string | null;
          owner_profile_id?: string | null;
          ownership_pct?: number;
          updated_at?: string;
          valuation_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assets_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          category_group: string;
          colour: string | null;
          created_at: string;
          household_id: string;
          icon: string | null;
          id: string;
          is_essential: boolean;
          is_system: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          category_group: string;
          colour?: string | null;
          created_at?: string;
          household_id: string;
          icon?: string | null;
          id?: string;
          is_essential?: boolean;
          is_system?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          category_group?: string;
          colour?: string | null;
          created_at?: string;
          household_id?: string;
          icon?: string | null;
          id?: string;
          is_essential?: boolean;
          is_system?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      forecast_expenses: {
        Row: {
          amount: number;
          category_id: string | null;
          confidence: string;
          created_at: string;
          currency: string;
          end_date: string | null;
          frequency: string;
          household_id: string;
          id: string;
          inflation_rate: number;
          label: string;
          notes: string | null;
          owner_profile_id: string | null;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          category_id?: string | null;
          confidence?: string;
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          frequency?: string;
          household_id: string;
          id?: string;
          inflation_rate?: number;
          label: string;
          notes?: string | null;
          owner_profile_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          confidence?: string;
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          frequency?: string;
          household_id?: string;
          id?: string;
          inflation_rate?: number;
          label?: string;
          notes?: string | null;
          owner_profile_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "forecast_expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "forecast_expenses_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "forecast_expenses_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      fx_rates: {
        Row: {
          as_of: string;
          base_ccy: string;
          created_at: string;
          id: string;
          quote_ccy: string;
          rate: number;
          updated_at: string;
        };
        Insert: {
          as_of?: string;
          base_ccy: string;
          created_at?: string;
          id?: string;
          quote_ccy: string;
          rate: number;
          updated_at?: string;
        };
        Update: {
          as_of?: string;
          base_ccy?: string;
          created_at?: string;
          id?: string;
          quote_ccy?: string;
          rate?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      goal_line_items: {
        Row: {
          created_at: string;
          currency: string;
          estimated_cost: number;
          goal_id: string;
          household_id: string;
          id: string;
          is_purchased: boolean;
          label: string;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          estimated_cost?: number;
          goal_id: string;
          household_id: string;
          id?: string;
          is_purchased?: boolean;
          label: string;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          estimated_cost?: number;
          goal_id?: string;
          household_id?: string;
          id?: string;
          is_purchased?: boolean;
          label?: string;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_line_items_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_line_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          country: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          funded_amount: number;
          goal_category: string;
          household_id: string;
          id: string;
          notes: string | null;
          owner_profile_id: string | null;
          priority: string;
          status: string;
          target_amount: number;
          target_date: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          funded_amount?: number;
          goal_category?: string;
          household_id: string;
          id?: string;
          notes?: string | null;
          owner_profile_id?: string | null;
          priority?: string;
          status?: string;
          target_amount?: number;
          target_date?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          funded_amount?: number;
          goal_category?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          owner_profile_id?: string | null;
          priority?: string;
          status?: string;
          target_amount?: number;
          target_date?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      holdings: {
        Row: {
          account_id: string | null;
          avg_cost: number | null;
          created_at: string;
          currency: string;
          exchange: string | null;
          household_id: string;
          id: string;
          name: string | null;
          notes: string | null;
          opened_at: string | null;
          owner_profile_id: string | null;
          quantity: number;
          security_type: string;
          ticker: string;
          updated_at: string;
        };
        Insert: {
          account_id?: string | null;
          avg_cost?: number | null;
          created_at?: string;
          currency?: string;
          exchange?: string | null;
          household_id: string;
          id?: string;
          name?: string | null;
          notes?: string | null;
          opened_at?: string | null;
          owner_profile_id?: string | null;
          quantity?: number;
          security_type?: string;
          ticker: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          avg_cost?: number | null;
          created_at?: string;
          currency?: string;
          exchange?: string | null;
          household_id?: string;
          id?: string;
          name?: string | null;
          notes?: string | null;
          opened_at?: string | null;
          owner_profile_id?: string | null;
          quantity?: number;
          security_type?: string;
          ticker?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "holdings_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "holdings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "holdings_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          base_currency: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          base_currency?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      income_streams: {
        Row: {
          annual_growth_rate: number;
          created_at: string;
          currency: string;
          end_date: string | null;
          frequency: string;
          gross_amount: number;
          household_id: string;
          id: string;
          income_type: string;
          label: string;
          net_amount: number | null;
          owner_profile_id: string | null;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          annual_growth_rate?: number;
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          frequency?: string;
          gross_amount?: number;
          household_id: string;
          id?: string;
          income_type?: string;
          label: string;
          net_amount?: number | null;
          owner_profile_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          annual_growth_rate?: number;
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          frequency?: string;
          gross_amount?: number;
          household_id?: string;
          id?: string;
          income_type?: string;
          label?: string;
          net_amount?: number | null;
          owner_profile_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "income_streams_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "income_streams_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      liabilities: {
        Row: {
          created_at: string;
          currency: string;
          end_date: string | null;
          household_id: string;
          id: string;
          interest_rate: number | null;
          liability_type: string;
          linked_asset_id: string | null;
          monthly_payment: number | null;
          name: string;
          notes: string | null;
          original_amount: number | null;
          outstanding_balance: number;
          owner_profile_id: string | null;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          household_id: string;
          id?: string;
          interest_rate?: number | null;
          liability_type?: string;
          linked_asset_id?: string | null;
          monthly_payment?: number | null;
          name: string;
          notes?: string | null;
          original_amount?: number | null;
          outstanding_balance?: number;
          owner_profile_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          end_date?: string | null;
          household_id?: string;
          id?: string;
          interest_rate?: number | null;
          liability_type?: string;
          linked_asset_id?: string | null;
          monthly_payment?: number | null;
          name?: string;
          notes?: string | null;
          original_amount?: number | null;
          outstanding_balance?: number;
          owner_profile_id?: string | null;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "liabilities_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_linked_asset_id_fkey";
            columns: ["linked_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      net_worth_snapshots: {
        Row: {
          as_of: string;
          base_currency: string;
          breakdown: Json | null;
          created_at: string;
          household_id: string;
          id: string;
          liquid_net_worth: number;
          net_worth: number;
          total_assets: number;
          total_liabilities: number;
          updated_at: string;
        };
        Insert: {
          as_of?: string;
          base_currency?: string;
          breakdown?: Json | null;
          created_at?: string;
          household_id: string;
          id?: string;
          liquid_net_worth?: number;
          net_worth?: number;
          total_assets?: number;
          total_liabilities?: number;
          updated_at?: string;
        };
        Update: {
          as_of?: string;
          base_currency?: string;
          breakdown?: Json | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          liquid_net_worth?: number;
          net_worth?: number;
          total_assets?: number;
          total_liabilities?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      price_snapshots: {
        Row: {
          as_of: string;
          change_pct: number | null;
          created_at: string;
          currency: string;
          id: string;
          market_cap: number | null;
          previous_close: number | null;
          price: number;
          ticker: string;
          updated_at: string;
        };
        Insert: {
          as_of?: string;
          change_pct?: number | null;
          created_at?: string;
          currency?: string;
          id?: string;
          market_cap?: number | null;
          previous_close?: number | null;
          price: number;
          ticker: string;
          updated_at?: string;
        };
        Update: {
          as_of?: string;
          change_pct?: number | null;
          created_at?: string;
          currency?: string;
          id?: string;
          market_cap?: number | null;
          previous_close?: number | null;
          price?: number;
          ticker?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          full_name: string | null;
          household_id: string;
          id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          full_name?: string | null;
          household_id: string;
          id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          full_name?: string | null;
          household_id?: string;
          id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      scenarios: {
        Row: {
          assumptions: Json;
          created_at: string;
          description: string | null;
          household_id: string;
          id: string;
          is_baseline: boolean;
          name: string;
          results: Json | null;
          updated_at: string;
        };
        Insert: {
          assumptions?: Json;
          created_at?: string;
          description?: string | null;
          household_id: string;
          id?: string;
          is_baseline?: boolean;
          name: string;
          results?: Json | null;
          updated_at?: string;
        };
        Update: {
          assumptions?: Json;
          created_at?: string;
          description?: string | null;
          household_id?: string;
          id?: string;
          is_baseline?: boolean;
          name?: string;
          results?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenarios_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      statements: {
        Row: {
          account_id: string | null;
          closing_balance: number | null;
          created_at: string;
          error_message: string | null;
          file_name: string | null;
          file_path: string;
          file_size: number | null;
          household_id: string;
          id: string;
          opening_balance: number | null;
          parsed_at: string | null;
          period_end: string | null;
          period_start: string | null;
          status: string;
          transaction_count: number | null;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          account_id?: string | null;
          closing_balance?: number | null;
          created_at?: string;
          error_message?: string | null;
          file_name?: string | null;
          file_path: string;
          file_size?: number | null;
          household_id: string;
          id?: string;
          opening_balance?: number | null;
          parsed_at?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          status?: string;
          transaction_count?: number | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          account_id?: string | null;
          closing_balance?: number | null;
          created_at?: string;
          error_message?: string | null;
          file_name?: string | null;
          file_path?: string;
          file_size?: number | null;
          household_id?: string;
          id?: string;
          opening_balance?: number | null;
          parsed_at?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          status?: string;
          transaction_count?: number | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "statements_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statements_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statements_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string | null;
          ai_confidence: number | null;
          amount: number;
          amount_base: number | null;
          booked_date: string;
          category_id: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          direction: string;
          household_id: string;
          id: string;
          is_recurring: boolean;
          is_reviewed: boolean;
          is_transfer: boolean;
          merchant: string | null;
          notes: string | null;
          raw_description: string | null;
          statement_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_id?: string | null;
          ai_confidence?: number | null;
          amount: number;
          amount_base?: number | null;
          booked_date: string;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          direction: string;
          household_id: string;
          id?: string;
          is_recurring?: boolean;
          is_reviewed?: boolean;
          is_transfer?: boolean;
          merchant?: string | null;
          notes?: string | null;
          raw_description?: string | null;
          statement_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          ai_confidence?: number | null;
          amount?: number;
          amount_base?: number | null;
          booked_date?: string;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          direction?: string;
          household_id?: string;
          id?: string;
          is_recurring?: boolean;
          is_reviewed?: boolean;
          is_transfer?: boolean;
          merchant?: string | null;
          notes?: string | null;
          raw_description?: string | null;
          statement_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_statement_id_fkey";
            columns: ["statement_id"];
            isOneToOne: false;
            referencedRelation: "statements";
            referencedColumns: ["id"];
          },
        ];
      };
      watchlist: {
        Row: {
          added_by: string | null;
          conviction: string | null;
          created_at: string;
          household_id: string;
          id: string;
          name: string | null;
          security_type: string | null;
          target_price: number | null;
          thesis: string | null;
          ticker: string;
          updated_at: string;
        };
        Insert: {
          added_by?: string | null;
          conviction?: string | null;
          created_at?: string;
          household_id: string;
          id?: string;
          name?: string | null;
          security_type?: string | null;
          target_price?: number | null;
          thesis?: string | null;
          ticker: string;
          updated_at?: string;
        };
        Update: {
          added_by?: string | null;
          conviction?: string | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          name?: string | null;
          security_type?: string | null;
          target_price?: number | null;
          thesis?: string | null;
          ticker?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watchlist_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "watchlist_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_household_id: { Args: never; Returns: string };
      current_role_is_owner: { Args: never; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
