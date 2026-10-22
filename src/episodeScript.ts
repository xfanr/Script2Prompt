import { normalizeShotUnitNumber } from './shotNumber'
import type { Shot } from './types'

export function normalizeSplitScriptText(value: unknown, shots: Shot[]): string | null {
  if (typeof value === 'string') return value
  const lines: string[] = []
  let previousUnit: number | null = null
  shots.forEach((shot) => {
    if (!shot.text.trim()) return
    const unit = normalizeShotUnitNumber(shot.unitNumber)
    if (previousUnit !== null && unit !== previousUnit) lines.push('===')
    const marker = shot.thirtySecondMode ? '+++' : '---'
    lines.push(`${marker}${shot.remark.trim() ? ` #${shot.remark}#` : ''}`, shot.text.trim())
    previousUnit = unit
  })
  return lines.length ? lines.join('\n') : null
}
