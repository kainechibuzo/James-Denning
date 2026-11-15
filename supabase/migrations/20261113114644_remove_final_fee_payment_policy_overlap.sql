
DROP POLICY IF EXISTS fee_payments_admin_write ON public.fee_payments;
CREATE POLICY fee_payments_admin_insert ON public.fee_payments FOR INSERT TO authenticated
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_payments_admin_update ON public.fee_payments FOR UPDATE TO authenticated
  USING (school_id = auth_school_id() AND auth_role() = 'admin')
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'admin');
CREATE POLICY fee_payments_admin_delete ON public.fee_payments FOR DELETE TO authenticated
  USING (school_id = auth_school_id() AND auth_role() = 'admin');
