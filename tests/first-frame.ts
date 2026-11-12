import { strict as assert } from 'node:assert'
import { createShot } from '../src/defaults'
import { parseFirstFrameText } from '../src/firstFrame'
import { composePrompt, composeShotDetail } from '../src/prompt'
import { analyzeTimingRange, parseTimingSegments, reconcileTimingSegments, resolveTimingSegments } from '../src/timing'
import type { GlobalConfig } from '../src/types'

const config = {
  prompt: {
    activeProfileId: 'test',
    referenceMode: 'detailed',
    profiles: [{ id: 'test', basePrefix: '', baseSuffix: '', sceneRolePrefix: '', sceneRoleSuffix: '', shotPrefix: '' }],
  },
} as GlobalConfig
const shot = createShot()
shot.firstFrameMode = true
shot.text = '【【李四开了\n特别响亮的\n一枪】】\n第一行内容\n第二行内容'
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
const dialogueText = '【【李四：别动！\n开枪】】\n李四：你好。'
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
const inlineText = '李四：你好【【开枪】】再见。'
const inline = parseTimingSegments(inlineText, ['李四'], true)
assert.deepEqual(inline.map((segment) => inlineText.slice(segment.start, segment.end)), ['你好', '再见。'])
assert(inline.every((segment) => segment.kind === 'dialogue'))

// Missing, empty and incomplete blocks retain the placeholder.
for (const text of ['普通内容', '【【未闭合', '【【 \n 】】\n普通内容']) {
  shot.text = text
  assert(composePrompt(config, shot, undefined, 8).includes('00-01秒（景别只能使用远景）\n@\n\n01-8秒'))
}
shot.text = '【【未闭合'
assert.equal(parseFirstFrameText(shot.text).detailText, shot.text)
assert.equal(analyzeTimingRange(shot.text, [], [], 0, shot.text.length, true).totalSeconds, 2)

// Disabling first-frame mode treats the same block as a comment.
shot.text = dialogueText
shot.firstFrameMode = false
assert(composePrompt(config, shot).endsWith(remainingDialogue))
assert(!composePrompt(config, shot).includes('00-01秒'))
assert.equal(parseTimingSegments(dialogueText, ['李四']).length, segments.length)
assert.equal(analyzeTimingRange(dialogueText, ['李四'], [], 0, dialogueText.length, true).totalSeconds,
  analyzeTimingRange(dialogueText, ['李四'], [], dialogueText.indexOf(remainingDialogue), dialogueText.length, true).totalSeconds)

// Multiple, inline and multiline comments are excluded without changing source offsets.
const comments = '【【首帧画面】】\n李四：你【【注释：别计时！】】好。\n【【多行\r\n注释】】\n抬手【【动作说明】】转身'
shot.text = comments
assert.equal(parseFirstFrameText(comments).ranges.length, 4)
assert.equal(parseFirstFrameText(comments).timingText.length, comments.length)
for (const enabled of [false, true]) {
  shot.firstFrameMode = enabled
  const detail = composeShotDetail(config, shot)
  assert(!detail.includes('注释') && !detail.includes('动作说明') && !detail.includes('【【'))
  assert.equal(detail.includes('首帧画面'), enabled)
  assert.equal(shot.text, comments)
  const timing = analyzeTimingRange(comments, ['李四'], [], 0, comments.length, enabled)
  assert.equal(timing.totalCharacters, 8)
  assert.equal(timing.dialogueCharacters, 2)
  assert.equal(timing.asyncActionSeconds, 2)
  assert.equal(analyzeTimingRange(comments, ['李四'], [], comments.indexOf('注释：'), comments.indexOf('】】', comments.indexOf('注释：')), enabled).totalSeconds, 0)
}
shot.firstFrameMode = false
shot.text = '（（旧括号内容））\n【单层括号】\n【【未闭合'
assert(composeShotDetail(config, shot).includes('（（旧括号内容））'))
assert(composeShotDetail(config, shot).includes('【单层括号】'))
assert(composeShotDetail(config, shot).includes('【【未闭合'))
console.log('First-frame prompt and timing checks passed.')
