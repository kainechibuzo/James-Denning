
-- Preserve existing row predicates while separating read policies from write policies.
-- This removes redundant SELECT evaluation from legacy ALL + SELECT policy pairs.

-- School-scoped catalogues: reads remain school-scoped; writes remain admin-only.
DROP POLICY IF EXISTS class_subjects_write ON public.class_subjects;
CREATE POLICY class_subjects_insert ON public.class_subjects FOR INSERT TO public
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY class_subjects_update ON public.class_subjects FOR UPDATE TO public
  USING (school_id = auth_school_id() AND auth_role() = 'admin')
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY class_subjects_delete ON public.class_subjects FOR DELETE TO public
  USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS ct_write ON public.class_teachers;
CREATE POLICY ct_insert ON public.class_teachers FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_teachers.class_id AND c.school_id = auth_school_id()) AND auth_role() = 'admin');
CREATE POLICY ct_update ON public.class_teachers FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_teachers.class_id AND c.school_id = auth_school_id()) AND auth_role() = 'admin')
  WITH CHECK (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_teachers.class_id AND c.school_id = auth_school_id()) AND auth_role() = 'admin');
CREATE POLICY ct_delete ON public.class_teachers FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_teachers.class_id AND c.school_id = auth_school_id()) AND auth_role() = 'admin');

DROP POLICY IF EXISTS classes_write ON public.classes;
CREATE POLICY classes_insert ON public.classes FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY classes_update ON public.classes FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY classes_delete ON public.classes FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS fee_structures_write ON public.fee_structures;
CREATE POLICY fee_structures_insert ON public.fee_structures FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_structures_update ON public.fee_structures FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_structures_delete ON public.fee_structures FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS grading_schema_write ON public.grading_schema;
CREATE POLICY grading_schema_insert ON public.grading_schema FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY grading_schema_update ON public.grading_schema FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY grading_schema_delete ON public.grading_schema FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS sessions_write ON public.sessions;
CREATE POLICY sessions_insert ON public.sessions FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY sessions_update ON public.sessions FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY sessions_delete ON public.sessions FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS subjects_write ON public.subjects;
CREATE POLICY subjects_insert ON public.subjects FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY subjects_update ON public.subjects FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY subjects_delete ON public.subjects FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS ts_write ON public.teacher_subjects;
CREATE POLICY ts_insert ON public.teacher_subjects FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = auth_school_id()) AND auth_role() IN ('admin','teacher'));
CREATE POLICY ts_update ON public.teacher_subjects FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = auth_school_id()) AND auth_role() IN ('admin','teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = auth_school_id()) AND auth_role() IN ('admin','teacher'));
CREATE POLICY ts_delete ON public.teacher_subjects FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_subjects.teacher_id AND t.school_id = auth_school_id()) AND auth_role() IN ('admin','teacher'));

DROP POLICY IF EXISTS teachers_write ON public.teachers;
CREATE POLICY teachers_insert ON public.teachers FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY teachers_update ON public.teachers FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY teachers_delete ON public.teachers FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS terms_write ON public.terms;
CREATE POLICY terms_insert ON public.terms FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY terms_update ON public.terms FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY terms_delete ON public.terms FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

-- Admin-only financial mutations; the existing scoped read policies remain authoritative.
DROP POLICY IF EXISTS fee_bill_items_admin_write ON public.fee_bill_items;
CREATE POLICY fee_bill_items_admin_insert ON public.fee_bill_items FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_bills b WHERE b.id = fee_bill_items.bill_id AND b.school_id = auth_school_id()));
CREATE POLICY fee_bill_items_admin_update ON public.fee_bill_items FOR UPDATE TO authenticated
  USING (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_bills b WHERE b.id = fee_bill_items.bill_id AND b.school_id = auth_school_id()))
  WITH CHECK (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_bills b WHERE b.id = fee_bill_items.bill_id AND b.school_id = auth_school_id()));
CREATE POLICY fee_bill_items_admin_delete ON public.fee_bill_items FOR DELETE TO authenticated
  USING (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_bills b WHERE b.id = fee_bill_items.bill_id AND b.school_id = auth_school_id()));

