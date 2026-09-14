# Adicionar item manual no Perfil (conquista/skill/formação/certificação)

## Contexto

Hoje o Perfil só permite editar/apagar itens que já existem (vindos de upload de CV). Não existe
forma de criar um item do zero — se o usuário quer registrar uma conquista nova que nunca esteve em
nenhum CV, precisa fabricar um CV falso só pra subir. Esta feature fecha essa lacuna.

Decisões já tomadas com o André:
- Botão "+ Adicionar" **por seção** (Conquistas, Formação, Skills, Certificações), não um seletor de
  tipo único.
- Tags de positioning (TPM/AI Product/Web3) aparecem **só no formulário de adicionar** — o upload de
  CV já não coleta isso (removido a pedido do André na Fase 2: itens importados por upload não têm
  mais seleção de tag, só os itens da importação original mantêm a tag que já tinham), e o
  formulário de editar não muda nesse ponto.
- Aproveitando a mudança, o formulário de **editar** ganha os campos de data que faltavam:
  `start_date`/`end_date` em conquistas, `completed_on`/`in_progress` em formação, `issued_on` em
  certificações — hoje esses campos existem no banco mas não aparecem em nenhum formulário do Perfil.

## Arquitetura

### `src/lib/repository.ts` — `EDITABLE_FIELDS` (movido de `profile-items.ts` — ver nota abaixo)

Campos editáveis por tabela, ampliados:

```ts
const EDITABLE_FIELDS: Record<ProfileItemTable, string[]> = {
  achievements: ['company', 'role_title', 'bullet', 'metric', 'start_date', 'end_date'],
  education: ['institution', 'degree', 'completed_on', 'in_progress'],
  skills: ['name', 'category'],
  certifications: ['name', 'issuer', 'issued_on'],
}
```

(Nota: `EDITABLE_FIELDS` já vive em `src/app/actions/profile-items.ts`, não precisa mover — a
referência acima é só pra deixar claro o valor final; a mudança real é só nesse array.)

`updateProfileItem` (repository.ts) já aceita `fields: Record<string, string>` genérico e escreve
direto — não precisa mudar, só o allowlist em `profile-items.ts` cresce.

### Nova Server Action: `addProfileItemAction`

Em `src/app/actions/profile-items.ts`, ao lado de `deleteProfileItemAction`/`updateProfileItemAction`:

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
    switch (validTable) {
      case 'achievements': {
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
        break
      }
      case 'skills': {
        const name = String(formData.get('name') ?? '').trim()
        const category = String(formData.get('category') ?? '').trim()
        if (!name || !category) {
          return { error: 'Nome e categoria são obrigatórios.', addedAt: _prevState.addedAt }
        }
        inserted = await insertSkills(db, userId, positioning, [{ name, category }])
        break
      }
      case 'education': {
        const institution = String(formData.get('institution') ?? '').trim()
        const degree = String(formData.get('degree') ?? '').trim()
        const inProgress = formData.get('in_progress') === 'on'
        const completedOn = inProgress ? null : (String(formData.get('completed_on') ?? '').trim() || null)
        if (!institution || !degree) {
          return { error: 'Instituição e curso são obrigatórios.', addedAt: _prevState.addedAt }
        }
        inserted = await insertEducation(db, userId, positioning, [{ institution, degree, completedOn, inProgress }])
        break
      }
      case 'certifications': {
        const name = String(formData.get('name') ?? '').trim()
        const issuer = String(formData.get('issuer') ?? '').trim() || null
        const issuedOn = String(formData.get('issued_on') ?? '').trim() || null
        if (!name) {
          return { error: 'Nome da certificação é obrigatório.', addedAt: _prevState.addedAt }
        }
        inserted = await insertCertifications(db, userId, positioning, [{ name, issuer, issuedOn }])
        break
      }
    }
    if (inserted === 0) {
      return { error: 'Esse item já existe no seu banco (nome/dados idênticos a um já cadastrado).', addedAt: _prevState.addedAt }
    }
  } catch (error) {
    console.error('addProfileItemAction: falha ao adicionar item:', error)
    return { error: 'Erro ao adicionar. Tente novamente.', addedAt: _prevState.addedAt }
  }

  revalidatePath('/perfil')
  return { error: null, addedAt: Date.now() }
}
```

Reaproveita `insertAchievements`/`insertSkills`/`insertEducation`/`insertCertifications` (já
`upsert` com `ignoreDuplicates`, da feature de dedup implementada hoje) passando um array de 1 item
— se `inserted === 0`, a constraint única do banco rejeitou por já existir um item idêntico, e a
action transforma isso numa mensagem amigável em vez de fingir sucesso silenciosamente.

`VALID_POSITIONING` já existe em `upload-cv.ts` — duplicar a constante em `profile-items.ts` (mesmo
valor `['TPM', 'AI Product', 'Web3']`), já que não há um módulo compartilhado só pra isso hoje e criar
um por causa de 2 usos seria over-engineering.

### UI — `src/app/perfil/profile-item-list.tsx`

**Formulário de editar** (`ProfileItemRow`, já existe): os `ItemField[]` de cada tipo passam a
incluir os campos de data novos (com `type: 'date'` ou `type: 'checkbox'` — o tipo `ItemField` ganha
um campo opcional `inputType?: 'text' | 'date' | 'checkbox'`, default `'text'` se omitido, pra não
quebrar os campos existentes). Quando `in_progress`/"Atual" (end_date) está marcado, o campo de data
correspondente é desabilitado no formulário e forçado a `null` no submit (checkbox controla, texto
don't matter).

**Formulário de adicionar** (`AddProfileItemForm`, novo componente no mesmo arquivo ou em
`add-profile-item-form.tsx` — decisão de implementação, ver plano): estado local `adding` (boolean,
mesmo padrão two-step de mostrar/esconder que `confirmingDelete` já usa), campos específicos por
tabela (definidos via um `fields` prop passado de `perfil/page.tsx`, mesmo padrão de `ItemField[]`
já usado pro editar), mais o bloco de checkboxes de positioning (`TPM`, `AI Product`, `Web3`, todos
opcionais, sem seleção múltipla forçada). Usa `useActionState(addProfileItemAction.bind(null, table), initialState)`.

### `src/app/perfil/page.tsx`

Passa os campos novos pra `fields: ItemField[]` de cada tipo (achievement ganha `start_date`/
`end_date` com `inputType: 'date'`; education ganha `completed_on`/`in_progress`; certification ganha
`issued_on`), e renderiza `<AddProfileItemForm table="..." />` acima de cada `<ProfileItemList
table="..." items={...} />`.

## Fora de escopo

- Editar positioning de um item já existente (só aparece no criar, como decidido)
- Validação de formato de data além do `type="date"` nativo do navegador
- Bulk-add (adicionar vários itens de uma vez) — é sempre um item por vez, mesmo padrão do editar

## Testes

Mesma limitação já documentada (sem mock de Supabase) — `addProfileItemAction` não ganha teste
automatizado. Verificação manual:
1. Adicionar uma conquista nova com todos os campos — confirma que aparece na lista.
2. Tentar adicionar uma conquista **idêntica** a uma já existente (mesma empresa/cargo/bullet) —
   confirma que mostra "Esse item já existe" em vez de duplicar.
3. Editar uma conquista existente pra preencher a data de fim ("Atual" desmarcado) — confirma que
   salva.
4. Marcar "Em andamento" numa formação e confirmar que a data de conclusão desaparece/é ignorada.
5. Adicionar uma certificação sem marcar nenhuma tag de positioning — confirma que salva com array
   vazio, sem erro.
