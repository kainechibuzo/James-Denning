
CREATE INDEX IF NOT EXISTS class_subjects_subject_id_idx ON public.class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS class_subjects_section_subject_id_idx ON public.class_subjects(section_subject_id);
CREATE INDEX IF NOT EXISTS jd_audit_events_run_id_idx ON public.jd_audit_events(run_id);
CREATE INDEX IF NOT EXISTS jd_audit_events_actor_id_idx ON public.jd_audit_events(actor_id);
