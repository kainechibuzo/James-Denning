-- Allow authenticated users to update only their own display name.
-- Row-level security remains responsible for row isolation.
grant update (full_name) on table public.profiles to authenticated;
