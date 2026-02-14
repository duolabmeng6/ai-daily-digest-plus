// ============================================================================
// AI Scoring
// ============================================================================

import { Article, CategoryId, GeminiScoringResult } from './types';
import { GEMINI_BATCH_SIZE, MAX_CONCURRENT_GEMINI } from './config';
import { callGemini, parseJsonResponse } from './gemini-client';
import { isDebugMode, log } from './logger';

function buildScoringPrompt(articles: Array<{ index: number; title: string; description: string; sourceName: string }>): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\n${a.description.slice(0, 300)}`
  ).join('\n\n---\n\n');

  return `你是一个资深技术内容策展人，正在为一份面向技术从业者的每日精选摘要筛选文章。

请对以下文章进行三个维度的评分（1-10 整数，10 分最高），并为每篇文章分配一个分类标签和提取 2-4 个关键词。

## 评分示例（参考标准）

### 示例 1: [Gwern] GPT-4 Technical Report
- **相关性 (relevance)**: 10 - 重大技术突破，所有 AI 从业者必读
- **质量 (quality)**: 10 - 深度技术分析，丰富数据，原创研究，引用详实
- **时效性 (timeliness)**: 9 - 近期发布，行业广泛讨论
- **分类**: ai-ml
- **关键词**: ["GPT-4", "benchmark", "evaluation", "LLM"]

### 示例 2: [Personal Blog] How I Learned Rust in 2024
- **相关性 (relevance)**: 6 - 对语言学习者和系统编程者有价值
- **质量 (quality)**: 7 - 个人实践经验，表达清晰，有参考价值
- **时效性 (timeliness)**: 5 - 常青内容，不过时
- **分类**: engineering
- **关键词**: ["Rust", "learning", "programming", "systems"]

### 示例 3: [Tech News] Company X Raises $100M
- **相关性 (relevance)**: 3 - 对技术从业者价值有限
- **质量 (quality)**: 4 - 简单报道，无深度分析
- **时效性 (timeliness)**: 6 - 当前热点，但持续性低
- **分类**: opinion
- **关键词**: ["startup", "funding", "business"]

## 评分维度（1-10 分）

### 1. 相关性 (relevance) - 对技术/编程/AI/互联网从业者的价值
- **10**: 所有技术人都应该知道的重大事件/技术突破
- **7-9**: 对大部分技术从业者有价值的重要进展
- **4-6**: 对特定技术领域或兴趣群体有价值
- **1-3**: 与技术行业关联不大或过于浅显

### 2. 质量 (quality) - 文章本身的深度和写作质量
- **10**: 深度分析，原创洞见，引用丰富，数据详实
- **7-9**: 有深度，观点独到，分析到位
- **4-6**: 信息准确，表达清晰，有参考价值
- **1-3**: 浅尝辄止，纯转述，缺乏原创内容

### 3. 时效性 (timeliness) - 当前是否值得阅读
- **10**: 正在发生的重大事件/刚发布的重要工具/版本
- **7-9**: 近期热点相关，值得及时了解
- **4-6**: 常青内容，不过时
- **1-3**: 过时内容或无时效价值

## 分类标签（必须从以下 6 类选一个）
- **ai-ml**: AI、机器学习、LLM、深度学习相关
- **security**: 安全、隐私、漏洞、加密相关
- **engineering**: 潯件工程、架构、编程语言、系统设计
- **tools**: 开发工具、开源项目、新发布的库/框架
- **opinion**: 行业观点、个人思考、职业发展、文化评论
- **other**: 以上都不太适合的

## 关键词提取
提取 2-4 个最能代表文章主题的关键词（用英文，简短，如 "Rust", "LLM", "database", "performance"）

## 待评分文章

${articlesList}

请严格按 JSON 格式返回，不要包含 markdown 代码块或其他文字：
Please output your response in JSON format according to this schema:
{
  "results": [
    {
      "index": 0,
      "relevance": 8,
      "quality": 7,
      "timeliness": 9,
      "category": "engineering",
      "keywords": ["Rust", "compiler", "performance"]
    }
  ]
}`;
}

export async function scoreArticlesWithAI(
  articles: Article[]
): Promise<Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>> {
  const allScores = new Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>();

  const indexed = articles.map((article, index) => ({
    index,
    title: article.title,
    description: article.description,
    sourceName: article.sourceName,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  console.log(`[digest] AI scoring: ${articles.length} articles in ${batches.length} batches`);

  const validCategories = new Set<string>(['ai-ml', 'security', 'engineering', 'tools', 'opinion', 'other']);

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildScoringPrompt(batch);

        // Debug 模式下打印完整 prompt
        if (isDebugMode()) {
          console.log('\n' + '='.repeat(80));
          console.log(`[DEBUG] 发送给 AI 评分的 Prompt (batch ${i / MAX_CONCURRENT_GEMINI + Math.floor(batchGroup.indexOf(batch) / MAX_CONCURRENT_GEMINI) + 1}):`);
          console.log('='.repeat(80));
          console.log(prompt);
          console.log('='.repeat(80) + '\n');
        }

        const responseText = await callGemini(prompt);
        const parsed = parseJsonResponse<GeminiScoringResult>(responseText);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            const clamp = (v: number) => Math.min(10, Math.max(1, Math.round(v)));
            const cat = (validCategories.has(result.category) ? result.category : 'other') as CategoryId;
            allScores.set(result.index, {
              relevance: clamp(result.relevance),
              quality: clamp(result.quality),
              timeliness: clamp(result.timeliness),
              category: cat,
              keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 4) : [],
            });
          }
        }
      } catch (error) {
        console.warn(`[digest] Scoring batch failed: ${error instanceof Error ? error.message : String(error)}`);
        for (const item of batch) {
          allScores.set(item.index, { relevance: 5, quality: 5, timeliness: 5, category: 'other', keywords: [] });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[digest] Scoring progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }

  return allScores;
}
