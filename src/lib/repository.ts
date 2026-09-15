import type { SupabaseClient } from '@supabase/supabase-js'
import type { Application, ApplicationStatus, CvVersion, InterviewQuestion, MasterDataBank, Positioning, Profile } from './types'

export async function getMasterDataBank(db: SupabaseClient, userId: string): Promise<MasterDataBank> {
  const [
    { data: achievements, error: achievementsError },
    { data: skills, error: skillsError },
    { data: education, error: educationError },
    { data: certifications, error: certificationsError },
  ] = await Promise.all([
    db.from('achievements').select('*').eq('user_id', userId),
    db.from('skills').select('*').eq('user_id', userId),
    db.from('education').select('*').eq('user_id', userId),
    db.from('certifications').select('*').eq('user_id', userId),
  ])
  if (achievementsError) throw achievementsError
  if (skillsError) throw skillsError
  if (educationError) throw educationError
  if (certificationsError) throw certificationsError
  return {
    achievements: achievements ?? [],
    skills: skills ?? [],
    education: education ?? [],
    certifications: certifications ?? [],
  }
}

export async function getProfile(db: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await db.from('profile').select('*').eq('user_id', userId).single()
  if (error) throw error
  return data
}

export async function updateProfile(db: SupabaseClient, userId: string, fields: Partial<Pick<Profile, 'github_url' | 'linkedin_url'>>): Promise<void> {
  const { error } = await db.from('profile').update(fields).eq('user_id', userId)
  if (error) throw error
}

