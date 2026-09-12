import type { SupabaseClient } from '@supabase/supabase-js'
import type { Application, ApplicationStatus, CvVersion, InterviewQuestion, MasterDataBank, Profile } from './types'

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

export async function getApplication(db: SupabaseClient, applicationId: string): Promise<Application> {
  const { data, error } = await db.from('applications').select('*').eq('id', applicationId).single()
  if (error) throw error
  return data
}

export async function updateJobDescription(db: SupabaseClient, applicationId: string, jobDescriptionRaw: string): Promise<void> {
  const { error } = await db.from('applications').update({ job_description_raw: jobDescriptionRaw }).eq('id', applicationId)
  if (error) throw error
}

export async function saveCvVersion(db: SupabaseClient, applicationId: string, storagePath: string, generatedJson: unknown): Promise<void> {
  const { error } = await db.from('cv_versions').insert({ application_id: applicationId, storage_path: storagePath, generated_json: generatedJson })
  if (error) throw error
}

export async function saveInterviewQuestions(db: SupabaseClient, applicationId: string, questions: { question: string; rationale: string }[]): Promise<void> {
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

export async function updateApplicationStatus(db: SupabaseClient, applicationId: string, status: ApplicationStatus): Promise<void> {
  const { error } = await db.from('applications').update({ status }).eq('id', applicationId)
  if (error) throw error
}

export async function getApplicationDetail(
  db: SupabaseClient,
  applicationId: string,
): Promise<{ application: Application; cvVersion: CvVersion | null; interviewQuestions: InterviewQuestion[] }> {
  const [
    { data: application, error: appError },
    { data: cvVersion, error: cvError },
    { data: interviewQuestions, error: iqError },
  ] = await Promise.all([
    db.from('applications').select('*').eq('id', applicationId).single(),
    db.from('cv_versions').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('interview_questions').select('*').eq('application_id', applicationId),
  ])
  if (appError) throw appError
  if (cvError) throw cvError
  if (iqError) throw iqError
  return { application, cvVersion: cvVersion ?? null, interviewQuestions: interviewQuestions ?? [] }
}
