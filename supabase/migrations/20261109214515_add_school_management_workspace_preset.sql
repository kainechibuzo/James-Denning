insert into public.org_presets (key,name,description,modules_json,settings_seed)
values (
  'school_management',
  'School management',
  'Students, staff, academics, attendance, fees, results and school communication.',
  '{"core":true,"people":true,"billing":true,"comms":true,"performance":true,"education":true}',
  '{"workspace_type":"education","education_module_enabled":"true"}'
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  modules_json = excluded.modules_json,
  settings_seed = excluded.settings_seed;
