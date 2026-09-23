import type Anthropic from '@anthropic-ai/sdk'
import { parseModelCvResponse, type GeneratedCv, type ModelCvResponse } from './generation-schema'
import { PERSONAL_PROJECT_COMPANY, type Achievement, type Education, type MasterDataBank } from './types'
import { findUnsupportedNumbers } from './number-provenance'
import {
  groupRoles,
  isSameRealJob,
  normalizeCompany,
  selectSpokenLanguages,
  sortRoleGroupsByRecency,
  splitCurrentAndEarlier,
  type RoleEntry,
  type RoleGroup,
} from './cv-render-shared'

export type CvLanguage = 'pt' | 'en'

// A CV is not a portfolio: a long tail of side repositories buries the real
// jobs. Matches the cap the prompt asks for in rule 6.2, and enforces it if
// the model returns more.
const MAX_PERSONAL_PROJECTS = 3

const LANGUAGE_LABELS: Record<CvLanguage, string> = {
  pt: 'português',
  en: 'inglês (English)',
}

export function buildGenerationPrompt(masterData: MasterDataBank, jobDescription: string, language: CvLanguage): string {
  const languageLabel = LANGUAGE_LABELS[language]
  // The period is shown to the model so it can reason about recency and about
  // which rows are the same job — it is NOT what ends up in the document. The
  // rendered dates are always copied from the master data row in
  // assembleGeneratedCv, never read back from the model's answer.
  const achievementLines = masterData.achievements
    .map((a) => `- [id:${a.id}] [${a.positioning.join('/')}] ${a.role_title} @ ${a.company} (${a.start_date} ate ${a.end_date ?? 'hoje'}): ${a.bullet}`)
    .join('\n')
  const skillLines = masterData.skills.map((s) => `- [${s.positioning.join('/')}] ${s.name}`).join('\n')

  return `Voce e um especialista em recrutamento tecnico e ATS. Gere um curriculo customizado pra vaga abaixo usando SOMENTE as conquistas e skills reais listadas no banco de dados. NUNCA invente conquista, metrica ou skill que nao esteja literalmente listada abaixo.

IDIOMA OBRIGATORIO: escreva TODO o conteudo (headline, summary, cover letter, bullets das conquistas, keywords, perguntas de entrevista e seus rationale) em ${languageLabel}, mesmo que o texto original do banco de dados esteja em outro idioma. Traduza mantendo os fatos e numeros EXATOS — nunca mude um numero, percentual ou metrica ao traduzir.

BANCO DE DADOS REAL:
Conquistas:
${achievementLines}

Skills:
${skillLines}

VAGA:
${jobDescription}

Regras obrigatorias:
1. Primeiro avalie honestamente: as conquistas e skills reais listadas acima cobrem os requisitos
   TECNICOS centrais da vaga (nao so requisitos genericos de gestao/comunicacao)? Se sim, defina
   "sufficientMatch": true e "matchWarning": null. Se NAO houver cobertura real dos requisitos
   tecnicos centrais da vaga, defina "sufficientMatch": false e explique o motivo em
   "matchWarning" (ex: "banco de dados nao tem nenhuma conquista real em Rust/Solidity/Soroban,
   exigidos pela vaga").
2. **"summary", "headline" e "coverLetter" sao parte de documentos finais que podem ser enviados a
   um recrutador de verdade — NUNCA escreva ali um aviso, ressalva ou julgamento sobre a vaga nao
   combinar com o perfil.** Esse tipo de avaliacao vai APENAS em "matchWarning". Se
   "sufficientMatch" for false, ainda assim preencha "summary"/"headline"/"coverLetter"/
   "selectedAchievements" normalmente com o que houver de mais proximo (serao descartados pelo
   sistema antes de chegar em qualquer documento).
3. O campo "headline" deve espelhar o titulo exato do cargo da vaga (traduzido pro idioma pedido se
   o titulo da vaga estiver em outro idioma).
4. Cada item de "selectedAchievements" deve ter "achievementId" com o ID EXATO (o texto depois de
   "id:" acima) de uma das conquistas listadas no banco de dados — NUNCA invente um ID que nao esteja
   na lista. O campo "bullet" e a versao traduzida/reescrita desse achievement no idioma pedido,
   mantendo os fatos e numeros exatos — pode reescrever a frase naturalmente no idioma, mas nao pode
   mudar o que aconteceu de verdade.
5. "keywords" deve listar os termos tecnicos exatos que aparecem na vaga e que tambem aparecem no
   banco de dados, no idioma pedido.
6. Se nao houver conquista real o suficiente pra essa vaga, retorne o que houver de mais proximo —
   nunca invente uma nova.
6.1. HISTORICO COMPLETO: selecione pelo menos 1 conquista de CADA empresa real listada no banco
   (todas, exceto as de "${PERSONAL_PROJECT_COMPANY}"), inclusive as empresas antigas e as pouco
   relacionadas com a vaga. Um curriculo que mostra so o emprego atual parece uma carreira de um
   emprego so e e descartado por recrutador. As conquistas das empresas antigas serao renderizadas
   de forma condensada (1 linha por cargo), entao escolha pra cada uma a conquista mais forte —
   de preferencia a que tem numero/metrica.
6.2. Conquistas com empresa "${PERSONAL_PROJECT_COMPANY}" sao repositorios open source, NAO empregos.
   Selecione no maximo 3, e so as que forem tecnicamente relevantes pra essa vaga especifica.
6.3. O banco e bilingue: o MESMO cargo pode aparecer duas vezes (mesma empresa, mesmo periodo) com o
   titulo em portugues numa linha e em ingles na outra. Quando isso acontecer, prefira selecionar as
   conquistas da linha cujo titulo ja esta em ${languageLabel} — o sistema junta as duas numa entrada
   so e usa o titulo da primeira que voce selecionar.
7. Gere tambem "interviewQuestions": 5 perguntas provaveis de entrevista pra essa vaga especifica,
   cada uma com "rationale" explicando por que essa pergunta e provavel pra essa vaga, ambos no
   idioma pedido.
8. Gere tambem "coverLetter": uma carta de apresentacao curta (200 a 350 palavras) pra essa vaga
   especifica, baseada SOMENTE nas conquistas reais do banco de dados (as mesmas usadas em
   "selectedAchievements", nunca invente uma nova so pra carta). Estrutura: comece com uma saudacao
   generica ("Prezados(as)," ou equivalente no idioma pedido — nunca invente o nome de uma pessoa
   ou empresa que nao apareca na vaga), conecte 2 a 3 conquistas reais especificas aos requisitos
   centrais da vaga em prosa corrida (nao lista de bullets), termine com um fechamento generico
   ("Atenciosamente," ou equivalente) SEM assinatura — nome e contato sao adicionados depois pelo
   sistema, nunca escreva o nome do candidato na carta.

Responda APENAS com um JSON no formato exato:
{"sufficientMatch": true, "matchWarning": null, "headline": "...", "summary": "...", "coverLetter": "...", "selectedAchievements": [{"achievementId": "...", "bullet": "..."}], "keywords": ["..."], "interviewQuestions": [{"question": "...", "rationale": "..."}]}`
}

