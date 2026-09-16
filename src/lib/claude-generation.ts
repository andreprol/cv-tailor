import type Anthropic from '@anthropic-ai/sdk'
import { parseModelCvResponse, type GeneratedCv, type ModelCvResponse } from './generation-schema'
import type { Education, MasterDataBank } from './types'

export type CvLanguage = 'pt' | 'en'

const LANGUAGE_LABELS: Record<CvLanguage, string> = {
  pt: 'português',
  en: 'inglês (English)',
}

export function buildGenerationPrompt(masterData: MasterDataBank, jobDescription: string, language: CvLanguage): string {
  const languageLabel = LANGUAGE_LABELS[language]
  const achievementLines = masterData.achievements
    .map((a) => `- [id:${a.id}] [${a.positioning.join('/')}] ${a.role_title} @ ${a.company}: ${a.bullet}`)
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

// Removes a comma or space sitting between two digits (thousands grouping,
// e.g. "1,000" -> "1000"), so a faithful reformat during translation doesn't
// look like an altered number. Deliberately leaves periods alone — those are
// ambiguous between a decimal point ("2.5%") and end-of-sentence punctuation,
// and mishandling that would be worse than not normalizing periods at all.
function normalizeNumberGrouping(text: string): string {
  return text.replace(/(\d)[,\s](?=\d)/g, '$1')
}

function extractDigits(text: string): string[] {
  return text.match(/\d+/g) ?? []
}

// A plain substring check would let "5%" pass against a bullet containing
// "50%" (since "5" is literally a substring of "50") — exactly the kind of
// altered number this guard exists to catch. Require the number to appear as
// a whole token (not embedded inside a longer digit run) instead.
function containsWholeNumber(text: string, number: string): boolean {
  return new RegExp(`(?<!\\d)${number}(?!\\d)`).test(text)
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
// CV. Reuse the same digit-provenance idea: every whole-number token in the
// letter must appear as a whole number somewhere in the real, already-
// verified bullets/metrics it's allowed to draw from (not a byte-for-byte
// match — the letter paraphrases freely, only the numbers are checked).
function assertCoverLetterDigitsAreReal(coverLetter: string, realAchievements: { bullet: string; metric: string | null }[]): void {
  const trustedText = normalizeNumberGrouping(
    realAchievements.map((a) => `${a.bullet} ${a.metric ?? ''}`).join(' '),
  )
  const letterDigits = extractDigits(normalizeNumberGrouping(coverLetter))
  const missingDigits = letterDigits.filter((digit) => !containsWholeNumber(trustedText, digit))
  if (missingDigits.length > 0) {
    throw new Error(`Numero na cover letter nao encontrado nas conquistas reais selecionadas (possivel alucinacao): ${missingDigits.join(', ')}.`)
  }
}

export function assembleGeneratedCv(masterData: MasterDataBank, model: ModelCvResponse, language: CvLanguage): GeneratedCv {
  const seenIds = new Set<string>()
  const selectedAchievements = []
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
    // cross-check its digits actually appear in the translated bullet
    // (tolerant of reformatting like "30%" -> "30 percent", but catches an
    // altered number like "50%").
    if (real.metric) {
      const normalizedMetric = normalizeNumberGrouping(real.metric)
      const normalizedBullet = normalizeNumberGrouping(selected.bullet)
      const missingDigits = extractDigits(normalizedMetric).filter((digit) => !containsWholeNumber(normalizedBullet, digit))
      if (missingDigits.length > 0) {
        throw new Error(`Numero/metrica alterado na traducao (possivel alucinacao): conquista "${real.bullet}" tem metrica real "${real.metric}", mas o bullet gerado nao contem ${missingDigits.join(', ')}.`)
      }
    }

    selectedAchievements.push({ company: real.company, roleTitle: real.role_title, bullet: selected.bullet })
    realSelected.push({ bullet: real.bullet, metric: real.metric })
  }

  assertCoverLetterDigitsAreReal(model.coverLetter, realSelected)

  return {
    sufficientMatch: model.sufficientMatch,
    matchWarning: model.matchWarning,
    language,
    headline: model.headline,
    summary: model.summary,
    coverLetter: model.coverLetter,
    selectedAchievements,
    education: sortEducation(masterData.education).map((e) => ({
      institution: e.institution,
      degree: e.degree,
      completedOn: e.completed_on,
      inProgress: e.in_progress,
    })),
    keywords: model.keywords,
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
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
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
