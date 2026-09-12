// claude-sonnet-5 sometimes wraps a JSON answer in a ```json ... ``` fence even
// when explicitly told to respond with only the JSON. Strip it before parsing.
export function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return fenced ? fenced[1] : text
}
