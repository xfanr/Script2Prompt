import { createDialogueReplacementRule } from './defaults'
import type { DialogueReplacementRule } from './types'

export function normalizeDialogueReplacementRules(rules: unknown): DialogueReplacementRule[] {
  if (!Array.isArray(rules)) {
    return []
  }

  const byForbidden = new Map<string, DialogueReplacementRule>()

  rules
    .filter((rule): rule is Partial<DialogueReplacementRule> => Boolean(rule) && typeof rule === 'object')
    .forEach((rule) => {
      const forbidden = typeof rule.forbidden === 'string' ? rule.forbidden.trim() : ''

      if (!forbidden) {
        return
      }

      const normalized = createDialogueReplacementRule(
        forbidden,
        typeof rule.replacement === 'string' ? rule.replacement : '',
      )
      normalized.id = typeof rule.id === 'string' && rule.id.trim() ? rule.id : normalized.id
      byForbidden.set(forbidden, normalized)
    })

  return Array.from(byForbidden.values())
}

export function applyDialogueReplacementRules(text: string, rules: DialogueReplacementRule[]) {
  return rules
    .filter((rule) => rule.forbidden)
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => Array.from(b.rule.forbidden).length - Array.from(a.rule.forbidden).length || a.index - b.index)
    .reduce((result, { rule }) => result.split(rule.forbidden).join(rule.replacement), text)
}

export function extractDialogueText(script: string, rules: DialogueReplacementRule[] = []) {
  const extracted = script
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const chineseColon = line.indexOf('：')
      const asciiColon = line.indexOf(':')
      const colonIndexes = [chineseColon, asciiColon].filter((index) => index >= 0)

      if (!colonIndexes.length) {
        return ''
      }

      return removeRoundBracketContent(line.slice(Math.min(...colonIndexes) + 1))
    })
    .filter(Boolean)
    .join('\n')

  return normalizeDialogueLines(applyDialogueReplacementRules(extracted, rules))
}

function removeRoundBracketContent(text: string) {
  let result = text
  let previous = ''

  while (result !== previous) {
    previous = result
    result = result.replace(/[（(][^（）()]*[）)]/g, '')
  }

  return result
}

function normalizeDialogueLines(text: string) {
  return text
    .replace(/[\p{P}\p{S}]+/gu, '\n')
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}
