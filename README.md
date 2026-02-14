# AI Daily Digest Plus

> 从 Hacker News 顶级技术博客中，用 AI 筛选出每日必读的精选文章。

[![Skill Type](https://img.shields.io/badge/Type-OpenCode%20Skill-blue)](https://skills.anthropic.com)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black)](https://bun.sh)
[![Language](https://img.shields.io/badge/Language-TypeScript-blue)](https://www.typescriptlang.org/)

---

## 简介

AI Daily Digest Plus 是一个智能技术文章聚合器，它会：

1. 从 **90 个顶级技术博客** 抓取最新文章（精选自 Hacker News 社区推荐）
2. 使用 **AI 多维评分** 筛选出高质量内容（相关性、质量、时效性）
3. 生成**中英双语**的每日精选日报，包含：
   - 📝 每日技术趋势总结
   - 🏆 Top 3 深度解读
   - 📊 可视化数据分析
   - 🗂 六大分类文章列表

---

## 安装

### 作为 Claude Code Skill 安装

1. 克隆仓库到 Claude Code 技能目录：

```bash
# 进入 Claude Code 技能目录
cd ~/.claude/skills

# 克隆仓库
git clone https://github.com/duolabmeng6/ai-daily-digest-plus.git
```

2. 重启 Claude Code，技能会自动加载

3. 在对话中输入 `/digest` 即可使用

### 手动安装（无需 Claude Code）

1. 克隆仓库到本地：

```bash
git clone https://github.com/duolabmeng6/ai-daily-digest-plus.git
cd ai-daily-digest-plus
```

2. 创建 `config.json` 配置文件（参考下方配置说明）

3. 运行脚本：

```bash
bun scripts/digest.ts --hours 48 --top-n 15 --lang zh
```

---

## 快速开始

### 方式一：作为 Skill 使用（推荐）

在 Claude Code 对话中输入：

```
/digest
```

然后按提示选择参数：

| 参数 | 选项 | 默认值 |
|:-----|-----:|:------:|
| 时间范围 | 24h / 48h / 72h / 7天 | 48h |
| 精选数量 | 10 / 15 / 20 篇 | 15 篇 |
| 输出语言 | 中文 / English | 中文 |

### 方式二：命令行运行

```bash
bun run scripts/digest.ts --hours 48 --top-n 15 --lang zh --output ./digest.md
```

或使用 npx 自动安装 Bun：

```bash
npx -y bun scripts/digest.ts --hours 48 --top-n 15 --lang zh --output ./digest.md
```

---

## 配置

### API 配置

在项目根目录创建 `config.json`：

```json
{
  "apis": [
    {
      "base_url": "https://api.example.com/v1",
      "api_key": "your-api-key",
      "model": "gpt-4"
    }
  ],
  "timeout_seconds": 120,
  "extra_body": {},
  "extra_headers": {}
}
```

支持配置多个 API 端点，系统会自动进行故障转移。

> ⚠️ 注意：`config.json` 已加入 `.gitignore`，不会被提交到仓库

### RSS 源配置

RSS 源列表存储在 `config/rss-feeds.json`，包含 90 个精选博客。

完整列表参考：[Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/)

---

## 工作原理

### 五步处理流水线

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  RSS 抓取   │ →  │  时间过滤   │ →  │  AI 评分    │
│  90 个源    │    │  按时间窗口  │    │  多维打分    │
└─────────────┘    └─────────────┘    └─────────────┘
                                           ↓
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  趋势总结   │ ←  │  AI 摘要    │ ←  │  自动分类    │
│  宏观洞察   │    │  翻译+总结  │    │  6 大分类    │
└─────────────┘    └─────────────┘    └─────────────┘
```

| 步骤 | 说明 |
|:-----|:-----|
| **1. RSS 抓取** | 并发抓取 90 个源（10 路并发，15s 超时），兼容 RSS 2.0 和 Atom 格式 |
| **2. 时间过滤** | 按指定时间窗口筛选近期文章 |
| **3. AI 评分** | Gemini 从相关性、质量、时效性三个维度打分（1-10），同时完成分类和关键词提取 |
| **4. AI 摘要** | 为 Top N 文章生成结构化摘要（4-6 句）、中文标题翻译、推荐理由 |
| **5. 趋势总结** | AI 归纳当日技术圈 2-3 个宏观趋势 |

### 模块架构

```
ai-daily-digest/
├── config/
│   └── rss-feeds.json      # 90 个 RSS 源列表
├── scripts/
│   ├── types.ts            # 类型定义
│   ├── config.ts           # 配置常量
│   ├── utils.ts            # 工具函数
│   ├── logger.ts           # 日志输出
│   ├── rss-parser.ts       # RSS 解析器
│   ├── feed-fetcher.ts     # RSS 抓取器
│   ├── gemini-client.ts    # Gemini API 客户端
│   ├── ai-scorer.ts        # AI 评分器
│   ├── ai-summarizer.ts   # AI 摘要器
│   ├── reporter.ts         # 报告生成器
│   └── digest.ts          # 主入口
├── config.json            # API 配置（不提交）
├── .gitignore
├── README.md
└── SKILL.md
```

---

## 日报结构

生成的 Markdown 文件包含以下板块：

| 板块 | 内容 |
|:-----|:-----|
| **📝 今日看点** | 3-5 句话的宏观趋势总结 |
| **🏆 今日必读** | Top 3 深度展示：中英双语标题、摘要、推荐理由、关键词 |
| **📊 数据概览** | 统计表格 + Mermaid 饼图 + Mermaid 柱状图 + ASCII 图 + 话题标签云 |
| **🗂 分类文章** | 按 6 大分类分组，每篇含中文标题、来源、相对时间、评分、摘要、关键词 |

### 六大分类

| 分类 | 覆盖范围 |
|:-----|:---------|
| 🤖 **AI / ML** | AI、机器学习、LLM、深度学习 |
| 🔒 **安全** | 安全、隐私、漏洞、加密 |
| ⚙️ **工程** | 软件工程、架构、编程语言、系统设计 |
| 🛠 **工具 / 开源** | 开发工具、开源项目、新发布的库/框架 |
| 💡 **观点 / 杂谈** | 行业观点、个人思考、职业发展 |
| 📝 **其他** | 不属于以上分类的内容 |

---

## 核心特性

- ✅ **零依赖** — 纯 TypeScript 单文件，基于 Bun 运行时的原生 `fetch` 和内置 XML 解析
- ✅ **中英双语** — 所有标题自动翻译为中文，原文标题保留为链接文字
- ✅ **结构化摘要** — 4-6 句覆盖核心问题→关键论点→结论的完整概述
- ✅ **可视化统计** — Mermaid 图表 + ASCII 柱状图 + 标签云
- ✅ **智能分类** — AI 自动将文章归入 6 大类别
- ✅ **趋势洞察** — 归纳当天技术圈的宏观趋势
- ✅ **模块化架构** — 清晰的职责分离，易于维护和扩展

---

## 命令行参数

```bash
bun scripts/digest.ts [options]

Options:
  --hours <n>     时间范围（小时），默认 48
  --top-n <n>     精选文章数量，默认 15
  --lang <lang>   输出语言（zh/en），默认 zh
  --output <path> 输出文件路径，默认 ./digest-YYYYMMDD.md
  --test          测试模式（仅抓取 1 个源）
  --debug         调试模式（显示详细日志）
  --help          显示帮助信息

Examples:
  # 标准使用
  bun scripts/digest.ts --hours 24 --top-n 10 --lang zh

  # 测试模式
  bun scripts/digest.ts --test --debug

  # 自定义输出
  bun scripts/digest.ts --hours 72 --top-n 20 --output ./my-digest.md
```

---

## 环境要求

| 依赖 | 说明 |
|:-----|:-----|
| [Bun](https://bun.sh) | 运行时（通过 `npx -y bun` 自动安装） |
| OpenAI 兼容 API | 支持 OpenAI、Gemini 等兼容接口 |
| 网络连接 | 访问 RSS 源和 API |

---

## 信息源

90 个 RSS 源精选自 [Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/)，由 [Andrej Karpathy](https://x.com/karpathy) 推荐。

包括但不限于：

> Simon Willison · Paul Graham · Dan Abramov · Gwern · Krebs on Security · Antirez · John Gruber · Troy Hunt · Mitchell Hashimoto · Steve Blank · Eli Bendersky · Fabien Sanglard ...

完整列表见 `config/rss-feeds.json`。

---

## 故障排除

### Config file not found
需要在项目根目录创建 `config.json` 文件。

### Failed to fetch N feeds
部分 RSS 源可能暂时不可用，脚本会跳过失败的源并继续处理。

### No articles found in time range
尝试扩大时间范围（如从 24 小时改为 48 小时）。

---

## License

MIT
