import type Anthropic from '@anthropic-ai/sdk'
import { parseGeneratedCv, type GeneratedCv } from './generation-schema'
import type { MasterDataBank } from './types'

export function buildGenerationPrompt(masterData: MasterDataBank, jobDescription: string): string {
  const achievementLines = masterData.achievements
    .map((a) => `- [${a.positioning.join('/')}] ${a.role_title} @ ${a.company}: ${a.bullet}`)
    .join('\n')
  const skillLines = masterData.skills.map((s) => `- [${s.positioning.join('/')}] ${s.name}`).join('\n')

  return `Voce e um especialista em recrutamento tecnico e ATS. Gere um curriculo customizado pra vaga abaixo usando SOMENTE as conquistas e skills reais listadas no banco de dados. NUNCA invente conquista, metrica ou skill que nao esteja literalmente listada abaixo.

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
3. O campo "headline" deve espelhar o titulo exato do cargo da vaga.
4. Cada item de "selectedAchievements" deve copiar o campo "bullet" LITERALMENTE de uma das conquistas listadas acima, sem parafrasear.
5. "keywords" deve listar os termos tecnicos exatos que aparecem na vaga e que tambem aparecem no banco de dados.
6. Se nao houver conquista real o suficiente pra essa vaga, retorne o que houver de mais proximo — nunca invente uma nova.
7. Gere tambem "interviewQuestions": 5 perguntas provaveis de entrevista pra essa vaga especifica, cada uma com "rationale" explicando por que essa pergunta e provavel pra essa vaga.

Responda APENAS com um JSON no formato exato:
{"sufficientMatch": true, "matchWarning": null, "headline": "...", "summary": "...", "selectedAchievements": [{"company": "...", "roleTitle": "...", "bullet": "..."}], "keywords": ["..."], "interviewQuestions": [{"question": "...", "rationale": "..."}]}`
}

export function assertAchievementsAreReal(masterData: MasterDataBank, generated: Pick<GeneratedCv, 'selectedAchievements'>): void {
  const realBullets = new Set(masterData.achievements.map((a) => a.bullet))
  for (const selected of generated.selectedAchievements) {
    if (!realBullets.has(selected.bullet)) {
      throw new Error(`Conquista nao encontrada no banco mestre (possivel alucinacao): "${selected.bullet}"`)
    }
  }
}

async function callOnce(client: Anthropic, masterData: MasterDataBank, jobDescription: string): Promise<GeneratedCv> {
  const prompt = buildGenerationPrompt(masterData, jobDescription)
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    // claude-sonnet-5 uses extended thinking by default, which consumes part of
    // max_tokens before the model starts writing its answer (confirmed against
    // the real API: a similarly-shaped extraction burned ~5.1k thinking tokens
    // — see the identical fix in scripts/import-cv.ts). 4096 was verified too
    // low against the live API: it either truncated the JSON mid-object
    // ("Unexpected end of JSON input") or left content[0] as a 'thinking'
    // block with the real answer never reached.
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error(`Claude nao retornou nenhum bloco de texto (stop_reason: ${response.stop_reason}). Blocos recebidos: ${response.content.map((b) => b.type).join(', ')}`)
  }
  const parsed = parseGeneratedCv(textBlock.text)
  assertAchievementsAreReal(masterData, parsed)
  return parsed
}

export async function generateTailoredCv(client: Anthropic, masterData: MasterDataBank, jobDescription: string): Promise<GeneratedCv> {
  try {
    return await callOnce(client, masterData, jobDescription)
  } catch {
    return await callOnce(client, masterData, jobDescription)
  }
}