export async function createApplication(
  db: SupabaseClient,
  userId: string,
  input: { company: string; roleTitle: string; sourceUrl: string | null; jobDescriptionRaw: string },
): Promise<Application> {
  const { data, error } = await db
    .from('applications')
    .insert({
      user_id: userId,
      company: input.company,
      role_title: input.roleTitle,
      source_url: input.sourceUrl,
      job_description_raw: input.jobDescriptionRaw,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getApplication(db: SupabaseClient, applicationId: string, userId: string): Promise<Application> {
  const { data, error } = await db.from('applications').select('*').eq('id', applicationId).eq('user_id', userId).single()
  if (error) throw error
  return data
}

export async function updateJobDescription(db: SupabaseClient, applicationId: string, userId: string, jobDescriptionRaw: string): Promise<void> {
  const { error } = await db.from('applications').update({ job_description_raw: jobDescriptionRaw }).eq('id', applicationId).eq('user_id', userId).select().single()
  if (error) throw error
}

export async function saveCvVersion(db: SupabaseClient, applicationId: string, storagePath: string, generatedJson: unknown): Promise<void> {
  const { error: deleteError } = await db.from('cv_versions').delete().eq('application_id', applicationId)
  if (deleteError) throw deleteError
  const { error } = await db.from('cv_versions').insert({ application_id: applicationId, storage_path: storagePath, generated_json: generatedJson })
  if (error) throw error
}

export async function saveInterviewQuestions(db: SupabaseClient, applicationId: string, questions: { question: string; rationale: string }[]): Promise<void> {
  const { error: deleteError } = await db.from('interview_questions').delete().eq('application_id', applicationId)
  if (deleteError) throw deleteError
  const rows = questions.map((q) => ({ application_id: applicationId, question: q.question, rationale: q.rationale }))
  const { error } = await db.from('interview_questions').insert(rows)
  if (error) throw error
}

export async function listApplications(db: SupabaseClient, userId: string, search?: string): Promise<Application[]> {
  let query = db.from('applications').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (search) {
    query = query.textSearch('search_vector', search, { type: 'websearch' })
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function updateApplicationStatus(db: SupabaseClient, applicationId: string, userId: string, status: ApplicationStatus): Promise<void> {
  const { error } = await db.from('applications').update({ status }).eq('id', applicationId).eq('user_id', userId).select().single()
  if (error) throw error
}

export async function deleteApplication(db: SupabaseClient, applicationId: string, userId: string): Promise<void> {
  const { data: application, error: appError } = await db
    .from('applications')
    .select('id')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (appError) throw appError
  if (!application) return

  const { data: versions, error: versionsError } = await db
    .from('cv_versions')
    .select('storage_path')
    .eq('application_id', applicationId)
  if (versionsError) throw versionsError

  if (versions && versions.length > 0) {
    const { error: storageError } = await db.storage.from('cv-files').remove(versions.map((v) => v.storage_path))
    if (storageError) console.error('deleteApplication: falha ao remover arquivos do Storage:', storageError)
  }

  const { error } = await db.from('applications').delete().eq('id', applicationId).eq('user_id', userId)
  if (error) throw error
}

export async function getApplicationDetail(
  db: SupabaseClient,
  applicationId: string,
  userId: string,
): Promise<{ application: Application; cvVersion: CvVersion | null; interviewQuestions: InterviewQuestion[] }> {
  const { data: application, error: appError } = await db.from('applications').select('*').eq('id', applicationId).eq('user_id', userId).single()
  if (appError) throw appError

  const [
    { data: cvVersion, error: cvError },
    { data: interviewQuestions, error: iqError },
  ] = await Promise.all([
    db.from('cv_versions').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('interview_questions').select('*').eq('application_id', applicationId),
  ])
  if (cvError) throw cvError
  if (iqError) throw iqError
  return { application, cvVersion: cvVersion ?? null, interviewQuestions: interviewQuestions ?? [] }
}

export async function insertAchievements(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { company: string; roleTitle: string; startDate: string; endDate: string | null; bullet: string; metric: string | null }[],
): Promise<number> {
  const rows = items.map((a) => ({
    user_id: userId, company: a.company, role_title: a.roleTitle,
    start_date: a.startDate, end_date: a.endDate, bullet: a.bullet, metric: a.metric, positioning,
  }))
  const { data, error } = await db.from('achievements').upsert(rows, { onConflict: 'user_id,company_norm,role_title_norm,bullet_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export async function insertSkills(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { name: string; category: string }[],
): Promise<number> {
  const rows = items.map((s) => ({ user_id: userId, name: s.name, category: s.category, positioning }))
  const { data, error } = await db.from('skills').upsert(rows, { onConflict: 'user_id,name_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export async function insertEducation(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { institution: string; degree: string; completedOn: string | null; inProgress: boolean }[],
): Promise<number> {
  const rows = items.map((e) => ({
    user_id: userId, institution: e.institution, degree: e.degree, completed_on: e.completedOn, in_progress: e.inProgress, positioning,
  }))
  const { data, error } = await db.from('education').upsert(rows, { onConflict: 'user_id,institution_norm,degree_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export async function insertCertifications(
  db: SupabaseClient,
  userId: string,
  positioning: Positioning[],
  items: { name: string; issuer: string | null; issuedOn: string | null }[],
): Promise<number> {
  const rows = items.map((c) => ({ user_id: userId, name: c.name, issuer: c.issuer, issued_on: c.issuedOn, positioning }))
  const { data, error } = await db.from('certifications').upsert(rows, { onConflict: 'user_id,name_norm,issuer_norm,issued_on_norm', ignoreDuplicates: true }).select()
  if (error) throw error
  return data?.length ?? 0
}

export type ProfileItemTable = 'achievements' | 'education' | 'skills' | 'certifications'

export async function deleteProfileItem(db: SupabaseClient, table: ProfileItemTable, id: string, userId: string): Promise<void> {
  const { error } = await db.from(table).delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

// SECURITY: `fields` is applied to the row as-is with no column allowlist —
// the caller must only ever build it from a known-safe set of editable
// columns (see the EDITABLE_FIELDS allowlist in src/app/actions/profile-items.ts).
export async function updateProfileItem(db: SupabaseClient, table: ProfileItemTable, id: string, userId: string, fields: Record<string, string | boolean | null>): Promise<void> {
  const { error } = await db.from(table).update(fields).eq('id', id).eq('user_id', userId).select().single()
  if (error) throw error
}