DROP POLICY IF EXISTS fee_bills_staff_write ON public.fee_bills;
CREATE POLICY fee_bills_admin_insert ON public.fee_bills FOR INSERT TO authenticated WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_bills_admin_update ON public.fee_bills FOR UPDATE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_bills_admin_delete ON public.fee_bills FOR DELETE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS fee_discounts_admin_write ON public.fee_discounts;
CREATE POLICY fee_discounts_admin_insert ON public.fee_discounts FOR INSERT TO authenticated WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_discounts_admin_update ON public.fee_discounts FOR UPDATE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_discounts_admin_delete ON public.fee_discounts FOR DELETE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS fee_items_admin_write ON public.fee_items;
CREATE POLICY fee_items_admin_insert ON public.fee_items FOR INSERT TO authenticated WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_items_admin_update ON public.fee_items FOR UPDATE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_items_admin_delete ON public.fee_items FOR DELETE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin');

DROP POLICY IF EXISTS fee_template_items_admin_write ON public.fee_template_items;
CREATE POLICY fee_template_items_admin_insert ON public.fee_template_items FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_templates t WHERE t.id = fee_template_items.template_id AND t.school_id = auth_school_id()));
CREATE POLICY fee_template_items_admin_update ON public.fee_template_items FOR UPDATE TO authenticated
  USING (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_templates t WHERE t.id = fee_template_items.template_id AND t.school_id = auth_school_id()))
  WITH CHECK (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_templates t WHERE t.id = fee_template_items.template_id AND t.school_id = auth_school_id()));
CREATE POLICY fee_template_items_admin_delete ON public.fee_template_items FOR DELETE TO authenticated
  USING (auth_role() = 'admin' AND EXISTS (SELECT 1 FROM public.fee_templates t WHERE t.id = fee_template_items.template_id AND t.school_id = auth_school_id()));

DROP POLICY IF EXISTS fee_templates_admin_write ON public.fee_templates;
CREATE POLICY fee_templates_admin_insert ON public.fee_templates FOR INSERT TO authenticated WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_templates_admin_update ON public.fee_templates FOR UPDATE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_templates_admin_delete ON public.fee_templates FOR DELETE TO authenticated USING (school_id = auth_school_id() AND auth_role() = 'admin');

-- Separate section management from the deliberately public active-section catalogue.
DROP POLICY IF EXISTS "Admins can manage sections" ON public.sections;
CREATE POLICY sections_admin_insert ON public.sections FOR INSERT TO public
  WITH CHECK (((auth.jwt() ->> 'user_role') = 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY sections_admin_update ON public.sections FOR UPDATE TO public
  USING (((auth.jwt() ->> 'user_role') = 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (((auth.jwt() ->> 'user_role') = 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY sections_admin_delete ON public.sections FOR DELETE TO public
  USING (((auth.jwt() ->> 'user_role') = 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
DROP POLICY IF EXISTS "Authenticated users can read sections" ON public.sections;
DROP POLICY IF EXISTS "Public can view active sections" ON public.sections;
CREATE POLICY sections_visibility ON public.sections FOR SELECT TO public
  USING ((auth.role() = 'authenticated') OR is_active = true);

-- Self-read and admin writes remain separate, avoiding an admin ALL policy on SELECT.
DROP POLICY IF EXISTS sp_admin ON public.student_profiles;
CREATE POLICY sp_admin_insert ON public.student_profiles FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_profiles.student_id AND s.school_id = auth_school_id()) AND auth_role() = 'admin');
CREATE POLICY sp_admin_update ON public.student_profiles FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_profiles.student_id AND s.school_id = auth_school_id()) AND auth_role() = 'admin')
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_profiles.student_id AND s.school_id = auth_school_id()) AND auth_role() = 'admin');
CREATE POLICY sp_admin_delete ON public.student_profiles FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_profiles.student_id AND s.school_id = auth_school_id()) AND auth_role() = 'admin');

DROP POLICY IF EXISTS students_admin ON public.students;
CREATE POLICY students_admin_insert ON public.students FOR INSERT TO public WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY students_admin_update ON public.students FOR UPDATE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin') WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY students_admin_delete ON public.students FOR DELETE TO public USING (school_id = auth_school_id() AND auth_role() = 'admin');

-- The email queue contains delivery operations; restrict direct client access to the explicit admin policies.
DROP POLICY IF EXISTS email_queue_school_scoped ON public.email_queue;
