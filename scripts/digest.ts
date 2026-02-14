import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ScoredArticle, CategoryId } from './types';
import { loadConfig } from './gemini-client';
import { fetchAllFeeds } from './feed-fetcher';
import { scoreArticlesWithAI } from './ai-scorer';
import { summarizeArticles, generateHighlights } from './ai-summarizer';
import { generateDigestReport } from './reporter';
import { setDebugMode, setTestMode, log, colors } from './logger';

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`${colors.bright}AI Daily Digest${colors.reset} - AI-powered RSS digest from 90 top tech blogs

${colors.cyan}Usage:${colors.reset}
  bun scripts/digest.ts [options]

${colors.cyan}Options:${colors.reset}
  --hours <n>     Time range in hours (default: 48)
  --top-n <n>     Number of top articles to include (default: 15)
  --lang <lang>   Summary language: zh or en (default: zh)
  --output <path> Output file path (default: ./digest-YYYYMMDD.md)
  --test          Test mode: only fetch 1 feed for debugging
  --debug         Debug mode: show detailed logs
  --help          Show this help

${colors.cyan}Config:${colors.reset}
  config.json     Required in project root with API configurations

${colors.cyan}Examples:${colors.reset}
  # Normal usage
  bun scripts/digest.ts --hours 24 --top-n 10 --lang zh

  # Test mode (1 feed only)
  bun scripts/digest.ts --test --debug

  # Custom output
  bun scripts/digest.ts --hours 72 --top-n 20 --output ./my-digest.md
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let hours = 48;
  let topN = 15;
  let lang: 'zh' | 'en' = 'zh';
  let outputPath = '';
  const debugMode = args.includes('--debug');
  const testMode = args.includes('--test');

  setDebugMode(debugMode);
  setTestMode(testMode);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--hours' && args[i + 1]) {
      hours = parseInt(args[++i]!, 10);
    } else if (arg === '--top-n' && args[i + 1]) {
      topN = parseInt(args[++i]!, 10);
    } else if (arg === '--lang' && args[i + 1]) {
      lang = args[++i] as 'zh' | 'en';
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i]!;
    }
  }

  // 加载配置
  try {
    await loadConfig();
  } catch (error) {
    console.error('[digest] Error: Failed to load config.json');
    console.error('[digest]', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // 加载RSS源
  const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'rss-feeds.json');
  let RSS_FEEDS: Array<{ name: string; xmlUrl: string; htmlUrl: string }>;
  try {
    const feedsContent = await readFile(configPath, 'utf-8');
    RSS_FEEDS = JSON.parse(feedsContent);
    log('success', `成功加载 ${RSS_FEEDS.length} 个 RSS 源`);
  } catch (error) {
    console.error('[digest] Error: Failed to load RSS feeds from config/rss-feeds.json');
    console.error('[digest]', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!outputPath) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
    await mkdir(dataDir, { recursive: true });
    outputPath = join(dataDir, `digest-${dateStr}.md`);
  }

  console.log(`[digest] === AI Daily Digest ===`);
  console.log(`[digest] Time range: ${hours} hours`);
  console.log(`[digest] Top N: ${topN}`);
  console.log(`[digest] Language: ${lang}`);
  console.log(`[digest] Output: ${outputPath}`);
  console.log('');

  // 选择RSS源（测试模式只抓1个）- 使用非空断言,因为如果RSS_FEEDS未赋值会先exit
  const feedsToFetch = testMode ? [RSS_FEEDS![0]!] : RSS_FEEDS!;
  if (testMode) {
    console.log(`[digest] ⚠️  测试模式: 仅抓取 ${feedsToFetch[0]!.name}`);
  }

  console.log(`[digest] Step 1/5: Fetching ${feedsToFetch.length} RSS feeds...`);
  const allArticles = await fetchAllFeeds(feedsToFetch);

  if (allArticles.length === 0) {
    console.error('[digest] Error: No articles fetched from any feed. Check network connection.');
    process.exit(1);
  }

  console.log(`[digest] Step 2/5: Filtering by time range (${hours} hours)...`);
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentArticles = allArticles.filter(a => a.pubDate.getTime() > cutoffTime.getTime());

  console.log(`[digest] Found ${recentArticles.length} articles within last ${hours} hours`);

  if (recentArticles.length === 0) {
    console.error(`[digest] Error: No articles found within the last ${hours} hours.`);
    console.error(`[digest] Try increasing --hours (e.g., --hours 168 for one week)`);
    process.exit(1);
  }

  console.log(`[digest] Step 3/5: AI scoring ${recentArticles.length} articles...`);
  const scores = await scoreArticlesWithAI(recentArticles);

  const scoredArticles = recentArticles.map((article, index) => {
    const score = scores.get(index) || { relevance: 5, quality: 5, timeliness: 5, category: 'other' as CategoryId, keywords: [] };
    return {
      ...article,
      totalScore: score.relevance + score.quality + score.timeliness,
      breakdown: score,
    };
  });

  scoredArticles.sort((a, b) => b.totalScore - a.totalScore);
  const topArticles = scoredArticles.slice(0, topN);

  console.log(`[digest] Top ${topN} articles selected (score range: ${topArticles[topArticles.length - 1]?.totalScore || 0} - ${topArticles[0]?.totalScore || 0})`);

  console.log(`[digest] Step 4/5: Generating AI summaries...`);
  const indexedTopArticles = topArticles.map((a, i) => ({ ...a, index: i }));
  const summaries = await summarizeArticles(indexedTopArticles, lang);

  const finalArticles: ScoredArticle[] = topArticles.map((a, i) => {
    const sm = summaries.get(i) || { titleZh: a.title, summary: a.description.slice(0, 200), reason: '' };
    return {
      title: a.title,
      link: a.link,
      pubDate: a.pubDate,
      description: a.description,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
      score: a.totalScore,
      scoreBreakdown: {
        relevance: a.breakdown.relevance,
        quality: a.breakdown.quality,
        timeliness: a.breakdown.timeliness,
      },
      category: a.breakdown.category,
      keywords: a.breakdown.keywords,
      titleZh: sm.titleZh,
      summary: sm.summary,
      reason: sm.reason,
    };
  });

  console.log(`[digest] Step 5/5: Generating today's highlights...`);
  const highlights = await generateHighlights(finalArticles, lang);

  const successfulSources = new Set(allArticles.map(a => a.sourceName));

  const report = generateDigestReport(finalArticles, highlights, {
    totalFeeds: RSS_FEEDS.length,
    successFeeds: successfulSources.size,
    totalArticles: allArticles.length,
    filteredArticles: recentArticles.length,
    hours,
    lang,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report);

  console.log('');
  console.log(`[digest] ✅ Done!`);
  console.log(`[digest] 📁 Report: ${outputPath}`);
  console.log(`[digest] 📊 Stats: ${successfulSources.size} sources → ${allArticles.length} articles → ${recentArticles.length} recent → ${finalArticles.length} selected`);

  if (finalArticles.length > 0) {
    console.log('');
    console.log(`[digest] 🏆 Top 3 Preview:`);
    for (let i = 0; i < Math.min(3, finalArticles.length); i++) {
      const a = finalArticles[i];
      console.log(`  ${i + 1}. ${a.titleZh || a.title}`);
      console.log(`     ${a.summary.slice(0, 80)}...`);
    }
  }
}

await main().catch((err) => {
  console.error(`[digest] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
