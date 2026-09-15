# Adicionar item manual no Perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar conquista/skill/formação/certificação do zero no Perfil (sem precisar subir um CV), e trazer os campos de data que faltavam pro formulário de editar.

**Architecture:** `repository.ts`'s `updateProfileItem` aceita `null` explícito pra limpar campos de data opcionais. `profile-items.ts` ganha uma nova Server Action (`addProfileItemAction`) que reaproveita as funções `insertX` (já `upsert`+`ignoreDuplicates`, da feature de dedup) passando um array de 1 item. `profile-item-list.tsx` ganha suporte a campo `date`/`checkbox` no formulário de editar existente. Um componente novo, `AddProfileItemForm`, renderiza o formulário de criar (campos variam por tabela, via `switch`).

**Tech Stack:** Next.js 15 Server Actions, React `useActionState`, TypeScript.

**Nota sobre testes:** mesma limitação já documentada em specs/planos anteriores deste projeto — sem mock de Supabase, `profile-items.ts` e o Route/Server Action layer não ganham teste automatizado. Verificação é manual (Task 7).

---

### Task 1: `repository.ts` — aceitar `null` explícito em `updateProfileItem`

**Files:**
- Modify: `cv-tailor/src/lib/repository.ts`

- [ ] **Step 1: Alterar a assinatura**

Localizar em `src/lib/repository.ts`:

```ts
export async function updateProfileItem(db: SupabaseClient, table: ProfileItemTable, id: string, userId: string, fields: Record<string, string>): Promise<void> {
```

Trocar por:

```ts
export async function updateProfileItem(db: SupabaseClient, table: ProfileItemTable, id: string, userId: string, fields: Record<string, string | null>): Promise<void> {
```

O corpo da função não muda — `.update(fields)` do Supabase já aceita `null` num campo pra virar
`SET coluna = NULL` na linha; só o tipo TypeScript estava mais restrito do que precisava.

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros (o único caller hoje, `updateProfileItemAction`, ainda passa só strings — tipo
mais largo aceita o que já era passado, `string` é atribuível a `string | null`)

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/lib/repository.ts
git commit -m "feat(cv-tailor): updateProfileItem aceita null pra limpar campos de data"
```

---

### Task 2: `profile-items.ts` — editar ganha campos de data

**Files:**
- Modify: `cv-tailor/src/app/actions/profile-items.ts`

- [ ] **Step 1: Ampliar `EDITABLE_FIELDS` e `updateProfileItemAction`**

Localizar em `src/app/actions/profile-items.ts`:

```ts
const EDITABLE_FIELDS: Record<ProfileItemTable, string[]> = {
  achievements: ['company', 'role_title', 'bullet', 'metric'],
  education: ['institution', 'degree'],
  skills: ['name', 'category'],
  certifications: ['name', 'issuer'],
}
```

Trocar por:

```ts
const EDITABLE_FIELDS: Record<ProfileItemTable, string[]> = {
  achievements: ['company', 'role_title', 'bullet', 'metric', 'start_date'],
  education: ['institution', 'degree'],
  skills: ['name', 'category'],
  certifications: ['name', 'issuer'],
}