// In-progress education first (still current, most relevant), then completed
// entries newest-first; entries without a completedOn (shouldn't normally
// happen outside in-progress) sort last within their group.
function sortEducation(education: Education[]): Education[] {
  return [...education].sort((a, b) => {
    if (a.in_progress !== b.in_progress) return a.in_progress ? -1 : 1
    if (!a.completed_on) return 1
    if (!b.completed_on) return -1
    return b.completed_on.localeCompare(a.completed_on)
  })
}

// The structured achievements have two guards (id exists, metric digits
// survive translation) that make assembleGeneratedCv THROW on a suspected
// fabrication. coverLetter is free prose referencing the same real
// achievements but had none of that — a hallucinated number there would
// silently reach a real recruiter with the same reputational risk as a bad
// CV. Reuse the same provenance idea: every number in the letter must be a
// real number from the already-verified bullets/metrics it is allowed to draw
// from (not a byte-for-byte match — the letter paraphrases freely, only the
// numbers are checked). See number-provenance.ts for how "same number" is
// decided across translation and reformatting.
function assertCoverLetterNumbersAreReal(coverLetter: string, realAchievements: { bullet: string; metric: string | null }[]): void {
  const trustedText = realAchievements.map((a) => `${a.bullet} ${a.metric ?? ''}`).join(' ')
  const unsupported = findUnsupportedNumbers(coverLetter, trustedText, { onlyMarked: true })
  if (unsupported.length > 0) {
    throw new Error(`Numero na cover letter nao encontrado nas conquistas reais selecionadas (possivel alucinacao): ${unsupported.join(', ')}.`)
  }
}

function toRoleEntry(achievement: Achievement, bullet: string): RoleEntry {
  return {
    company: achievement.company,
    roleTitle: achievement.role_title,
    startDate: achievement.start_date,
    endDate: achievement.end_date,
    bullet,
  }
}

