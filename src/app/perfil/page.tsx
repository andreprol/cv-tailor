import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getMasterDataBank, getProfile } from '@/lib/repository'
import { UploadCvForm } from './upload-cv-form'
import { ProfileItemList, type ProfileItem } from './profile-item-list'
import { AddProfileItemForm } from './add-profile-item-form'
import { GithubSection } from './github-section'

export default async function PerfilPage() {
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const masterData = await getMasterDataBank(db, userId)
  const profile = await getProfile(db, userId)

  const achievementItems: ProfileItem[] = masterData.achievements.map((a) => ({
    id: a.id,
    positioning: a.positioning,
    primary: `${a.role_title} @ ${a.company}`,
    secondary: a.bullet,
    fields: [
      { name: 'company', label: 'Empresa', value: a.company },
      { name: 'role_title', label: 'Cargo', value: a.role_title },
      { name: 'bullet', label: 'Conquista', value: a.bullet, multiline: true },
      { name: 'metric', label: 'Métrica', value: a.metric ?? '' },
      { name: 'start_date', label: 'Data de início', value: a.start_date, inputType: 'date' },
      { name: 'end_date', label: 'Data de fim', value: a.end_date ?? '', inputType: 'date' },
    ],
  }))

  const educationItems: ProfileItem[] = masterData.education.map((e) => ({
    id: e.id,
    positioning: e.positioning,
    primary: e.institution,
    secondary: e.degree,
    fields: [
      { name: 'institution', label: 'Instituição', value: e.institution },
      { name: 'degree', label: 'Curso', value: e.degree },
      { name: 'completed_on', label: 'Data de conclusão', value: e.completed_on ?? '', inputType: 'date' },
      { name: 'in_progress', label: 'Em andamento', value: String(e.in_progress), inputType: 'checkbox' },
    ],
  }))

  const skillItems: ProfileItem[] = masterData.skills.map((s) => ({
    id: s.id,
    positioning: s.positioning,
    primary: s.name,
    secondary: s.category,
    fields: [
      { name: 'name', label: 'Skill', value: s.name },
      { name: 'category', label: 'Categoria', value: s.category },
    ],
  }))

  const certificationItems: ProfileItem[] = masterData.certifications.map((c) => ({
    id: c.id,
    positioning: c.positioning,
    primary: c.name,
    secondary: c.issuer ?? '',
    fields: [
      { name: 'name', label: 'Certificação', value: c.name },
      { name: 'issuer', label: 'Emissor', value: c.issuer ?? '' },
      { name: 'issued_on', label: 'Data de emissão', value: c.issued_on ?? '', inputType: 'date' },
    ],
  }))

  return (
    <main className="container">
      <div className="section-header">
        <h1>Perfil</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/" className="btn btn-primary">
            Ver candidaturas
          </Link>
          <Link href="/applications/new" className="btn btn-primary">
            + Nova candidatura
          </Link>
        </div>
      </div>
      <p className="hint">Suba um CV (PDF ou DOCX) pra alimentar seu banco de dados. Edite ou apague qualquer item quando quiser — a revisão nunca é obrigatória.</p>

      <UploadCvForm />

      <h2>GitHub</h2>
      <GithubSection githubUrl={profile.github_url} />

      <h2>Conquistas</h2>
      <AddProfileItemForm table="achievements" />
      <ProfileItemList table="achievements" items={achievementItems} />

      <h2>Formação</h2>
      <AddProfileItemForm table="education" />
      <ProfileItemList table="education" items={educationItems} />

      <h2>Skills</h2>
      <AddProfileItemForm table="skills" />
      <ProfileItemList table="skills" items={skillItems} />

      <h2>Certificações</h2>
      <AddProfileItemForm table="certifications" />
      <ProfileItemList table="certifications" items={certificationItems} />
    </main>
  )
}
