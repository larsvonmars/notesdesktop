export interface ParsedAIResponse {
  type: 'structured' | 'text'
  summary?: string
  keyPoints?: string[]
  suggestedTasks?: string[]
  rawText?: string
}

export function parseAIResponse(content: string): ParsedAIResponse {
  const extractBalancedJSON = (str: string, startIdx: number): string | null => {
    if (str[startIdx] !== '{') return null
    let braceCount = 0
    let inString = false
    let escape = false
    for (let i = startIdx; i < str.length; i++) {
      const char = str[i]
      if (escape) { escape = false; continue }
      if (char === '\\' && inString) { escape = true; continue }
      if (char === '"' && !escape) { inString = !inString; continue }
      if (!inString) {
        if (char === '{') braceCount++
        else if (char === '}') {
          braceCount--
          if (braceCount === 0) return str.substring(startIdx, i + 1)
        }
      }
    }
    return null
  }

  const codeBlockMatch = content.match(/```(?:json)?\s*/)
  if (codeBlockMatch) {
    const startOfJson = content.indexOf('{', codeBlockMatch.index)
    if (startOfJson !== -1) {
      const jsonStr = extractBalancedJSON(content, startOfJson)
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr)
          if (parsed.summary || parsed.keyPoints || parsed.suggestedTasks) {
            return { type: 'structured', summary: parsed.summary, keyPoints: parsed.keyPoints, suggestedTasks: parsed.suggestedTasks }
          }
        } catch { /* continue */ }
      }
    }
  }

  const firstBrace = content.indexOf('{')
  if (firstBrace !== -1) {
    const jsonStr = extractBalancedJSON(content, firstBrace)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed.summary || parsed.keyPoints || parsed.suggestedTasks) {
          return { type: 'structured', summary: parsed.summary, keyPoints: parsed.keyPoints, suggestedTasks: parsed.suggestedTasks }
        }
      } catch { /* fall through */ }
    }
  }

  return { type: 'text', rawText: content }
}
