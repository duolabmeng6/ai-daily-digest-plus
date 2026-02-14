---
name: ai-daily-digest
description: "从 Karpathy 推荐的 90 个顶级技术博客抓取 RSS，使用 AI 评分筛选文章，生成每日摘要日报。包含中文标题、分类分组、趋势亮点、可视化统计（Mermaid 图表和标签云）。当用户提到 'daily digest'、'RSS digest'、'blog digest'、'AI blogs'、'tech news summary' 或请求运行 /科技日报 命令时触发。"
---

# AI Daily Digest

从 Karpathy 推荐的 90 个热门技术博客中抓取最新文章，通过 AI 评分筛选，生成每日精选摘要。

## 命令

### `/科技日报`

运行每日摘要生成器。

**使用方式**: 输入 `/科技日报`，Agent 通过交互式引导收集参数后执行。

---

## 脚本目录

**重要**: 所有脚本位于此 skill 的 `scripts/` 子目录。

**Agent 执行说明**:
1. 确定此 SKILL.md 文件的目录路径为 `SKILL_DIR`
2. 脚本路径 = `${SKILL_DIR}/scripts/<script-name>.ts`

| 脚本 | 用途 |
|------|------|
| `scripts/digest.ts` | 主脚本 - RSS 抓取、AI 评分、生成摘要 |

**触发命令**: `/科技日报`

---

## 初始化配置

### 首次使用：创建 API 配置文件

Agent 在首次运行时**必须引导用户创建 `config.json`：

```
question({
  questions: [
    {
      header: "API Base URL",
      question: "请输入 OpenAI 兼容的 API Base URL：\n\n示例：\n• https://api.openai.com/v1\n• https://api.gemini-cloud.com/v1beta\n• https://your-proxy.com/v1",
      type: "input",
      placeholder: "https://api.openai.com/v1"
    },
    {
      header: "API Key",
      question: "请输入 API Key：",
      type: "input"
    },
    {
      header: "Model 名称",
      question: "请输入模型名称：\n\n示例：\n• gpt-4\n• gpt-4o\n• gemini-2.0-flash-exp",
      type: "input",
      placeholder: "gpt-4"
    }
  ]
})
```

然后创建 `config.json` 文件：

```bash
cat > config.json << 'EOF'
{
  "apis": [
    {
      "base_url": "${base_url}",
      "api_key": "${api_key}",
      "model": "${model}"
    }
  ],
  "timeout_seconds": 120,
  "extra_body": {},
  "extra_headers": {}
}
EOF
```

输出确认：

```
✅ 配置文件已创建：config.json
```

---

## 配置持久化

配置文件路径: `~/.ai-daily-digest/config.json`

Agent 在执行前**必须检查**此文件是否存在：
1. 如果存在，读取并解析 JSON
2. 询问用户是否使用已保存配置
3. 执行完成后保存当前配置到此文件

**配置文件结构**:
```json
{
  "timeRange": 48,
  "topN": 15,
  "language": "zh",
  "lastUsed": "2026-02-14T12:00:00Z"
}
```

---

## 交互流程

### Step 0: 检查已保存配置

```bash
cat ~/.ai-daily-digest/config.json 2>/dev/null || echo "NO_CONFIG"
```

如果配置存在，询问是否复用：

```
question({
  questions: [{
    header: "使用已保存配置",
    question: "检测到上次使用的配置：\n\n• 时间范围: ${config.timeRange}小时\n• 精选数量: ${config.topN} 篇\n• 输出语言: ${config.language === 'zh' ? '中文' : 'English'}\n\n请选择操作：",
    options: [
      { label: "使用上次配置直接运行 (推荐)", description: "使用所有已保存的参数立即开始" },
      { label: "重新配置", description: "从头开始配置所有参数" }
    ]
  }]
})
```

### Step 1: 收集参数

使用 `question()` 一次性收集：

```
question({
  questions: [
    {
      header: "时间范围",
      question: "抓取多长时间内的文章？",
      options: [
        { label: "24 小时", description: "仅最近一天" },
        { label: "48 小时 (推荐)", description: "最近两天，覆盖更全" },
        { label: "72 小时", description: "最近三天" },
        { label: "7 天", description: "一周内的文章" }
      ]
    },
    {
      header: "精选数量",
      question: "AI 筛选后保留多少篇？",
      options: [
        { label: "10 篇", description: "精简版" },
        { label: "15 篇 (推荐)", description: "标准推荐" },
        { label: "20 篇", description: "扩展版" }
      ]
    },
    {
      header: "输出语言",
      question: "摘要使用什么语言？",
      options: [
        { label: "中文 (推荐)", description: "摘要翻译为中文" },
        { label: "English", description: "保持英文原文" }
      ]
    }
  ]
})
```

### Step 2: 执行脚本

```bash
mkdir -p ./output

npx -y bun ${SKILL_DIR}/scripts/digest.ts \
  --hours <timeRange> \
  --top-n <topN> \
  --lang <zh|en> \
  --output ./output/digest-$(date +%Y%m%d).md
```

**注意**：`config.json` 配置文件应在初始化步骤中已创建。

支持配置多个 API 端点，系统会自动进行故障转移。

### Step 3: 结果展示

**成功时**：
- 📁 报告文件路径
- 📊 摘要摘要：扫描源数、抓取文章数、精选文章数
- 🏆 **今日精选 Top 3 预览**：中文标题 + 一句话摘要

**报告结构**（生成的 Markdown 文件包含以下板块）：
1. **📝 今日看点** — AI 归纳的 3-5 句宏观趋势总结
2. **🏆 今日必读 Top 3** — 中英双语标题、摘要、推荐理由、关键词标签
3. **📊 数据概览** — 统计表格 + Mermaid 分类饼图 + 高频关键词柱状图 + ASCII 纯文本图（终端友好） + 话题标签云
4. **分类文章列表** — 按 6 大分类（AI/ML、安全、工程、工具/开源、观点/杂谈、其他）分组展示，每篇含中文标题、相对时间、综合评分、摘要、关键词

**失败时**：
- 显示错误信息
- 常见问题：API Key 无效、网络问题、RSS 源不可用

---

## 参数映射

| 交互选项 | 脚本参数 |
|----------|----------|
| 24 小时 | `--hours 24` |
| 48 小时 | `--hours 48` |
| 72 小时 | `--hours 72` |
| 7 天 | `--hours 168` |
| 10 篇 | `--top-n 10` |
| 15 篇 | `--top-n 15` |
| 20 篇 | `--top-n 20` |
| 中文 | `--lang zh` |
| English | `--lang en` |

---

## 环境要求

- `bun` 运行时（通过 `npx -y bun` 自动安装）
- `config.json` 配置文件（包含 API 配置）
- 网络访问（需要能访问 RSS 源和 API）

---

## 信息源

90 个 RSS 源来自 [Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/)，由 [Andrej Karpathy](https://x.com/karpathy) 推荐。

包括：simonwillison.net, paulgraham.com, overreacted.io, gwern.net, krebsonsecurity.com, antirez.com, daringfireball.net 等顶级技术博客。

完整列表见 `config/rss-feeds.json`。

---

## 故障排除

### "Config file not found"
需要在项目根目录创建 `config.json` 文件，配置 API 端点和密钥。

### "Failed to fetch N feeds"
部分 RSS 源可能暂时不可用，脚本会跳过失败的源并继续处理。

### "No articles found in time range"
尝试扩大时间范围（如从 24 小时改为 48 小时）。