// Campo de data opcional: string vazia vira null (nunca '' — coluna date
// do Postgres rejeita string vazia com erro, precisa ser NULL de verdade).
function optionalDate(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? '').trim() || null
}
```

Localizar `updateProfileItemAction`:

```ts
export async function updateProfileItemAction(
  table: string,
  id: string,
  _prevState: UpdateProfileItemState,
  formData: FormData,
): Promise<UpdateProfileItemState> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', savedAt: _prevState.savedAt }
  }

  const db = createServiceClient()

  const fields: Record<string, string> = {}
  for (const key of EDITABLE_FIELDS[validTable]) {
    const value = formData.get(key)
    if (value !== null) fields[key] = String(value)
  }

  try {
    await updateProfileItem(db, validTable, id, userId, fields)
  } catch (error) {
    console.error('updateProfileItemAction: falha ao salvar item do perfil:', error)
    return { error: 'Erro ao salvar. Tente novamente.', savedAt: _prevState.savedAt }
  }

  revalidatePath('/perfil')
  return { error: null, savedAt: Date.now() }
}
```

Trocar por:

```ts
export async function updateProfileItemAction(
  table: string,
  id: string,
  _prevState: UpdateProfileItemState,
  formData: FormData,
): Promise<UpdateProfileItemState> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', savedAt: _prevState.savedAt }
  }

  const db = createServiceClient()

  const fields: Record<string, string | null> = {}
  for (const key of EDITABLE_FIELDS[validTable]) {
    const value = formData.get(key)
    if (value !== null) fields[key] = String(value)
  }

  if (validTable === 'achievements') {
    fields.end_date = optionalDate(formData, 'end_date')
  }
  if (validTable === 'education') {
    fields.completed_on = optionalDate(formData, 'completed_on')
    fields.in_progress = formData.get('in_progress') === 'on' ? 'true' : 'false'
  }
  if (validTable === 'certifications') {
    fields.issued_on = optionalDate(formData, 'issued_on')
  }

  try {
    await updateProfileItem(db, validTable, id, userId, fields)
  } catch (error) {
    console.error('updateProfileItemAction: falha ao salvar item do perfil:', error)
    return { error: 'Erro ao salvar. Tente novamente.', savedAt: _prevState.savedAt }
  }

  revalidatePath('/perfil')
  return { error: null, savedAt: Date.now() }
}
```

Notas de implementação:
- `start_date` entra no `EDITABLE_FIELDS` genérico (nunca fica vazio de verdade — toda conquista já
  tem uma data de início no banco, o formulário de editar só mostra o valor existente).
- `end_date`/`completed_on`/`issued_on` são tratados fora do loop genérico porque precisam virar
  `null` explícito quando vazios (não `''`) — uma coluna `date` do Postgres rejeita string vazia com
  erro, não trata como "sem valor".
- `in_progress` é boolean no banco — checkbox desmarcado não aparece no `FormData` (comportamento
  padrão de HTML), então não dá pra usar o loop genérico (`value !== null` nunca detectaria "false"
  corretamente). Tratado à parte, sempre define explicitamente `'true'` ou `'false'`.

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/actions/profile-items.ts
git commit -m "feat(cv-tailor): editar ganha campos de data (achievements/education/certifications)"
```

---

### Task 3: `profile-items.ts` — `addProfileItemAction`

**Files:**
- Modify: `cv-tailor/src/app/actions/profile-items.ts`

- [ ] **Step 1: Adicionar imports, constante e a action nova**

No topo do arquivo, ampliar os imports existentes. Localizar:

```ts
import { deleteProfileItem, updateProfileItem, type ProfileItemTable } from '@/lib/repository'
```

Trocar por:

```ts
import {
  deleteProfileItem,
  updateProfileItem,
  insertAchievements,
  insertSkills,
  insertEducation,
  insertCertifications,
  type ProfileItemTable,
} from '@/lib/repository'
import type { Positioning } from '@/lib/types'
```

Logo abaixo de `VALID_TABLES`, adicionar:

```ts
const VALID_POSITIONING: Positioning[] = ['TPM', 'AI Product', 'Web3']
```

No final do arquivo, adicionar a nova action:

