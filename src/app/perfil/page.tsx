import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { getMasterDataBank } from '@/lib/repository'
import { UploadCvForm } from './upload-cv-form'
import { ProfileItemList, type ProfileItem } from './profile-item-list'

export default async function PerfilPage() {
  const userId = await getCurrentUserId()
  const db = createServiceClient()
  const masterData = await getMasterDataBank(db, userId)

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
    ],
  }))

  return (
    <main className="container">
      <div className="section-header">
        <h1>Perfil</h1>
        <Link href="/applications/new" className="btn btn-primary">
          + Nova candidatura
        </Link>
      </div>
      <p className="hint">Suba um CV (PDF ou DOCX) pra alimentar seu banco de dados. Edite ou apague qualquer item quando quiser — a revisão nunca é obrigatória.</p>

      <UploadCvForm />

      <h2>Conquistas</h2>
      <ProfileItemList table="achievements" items={achievementItems} />

      <h2>Formação</h2>
      <ProfileItemList table="education" items={educationItems} />

      <h2>Skills</h2>
      <ProfileItemList table="skills" items={skillItems} />

      <h2>Certificações</h2>
      <ProfileItemList table="certifications" items={certificationItems} />
    </main>
  )
}
