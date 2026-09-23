// claude-sonnet-5 sometimes wraps a JSON answer in a ```json ... ``` fence even
// when explicitly told to respond with only the JSON. Strip it before parsing.
export function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  // A truncated response (max_tokens reached mid-answer) has the OPENING
  // fence but no closing one, so the match above fails and the raw text goes
  // to JSON.parse, which reports a baffling "Unexpected token '`'" instead of
  // the real problem. Strip a dangling opening fence too — the parse still
  // fails on the truncated JSON, but with an error that points at the actual
  // truncation.
  const unterminated = text.match(/^\s*```(?:json)?\s*([\s\S]*)$/)
  return unterminated ? unterminated[1] : text
}
