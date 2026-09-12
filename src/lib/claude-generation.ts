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
1. O campo "headline" deve espelhar o titulo exato do cargo da vaga.
2. Cada item de "selectedAchievements" deve copiar o campo "bullet" LITERALMENTE de uma das conquistas listadas acima, sem parafrasear.
3. "keywords" deve listar os termos tecnicos exatos que aparecem na vaga e que tambem aparecem no banco de dados.
4. Se nao houver conquista real o suficiente pra essa vaga, retorne o que houver de mais proximo — nunca invente uma nova.
5. Gere tambem "interviewQuestions": 5 perguntas provaveis de entrevista pra essa vaga especifica, cada uma com "rationale" explicando por que essa pergunta e provavel pra essa vaga.

Responda APENAS com um JSON no formato exato:
{"headline": "...", "summary": "...", "selectedAchievements": [{"company": "...", "roleTitle": "...", "bullet": "..."}], "keywords": ["..."], "interviewQuestions": [{"question": "...", "rationale": "..."}]}`
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
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  const text = block?.type === 'text' ? block.text : ''
  const parsed = parseGeneratedCv(text)
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
