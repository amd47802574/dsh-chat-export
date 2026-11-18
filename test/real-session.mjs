// 端到端验证：用真实会话日志跑 finalOnly 过滤。
// 用法：node test/real-session.mjs <session.v4.jsonl.zstd> [预览输出.md]
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeSessionArtifact } from '../src/zstd.js'
import { buildTranscript } from '../src/transcript.js'
import { renderMarkdown } from '../src/markdown.js'
import { defaultOptions } from '../src/options.js'

const artifact = process.argv[2]
if (artifact === undefined) {
  console.error('用法: node test/real-session.mjs <session.v4.jsonl.zstd> [预览输出.md]')
  console.error('会话日志通常位于 ~/.dsh/sessions/<工作区目录>/<会话>/session.v4.jsonl.zstd')
  process.exit(1)
}
const buffer = readFileSync(artifact)
const text = decodeSessionArtifact(buffer)
const lines = text.split('\n').filter((line) => line.trim() !== '')
const header = JSON.parse(lines[0])
const events = lines.slice(1).map((line) => JSON.parse(line))
console.log(`日志行数：${lines.length}（首行 header.createdAt=${header.createdAt}）`)
console.log(`事件类型分布：`, [...new Set(events.map((e) => e.type))].length, '种；assistant/message =', events.filter((e) => e.type === 'assistant/message').length)

const on = { ...defaultOptions() }
console.log('当前默认开启的选项：', Object.entries(on).filter(([, v]) => v === true).map(([k]) => k).join(', '))
const tOn = buildTranscript(header, events, on)
const off = { ...on, finalOnly: false }
const tOff = buildTranscript(header, events, off)

const aOn = tOn.entries.filter((e) => e.kind === 'assistant').length
const aOff = tOff.entries.filter((e) => e.kind === 'assistant').length
console.log(`\n关闭过滤：助手条目 ${aOff} 条`)
console.log(`开启过滤：助手条目 ${aOn} 条（隐藏 ${aOff - aOn} 条过程播报）`)
console.log(`图片计数：开 ${tOn.meta.counts.images} 张 / 关 ${tOff.meta.counts.images} 张；工具调用：${tOn.meta.counts.toolCalls} 次；回合：${tOn.meta.counts.turns} 轮`)

// 每个回合抽一条被隐藏的播报和被保留的最终回复，证明留的是对的那条
for (const turn of [...new Set(tOff.entries.filter((e) => e.kind === 'assistant').map((e) => e.turn))].slice(0, 3)) {
  const all = tOff.entries.filter((e) => e.kind === 'assistant' && e.turn === turn)
  const kept = tOn.entries.filter((e) => e.kind === 'assistant' && e.turn === turn)
  const keptText = kept.length > 0 ? kept[0].parts.find((p) => p.type === 'text')?.text.slice(0, 40) : '（无）'
  console.log(`\n回合 ${turn}：共 ${all.length} 条助手消息 → 保留 ${kept.length} 条`)
  console.log(`  保留：${keptText.replace(/\n/g, ' ')}`)
}

const md = renderMarkdown(tOn, {})
const out = process.argv[3] ?? 'final-only-preview.md'
writeFileSync(out, md, 'utf8')
console.log(`\n已写出过滤后的完整导出预览：${out}（${Math.round(md.length / 1024)} KB）`)
console.log(md.split('\n').slice(0, 14).join('\n'))
