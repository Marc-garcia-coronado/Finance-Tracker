// Tipos de la base de datos Supabase.
// Escrito a mano fiel a schema.sql con el MISMO formato que produce
//   `supabase gen types typescript`
// Regenerable con `npm run gen:types` cuando tengas acceso a la CLI.
// Nota: bigint y numeric llegan como `number` vía PostgREST.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: Database['public']['Enums']['account_type']
          is_budget_bucket: boolean
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          type: Database['public']['Enums']['account_type']
          is_budget_bucket?: boolean
          is_archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: Database['public']['Enums']['account_type']
          is_budget_bucket?: boolean
          is_archived?: boolean
          created_at?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          id: string
          user_id: string
          occurred_on: string
          description: string
          kind: Database['public']['Enums']['entry_kind']
          voided_at: string | null
          voids_entry_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          occurred_on: string
          description?: string
          kind: Database['public']['Enums']['entry_kind']
          voided_at?: string | null
          voids_entry_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          occurred_on?: string
          description?: string
          kind?: Database['public']['Enums']['entry_kind']
          voided_at?: string | null
          voids_entry_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entries_voids_entry_id_fkey'
            columns: ['voids_entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
        ]
      }
      entry_lines: {
        Row: {
          id: string
          user_id: string
          entry_id: string
          account_id: string
          amount_cents: number | null
          amount_enc: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          entry_id: string
          account_id: string
          amount_cents?: number | null
          amount_enc?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entry_id?: string
          account_id?: string
          amount_cents?: number | null
          amount_enc?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entry_lines_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entry_lines_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
        ]
      }
      settings: {
        Row: {
          user_id: string
          estimated_monthly_income_cents: number | null
          income_enc: string | null
          updated_at: string
        }
        Insert: {
          user_id?: string
          estimated_monthly_income_cents?: number | null
          income_enc?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          estimated_monthly_income_cents?: number | null
          income_enc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vault: {
        Row: {
          user_id: string
          salt_p: string
          salt_r: string
          wrap_p: string
          wrap_r: string
          verifier: string
          version: number
          created_at: string
        }
        Insert: {
          user_id?: string
          salt_p: string
          salt_r: string
          wrap_p: string
          wrap_r: string
          verifier: string
          version?: number
          created_at?: string
        }
        Update: {
          user_id?: string
          salt_p?: string
          salt_r?: string
          wrap_p?: string
          wrap_r?: string
          verifier?: string
          version?: number
          created_at?: string
        }
        Relationships: []
      }
      budget_allocations: {
        Row: {
          id: string
          user_id: string
          account_id: string
          percent: number
        }
        Insert: {
          id?: string
          user_id?: string
          account_id: string
          percent: number
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          percent?: number
        }
        Relationships: [
          {
            foreignKeyName: 'budget_allocations_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      goals: {
        Row: {
          id: string
          user_id: string
          name: string
          target_cents: number | null
          target_enc: string | null
          monthly_contribution_cents: number | null
          monthly_contribution_enc: string | null
          linked_account_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          target_cents?: number | null
          target_enc?: string | null
          monthly_contribution_cents?: number | null
          monthly_contribution_enc?: string | null
          linked_account_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          target_cents?: number | null
          target_enc?: string | null
          monthly_contribution_cents?: number | null
          monthly_contribution_enc?: string | null
          linked_account_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'goals_linked_account_id_fkey'
            columns: ['linked_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      recurring_templates: {
        Row: {
          id: string
          user_id: string
          description: string
          amount_cents: number | null
          amount_enc: string | null
          from_account_id: string
          to_account_id: string
          kind: Database['public']['Enums']['entry_kind']
          cadence: Database['public']['Enums']['cadence']
          day_of_month: number
          next_run_on: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          description: string
          amount_cents?: number | null
          amount_enc?: string | null
          from_account_id: string
          to_account_id: string
          kind?: Database['public']['Enums']['entry_kind']
          cadence?: Database['public']['Enums']['cadence']
          day_of_month?: number
          next_run_on: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          description?: string
          amount_cents?: number | null
          amount_enc?: string | null
          from_account_id?: string
          to_account_id?: string
          kind?: Database['public']['Enums']['entry_kind']
          cadence?: Database['public']['Enums']['cadence']
          day_of_month?: number
          next_run_on?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recurring_templates_from_account_id_fkey'
            columns: ['from_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recurring_templates_to_account_id_fkey'
            columns: ['to_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      create_entry: {
        Args: {
          p_occurred_on: string
          p_description: string
          p_kind: Database['public']['Enums']['entry_kind']
          p_lines: Json
        }
        Returns: string
      }
      void_entry: {
        Args: { p_entry_id: string; p_lines: Json }
        Returns: string
      }
      seed_default_accounts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      account_type: 'asset' | 'income' | 'expense'
      entry_kind: 'income' | 'expense' | 'transfer' | 'adjustment'
      cadence: 'monthly' | 'annual'
    }
    CompositeTypes: Record<PropertyKey, never>
  }
}

// ---------------------------------------------------------------------------
// Helpers de acceso a tipos (atajos para usar en el resto de la app)
// ---------------------------------------------------------------------------
type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']
export type Views<T extends keyof PublicSchema['Views']> =
  PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T]
