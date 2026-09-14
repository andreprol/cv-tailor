import type Anthropic from '@anthropic-ai/sdk'
import { parseModelCvResponse, type GeneratedCv, type ModelCvResponse } from './generation-schema'
import type { MasterDataBank } from './types'

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

IDIOMA OBRIGATORIO: escreva TODO o conteudo (headline, summary, bullets das conquistas, keywords, perguntas de entrevista e seus rationale) em ${languageLabel}, mesmo que o texto original do banco de dados esteja em outro idioma. Traduza mantendo os fatos e numeros EXATOS — nunca mude um numero, percentual ou metrica ao traduzir.

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
2. **"summary" e "headline" sao parte do documento final que pode ser enviado a um recrutador de
   verdade — NUNCA escreva ali um aviso, ressalva ou julgamento sobre a vaga nao combinar com o
   perfil.** Esse tipo de avaliacao vai APENAS em "matchWarning". Se "sufficientMatch" for false,
   ainda assim preencha "summary"/"headline"/"selectedAchievements" normalmente com o que houver de
   mais proximo (serao descartados pelo sistema antes de chegar em qualquer documento).
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

Responda APENAS com um JSON no formato exato:
{"sufficientMatch": true, "matchWarning": null, "headline": "...", "summary": "...", "selectedAchievements": [{"achievementId": "...", "bullet": "..."}], "keywords": ["..."], "interviewQuestions": [{"question": "...", "rationale": "..."}]}`
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

export function assembleGeneratedCv(masterData: MasterDataBank, model: ModelCvResponse): GeneratedCv {
  const seenIds = new Set<string>()
  const selectedAchievements = []

  for (const selected of model.selectedAchievements) {
    // A model quirk (not a fabrication signal) can select the same real
    // achievement twice — drop the repeat instead of rendering the same
    // bullet twice in the final document.
    if (seenIds.has(selected.achievementId)) continue
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
      const missingDigits = extractDigits(real.metric).filter((digit) => !containsWholeNumber(selected.bullet, digit))
      if (missingDigits.length > 0) {
        throw new Error(`Numero/metrica alterado na traducao (possivel alucinacao): conquista "${real.bullet}" tem metrica real "${real.metric}", mas o bullet gerado nao contem ${missingDigits.join(', ')}.`)
      }
    }

    selectedAchievements.push({ company: real.company, roleTitle: real.role_title, bullet: selected.bullet })
  }

  return {
    sufficientMatch: model.sufficientMatch,
    matchWarning: model.matchWarning,
    headline: model.headline,
    summary: model.summary,
    selectedAchievements,
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
  return assembleGeneratedCv(masterData, model)
}

export async function generateTailoredCv(client: Anthropic, masterData: MasterDataBank, jobDescription: string, language: CvLanguage): Promise<GeneratedCv> {
  try {
    return await callOnce(client, masterData, jobDescription, language)
  } catch {
    return await callOnce(client, masterData, jobDescription, language)
  }
}
