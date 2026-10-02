import { strict as assert } from 'node:assert'
import { createShot } from '../src/defaults'
import { parseFirstFrameText } from '../src/firstFrame'
import { composePrompt } from '../src/prompt'
import { analyzeTimingRange, parseTimingSegments, reconcileTimingSegments, resolveTimingSegments } from '../src/timing'
import type { GlobalConfig } from '../src/types'

const config = {
  prompt: {
    activeProfileId: 'test',
    profiles: [{ id: 'test', basePrefix: '', baseSuffix: '', sceneRolePrefix: '', sceneRoleSuffix: '', shotPrefix: '' }],
  },
} as GlobalConfig
const shot = createShot()
shot.firstFrameMode = true
shot.text = '（（李四开了\n特别响亮的\n一枪））\n第一行内容\n第二行内容'
const parsed = parseFirstFrameText(shot.text)
assert.equal(parsed.content, '李四开了\n特别响亮的\n一枪')
assert.equal(parsed.timingText.length, shot.text.length)
assert.deepEqual(parseTimingSegments(shot.text, ['李四'], true).map((segment) => segment.sourceText), ['第一行内容', '第二行内容'])
const analysis = analyzeTimingRange(shot.text, ['李四'], [], 0, shot.text.length, true)
assert.equal(analysis.totalCharacters, 10)
assert.equal(analysis.totalSeconds, 4)
assert.equal(composePrompt(config, shot, undefined, analysis.totalSeconds).split('三、分镜详情\n')[1],
  '00-01秒（景别只能使用远景）\n李四开了\n特别响亮的\n一枪\n\n01-4秒（景别不限）\n第一行内容\n第二行内容')

// Dialogue inside the first-frame block must not create a timing segment.
const dialogueText = '（（李四：别动！\n开枪））\n李四：你好。'
const remainingDialogue = '李四：你好。'
assert.deepEqual(analyzeTimingRange(dialogueText, ['李四'], [], 0, dialogueText.length, true),
  analyzeTimingRange(remainingDialogue, ['李四'], []))
const segments = resolveTimingSegments(dialogueText, ['李四'], [], true)
assert.equal(segments.length, 1)
assert.equal(segments[0].kind, 'dialogue')
assert.equal(dialogueText.slice(segments[0].start, segments[0].end), '你好。')
const saved = reconcileTimingSegments(dialogueText, ['李四'], [], true)
assert.equal(saved[0].kind, 'dialogue')
if (saved[0].kind === 'dialogue') saved[0].speechRate = 'slow'
assert.equal(resolveTimingSegments(dialogueText, ['李四'], saved, true)[0].config.id, saved[0].id)
assert.equal(analyzeTimingRange(dialogueText, ['李四'], saved, 0, dialogueText.length, true).dialogueArticulationSeconds, 0.4)

// Inline blocks stay outside all highlighted timing ranges.
const inlineText = '李四：你好（（开枪））再见。'
const inline = parseTimingSegments(inlineText, ['李四'], true)
assert.deepEqual(inline.map((segment) => inlineText.slice(segment.start, segment.end)), ['你好', '再见。'])
assert(inline.every((segment) => segment.kind === 'dialogue'))

// Missing, empty and incomplete blocks retain the placeholder.
for (const text of ['普通内容', '（（未闭合', '（（ \n ））\n普通内容']) {
  shot.text = text
  assert(composePrompt(config, shot, undefined, 8).includes('00-01秒（景别只能使用远景）\n@\n\n01-8秒'))
}
shot.text = '（（未闭合'
assert.equal(parseFirstFrameText(shot.text).detailText, shot.text)
assert.equal(analyzeTimingRange(shot.text, [], [], 0, shot.text.length, true).totalSeconds, 2)

// Turning first-frame mode off keeps the original text and timing behavior.
shot.text = dialogueText
shot.firstFrameMode = false
assert(composePrompt(config, shot).endsWith(dialogueText))
assert(!composePrompt(config, shot).includes('00-01秒'))
assert(parseTimingSegments(dialogueText, ['李四']).length > segments.length)
assert.equal(analyzeTimingRange(dialogueText, ['李四'], [], 0, dialogueText.length, true).totalSeconds,
  analyzeTimingRange(dialogueText, ['李四'], [], dialogueText.indexOf(remainingDialogue), dialogueText.length, true).totalSeconds)
console.log('First-frame prompt and timing checks passed.')
