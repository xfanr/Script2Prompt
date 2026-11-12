export function parseFirstFrameText(text: string) {
  const matches = Array.from(text.matchAll(/【【([\s\S]*?)】】/gu))
  const ranges = matches.map((match) => ({ start: match.index, end: match.index + match[0].length }))
  return {
    content: matches[0]?.[1].trim() || '@',
    detailText: text.replace(/【【([\s\S]*?)】】/gu, ''),
    timingText: text.replace(/【【([\s\S]*?)】】/gu, (match) => match.replace(/[^\r\n]/g, ' ')),
    range: ranges[0] ?? null,
    ranges,
  }
}