```ts
export interface AddProfileItemState {
  error: string | null
  addedAt: number
}

export async function addProfileItemAction(
  table: string,
  _prevState: AddProfileItemState,
  formData: FormData,
): Promise<AddProfileItemState> {
  const validTable = assertValidTable(table)

  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return { error: 'Sua sessao expirou. Faca login novamente.', addedAt: _prevState.addedAt }
  }

  const positioning = formData.getAll('positioning')
    .map(String)
    .filter((value): value is Positioning => (VALID_POSITIONING as string[]).includes(value))

  const db = createServiceClient()

  try {
    let inserted: number

    if (validTable === 'achievements') {
      const company = String(formData.get('company') ?? '').trim()
      const roleTitle = String(formData.get('role_title') ?? '').trim()
      const bullet = String(formData.get('bullet') ?? '').trim()
      const metric = String(formData.get('metric') ?? '').trim() || null
      const startDate = String(formData.get('start_date') ?? '').trim()
      const endDate = String(formData.get('end_date') ?? '').trim() || null
      if (!company || !roleTitle || !bullet || !startDate) {
        return { error: 'Empresa, cargo, conquista e data de início são obrigatórios.', addedAt: _prevState.addedAt }
      }
      inserted = await insertAchievements(db, userId, positioning, [{ company, roleTitle, startDate, endDate, bullet, metric }])
    } else if (validTable === 'skills') {
      const name = String(formData.get('name') ?? '').trim()
      const category = String(formData.get('category') ?? '').trim()
      if (!name || !category) {
        return { error: 'Nome e categoria são obrigatórios.', addedAt: _prevState.addedAt }
      }
      inserted = await insertSkills(db, userId, positioning, [{ name, category }])
    } else if (validTable === 'education') {
      const institution = String(formData.get('institution') ?? '').trim()
      const degree = String(formData.get('degree') ?? '').trim()
      const inProgress = formData.get('in_progress') === 'on'
      const completedOn = inProgress ? null : (String(formData.get('completed_on') ?? '').trim() || null)
      if (!institution || !degree) {
        return { error: 'Instituição e curso são obrigatórios.', addedAt: _prevState.addedAt }
      }
      inserted = await insertEducation(db, userId, positioning, [{ institution, degree, completedOn, inProgress }])
    } else {
      const name = String(formData.get('name') ?? '').trim()
      const issuer = String(formData.get('issuer') ?? '').trim() || null
      const issuedOn = String(formData.get('issued_on') ?? '').trim() || null
      if (!name) {
        return { error: 'Nome da certificação é obrigatório.', addedAt: _prevState.addedAt }
      }
      inserted = await insertCertifications(db, userId, positioning, [{ name, issuer, issuedOn }])
    }

    if (inserted === 0) {
      return { error: 'Esse item já existe no seu banco (dados idênticos a um já cadastrado).', addedAt: _prevState.addedAt }
    }
  } catch (error) {
    console.error('addProfileItemAction: falha ao adicionar item:', error)
    return { error: 'Erro ao adicionar. Tente novamente.', addedAt: _prevState.addedAt }
  }

  revalidatePath('/perfil')
  return { error: null, addedAt: Date.now() }
}
```

Notas de implementação:
- Usa `if/else if` em vez de `switch` porque `validTable` já foi estreitado por `assertValidTable`
  pra um union de 4 strings literais — o TypeScript narrowing funciona igual, e evita a necessidade
  de um `case` vazio/`default` pro branch de certifications (o `else` final já cobre, já que são só
  4 valores possíveis).
- `insertAchievements`/`insertSkills`/`insertEducation`/`insertCertifications` já existem em
  `src/lib/repository.ts` (feature de dedup implementada mais cedo) e retornam `Promise<number>` —
  quantas linhas foram REALMENTE inseridas (a constraint única do banco ignora silenciosamente uma
  duplicata exata). `inserted === 0` é como esta action detecta "já existe" sem precisar de nenhuma
  query extra de checagem.

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/actions/profile-items.ts
git commit -m "feat(cv-tailor): adiciona addProfileItemAction"
```

---

### Task 4: `profile-item-list.tsx` — suporte a campo `date`/`checkbox` no editar

**Files:**
- Modify: `cv-tailor/src/app/perfil/profile-item-list.tsx`

- [ ] **Step 1: Ampliar `ItemField` e a renderização do formulário de editar**

Localizar:

```ts
export interface ItemField {
  name: string
  label: string
  value: string
  multiline?: boolean
}
```

Trocar por:

```ts
export interface ItemField {
  name: string
  label: string
  value: string
  multiline?: boolean
  inputType?: 'text' | 'date' | 'checkbox'
}
```

Localizar, dentro de `ProfileItemRow`, o bloco do formulário de editar:

```tsx
        {item.fields.map((field) => (
          <div className="field" key={field.name}>
            <label htmlFor={`${item.id}-${field.name}`}>{field.label}</label>
            {field.multiline ? (
              <textarea id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} rows={3} />
            ) : (
              <input id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} />
            )}
          </div>
        ))}
```

Trocar por:

```tsx
        {item.fields.map((field) => (
          <div className="field" key={field.name}>
            {field.inputType === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input name={field.name} type="checkbox" value="on" defaultChecked={field.value === 'true'} />
                {field.label}
              </label>
            ) : (
              <>
                <label htmlFor={`${item.id}-${field.name}`}>{field.label}</label>
                {field.multiline ? (
                  <textarea id={`${item.id}-${field.name}`} name={field.name} defaultValue={field.value} rows={3} />
                ) : (
                  <input
                    id={`${item.id}-${field.name}`}
                    name={field.name}
                    type={field.inputType === 'date' ? 'date' : 'text'}
                    defaultValue={field.value}
                  />
                )}
              </>
            )}
          </div>
        ))}
