alter table public.sections add column if not exists color text;
comment on column public.sections.color is 'Optional display colour for a section; clients must retain their existing fallback when null.';
