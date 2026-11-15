import { normalizeShotUnitNumber } from './shotNumber'
import type { Shot } from './types'

export function normalizeSplitScriptText(value: unknown, shots: Shot[]): string | null {
  if (typeof value === 'string') return value.replace(/^([ \t　]*)\+\+\+(?=[ \t　]*(?:#|\r?$))/gm, '$1---')
  const lines: string[] = []
  let previousUnit: number | null = null
  shots.forEach((shot) => {
    if (!shot.text.trim()) return
    const unit = normalizeShotUnitNumber(shot.unitNumber)
    if (previousUnit !== null && unit !== previousUnit) lines.push('===')
    lines.push(`---${shot.remark.trim() ? ` #${shot.remark}#` : ''}`, shot.text.trim())
    previousUnit = unit
  })
  return lines.length ? lines.join('\n') : null
}

export function organizeScriptText(text: string): string {
  const protectedRemarks: string[] = []
  const protectedDraft = text
    .replace(/\r\n/g, '\n')
    .replace(/:/g, '：')
    .replace(/[ \t　]*---[ \t　]*#([^#\r\n]*)#[ \t　]*/g, (_match, remark: string) => {
      const placeholder = `\n__SHOT_REMARK_${protectedRemarks.length}__\n`
      protectedRemarks.push(remark)
      return placeholder
    })

  return protectedDraft
    .replace(/[ \t　]*===[ \t　]*/g, '\n===\n')
    .replace(/[ \t　]*---[ \t　]*/g, '\n---\n')
    .replace(/[△▲][ \t　]*/g, '')
    .replace(/[\t　]+/g, '')
    .replace(/\.{3,}/g, '…')
    .replace(/[ \t　]+\n/g, '\n')
    .replace(/\n[ \t　]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .replace(/__SHOT_REMARK_(\d+)__/g, (_match, index: string) => {
      return `--- #${protectedRemarks[Number(index)]}#`
    })
}

export type BatchShotSegment = {
  text: string
  remark: string
  unitNumber: number
}

export function splitBatchShotText(value: string): BatchShotSegment[] {
  const segments: BatchShotSegment[] = []
  let unitNumber = 1

  value
    .replace(/\r\n/g, '\n')
    .split(/===/g)
    .forEach((unitText) => {
      const unitSegments: Omit<BatchShotSegment, 'unitNumber'>[] = []
      unitText.split(/---/g).forEach((item, index) => {
        let text = item
        let remark = ''

        if (index > 0) {
          const remarkMatch = text.match(/^[ \t　]*#([^#\r\n]*)#/)

          if (remarkMatch) {
            remark = remarkMatch[1].trim() ? remarkMatch[1] : ''
            text = text.slice(remarkMatch[0].length)
          }
        }

        text = text.trim()

        if (text) {
          unitSegments.push({
            text,
            remark,
          })
        }
      })

      if (!unitSegments.length) {
        return
      }

      segments.push(...unitSegments.map((segment) => ({ ...segment, unitNumber })))
      unitNumber += 1
    })

  return segments
}
