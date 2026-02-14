// ============================================================================
// AI Summarizer
// ============================================================================

import { Article, ScoredArticle, GeminiSummaryResult } from './types';
import { GEMINI_BATCH_SIZE, MAX_CONCURRENT_GEMINI } from './config';
import { callGemini, parseJsonResponse } from './gemini-client';
import { isDebugMode } from './logger';

function buildSummaryPrompt(
  articles: Array<{ index: number; title: string; description: string; sourceName: string; link: string }>,
  lang: 'zh' | 'en'
): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\nURL: ${a.link}\n${a.description.slice(0, 800)}`
  ).join('\n\n---\n\n');

  const langInstruction = lang === 'zh'
    ? '请用中文撰写摘要和推荐理由。如果原文是英文，请翻译为中文。标题翻译也用中文。'
    : 'Write summaries, reasons, and title translations in English.';

  return `你是一个技术内容摘要专家。请为以下文章完成三件事：

1. **中文标题** (titleZh): 将英文标题翻译成自然的中文。如果原标题已经是中文则保持不变。
2. **摘要** (summary): 4-6 句话的结构化摘要，让读者不点进原文也能了解核心内容。
3. **推荐理由** (reason): 1 句话说明"为什么值得读"，区别于摘要（摘要说"是什么"，推荐理由说"为什么"）。

${langInstruction}

## 摘要示例（参考标准）

### 示例 1: [Gwern Blog] GPT-4 Technical Report
**中文标题**: GPT-4 技术报告：全面评测与基准测试
**摘要**:
GPT-4 在多项基准测试中展现出了超越 GPT-3.5 的性能，在 MMLU 基准中达到 86.4% 的准确率。研究团队通过对抗性测试评估了模型的安全性和鲁棒性，并详细记录了在数学推理、编程能力和多语言理解方面的改进。报告还公开了模型架构细节和训练方法，包括混合专家（MoE）架构的应用。
**推荐理由**: OpenAI 官方技术报告，包含详实的测试数据和架构分析，对 AI 从业者和研究者必读。

### 示例 2: [Engineering Blog] How We Reduced Database Latency by 70%
**中文标题**: 我们如何将数据库延迟降低 70%
**摘要**:
团队通过引入读写分离、查询优化和缓存策略，将 PostgreSQL 数据库的平均响应时间从 200ms 降至 60ms。关键优化包括：添加 Redis 缓存层减少 80% 的读查询，使用连接池优化并发性能，以及重写慢查询提升索引效率。实施后系统 P99 延迟从 500ms 降至 150ms，用户体验显著改善。
**推荐理由**: 实战案例详细，包含具体数据、优化方案和效果对比，对后端工程师有很高参考价值。

### 示例 3: [Personal Blog] Why I Switched from VS Code to Neovim
**中文标题**: 为什么我从 VS Code 切换到 Neovim
**摘要**:
作者分享了从 VS Code 迁移到 Neovim 的过程和原因，主要动力是对性能和可定制性的追求。通过 Lua 配置和插件生态，实现了更快的启动速度（&lt;100ms）和更流畅的编辑体验。文章详细介绍了关键插件配置、快捷键迁移策略，以及遇到的挑战和解决方案。
**推荐理由**: 编辑器定制经验分享，对追求开发工具效率的开发者有启发意义。

## 摘要要求

### 结构要求（必须满足）
- ✅ 用"探讨了"、"发现了"、"实现了"、"表明"等动词开头
- ✅ 点明核心问题 → 关键方案/发现 → 结论（逻辑链条完整）
- ✅ 包含具体技术名词、数据指标、方案名称
- ✅ 对比类文章要指出比较对象和结论
- ❌ 不要"本文介绍了"、"文章讨论了"这种废话开头

### 质量标准
- **长度**: 150-300 字（英文 100-200 词）
- **信息密度**: 每句都要有实质性内容，避免空洞描述
- **技术准确性**: 保留关键数字（百分比、版本号、时间等）
- **可读性**: 目标读者花 30 秒读完摘要，就能决定是否值得读原文

### 推荐理由要求
- 区别于摘要（摘要说"是什么"，推荐理由说"为什么值得读"）
- 突出价值：实战经验/深度分析/官方报告/重要数据等
- 1 句话，简洁有力

## 待摘要文章

${articlesList}

请严格按 JSON 格式返回：
{
  "results": [
    {
      "index": 0,
      "titleZh": "中文翻译的标题",
      "summary": "摘要内容...",
      "reason": "推荐理由..."
    }
  ]
}`;
}

export async function summarizeArticles(
  articles: Array<Article & { index: number }>,
  lang: 'zh' | 'en'
): Promise<Map<number, { titleZh: string; summary: string; reason: string }>> {
  const summaries = new Map<number, { titleZh: string; summary: string; reason: string }>();

  const indexed = articles.map(a => ({
    index: a.index,
    title: a.title,
    description: a.description,
    sourceName: a.sourceName,
    link: a.link,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  console.log(`[digest] Generating summaries for ${articles.length} articles in ${batches.length} batches`);

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildSummaryPrompt(batch, lang);

        // Debug 模式下打印完整 prompt
        if (isDebugMode()) {
          console.log('\n' + '='.repeat(80));
          console.log(`[DEBUG] 发送给 AI 摘要的 Prompt (batch ${i / MAX_CONCURRENT_GEMINI + Math.floor(batchGroup.indexOf(batch) / MAX_CONCURRENT_GEMINI) + 1}):`);
          console.log('='.repeat(80));
          console.log(prompt);
          console.log('='.repeat(80) + '\n');
        }

        const responseText = await callGemini(prompt);
        const parsed = parseJsonResponse<GeminiSummaryResult>(responseText);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            summaries.set(result.index, {
              titleZh: result.titleZh || '',
              summary: result.summary || '',
              reason: result.reason || '',
            });
          }
        }
      } catch (error) {
        console.warn(`[digest] Summary batch failed: ${error instanceof Error ? error.message : String(error)}`);
        for (const item of batch) {
          summaries.set(item.index, { titleZh: item.title, summary: item.description.slice(0, 200), reason: '' });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[digest] Summary progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }

  return summaries;
}

export async function generateHighlights(
  articles: ScoredArticle[],
  lang: 'zh' | 'en'
): Promise<string> {
  const articleList = articles.slice(0, 10).map((a, i) =>
    `${i + 1}. [${a.category}] ${a.titleZh || a.title} — ${a.summary.slice(0, 100)}`
  ).join('\n');

  const langNote = lang === 'zh' ? '用中文回答。' : 'Write in English.';

  const prompt = `根据以下今日精选技术文章列表，写一段 3-5 句话的"今日看点"总结。
要求：
- 提炼出今天技术圈的 2-3 个主要趋势或话题
- 不要逐篇列举，要做宏观归纳
- 风格简洁有力，像新闻导语
${langNote}

文章列表：
${articleList}

直接返回纯文本总结，不要 JSON，不要 markdown 格式。`;

  if (isDebugMode()) {
    console.log('\n' + '='.repeat(80));
    console.log('[DEBUG] 发送给 AI 生成亮点的 Prompt:');
    console.log('='.repeat(80));
    console.log(prompt);
    console.log('='.repeat(80) + '\n');
  }

  try {
    const text = await callGemini(prompt);
    return text.trim();
  } catch (error) {
    console.warn(`[digest] Highlights generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}