// Every other place in this module decides employer identity through
// normalizeCompany; a raw `!==` here would let a row edited by hand into
// 'projeto pessoal' or 'Projeto Pessoal ' slip past both filters and be
// rendered as a job with no end date — the exact bug the split exists to fix.
function isPersonalProject(company: string): boolean {
  return normalizeCompany(company) === normalizeCompany(PERSONAL_PROJECT_COMPANY)
}

// A condensed one-liner should carry a number when the job has one, which is
// what makes it worth a line at all.
function strongestBullet(bullets: string[]): string {
  return bullets.find((bullet) => /\d/.test(bullet)) ?? bullets[0]
}

// Career coverage is guaranteed here, in code, not by the prompt. Rule 6.1
// asks the model to pick something from every employer, but a model that
// ignores it must not be able to silently delete half of a career from the
// document — the previous behavior, where a job-relevance ranking made every
// pre-2014 employer disappear and the CV read as a one-job career. Any real
// employer missing from the model's selection is rebuilt straight from the
// master data.
function buildMasterJobGroups(achievements: Achievement[]): RoleGroup[] {
  return groupRoles(
    achievements
      .filter((achievement) => !isPersonalProject(achievement.company))
      .map((achievement) => toRoleEntry(achievement, achievement.bullet)),
  )
}

export function assembleGeneratedCv(masterData: MasterDataBank, model: ModelCvResponse, language: CvLanguage): GeneratedCv {
  const seenIds = new Set<string>()
  const selectedRoles: RoleEntry[] = []
  const personalProjects: GeneratedCv['personalProjects'] = []
  const realSelected: { bullet: string; metric: string | null }[] = []

  for (const selected of model.selectedAchievements) {
    // A model quirk (not a fabrication signal) can select the same real
    // achievement twice — drop the repeat instead of rendering the same
    // bullet twice in the final document.
    if (seenIds.has(selected.achievementId)) {
      // Not a fabrication signal (the id already proved real), but repeated
      // selection can mean the model is short on distinct real matches for
      // this vaga — worth a trace even though there's nothing to throw on.
      console.warn(`assembleGeneratedCv: achievementId "${selected.achievementId}" selecionado mais de uma vez, ignorando repeticao.`)
      continue
    }
    seenIds.add(selected.achievementId)

    const real = masterData.achievements.find((a) => a.id === selected.achievementId)
    if (!real) {
      throw new Error(`Conquista nao encontrada no banco mestre (possivel alucinacao): id "${selected.achievementId}" nao existe.`)
    }

    // Provenance-by-id proves the achievement is real, but the translated
    // bullet's WORDING is still fully trusted to the model — nothing else
    // checks that a number/percentage survived translation unchanged. Since
    // `metric` already stores the achievement's key number separately,
    // cross-check those numbers survive into the translated bullet (tolerant
    // of reformatting like "30%" -> "30 percent" or "US$200 mil" ->
    // "$200,000", but catching an altered number like "50%").
    // Two directions, and both matter:
    //
    //   metric -> bullet  catches a real number being dropped or altered in
    //                     translation ("5%" becoming "50%").
    //   bullet -> source  catches a number being INVENTED. Only the first
    //                     direction existed, so a bullet could carry
    //                     "99.9% uptime across 450 stores" with neither
    //                     figure anywhere in the master data and pass — and
    //                     an achievement with no `metric` at all was not
    //                     checked in any way.
    //
    // Unlike the cover letter, this one checks every number rather than only
    // the metric-marked ones: a CV bullet is a translation of one specific
    // master bullet, so a number that is not in the source has no business
    // being there, whereas a cover letter is prose that legitimately says
    // "since 2014" or "10 years".
    const invented = findUnsupportedNumbers(selected.bullet, `${real.bullet} ${real.metric ?? ''}`)
    if (invented.length > 0) {
      throw new Error(`Numero inventado no bullet gerado (possivel alucinacao): conquista real "${real.bullet}" nao contem ${invented.join(', ')}.`)
    }

    if (real.metric) {
      const missing = findUnsupportedNumbers(real.metric, selected.bullet)
      if (missing.length > 0) {
        throw new Error(`Numero/metrica alterado na traducao (possivel alucinacao): conquista "${real.bullet}" tem metrica real "${real.metric}", mas o bullet gerado nao contem ${missing.join(', ')}.`)
      }
    }

    // An imported GitHub repository is real master data (it feeds skill
    // matching) but it is not a job: it carries company "Projeto Pessoal" and
    // no end date, so leaving it in the experience list would render it as a
    // current position alongside the real ones.
    if (isPersonalProject(real.company)) {
      personalProjects.push({ name: real.role_title, summary: selected.bullet })
    } else {
      selectedRoles.push(toRoleEntry(real, selected.bullet))
    }
    realSelected.push({ bullet: real.bullet, metric: real.metric })
  }

  assertCoverLetterNumbersAreReal(model.coverLetter, realSelected)

  // Only what the model actually chose can become the detailed section. A
  // group rebuilt by the coverage guarantee holds every raw bullet that
  // employer has, in whatever language the master data stores them — letting
  // one of those reach `current` (which it would, if it happened to be the
  // open-ended row) dumps the whole untranslated bank into the CV's most
  // prominent section. Coverage exists to add a one-line mention, never to
  // take over Work Experience.
  const selectedGroups = groupRoles(selectedRoles)
  const masterGroups = buildMasterJobGroups(masterData.achievements)

  // The period printed must describe the JOB, not whichever row the model
  // happened to cite. The bank is bilingual and the two rows of one job were
  // imported separately, so they can disagree on the end date — taking it
  // from the selected row alone made the same job print "2004 — 2008" on the
  // Portuguese CV and "2004 — 2009" on the English one. The start date is
  // equal by construction (it is part of the group's identity); only the end
  // needs to come from the full master group.
  for (const group of selectedGroups) {
    const master = masterGroups.find((masterGroup) => isSameRealJob(masterGroup, group))
    if (master) group.endDate = master.endDate
  }

  const uncovered = masterGroups.filter((masterGroup) => !selectedGroups.some((group) => isSameRealJob(group, masterGroup)))
  const selected = splitCurrentAndEarlier(selectedGroups)

  let current = selected.current
  let earlier = sortRoleGroupsByRecency([...selected.earlier, ...uncovered])

  // The model selected nothing usable (or only personal projects). Rather
  // than render an empty Work Experience heading, promote the most recent job
  // — but condensed to its single strongest bullet, not expanded.
  if (current.length === 0 && earlier.length > 0) {
    current = [{ ...earlier[0], bullets: [strongestBullet(earlier[0].bullets)] }]
    earlier = earlier.slice(1)
  }

  return {
    sufficientMatch: model.sufficientMatch,
    matchWarning: model.matchWarning,
    language,
    headline: model.headline,
    summary: model.summary,
    coverLetter: model.coverLetter,
    // Flattened back to one entry per bullet (the shape the templates already
    // consume); they regroup it identically, since every entry of a group now
    // carries that group's single company/roleTitle/period.
    selectedAchievements: current.flatMap((group) => group.bullets.map((bullet) => ({
      company: group.company,
      roleTitle: group.roleTitle,
      startDate: group.startDate,
      endDate: group.endDate,
      bullet,
    }))),
    earlierExperience: earlier.map((group) => ({
      company: group.company,
      roleTitle: group.roleTitle,
      startDate: group.startDate,
      endDate: group.endDate,
      summary: strongestBullet(group.bullets),
    })),
    personalProjects: personalProjects.slice(0, MAX_PERSONAL_PROJECTS),
    education: sortEducation(masterData.education).map((e) => ({
      institution: e.institution,
      degree: e.degree,
      completedOn: e.completed_on,
      inProgress: e.in_progress,
    })),
    keywords: model.keywords,
    languages: selectSpokenLanguages(masterData.skills, language),
    interviewQuestions: model.interviewQuestions,
  }
}

