-- Step A: move Fase 1's hardcoded-user data onto the real authenticated user.
-- Must run BEFORE the FK constraints below, or the FK add fails (the old
-- placeholder UUID '00000000-0000-0000-0000-000000000001' does not exist in
-- auth.users). If this step is skipped, Step B fails loudly (safe) rather
-- than silently hiding André's data behind RLS (which is what would happen
-- if the FK were somehow skipped too).
update profile set user_id = 'fb6e150f-6b6c-4ed3-8fc9-2a4794937e5d' where user_id = '00000000-0000-0000-0000-000000000001';
update achievements set user_id = 'fb6e150f-6b6c-4ed3-8fc9-2a4794937e5d' where user_id = '00000000-0000-0000-0000-000000000001';
update education set user_id = 'fb6e150f-6b6c-4ed3-8fc9-2a4794937e5d' where user_id = '00000000-0000-0000-0000-000000000001';
update certifications set user_id = 'fb6e150f-6b6c-4ed3-8fc9-2a4794937e5d' where user_id = '00000000-0000-0000-0000-000000000001';
update skills set user_id = 'fb6e150f-6b6c-4ed3-8fc9-2a4794937e5d' where user_id = '00000000-0000-0000-0000-000000000001';
update applications set user_id = 'fb6e150f-6b6c-4ed3-8fc9-2a4794937e5d' where user_id = '00000000-0000-0000-0000-000000000001';

-- Step B: real referential integrity.
alter table profile add constraint profile_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table achievements add constraint achievements_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table education add constraint education_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table certifications add constraint certifications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table skills add constraint skills_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table applications add constraint applications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- Step C: row level security as a second layer behind the app's own
-- explicit user_id filter (service role bypasses RLS by design, so the
-- application-level filter stays mandatory — RLS here is a safety net).
alter table profile enable row level security;
alter table achievements enable row level security;
alter table education enable row level security;
alter table certifications enable row level security;
alter table skills enable row level security;
alter table applications enable row level security;
alter table cv_versions enable row level security;
alter table interview_questions enable row level security;

create policy profile_owner on profile for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy achievements_owner on achievements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy education_owner on education for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy certifications_owner on certifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy skills_owner on skills for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applications_owner on applications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cv_versions_owner on cv_versions for all using (application_id in (select id from applications where user_id = auth.uid()));
create policy interview_questions_owner on interview_questions for all using (application_id in (select id from applications where user_id = auth.uid()));
