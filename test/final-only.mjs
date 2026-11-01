// 「模型输出(无思考)」行为的回归测试：node test/final-only.mjs
// 造一个两回合的合成会话日志，断言每回合只留下最后一条带文字的助手消息，
// 以及选项解析、默认值与对话框开关的一致性。
import { buildTranscript } from '../src/transcript.js'
import { renderMarkdown } from '../src/markdown.js'
import { defaultOptions, parseCommandInput, optionsFromQuery, optionsToQuery } from '../src/options.js'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failed += 1
}

const imgInNarration = { attachmentId: 'att-narration', name: '过程截图.png', width: 8, height: 8, bytes: 64 }
const imgInResult = { attachmentId: 'att-result', name: '结果截图.png', width: 8, height: 8, bytes: 64 }

const assistant = (seq, time, turn, step, id, blocks) => ({
  seq, time, type: 'assistant/message', surfaceOp: 'append',
  data: { turn, step, message: { id, source: { provider: 'p', model: 'm' }, content: blocks } },
})
const toolCall = (seq, time, turn, step, callId, name) => ({
  seq, time, type: 'tool/call', surfaceOp: 'append', data: { callId, name, arguments: '{"q":"x"}', turn, step },
})
const toolResult = (seq, time, callId, blocks) => ({
  seq, time, type: 'tool/result', surfaceOp: 'append',
  data: { message: { source: { callId }, content: [{ type: 'tool-result', content: blocks }] } },
})

const events = [
  { seq: 1, time: 1000, type: 'session/title', data: { title: '测试会话' } },
  { seq: 2, time: 1100, type: 'turn/start', data: { turn: 1 } },
  { seq: 3, time: 1200, type: 'user/message', surfaceOp: 'append', data: { id: 'u1', source: { kind: 'user' }, content: [{ type: 'text', text: '第一个问题' }] } },
  // 回合 1：播报（带一张只在播报里出现的图）→ 工具 → 最终回复
  assistant(4, 1300, 1, 1, 'a1', [{ type: 'text', text: '我来查一下这个插件的用法。' }, { type: 'image', attachment: imgInNarration }]),
  toolCall(5, 1400, 1, 1, 'c1', 'web_search'),
  toolResult(6, 1500, 'c1', [{ type: 'text', text: '搜索结果' }]),
  assistant(7, 1600, 1, 2, 'a2', [{ type: 'text', text: '找到了：这是最终回复一。' }]),
  { seq: 8, time: 1700, type: 'turn/end', data: { reason: { kind: 'completed' } } },
  { seq: 9, time: 1800, type: 'turn/start', data: { turn: 2 } },
  { seq: 10, time: 1900, type: 'user/message', surfaceOp: 'append', data: { id: 'u2', source: { kind: 'user' }, content: [{ type: 'text', text: '第二个问题' }] } },
  // 回合 2：播报 → 工具 → 播报 → 工具（结果带图）→ 最终回复
  assistant(11, 2000, 2, 1, 'a3', [{ type: 'text', text: '再看一下相关代码。' }]),
  toolCall(12, 2100, 2, 1, 'c2', 'read'),
  toolResult(13, 2200, 'c2', [{ type: 'text', text: '代码内容' }]),
  assistant(14, 2300, 2, 2, 'a4', [{ type: 'text', text: '确认了，还差一步。' }]),
  toolCall(15, 2400, 2, 2, 'c3', 'edit'),
  toolResult(15, 2500, 'c3', [{ type: 'text', text: '编辑完成' }, { type: 'image', attachment: imgInResult }]),
  assistant(17, 2600, 2, 3, 'a5', [{ type: 'text', text: '这是最终回复二。' }]),
  { seq: 18, time: 2700, type: 'turn/end', data: { reason: { kind: 'completed' } } },
]

// ---- 1. 默认选项：modelOutput 关、finalOnly 开（隐含包含模型输出） ----
const defaults = defaultOptions()
check('默认：modelOutput=false', defaults.modelOutput === false)
check('默认：finalOnly=true', defaults.finalOnly === true)
const on = { ...defaults, thinking: false, tools: true, timestamps: false, usage: false }
const tOn = buildTranscript({ id: 'session-x', createdAt: 1000, cwd: 'C:/tmp' }, events, on)
const assistantsOn = tOn.entries.filter((e) => e.kind === 'assistant')
check('finalOnly 隐含模型输出：助手条目只剩每回合 1 条（共 2 条）', assistantsOn.length === 2)
check('回合 1 保留的是最终回复', assistantsOn[0]?.parts.some((p) => p.type === 'text' && p.text.includes('最终回复一')))
check('回合 2 保留的是最终回复', assistantsOn[1]?.parts.some((p) => p.type === 'text' && p.text.includes('最终回复二')))
check('播报文字已全部消失', tOn.entries.every((e) => !(e.parts ?? []).some((p) => p.type === 'text' && /查一下|确认了/.test(p.text))))
check('计数 assistantMessages 同步为 2', tOn.meta.counts.assistantMessages === 2)
check('只在播报里出现的图被从计数里剔除', tOn.meta.counts.images === 1)
check('工具调用条目未受影响', tOn.entries.filter((e) => e.kind === 'tool').length === 3)