```

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/perfil/profile-item-list.tsx
git commit -m "feat(cv-tailor): formulario de editar suporta campo date e checkbox"
```

---

### Task 5: `AddProfileItemForm` (componente novo)

**Files:**
- Create: `cv-tailor/src/app/perfil/add-profile-item-form.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useActionState, useEffect, useState } from 'react'
import { addProfileItemAction, type AddProfileItemState } from '@/app/actions/profile-items'
import type { ProfileItemTable } from '@/lib/repository'

const POSITIONING_OPTIONS = ['TPM', 'AI Product', 'Web3'] as const

const initialAddState: AddProfileItemState = { error: null, addedAt: 0 }

export function AddProfileItemForm({ table }: { table: ProfileItemTable }) {
  const [adding, setAdding] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [state, formAction, pending] = useActionState(addProfileItemAction.bind(null, table), initialAddState)

  useEffect(() => {
    if (state.addedAt > 0) {
      setAdding(false)
      setFormKey((k) => k + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.addedAt])

  if (!adding) {
    return (
      <button type="button" onClick={() => setAdding(true)} className="btn btn-secondary" style={{ marginBottom: 'var(--space-3)' }}>
        + Adicionar
      </button>
    )
  }

  return (
    <form key={formKey} action={formAction} className="card" style={{ marginBottom: 'var(--space-3)' }}>
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}

      {table === 'achievements' && (
        <>
          <div className="field">
            <label htmlFor="add-company">Empresa</label>
            <input id="add-company" name="company" required />
          </div>
          <div className="field">
            <label htmlFor="add-role_title">Cargo</label>
            <input id="add-role_title" name="role_title" required />
          </div>
          <div className="field">
            <label htmlFor="add-bullet">Conquista</label>
            <textarea id="add-bullet" name="bullet" rows={3} required />
          </div>
          <div className="field">
            <label htmlFor="add-metric">Métrica (opcional)</label>
            <input id="add-metric" name="metric" />
          </div>
          <div className="field">
            <label htmlFor="add-start_date">Data de início</label>
            <input id="add-start_date" name="start_date" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="add-end_date">Data de fim (opcional)</label>
            <input id="add-end_date" name="end_date" type="date" />
          </div>
        </>
      )}

      {table === 'skills' && (
        <>
          <div className="field">
            <label htmlFor="add-name">Skill</label>
            <input id="add-name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="add-category">Categoria</label>
            <input id="add-category" name="category" required />
          </div>
        </>
      )}

      {table === 'education' && (
        <>
          <div className="field">
            <label htmlFor="add-institution">Instituição</label>
            <input id="add-institution" name="institution" required />
          </div>
          <div className="field">
            <label htmlFor="add-degree">Curso</label>
            <input id="add-degree" name="degree" required />
          </div>
          <div className="field">
            <label htmlFor="add-completed_on">Data de conclusão (opcional)</label>
            <input id="add-completed_on" name="completed_on" type="date" />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input name="in_progress" type="checkbox" value="on" /> Em andamento
            </label>
          </div>
        </>
      )}

      {table === 'certifications' && (
        <>
          <div className="field">
            <label htmlFor="add-name">Certificação</label>
            <input id="add-name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="add-issuer">Emissor (opcional)</label>
            <input id="add-issuer" name="issuer" />
          </div>
          <div className="field">
            <label htmlFor="add-issued_on">Data de emissão (opcional)</label>
            <input id="add-issued_on" name="issued_on" type="date" />
          </div>
        </>
      )}

      <div className="field">
        <span className="hint">Tags de posicionamento (opcional)</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {POSITIONING_OPTIONS.map((tag) => (
            <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" name="positioning" value={tag} /> {tag}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Salvando…' : 'Adicionar'}</button>
        <button type="button" onClick={() => setAdding(false)} className="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  )
}
```

Notas de implementação:
- `key={formKey}` força o React a desmontar/remontar o `<form>` inteiro depois de um sucesso — como
  todos os inputs são não-controlados (`defaultValue`, sem `value`+`onChange`), isso é o jeito mais
  simples de limpar o formulário sem precisar de um `ref` por campo.
