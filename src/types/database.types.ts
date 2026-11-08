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
      academic_calendar: {
        Row: {
          created_at: string
          end_date: string | null
          id: number
          notes: string | null
          school_id: string
          session_id: number | null
          start_date: string | null
          term_id: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: never
          notes?: string | null
          school_id: string
          session_id?: number | null
          start_date?: string | null
          term_id?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: never
          notes?: string | null
          school_id?: string
          session_id?: number | null
          start_date?: string | null
          term_id?: number | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_calendar_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: number
          new_value: string | null
          notes: string | null
          old_value: string | null
          performed_at: string
          performed_by: string
          school_id: string | null
        }
        Insert: {
          action: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: never
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          performed_at?: string
          performed_by?: string
          school_id?: string | null
        }
        Update: {
          action?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: never
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          performed_at?: string
          performed_by?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string | null
          body: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: number
          school_id: string | null
          title: string
        }
        Insert: {
          audience?: string | null
          body: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: number
          school_id?: string | null
          title: string
        }
        Update: {
          audience?: string | null
          body?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: number
          school_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: number | null
          created_at: string | null
          date: string
          id: number
          notes: string | null
          recorded_by: string | null
          school_id: string | null
          session_id: number | null
          status: string
          student_id: string | null
          term_id: number | null
          updated_at: string | null
        }
        Insert: {
          class_id?: number | null
          created_at?: string | null
          date: string
          id?: number
          notes?: string | null
          recorded_by?: string | null
          school_id?: string | null
          session_id?: number | null
          status?: string
          student_id?: string | null
          term_id?: number | null
          updated_at?: string | null
        }
        Update: {
          class_id?: number | null
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
          recorded_by?: string | null
          school_id?: string | null
          session_id?: number | null
          status?: string
          student_id?: string | null
          term_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      cae_components: {
        Row: {
          cae_id: number | null
          created_at: string
          display_order: number | null
          id: number
          name: string | null
        }
        Insert: {
          cae_id?: number | null
          created_at?: string
          display_order?: number | null
          id?: never
          name?: string | null
        }
        Update: {
          cae_id?: number | null
          created_at?: string
          display_order?: number | null
          id?: never
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cae_components_cae_id_fkey"
            columns: ["cae_id"]
            isOneToOne: false
            referencedRelation: "cae_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      cae_ratings: {
        Row: {
          created_at: string
          id: number
          label: string | null
          school_id: string | null
          section_id: number | null
          sort_order: number | null
          symbol: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          label?: string | null
          school_id?: string | null
          section_id?: number | null
          sort_order?: number | null
          symbol?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          label?: string | null
          school_id?: string | null
          section_id?: number | null
          sort_order?: number | null
          symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cae_ratings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cae_structures: {
        Row: {
          created_at: string
          id: number
          name: string | null
          school_id: string | null
          section_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          name?: string | null
          school_id?: string | null
          section_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string | null
          school_id?: string | null
          section_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cae_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cae_traits: {
        Row: {
          category: string | null
          created_at: string
          id: number
          is_active: boolean
          name: string | null
          school_id: string | null
          section_id: number | null
          sort_order: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string | null
          school_id?: string | null
          section_id?: number | null
          sort_order?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string | null
          school_id?: string | null
          section_id?: number | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cae_traits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: number | null
          id: number
          school_id: string | null
          section_subject_id: number | null
          subject_id: number | null
        }
        Insert: {
          class_id?: number | null
          id?: number
          school_id?: string | null
          section_subject_id?: number | null
          subject_id?: number | null
        }
        Update: {
          class_id?: number | null
          id?: number
          school_id?: string | null
          section_subject_id?: number | null
          subject_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_section_subject_id_fkey"
            columns: ["section_subject_id"]
            isOneToOne: false
            referencedRelation: "section_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      class_teachers: {
        Row: {
          class_id: number | null
          id: number
          is_form_teacher: boolean
          school_id: string | null
          session_id: number | null
          teacher_id: number | null
        }
        Insert: {
          class_id?: number | null
          id?: number
          is_form_teacher?: boolean
          school_id?: string | null
          session_id?: number | null
          teacher_id?: number | null
        }
        Update: {
          class_id?: number | null
          id?: number
          is_form_teacher?: boolean
          school_id?: string | null
          session_id?: number | null
          teacher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string | null
          id: number
          level: string
          name: string
          school_id: string | null
          section_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          level: string
          name: string
          school_id?: string | null
          section_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          level?: string
          name?: string
          school_id?: string | null
          section_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body: string
          error_message: string | null
          id: number
          metadata: Json | null
          recipient_count: number
          recipients: Json
          school_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
          template_id: number | null
        }
        Insert: {
          body: string
          error_message?: string | null
          id?: number
          metadata?: Json | null
          recipient_count?: number
          recipients?: Json
          school_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          template_id?: number | null
        }
        Update: {
          body?: string
          error_message?: string | null
          id?: number
          metadata?: Json | null
          recipient_count?: number
          recipients?: Json
          school_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          template_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attachments: Json
          batch_id: string
          created_at: string
          error_message: string | null
          html: string | null
          id: number
          metadata: Json
          processed_at: string | null
          school_id: string | null
          status: string
          subject: string | null
          to_email: string
        }
        Insert: {
          attachments?: Json
          batch_id: string
          created_at?: string
          error_message?: string | null
          html?: string | null
          id?: never
          metadata?: Json
          processed_at?: string | null
          school_id?: string | null
          status?: string
          subject?: string | null
          to_email: string
        }
        Update: {
          attachments?: Json
          batch_id?: string
          created_at?: string
          error_message?: string | null
          html?: string | null
          id?: never
          metadata?: Json
          processed_at?: string | null
          school_id?: string | null
          status?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: number
          name: string
          school_id: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: number
          name: string
          school_id?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: number
          name?: string
          school_id?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_audit_log: {
        Row: {
          action: string
          amount: number | null
          bill_id: number | null
          created_at: string | null
          details: Json | null
          id: number
          performed_by: string
          school_id: string | null
          student_id: string
        }
        Insert: {
          action: string
          amount?: number | null
          bill_id?: number | null
          created_at?: string | null
          details?: Json | null
          id?: number
          performed_by?: string
          school_id?: string | null
          student_id: string
        }
        Update: {
          action?: string
          amount?: number | null
          bill_id?: number | null
          created_at?: string | null
          details?: Json | null
          id?: number
          performed_by?: string
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_audit_log_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "fee_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_bill_items: {
        Row: {
          amount: number
          bill_id: number
          created_at: string | null
          fee_item_id: number | null
          id: number
          is_carry_forward: boolean
          is_included: boolean | null
          is_optional: boolean | null
          name: string
          source_bill_id: number | null
        }
        Insert: {
          amount?: number
          bill_id: number
          created_at?: string | null
          fee_item_id?: number | null
          id?: number
          is_carry_forward?: boolean
          is_included?: boolean | null
          is_optional?: boolean | null
          name: string
          source_bill_id?: number | null
        }
        Update: {
          amount?: number
          bill_id?: number
          created_at?: string | null
          fee_item_id?: number | null
          id?: number
          is_carry_forward?: boolean
          is_included?: boolean | null
          is_optional?: boolean | null
          name?: string
          source_bill_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "fee_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_bill_items_fee_item_id_fkey"
            columns: ["fee_item_id"]
            isOneToOne: false
            referencedRelation: "fee_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_bill_items_source_bill_id_fkey"
            columns: ["source_bill_id"]
            isOneToOne: false
            referencedRelation: "fee_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_bills: {
        Row: {
          academic_year: string
          amount_paid: number
          balance: number | null
          carried_forward: boolean
          class_id: number | null
          created_at: string | null
          due_date: string | null
          generated_by: string | null
          id: number
          school_id: string | null
          section_id: number | null
          status: string
          student_id: string
          template_id: number | null
          term: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          amount_paid?: number
          balance?: number | null
          carried_forward?: boolean
          class_id?: number | null
          created_at?: string | null
          due_date?: string | null
          generated_by?: string | null
          id?: number
          school_id?: string | null
          section_id?: number | null
          status?: string
          student_id: string
          template_id?: number | null
          term: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          amount_paid?: number
          balance?: number | null
          carried_forward?: boolean
          class_id?: number | null
          created_at?: string | null
          due_date?: string | null
          generated_by?: string | null
          id?: number
          school_id?: string | null
          section_id?: number | null
          status?: string
          student_id?: string
          template_id?: number | null
          term?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_bills_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_bills_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_bills_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_bills_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fee_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_discounts: {
        Row: {
          amount: number
          applied_by: string | null
          bill_id: number
          created_at: string | null
          discount_type: string
          id: number
          label: string
          school_id: string | null
          student_id: string
          value: number
        }
        Insert: {
          amount: number
          applied_by?: string | null
          bill_id: number
          created_at?: string | null
          discount_type?: string
          id?: number
          label: string
          school_id?: string | null
          student_id: string
          value: number
        }
        Update: {
          amount?: number
          applied_by?: string | null
          bill_id?: number
          created_at?: string | null
          discount_type?: string
          id?: number
          label?: string
          school_id?: string | null
          student_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_discounts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "fee_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_discounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_items: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: number
          is_active: boolean | null
          is_compulsory: boolean | null
          name: string
          school_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          is_compulsory?: boolean | null
          name: string
          school_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          is_compulsory?: boolean | null
          name?: string
          school_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          bank_reference: string | null
          bill_id: number
          created_at: string | null
          id: number
          is_refunded: boolean
          notes: string | null
          payment_date: string | null
          payment_method: string
          paystack_reference: string | null
          recorded_by: string | null
          school_id: string | null
          student_id: string
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          bill_id: number
          created_at?: string | null
          id?: number
          is_refunded?: boolean
          notes?: string | null
          payment_date?: string | null
          payment_method?: string
          paystack_reference?: string | null
          recorded_by?: string | null
          school_id?: string | null
          student_id: string
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          bill_id?: number
          created_at?: string | null
          id?: number
          is_refunded?: boolean
          notes?: string | null
          payment_date?: string | null
          payment_method?: string
          paystack_reference?: string | null
          recorded_by?: string | null
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "fee_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_refunds: {
        Row: {
          amount: number
          bill_id: number
          created_at: string | null
          id: number
          payment_id: number | null
          reason: string
          refund_date: string | null
          refunded_by: string | null
          school_id: string | null
          student_id: string
        }
        Insert: {
          amount: number
          bill_id: number
          created_at?: string | null
          id?: number
          payment_id?: number | null
          reason: string
          refund_date?: string | null
          refunded_by?: string | null
          school_id?: string | null
          student_id: string
        }
        Update: {
          amount?: number
          bill_id?: number
          created_at?: string | null
          id?: number
          payment_id?: number | null
          reason?: string
          refund_date?: string | null
          refunded_by?: string | null
          school_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_refunds_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "fee_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_refunds_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          amount: number
          class_id: number | null
          created_at: string | null
          fee_type: string
          id: number
          school_id: string | null
          section_id: number | null
          session_id: number | null
          term_id: number | null
        }
        Insert: {
          amount: number
          class_id?: number | null
          created_at?: string | null
          fee_type: string
          id?: number
          school_id?: string | null
          section_id?: number | null
          session_id?: number | null
          term_id?: number | null
        }
        Update: {
          amount?: number
          class_id?: number | null
          created_at?: string | null
          fee_type?: string
          id?: number
          school_id?: string | null
          section_id?: number | null
          session_id?: number | null
          term_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_template_items: {
        Row: {
          amount: number
          created_at: string | null
          fee_item_id: number
          id: number
          is_optional: boolean | null
          template_id: number
        }
        Insert: {
          amount?: number
          created_at?: string | null
          fee_item_id: number
          id?: number
          is_optional?: boolean | null
          template_id: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          fee_item_id?: number
          id?: number
          is_optional?: boolean | null
          template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_template_items_fee_item_id_fkey"
            columns: ["fee_item_id"]
            isOneToOne: false
            referencedRelation: "fee_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fee_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_templates: {
        Row: {
          academic_year: string
          class_level: string | null
          created_at: string | null
          created_by: string | null
          id: number
          is_active: boolean | null
          name: string
          school_id: string | null
          student_type: string
          template_type: string | null
          term: string
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          class_level?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          school_id?: string | null
          student_type?: string
          template_type?: string | null
          term: string
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          class_level?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          school_id?: string | null
          student_type?: string
          template_type?: string | null
          term?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_schema: {
        Row: {
          created_at: string | null
          grade: string
          id: number
          max_score: number
          min_score: number
          remark: string
          schema_type: string | null
          school_id: string | null
        }
        Insert: {
          created_at?: string | null
          grade: string
          id?: number
          max_score: number
          min_score: number
          remark: string
          schema_type?: string | null
          school_id?: string | null
        }
        Update: {
          created_at?: string | null
          grade?: string
          id?: number
          max_score?: number
          min_score?: number
          remark?: string
          schema_type?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grading_schema_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hire_quota_entries: {
        Row: {
          hire_id: number
          id: number
          note: string
          recorded_at: string
          recorded_by: string
          school_id: string
          value: number
        }
        Insert: {
          hire_id: number
          id?: never
          note?: string
          recorded_at?: string
          recorded_by?: string
          school_id: string
          value: number
        }
        Update: {
          hire_id?: number
          id?: never
          note?: string
          recorded_at?: string
          recorded_by?: string
          school_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "hire_quota_entries_hire_id_fkey"
            columns: ["hire_id"]
            isOneToOne: false
            referencedRelation: "hires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hire_quota_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hires: {
        Row: {
          application_id: number
          contact_email: string
          created_at: string
          hire_name: string
          id: number
          quota_end: string | null
          quota_measure_method: string
          quota_metric: string
          quota_period: string
          quota_start: string | null
          quota_target: number
          quota_unit: string
          role_id: number
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: number
          contact_email?: string
          created_at?: string
          hire_name: string
          id?: never
          quota_end?: string | null
          quota_measure_method?: string
          quota_metric: string
          quota_period?: string
          quota_start?: string | null
          quota_target?: number
          quota_unit?: string
          role_id: number
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: number
          contact_email?: string
          created_at?: string
          hire_name?: string
          id?: never
          quota_end?: string | null
          quota_measure_method?: string
          quota_metric?: string
          quota_period?: string
          quota_start?: string | null
          quota_target?: number
          quota_unit?: string
          role_id?: number
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hires_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "hiring_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hires_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "hiring_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hires_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_applications: {
        Row: {
          access_token: string
          applicant_email: string
          applicant_name: string
          applicant_phone: string
          asking_price: number | null
          asking_price_note: string
          created_at: string
          id: number
          qualifications: string
          role_id: number
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          access_token: string
          applicant_email: string
          applicant_name: string
          applicant_phone?: string
          asking_price?: number | null
          asking_price_note?: string
          created_at?: string
          id?: never
          qualifications?: string
          role_id: number
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string
          asking_price?: number | null
          asking_price_note?: string
          created_at?: string
          id?: never
          qualifications?: string
          role_id?: number
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_applications_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "hiring_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_messages: {
        Row: {
          application_id: number
          body: string
          created_at: string
          id: number
          school_id: string
          sender: string
          sender_name: string
        }
        Insert: {
          application_id: number
          body: string
          created_at?: string
          id?: never
          school_id: string
          sender: string
          sender_name: string
        }
        Update: {
          application_id?: number
          body?: string
          created_at?: string
          id?: never
          school_id?: string
          sender?: string
          sender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "hiring_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_roles: {
        Row: {
          created_at: string
          created_by: number | null
          description: string
          expectations: string
          id: number
          is_published: boolean
          price_max: number | null
          price_min: number | null
          price_note: string
          school_id: string
          slug: string
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string
          expectations?: string
          id?: never
          is_published?: boolean
          price_max?: number | null
          price_min?: number | null
          price_note?: string
          school_id: string
          slug: string
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string
          expectations?: string
          id?: never
          is_published?: boolean
          price_max?: number | null
          price_min?: number | null
          price_note?: string
          school_id?: string
          slug?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_transcript_subjects: {
        Row: {
          component_scores: Json | null
          display_order: number | null
          id: number
          subject_name: string
          t1_ca: number | null
          t1_exam: number | null
          t1_total: number | null
          t2_ca: number | null
          t2_exam: number | null
          t2_total: number | null
          t3_ca: number | null
          t3_exam: number | null
          t3_total: number | null
          transcript_id: number
        }
        Insert: {
          component_scores?: Json | null
          display_order?: number | null
          id?: never
          subject_name: string
          t1_ca?: number | null
          t1_exam?: number | null
          t1_total?: number | null
          t2_ca?: number | null
          t2_exam?: number | null
          t2_total?: number | null
          t3_ca?: number | null
          t3_exam?: number | null
          t3_total?: number | null
          transcript_id: number
        }
        Update: {
          component_scores?: Json | null
          display_order?: number | null
          id?: never
          subject_name?: string
          t1_ca?: number | null
          t1_exam?: number | null
          t1_total?: number | null
          t2_ca?: number | null
          t2_exam?: number | null
          t2_total?: number | null
          t3_ca?: number | null
          t3_exam?: number | null
          t3_total?: number | null
          transcript_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_transcript_subjects_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "manual_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_transcripts: {
        Row: {
          academic_year: string | null
          class_name: string | null
          class_periods: Json | null
          created_at: string
          dob: string | null
          gender: string | null
          id: number
          notes: string | null
          school_id: string | null
          section_name: string | null
          structure_id: number | null
          structure_name: string | null
          student_id: string | null
          student_name: string
          student_number: string | null
          transcript_type: string
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          class_name?: string | null
          class_periods?: Json | null
          created_at?: string
          dob?: string | null
          gender?: string | null
          id?: never
          notes?: string | null
          school_id?: string | null
          section_name?: string | null
          structure_id?: number | null
          structure_name?: string | null
          student_id?: string | null
          student_name: string
          student_number?: string | null
          transcript_type?: string
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          class_name?: string | null
          class_periods?: Json | null
          created_at?: string
          dob?: string | null
          gender?: string | null
          id?: never
          notes?: string | null
          school_id?: string | null
          section_name?: string | null
          structure_id?: number | null
          structure_name?: string | null
          student_id?: string | null
          student_name?: string
          student_number?: string | null
          transcript_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_transcripts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          event_type: string | null
          id: number
          link_page: string | null
          read_at: string | null
          recipient_id: string
          recipient_role: string | null
          school_id: string
          title: string
          type: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_type?: string | null
          id?: never
          link_page?: string | null
          read_at?: string | null
          recipient_id: string
          recipient_role?: string | null
          school_id: string
          title: string
          type?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          event_type?: string | null
          id?: never
          link_page?: string | null
          read_at?: string | null
          recipient_id?: string
          recipient_role?: string | null
          school_id?: string
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      org_presets: {
        Row: {
          created_at: string
          description: string
          id: number
          key: string
          modules_json: Json
          name: string
          settings_seed: Json
        }
        Insert: {
          created_at?: string
          description?: string
          id?: never
          key: string
          modules_json?: Json
          name: string
          settings_seed?: Json
        }
        Update: {
          created_at?: string
          description?: string
          id?: never
          key?: string
          modules_json?: Json
          name?: string
          settings_seed?: Json
        }
        Relationships: []
      }
      org_submissions: {
        Row: {
          contact_email: string
          contact_name: string
          created_at: string
          id: number
          org_name: string
          phone: string
          preset_key: string
          school_id: string
          status: string
        }
        Insert: {
          contact_email?: string
          contact_name?: string
          created_at?: string
          id?: never
          org_name: string
          phone?: string
          preset_key: string
          school_id: string
          status?: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          created_at?: string
          id?: never
          org_name?: string
          phone?: string
          preset_key?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tools: {
        Row: {
          created_at: string
          id: number
          is_enabled: boolean
          school_id: string
          tool_key: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_enabled?: boolean
          school_id: string
          tool_key: string
        }
        Update: {
          created_at?: string
          id?: never
          is_enabled?: boolean
          school_id?: string
          tool_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_tools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          fee_type: string | null
          id: number
          payment_date: string | null
          payment_reference: string | null
          payment_status: string
          paystack_reference: string | null
          school_id: string | null
          session_id: number | null
          student_id: string | null
          term_id: number | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          fee_type?: string | null
          id?: number
          payment_date?: string | null
          payment_reference?: string | null
          payment_status?: string
          paystack_reference?: string | null
          school_id?: string | null
          session_id?: number | null
          student_id?: string | null
          term_id?: number | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          fee_type?: string | null
          id?: number
          payment_date?: string | null
          payment_reference?: string | null
          payment_status?: string
          paystack_reference?: string | null
          school_id?: string | null
          session_id?: number | null
          student_id?: string | null
          term_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: number
          new_value: string | null
          old_value: string | null
          page_id: string | null
          target_role: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: never
          new_value?: string | null
          old_value?: string | null
          page_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: never
          new_value?: string | null
          old_value?: string | null
          page_id?: string | null
          target_role?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_login: string | null
          password_hash: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_login?: string | null
          password_hash?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_login?: string | null
          password_hash?: string | null
        }
        Relationships: []
      }
      portal_cae_results: {
        Row: {
          class_id: number | null
          created_at: string
          id: number
          rating_id: number | null
          school_id: string | null
          session_id: number | null
          student_id: string
          term_id: number | null
          trait_id: number | null
          updated_at: string
        }
        Insert: {
          class_id?: number | null
          created_at?: string
          id?: never
          rating_id?: number | null
          school_id?: string | null
          session_id?: number | null
          student_id: string
          term_id?: number | null
          trait_id?: number | null
          updated_at?: string
        }
        Update: {
          class_id?: number | null
          created_at?: string
          id?: never
          rating_id?: number | null
          school_id?: string | null
          session_id?: number | null
          student_id?: string
          term_id?: number | null
          trait_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_cae_results_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "cae_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_cae_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_cae_results_trait_id_fkey"
            columns: ["trait_id"]
            isOneToOne: false
            referencedRelation: "cae_traits"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_results: {
        Row: {
          ca_score: number | null
          class_id: number | null
          created_at: string | null
          exam_score: number | null
          id: number
          school_id: string | null
          session_id: number | null
          student_id: string | null
          subject_id: number
          term_id: number | null
          total_score: number | null
          updated_at: string | null
        }
        Insert: {
          ca_score?: number | null
          class_id?: number | null
          created_at?: string | null
          exam_score?: number | null
          id?: number
          school_id?: string | null
          session_id?: number | null
          student_id?: string | null
          subject_id: number
          term_id?: number | null
          total_score?: number | null
          updated_at?: string | null
        }
        Update: {
          ca_score?: number | null
          class_id?: number | null
          created_at?: string | null
          exam_score?: number | null
          id?: number
          school_id?: string | null
          session_id?: number | null
          student_id?: string | null
          subject_id?: number
          term_id?: number | null
          total_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_results_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_results_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          role: string
          school_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
          school_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_decisions: {
        Row: {
          decision: string
          from_class_id: number | null
          id: number
          run_id: number
          school_id: string | null
          student_id: string
          to_class_id: number | null
          updated_at: string
        }
        Insert: {
          decision: string
          from_class_id?: number | null
          id?: never
          run_id: number
          school_id?: string | null
          student_id: string
          to_class_id?: number | null
          updated_at?: string
        }
        Update: {
          decision?: string
          from_class_id?: number | null
          id?: never
          run_id?: number
          school_id?: string | null
          student_id?: string
          to_class_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "promotion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_decisions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_runs: {
        Row: {
          armed_by: string | null
          committed_at: string | null
          created_at: string
          from_session_id: number
          id: number
          promotion_term_id: number | null
          school_id: string | null
          status: string
        }
        Insert: {
          armed_by?: string | null
          committed_at?: string | null
          created_at?: string
          from_session_id: number
          id?: never
          promotion_term_id?: number | null
          school_id?: string | null
          status?: string
        }
        Update: {
          armed_by?: string | null
          committed_at?: string | null
          created_at?: string
          from_session_id?: number
          id?: never
          promotion_term_id?: number | null
          school_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      recycle_bin: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          expires_at: string
          id: number
          record_data: Json
          record_id: string
          record_type: string
          school_id: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          expires_at: string
          id?: never
          record_data: Json
          record_id: string
          record_type: string
          school_id: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          expires_at?: string
          id?: never
          record_data?: Json
          record_id?: string
          record_type?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recycle_bin_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_publish: {
        Row: {
          class_id: number | null
          id: number
          is_published: boolean
          principal_signature_id: number | null
          published: boolean
          published_by: string | null
          school_id: string
          session_id: number | null
          show_attendance: boolean | null
          show_cae: boolean | null
          show_next_term: boolean | null
          show_parent_ack: boolean | null
          show_position: boolean | null
          show_principal_comment: boolean | null
          show_teacher_comment: boolean | null
          teacher_signature_id: number | null
          template_id: number | null
          term_id: number | null
          unpublished_at: string | null
          updated_at: string
        }
        Insert: {
          class_id?: number | null
          id?: never
          is_published?: boolean
          principal_signature_id?: number | null
          published?: boolean
          published_by?: string | null
          school_id: string
          session_id?: number | null
          show_attendance?: boolean | null
          show_cae?: boolean | null
          show_next_term?: boolean | null
          show_parent_ack?: boolean | null
          show_position?: boolean | null
          show_principal_comment?: boolean | null
          show_teacher_comment?: boolean | null
          teacher_signature_id?: number | null
          template_id?: number | null
          term_id?: number | null
          unpublished_at?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: number | null
          id?: never
          is_published?: boolean
          principal_signature_id?: number | null
          published?: boolean
          published_by?: string | null
          school_id?: string
          session_id?: number | null
          show_attendance?: boolean | null
          show_cae?: boolean | null
          show_next_term?: boolean | null
          show_parent_ack?: boolean | null
          show_position?: boolean | null
          show_principal_comment?: boolean | null
          show_teacher_comment?: boolean | null
          teacher_signature_id?: number | null
          template_id?: number | null
          term_id?: number | null
          unpublished_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_publish_principal_signature_id_fkey"
            columns: ["principal_signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_publish_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_publish_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_publish_teacher_signature_id_fkey"
            columns: ["teacher_signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_publish_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          default_next_term_date: string | null
          default_principal_comment: string | null
          default_teacher_comment: string | null
          description: string | null
          id: number
          is_default: boolean | null
          name: string
          principal_signature_id: number | null
          school_id: string | null
          show_cae: boolean | null
          show_next_term: boolean | null
          show_parent_ack: boolean | null
          show_position: boolean | null
          show_principal_comment: boolean | null
          show_teacher_comment: boolean | null
          teacher_signature_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          default_next_term_date?: string | null
          default_principal_comment?: string | null
          default_teacher_comment?: string | null
          description?: string | null
          id?: number
          is_default?: boolean | null
          name: string
          principal_signature_id?: number | null
          school_id?: string | null
          show_cae?: boolean | null
          show_next_term?: boolean | null
          show_parent_ack?: boolean | null
          show_position?: boolean | null
          show_principal_comment?: boolean | null
          show_teacher_comment?: boolean | null
          teacher_signature_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          default_next_term_date?: string | null
          default_principal_comment?: string | null
          default_teacher_comment?: string | null
          description?: string | null
          id?: number
          is_default?: boolean | null
          name?: string
          principal_signature_id?: number | null
          school_id?: string | null
          show_cae?: boolean | null
          show_next_term?: boolean | null
          show_parent_ack?: boolean | null
          show_position?: boolean | null
          show_principal_comment?: boolean | null
          show_teacher_comment?: boolean | null
          teacher_signature_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_principal_signature_id_fkey"
            columns: ["principal_signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_teacher_signature_id_fkey"
            columns: ["teacher_signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      result_approvals: {
        Row: {
          class_id: number | null
          created_at: string | null
          ea_approved_at: string | null
          ea_approved_by: string | null
          ea_notes: string | null
          ea_status: string
          id: number
          ma_approved_at: string | null
          ma_approved_by: string | null
          ma_notes: string | null
          ma_status: string
          school_id: string | null
          session_id: number | null
          term_id: number | null
          updated_at: string | null
        }
        Insert: {
          class_id?: number | null
          created_at?: string | null
          ea_approved_at?: string | null
          ea_approved_by?: string | null
          ea_notes?: string | null
          ea_status?: string
          id?: number
          ma_approved_at?: string | null
          ma_approved_by?: string | null
          ma_notes?: string | null
          ma_status?: string
          school_id?: string | null
          session_id?: number | null
          term_id?: number | null
          updated_at?: string | null
        }
        Update: {
          class_id?: number | null
          created_at?: string | null
          ea_approved_at?: string | null
          ea_approved_by?: string | null
          ea_notes?: string | null
          ea_status?: string
          id?: number
          ma_approved_at?: string | null
          ma_approved_by?: string | null
          ma_notes?: string | null
          ma_status?: string
          school_id?: string | null
          session_id?: number | null
          term_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "result_approvals_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_approvals_ea_approved_by_fkey"
            columns: ["ea_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_approvals_ma_approved_by_fkey"
            columns: ["ma_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_approvals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_approvals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_approvals_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          id: string
          page_id: string
          role: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          id?: string
          page_id: string
          role: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          id?: string
          page_id?: string
          role?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          id: number
          key: string
          school_id: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: never
          key: string
          school_id?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: never
          key?: string
          school_id?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          admin_email: string | null
          admin_name: string | null
          admin_password: string | null
          admin_password_hash: string | null
          contact_phone: string | null
          created_at: string
          id: string
          logo: string | null
          name: string
          onboarding_step: string | null
          phone: string | null
          plan: string | null
          preset_key: string | null
          settings_password: string | null
          setup_done: boolean
          state: string | null
          status: string
          student_id_prefix: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_email?: string | null
          admin_name?: string | null
          admin_password?: string | null
          admin_password_hash?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo?: string | null
          name: string
          onboarding_step?: string | null
          phone?: string | null
          plan?: string | null
          preset_key?: string | null
          settings_password?: string | null
          setup_done?: boolean
          state?: string | null
          status?: string
          student_id_prefix?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_email?: string | null
          admin_name?: string | null
          admin_password?: string | null
          admin_password_hash?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo?: string | null
          name?: string
          onboarding_step?: string | null
          phone?: string | null
          plan?: string | null
          preset_key?: string | null
          settings_password?: string | null
          setup_done?: boolean
          state?: string | null
          status?: string
          student_id_prefix?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      section_subjects: {
        Row: {
          code: string | null
          created_at: string
          id: number
          name: string
          school_id: string | null
          section_id: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: never
          name: string
          school_id?: string | null
          section_id?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: never
          name?: string
          school_id?: string | null
          section_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "section_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean | null
          name: string
          school_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          school_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          school_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: number
          image_url: string
          is_active: boolean | null
          name: string
          role_label: string | null
          school_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          image_url: string
          is_active?: boolean | null
          name: string
          role_label?: string | null
          school_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          image_url?: string
          is_active?: boolean | null
          name?: string
          role_label?: string | null
          school_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          class_id: number | null
          id: number
          profile_id: string | null
          student_id: string | null
        }
        Insert: {
          class_id?: number | null
          id?: number
          profile_id?: string | null
          student_id?: string | null
        }
        Update: {
          class_id?: number | null
          id?: number
          profile_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_requests: {
        Row: {
          admin_note: string | null
          admission_year: string | null
          age: number | null
          class_id: number | null
          created_at: string | null
          dob: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: number
          last_name: string
          middle_name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string | null
          source: string | null
          status: string | null
          submitted_by: string
          teacher_name: string | null
        }
        Insert: {
          admin_note?: string | null
          admission_year?: string | null
          age?: number | null
          class_id?: number | null
          created_at?: string | null
          dob?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: number
          last_name: string
          middle_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          source?: string | null
          status?: string | null
          submitted_by: string
          teacher_name?: string | null
        }
        Update: {
          admin_note?: string | null
          admission_year?: string | null
          age?: number | null
          class_id?: number | null
          created_at?: string | null
          dob?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: number
          last_name?: string
          middle_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          source?: string | null
          status?: string | null
          submitted_by?: string
          teacher_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_requests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_number: string
          admission_year: string | null
          age: number | null
          class_id: number | null
          created_at: string | null
          display_name: string | null
          dob: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          graduation_year: string | null
          guardian_name: string | null
          id: string
          is_new_enrollee: boolean
          last_name: string | null
          middle_name: string | null
          name: string
          password_hash: string | null
          phone: string | null
          school_id: string | null
          status: string
        }
        Insert: {
          admission_number: string
          admission_year?: string | null
          age?: number | null
          class_id?: number | null
          created_at?: string | null
          display_name?: string | null
          dob?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          graduation_year?: string | null
          guardian_name?: string | null
          id: string
          is_new_enrollee?: boolean
          last_name?: string | null
          middle_name?: string | null
          name: string
          password_hash?: string | null
          phone?: string | null
          school_id?: string | null
          status?: string
        }
        Update: {
          admission_number?: string
          admission_year?: string | null
          age?: number | null
          class_id?: number | null
          created_at?: string | null
          display_name?: string | null
          dob?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          graduation_year?: string | null
          guardian_name?: string | null
          id?: string
          is_new_enrollee?: boolean
          last_name?: string | null
          middle_name?: string | null
          name?: string
          password_hash?: string | null
          phone?: string | null
          school_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_access_grants: {
        Row: {
          class_id: number | null
          created_at: string
          granted_by: number | null
          id: number
          school_id: string | null
          subject_id: number | null
          teacher_id: number | null
        }
        Insert: {
          class_id?: number | null
          created_at?: string
          granted_by?: number | null
          id?: never
          school_id?: string | null
          subject_id?: number | null
          teacher_id?: number | null
        }
        Update: {
          class_id?: number | null
          created_at?: string
          granted_by?: number | null
          id?: never
          school_id?: string | null
          subject_id?: number | null
          teacher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_access_grants_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_grants_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_grants_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "section_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_grants_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_access_requests: {
        Row: {
          admin_note: string | null
          class_id: number | null
          id: number
          requested_at: string
          reviewed_at: string | null
          reviewed_by: number | null
          school_id: string | null
          status: string
          subject_ids: Json
          teacher_id: number | null
        }
        Insert: {
          admin_note?: string | null
          class_id?: number | null
          id?: never
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: number | null
          school_id?: string | null
          status?: string
          subject_ids?: Json
          teacher_id?: number | null
        }
        Update: {
          admin_note?: string | null
          class_id?: number | null
          id?: never
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: number | null
          school_id?: string | null
          status?: string
          subject_ids?: Json
          teacher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_access_requests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_access_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string | null
          id: number
          name: string
          school_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: number
          name: string
          school_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: number
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_subjects: {
        Row: {
          class_id: number | null
          id: number
          school_id: string | null
          session_id: number | null
          subject_id: number | null
          teacher_id: number | null
        }
        Insert: {
          class_id?: number | null
          id?: number
          school_id?: string | null
          session_id?: number | null
          subject_id?: number | null
          teacher_id?: number | null
        }
        Update: {
          class_id?: number | null
          id?: number
          school_id?: string | null
          session_id?: number | null
          subject_id?: number | null
          teacher_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string | null
          date_joined: string | null
          display_name: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: number
          password_hash: string | null
          phone: string | null
          profile_id: string | null
          role: string
          school_id: string | null
          staff_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          date_joined?: string | null
          display_name?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: number
          password_hash?: string | null
          phone?: string | null
          profile_id?: string | null
          role?: string
          school_id?: string | null
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          date_joined?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: number
          password_hash?: string | null
          phone?: string | null
          profile_id?: string | null
          role?: string
          school_id?: string | null
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
          school_id: string | null
          session_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          school_id?: string | null
          session_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          school_id?: string | null
          session_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_periods: {
        Row: {
          end_time: string | null
          id: number
          is_break: boolean
          name: string | null
          order_index: number | null
          school_id: string
          start_time: string | null
        }
        Insert: {
          end_time?: string | null
          id?: never
          is_break?: boolean
          name?: string | null
          order_index?: number | null
          school_id: string
          start_time?: string | null
        }
        Update: {
          end_time?: string | null
          id?: never
          is_break?: boolean
          name?: string | null
          order_index?: number | null
          school_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_id: number | null
          day_of_week: number
          id: number
          period_id: number | null
          school_id: string
          session_id: number | null
          subject_id: number | null
          teacher_id: number | null
          term_id: number | null
        }
        Insert: {
          class_id?: number | null
          day_of_week: number
          id?: never
          period_id?: number | null
          school_id: string
          session_id?: number | null
          subject_id?: number | null
          teacher_id?: number | null
          term_id?: number | null
        }
        Update: {
          class_id?: number | null
          day_of_week?: number
          id?: never
          period_id?: number | null
          school_id?: string
          session_id?: number | null
          subject_id?: number | null
          teacher_id?: number | null
          term_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timetable_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "section_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_drafts: {
        Row: {
          class_name: string | null
          created_at: string
          created_by_name: string | null
          generated_at: string | null
          id: number
          missing_fields: Json | null
          note: string | null
          school_id: string | null
          score_overrides: Json | null
          session_ids: Json | null
          status: string
          student_id: string | null
          student_name: string | null
          updated_at: string
          updated_by_name: string | null
        }
        Insert: {
          class_name?: string | null
          created_at?: string
          created_by_name?: string | null
          generated_at?: string | null
          id?: never
          missing_fields?: Json | null
          note?: string | null
          school_id?: string | null
          score_overrides?: Json | null
          session_ids?: Json | null
          status?: string
          student_id?: string | null
          student_name?: string | null
          updated_at?: string
          updated_by_name?: string | null
        }
        Update: {
          class_name?: string | null
          created_at?: string
          created_by_name?: string | null
          generated_at?: string | null
          id?: never
          missing_fields?: Json | null
          note?: string | null
          school_id?: string | null
          score_overrides?: Json | null
          session_ids?: Json | null
          status?: string
          student_id?: string | null
          student_name?: string | null
          updated_at?: string
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcript_drafts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          created_at: string | null
          doc_type: string | null
          file_url: string | null
          filename: string
          id: string
          student_id: string | null
        }
        Insert: {
          created_at?: string | null
          doc_type?: string | null
          file_url?: string | null
          filename: string
          id: string
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          doc_type?: string | null
          file_url?: string | null
          filename?: string
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allowed: boolean
          id: string
          page_id: string
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          allowed?: boolean
          id?: string
          page_id: string
          updated_at?: string
          user_id: string
          user_type: string
        }
        Update: {
          allowed?: boolean
          id?: string
          page_id?: string
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_role: { Args: never; Returns: string }
      auth_school_id: { Args: never; Returns: string }
      auth_student_id: { Args: never; Returns: string }
      auth_teacher_id: { Args: never; Returns: number }
      hiring_get_thread: { Args: { p_token: string }; Returns: Json }
      hiring_post_message: {
        Args: { p_body: string; p_sender_name: string; p_token: string }
        Returns: Json
      }
      hiring_public_role: {
        Args: { p_slug: string }
        Returns: {
          description: string
          expectations: string
          id: number
          org_name: string
          price_max: number
          price_min: number
          price_note: string
          summary: string
          title: string
        }[]
      }
      hiring_public_submit_application: {
        Args: {
          p_asking_price: number
          p_email: string
          p_name: string
          p_phone: string
          p_price_note: string
          p_qualifications: string
          p_slug: string
        }
        Returns: Json
      }
      login_list_schools: {
        Args: never
        Returns: {
          address: string
          id: string
          logo: string
          name: string
          phone: string
          student_id_prefix: string
        }[]
      }
      login_lookup_access_settings: {
        Args: { p_school_id: string }
        Returns: {
          key: string
          value: string
        }[]
      }
      login_lookup_school_admin: {
        Args: { p_school_id: string }
        Returns: {
          admin_email: string
          admin_name: string
        }[]
      }
      login_lookup_student: {
        Args: { p_school_id: string; p_student_id: string }
        Returns: {
          class_id: number
          display_name: string
          email: string
          id: string
          name: string
          status: string
        }[]
      }
      login_lookup_teacher: {
        Args: { p_school_id: string; p_staff_id: string }
        Returns: {
          display_name: string
          email: string
          full_name: string
          id: number
          role: string
          staff_id: string
          status: string
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
