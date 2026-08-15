/**
 * Ручной тип схемы public в формате supabase-js v2.
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ИСТИНЫ — DDL фазы 1 из контракта проекта.
 * Правила соответствия DDL -> типу:
 *   - колонка NOT NULL           -> Row: T            (без null)
 *   - колонка без NOT NULL       -> Row: T | null
 *   - Insert: обязательна, только если NOT NULL и НЕТ DEFAULT; иначе опциональна
 *   - Update: все поля опциональны
 *
 * Кардио (осознанное отступление от спеки): exercises.kind / sets.kind.
 * У силового подхода заполнены weight_kg/reps/rir, у кардио — duration_sec/distance_m.
 * Ограничение sets_shape_ck на стороне БД не даёт смешать одно с другим,
 * поэтому в типах эти поля nullable, а гарантию формы даёт домен (см. domain.ts).
 *
 * Когда появится доступ к проекту Supabase, файл сверяется с
 * `npm run db:types` (он пишет в src/types/database.generated.ts и НЕ перетирает этот файл).
 */

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
      profiles: {
        Row: {
          id: string
          nickname: string
          bodyweight_kg: number | null
          onboarded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nickname: string
          bodyweight_kg?: number | null
          onboarded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nickname?: string
          bodyweight_kg?: number | null
          onboarded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      bodyweight_entries: {
        Row: {
          id: string
          profile_id: string
          /** Локальная дата пользователя в формате YYYY-MM-DD, без времени. */
          measured_on: string
          weight_kg: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          measured_on: string
          weight_kg: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          measured_on?: string
          weight_kg?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'bodyweight_entries_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      circles: {
        Row: {
          id: string
          name: string
          owner_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'circles_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      circle_members: {
        Row: {
          circle_id: string
          profile_id: string
          joined_at: string
        }
        Insert: {
          circle_id: string
          profile_id: string
          joined_at?: string
        }
        Update: {
          circle_id?: string
          profile_id?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'circle_members_circle_id_fkey'
            columns: ['circle_id']
            isOneToOne: false
            referencedRelation: 'circles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'circle_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      circle_invites: {
        Row: {
          token: string
          circle_id: string
          created_by: string
          expires_at: string
          used_by: string | null
          used_at: string | null
          created_at: string
        }
        Insert: {
          token: string
          circle_id: string
          created_by: string
          expires_at: string
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Update: {
          token?: string
          circle_id?: string
          created_by?: string
          expires_at?: string
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'circle_invites_circle_id_fkey'
            columns: ['circle_id']
            isOneToOne: false
            referencedRelation: 'circles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'circle_invites_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'circle_invites_used_by_fkey'
            columns: ['used_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      muscle_stat_map: {
        Row: {
          muscle: string
          stat_key: Database['public']['Enums']['stat_key']
        }
        Insert: {
          muscle: string
          stat_key: Database['public']['Enums']['stat_key']
        }
        Update: {
          muscle?: string
          stat_key?: Database['public']['Enums']['stat_key']
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: string
          slug: string
          name_ru: string
          name_en: string | null
          kind: Database['public']['Enums']['exercise_kind']
          equipment: string | null
          category: string | null
          mechanic: string | null
          force: string | null
          level: string | null
          primary_muscles: string[]
          secondary_muscles: string[]
          weight_step_kg: number
          is_custom: boolean
          owner_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name_ru: string
          name_en?: string | null
          kind?: Database['public']['Enums']['exercise_kind']
          equipment?: string | null
          category?: string | null
          mechanic?: string | null
          force?: string | null
          level?: string | null
          primary_muscles?: string[]
          secondary_muscles?: string[]
          weight_step_kg?: number
          is_custom?: boolean
          owner_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name_ru?: string
          name_en?: string | null
          kind?: Database['public']['Enums']['exercise_kind']
          equipment?: string | null
          category?: string | null
          mechanic?: string | null
          force?: string | null
          level?: string | null
          primary_muscles?: string[]
          secondary_muscles?: string[]
          weight_step_kg?: number
          is_custom?: boolean
          owner_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'exercises_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      programs: {
        Row: {
          id: string
          profile_id: string
          name: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          name: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          name?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'programs_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      program_days: {
        Row: {
          id: string
          program_id: string
          order_index: number
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          program_id: string
          order_index: number
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          order_index?: number
          name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'program_days_program_id_fkey'
            columns: ['program_id']
            isOneToOne: false
            referencedRelation: 'programs'
            referencedColumns: ['id']
          },
        ]
      }
      program_items: {
        Row: {
          id: string
          program_day_id: string
          exercise_id: string
          order_index: number
          target_sets: number
          // силовые цели: null у кардио-элементов
          rep_min: number | null
          rep_max: number | null
          target_rir: number | null
          // кардио-цели: null у силовых элементов
          target_duration_sec: number | null
          target_distance_m: number | null
          // память для автозаполнения
          last_weight_kg: number | null
          last_reps: number | null
          last_duration_sec: number | null
          last_distance_m: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_day_id: string
          exercise_id: string
          order_index: number
          target_sets?: number
          rep_min?: number | null
          rep_max?: number | null
          target_rir?: number | null
          target_duration_sec?: number | null
          target_distance_m?: number | null
          last_weight_kg?: number | null
          last_reps?: number | null
          last_duration_sec?: number | null
          last_distance_m?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_day_id?: string
          exercise_id?: string
          order_index?: number
          target_sets?: number
          rep_min?: number | null
          rep_max?: number | null
          target_rir?: number | null
          target_duration_sec?: number | null
          target_distance_m?: number | null
          last_weight_kg?: number | null
          last_reps?: number | null
          last_duration_sec?: number | null
          last_distance_m?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'program_items_program_day_id_fkey'
            columns: ['program_day_id']
            isOneToOne: false
            referencedRelation: 'program_days'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'program_items_exercise_id_fkey'
            columns: ['exercise_id']
            isOneToOne: false
            referencedRelation: 'exercises'
            referencedColumns: ['id']
          },
        ]
      }
      sessions: {
        Row: {
          id: string
          profile_id: string
          program_day_id: string | null
          raid_id: string | null
          state: Database['public']['Enums']['session_state']
          started_at: string
          finished_at: string | null
          total_score: number
          total_volume_kg: number
          total_cardio_sec: number
          readiness_at_start: number | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          program_day_id?: string | null
          raid_id?: string | null
          state?: Database['public']['Enums']['session_state']
          started_at?: string
          finished_at?: string | null
          total_score?: number
          total_volume_kg?: number
          total_cardio_sec?: number
          readiness_at_start?: number | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          program_day_id?: string | null
          raid_id?: string | null
          state?: Database['public']['Enums']['session_state']
          started_at?: string
          finished_at?: string | null
          total_score?: number
          total_volume_kg?: number
          total_cardio_sec?: number
          readiness_at_start?: number | null
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sessions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sessions_program_day_id_fkey'
            columns: ['program_day_id']
            isOneToOne: false
            referencedRelation: 'program_days'
            referencedColumns: ['id']
          },
        ]
      }
      sets: {
        Row: {
          id: string
          session_id: string
          exercise_id: string
          program_item_id: string | null
          order_index: number
          /** Проставляется триггером из exercises.kind — клиентскому значению БД не доверяет. */
          kind: Database['public']['Enums']['exercise_kind']
          // силовой подход
          weight_kg: number | null
          reps: number | null
          rir: number | null
          // кардио-отрезок
          duration_sec: number | null
          distance_m: number | null
          // фаза 2, заполняет триггер
          e1rm: number | null
          e1rm_ref: number | null
          ri: number | null
          score: number | null
          client_id: string
          logged_at: string
        }
        Insert: {
          id?: string
          session_id: string
          exercise_id: string
          program_item_id?: string | null
          order_index: number
          kind?: Database['public']['Enums']['exercise_kind']
          weight_kg?: number | null
          reps?: number | null
          rir?: number | null
          duration_sec?: number | null
          distance_m?: number | null
          e1rm?: number | null
          e1rm_ref?: number | null
          ri?: number | null
          score?: number | null
          client_id: string
          logged_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          exercise_id?: string
          program_item_id?: string | null
          order_index?: number
          kind?: Database['public']['Enums']['exercise_kind']
          weight_kg?: number | null
          reps?: number | null
          rir?: number | null
          duration_sec?: number | null
          distance_m?: number | null
          e1rm?: number | null
          e1rm_ref?: number | null
          ri?: number | null
          score?: number | null
          client_id?: string
          logged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sets_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sets_exercise_id_fkey'
            columns: ['exercise_id']
            isOneToOne: false
            referencedRelation: 'exercises'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sets_program_item_id_fkey'
            columns: ['program_item_id']
            isOneToOne: false
            referencedRelation: 'program_items'
            referencedColumns: ['id']
          },
        ]
      }
      game_config: {
        Row: {
          key: string
          value: Json
          description: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          description?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      /**
       * Открывает сессию: висящую активную помечает 'abandoned' и создаёт новую,
       * поэтому активная сессия на профиль всегда ровно одна. Возвращает строку
       * созданной сессии целиком.
       */
      start_session: {
        Args: {
          p_program_day_id?: string | null
        }
        Returns: Database['public']['Tables']['sessions']['Row']
      }
      /**
       * Закрывает сессию: state -> 'finished' | 'abandoned', finished_at = now(),
       * пересчитывает total_volume_kg и total_cardio_sec по строкам sets
       * и переносит память автозаполнения в program_items.
       */
      finish_session: {
        Args: {
          p_session_id: string
          p_state?: Database['public']['Enums']['session_state']
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['sessions']['Row']
      }
    }
    Enums: {
      stat_key: 'chest' | 'back' | 'shoulders' | 'arms' | 'quads' | 'posterior' | 'core'
      session_state: 'active' | 'finished' | 'abandoned'
      exercise_kind: 'strength' | 'cardio'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/** Значения enum'ов в рантайме (аналог `Constants` из supabase gen types). */
export const Constants = {
  public: {
    Enums: {
      stat_key: ['chest', 'back', 'shoulders', 'arms', 'quads', 'posterior', 'core'],
      session_state: ['active', 'finished', 'abandoned'],
      exercise_kind: ['strength', 'cardio'],
    },
  },
} as const

// --- Служебные хелперы поверх Database (как в свежих supabase gen types) ---

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
export type FunctionArgs<T extends keyof PublicSchema['Functions']> =
  PublicSchema['Functions'][T]['Args']
export type FunctionReturns<T extends keyof PublicSchema['Functions']> =
  PublicSchema['Functions'][T]['Returns']
