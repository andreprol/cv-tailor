export type Positioning = 'TPM' | 'AI Product' | 'Web3'

export interface Profile {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string | null
  location: string | null
  linkedin_url: string | null
  github_url: string | null
}

export interface Achievement {
  id: string
  user_id: string
  company: string
  role_title: string
  start_date: string
  end_date: string | null
  bullet: string
  metric: string | null
  positioning: Positioning[]
}

export interface Skill {
  id: string
  user_id: string
  name: string
  category: string
  positioning: Positioning[]
}

export interface Education {
  id: string
  user_id: string
  institution: string
  degree: string
  completed_on: string | null
  in_progress: boolean
  positioning: Positioning[]
}

export interface Certification {
  id: string
  user_id: string
  name: string
  issuer: string | null
  issued_on: string | null
  positioning: Positioning[]
}

export interface MasterDataBank {
  achievements: Achievement[]
  skills: Skill[]
  education: Education[]
  certifications: Certification[]
}

export type ApplicationStatus = 'sem_resposta' | 'rejeitado' | 'entrevista' | 'oferta'

export interface Application {
  id: string
  user_id: string
  company: string
  role_title: string
  source_url: string | null
  job_description_raw: string
  status: ApplicationStatus
  applied_at: string
  created_at: string
}

export interface CvVersion {
  id: string
  application_id: string
  storage_path: string
  generated_json: unknown
  created_at: string
}

export interface InterviewQuestion {
  id: string
  application_id: string
  question: string
  rationale: string
  created_at: string
}