async function callOnce(client: Anthropic, masterData: MasterDataBank, jobDescription: string, language: CvLanguage): Promise<GeneratedCv> {
  const prompt = buildGenerationPrompt(masterData, jobDescription, language)
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    // claude-sonnet-5 uses extended thinking by default, which consumes part of
    // max_tokens before the model starts writing its answer (confirmed against
    // the real API — see the identical fix in scripts/import-cv.ts / import-cv.ts).
    // Raised from 8000 when rule 6.1 (one achievement per real employer) made
    // the answer longer: confirmed against the real API, 8000 truncated the
    // JSON mid-string on a 44-achievement bank, which surfaced as a baffling
    // JSON.parse error rather than as "the answer was cut off".
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  // Truncation leaves syntactically broken JSON. Say so plainly instead of
  // letting JSON.parse report an arbitrary character as the problem.
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Resposta da Claude foi truncada por max_tokens — o JSON veio incompleto. Aumente max_tokens ou reduza o banco mestre enviado no prompt.')
  }
  const model = parseModelCvResponse(textBlock.text)
  return assembleGeneratedCv(masterData, model, language)
}

export async function generateTailoredCv(client: Anthropic, masterData: MasterDataBank, jobDescription: string, language: CvLanguage): Promise<GeneratedCv> {
  try {
    return await callOnce(client, masterData, jobDescription, language)
  } catch {
    return await callOnce(client, masterData, jobDescription, language)
  }
}
