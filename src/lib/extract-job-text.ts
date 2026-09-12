export function extractTextFromHtml(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ')
  return withoutTags.replace(/\s+/g, ' ').trim()
}

const MIN_JOB_TEXT_LENGTH = 200

export async function fetchJobDescription(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!response.ok) return null
    const html = await response.text()
    const text = extractTextFromHtml(html)
    return text.length >= MIN_JOB_TEXT_LENGTH ? text : null
  } catch {
    return null
  }
}
