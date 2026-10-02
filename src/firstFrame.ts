export function parseFirstFrameText(text: string) {
  const match = /（（([\s\S]*?)））/u.exec(text)
  if (!match) return { content: '@', detailText: text, timingText: text, range: null }

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  return {
    content: match[1].trim() || '@',
    detailText: before + after,
    timingText: before + match[0].replace(/[^\r\n]/g, ' ') + after,
    range: { start: match.index, end: match.index + match[0].length },
  }
}