const mdOn = renderMarkdown(tOn, {})
check('Markdown 不含播报文字', !mdOn.includes('我来查一下') && !mdOn.includes('确认了'))
check('Markdown 含最终回复', mdOn.includes('最终回复一') && mdOn.includes('最终回复二'))
check('Markdown 头部声明模型输出(无思考)', mdOn.includes('仅每轮最终回复（无思考）'))

// ---- 2. 关闭过滤（modelOutput 显式开）：回到原始行为 ----
const off = { ...on, finalOnly: false, modelOutput: true }
const tOff = buildTranscript({ id: 'session-x', createdAt: 1000, cwd: 'C:/tmp' }, events, off)
check('关闭过滤：5 条助手条目全保留', tOff.entries.filter((e) => e.kind === 'assistant').length === 5)
check('关闭过滤：图片计数回到 2', tOff.meta.counts.images === 2)
check('关闭过滤：Markdown 含播报文字', renderMarkdown(tOff, {}).includes('我来查一下'))

// ---- 2b. 两个开关都关：模型输出整体不出现 ----
const none = { ...on, finalOnly: false }
const tNone = buildTranscript({ id: 'session-x', createdAt: 1000, cwd: 'C:/tmp' }, events, none)
check('modelOutput 与 finalOnly 都关：无助手条目', tNone.entries.filter((e) => e.kind === 'assistant').length === 0)

// ---- 3. 没有文字回合不受影响：只有 reasoning 的回合保持原样 ----
const reasoningTurn = [
  { seq: 1, time: 1000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 1100, type: 'user/message', surfaceOp: 'append', data: { id: 'u1', source: { kind: 'user' }, content: [{ type: 'text', text: '问' }] } },
  assistant(3, 1200, 1, 1, 'a1', [{ type: 'reasoning', text: '只思考没说话' }]),
  { seq: 4, time: 1300, type: 'turn/end', data: { reason: { kind: 'interrupted' } } },
]
const tReason = buildTranscript(undefined, reasoningTurn, { ...on, thinking: true })
check('无文字回合：reasoning 条目保留', tReason.entries.filter((e) => e.kind === 'assistant').length === 1)

// ---- 4. 选项解析：命令行与 query 参数 ----
check('默认命令行解析 finalOnly=true', parseCommandInput('').options.finalOnly === true)
check('--no-final 关闭', parseCommandInput('--no-final').options.finalOnly === false)
check('--final 显式开启', parseCommandInput('--final').options.finalOnly === true)
check('query finalOnly=0 关闭', optionsFromQuery(new URLSearchParams('finalOnly=0')).options.finalOnly === false)
check('query 缺省时保持默认开启', optionsFromQuery(new URLSearchParams('')).options.finalOnly === true)
const roundTrip = [...optionsToQuery({ ...defaultOptions(), finalOnly: false }, null)]
check('非默认值会写进 query（finalOnly=false）', roundTrip.some(([k, v]) => k === 'finalOnly' && v === 'false'))

// ---- 5. client.js 的 defaultForm 与 defaultOptions 一致，开关顺序与命名正确 ----
const clientSrc = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
check('对话框 defaultForm 含 finalOnly: true', /function defaultForm\(\)[\s\S]*?finalOnly: true,/.test(clientSrc))
check('对话框 defaultForm 含 modelOutput: false', /function defaultForm\(\)[\s\S]*?modelOutput: false,/.test(clientSrc))
check('开关改名为「模型输出(无思考)」', clientSrc.includes("'content.finalOnly': '模型输出(无思考)'"))
const inputRow = clientSrc.indexOf("labelKey: 'content.userInput'")
const finalRow = clientSrc.indexOf("labelKey: 'content.finalOnly'")
const outputRow = clientSrc.indexOf("labelKey: 'content.modelOutput'")
check('finalOnly 开关位于第 2 位（用户输入之后、模型输出之前）', inputRow !== -1 && inputRow < finalRow && finalRow < outputRow)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
