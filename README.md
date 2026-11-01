# dsh-chat-export（模型输出(无思考) 定制版）

基于 [DDDMUC/dsh-chat-export](https://github.com/DDDMUC/dsh-chat-export) v0.1.6（MIT）修改的 DeepSeek Harness 会话导出插件：把任意会话导出成可读的 Markdown / HTML / 纯文本 / ZIP 文字稿。

上游插件的完整介绍（设计思路、多帧 zstd 的坑、实现细节）见[原仓库 README](https://github.com/DDDMUC/dsh-chat-export)。本仓库只维护定制改动。

## 这个定制版改了什么

针对 agent 会话的阅读体验做了三处修改：

1. **新增「模型输出(无思考)」开关**（默认开启，位于内容开关区第 2 位）
   - 每个**回合**只保留**最后一条带文字的助手消息**（即最终回复）；工具调用前那些「我来查一下…」「再确认一下…」的过程播报全部不导出。
   - 开启时**自动包含模型输出**——即使「模型输出」开关是关的。所以默认组合就是：用户输入 + 每轮最终回复，一份干净的问答。
   - 命令行等价物：`--final` / `--no-final`。
   - 回合里没有文字的（被打断、只剩思考）保持原样，不会丢内容。
2. **新的默认值**：默认只开「用户输入」+「模型输出(无思考)」；思维链、系统提示词、工具调用与结果、注入内容、时间戳、用量统计全部默认关。
3. **头部统计按过滤后的实际内容重算**（助手条数、思考段数、图片数），并新增说明行 `模型输出 | 仅每轮最终回复（无思考）`，一眼可辨产物来自哪个版本。

用户消息一律**原文照搬**——包括你自己在消息里粘贴或 @ 引用展开的内容，插件不改一个字。

## 安装

```sh
dsh plugin --profile web add github:amd47802574/dsh-chat-export
```

桌面 App 也可以在插件管理里从 GitHub 安装。**装完重启 App**（宿主半代码要随进程加载；之后改浏览器半不用重启）。

> 已装上游原版的话，两者注册的是同一个插件 id 与 `/export-md` 命令，请先停用原版再装本版。

## 使用

- **会话头部按钮**：点「导出文字稿」→ 选格式/范围/内容开关 → 浏览器下载或保存到目录。
- **斜杠命令**：

```sh
/export-md                           # Markdown，默认选项（用户输入 + 每轮最终回复）
/export-md html                      # 自包含 HTML，可打印成 PDF
/export-md txt                       # 纯文本
/export-md zip --images=embed        # 打包 md + html + txt + 图片
/export-md --tools --thinking        # 完整过程：工具调用 + 思考块
/export-md --output --no-final       # 全部模型输出（含过程播报）
/export-md html --save=/path/to/dir  # 直接写进目录
```

参数与上游一致，仅新增 `--final` / `--no-final`，且 `--output`、`--thinking`、`--system` 的默认值改为关。全部参数见 `src/options.js` 的 `COMMAND_HINT` 或对话框。

## 测试

```sh
npm test        # 即 node test/final-only.mjs，27 项断言
```

覆盖：每回合只留最终回复、播报消失、计数重算、`finalOnly` 隐含模型输出、两开关全关时不输出模型内容、命令行与 query 解析、对话框默认值与开关顺序。

## 与上游的差异一览

| 项 | 上游 v0.1.6 | 本版 |
| --- | --- | --- |
| 过程播报 | 全部导出 | 默认隐藏，只留每轮最终回复 |
| 默认开启 | 用户输入、模型输出、思维链、系统提示词 | 用户输入、模型输出(无思考) |
| `finalOnly` 选项 | 无 | 有，且隐含包含模型输出 |
| 头部统计 | 原样 | 按过滤后内容重算 |

## License

MIT © 2026 DDDMUC（原作品）。本 fork 的修改同样以 MIT 发布。