- Os campos exigidos (`required`) fazem o próprio navegador bloquear o submit antes de chegar no
  servidor — a validação de "campo obrigatório" que a Server Action também faz (Task 3) é a segunda
  camada, pro caso de alguém desabilitar JS/validação do navegador.

- [ ] **Step 2: Rodar `tsc --noEmit`**

Run: `cd cv-tailor && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add cv-tailor/src/app/perfil/add-profile-item-form.tsx
git commit -m "feat(cv-tailor): adiciona AddProfileItemForm"
```

---

### Task 6: `perfil/page.tsx` — campos novos + botão de adicionar por seção

**Files:**
- Modify: `cv-tailor/src/app/perfil/page.tsx`

- [ ] **Step 1: Importar o componente novo**

No topo do arquivo, localizar:

```ts
import { ProfileItemList, type ProfileItem } from './profile-item-list'
```

Adicionar logo abaixo:

```ts
import { AddProfileItemForm } from './add-profile-item-form'
```

- [ ] **Step 2: Ampliar os `fields` de cada tipo com os campos de data novos**

Localizar:

```ts
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
```

Trocar por:

```ts
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
```

Localizar:

```ts
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
```

Trocar por:

```ts
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
```

Localizar:

```ts
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
```

Trocar por:

```ts
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
```

- [ ] **Step 3: Adicionar o botão de adicionar acima de cada lista**

Localizar:

```tsx
      <h2>Conquistas</h2>
      <ProfileItemList table="achievements" items={achievementItems} />

      <h2>Formação</h2>
      <ProfileItemList table="education" items={educationItems} />

      <h2>Skills</h2>
      <ProfileItemList table="skills" items={skillItems} />

      <h2>Certificações</h2>
      <ProfileItemList table="certifications" items={certificationItems} />
```

Trocar por:

```tsx
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
```

- [ ] **Step 4: Rodar `tsc --noEmit` e `npm run build`**

Run: `cd cv-tailor && npx tsc --noEmit && npm run build`
Expected: sem erros, build completo

- [ ] **Step 5: Commit**

```bash
git add cv-tailor/src/app/perfil/page.tsx
git commit -m "feat(cv-tailor): wire AddProfileItemForm e campos de data na pagina de perfil"
```

---

### Task 7: Verificação manual contra o Supabase real

**Esta task NÃO é executada por um subagent** — precisa de navegador logado, feita pela sessão
controladora depois que as Tasks 1-6 estiverem implementadas e revisadas.

- [ ] **Step 1: Adicionar uma conquista nova**

No Perfil, clicar "+ Adicionar" em Conquistas, preencher empresa/cargo/conquista/data de início,
deixar data de fim e métrica em branco, salvar. Confirmar que aparece na lista.

- [ ] **Step 2: Tentar adicionar a mesma conquista de novo (mesmos dados)**

Confirmar que mostra "Esse item já existe no seu banco" em vez de duplicar (testa a integração com
a constraint única da feature de dedup).

- [ ] **Step 3: Editar uma conquista existente pra preencher a data de fim**

Abrir "Editar" numa conquista qualquer, preencher "Data de fim", salvar. Confirmar que salva sem
erro (testa o `optionalDate`/`null` explícito).

- [ ] **Step 4: Editar uma formação e marcar "Em andamento"**

Confirmar que salva com `in_progress = true`, e que a coluna `completed_on` fica `null` no banco
mesmo se antes tinha uma data preenchida (conferir via SQL Editor do Supabase se necessário).

- [ ] **Step 5: Adicionar uma certificação sem marcar nenhuma tag de positioning**

Confirmar que salva com `positioning = {}` (array vazio), sem erro.

- [ ] **Step 6: Adicionar uma skill nova e conferir que ela aparece deduplicada corretamente**

Adicionar uma skill com nome igual a uma já existente mas com capitalização/espaçamento diferente
(ex: "  Python  " quando já existe "Python") — confirmar que é rejeitada como duplicata (a
normalização do banco, da feature de dedup, ignora maiúsculas/espaços).

---

## Fora de escopo (confirmado na spec)

- Editar positioning de um item já existente
- Validação de formato de data além do `type="date"` nativo do navegador
- Adicionar vários itens de uma vez (bulk-add)
