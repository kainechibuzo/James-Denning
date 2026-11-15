-- Restore the exact definitions captured immediately before digest qualification.
do $$ declare v record; begin
 for v in select function_definition from jd_private.authorization_function_backups
 where migration_name='20261114221500_jd_qualify_pgcrypto_digest' order by function_name loop
  execute v.function_definition;
 end loop;
end $$;
