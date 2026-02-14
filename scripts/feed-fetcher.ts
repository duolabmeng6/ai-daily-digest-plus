// ============================================================================
// Feed Fetcher
// ============================================================================

import { Article } from './types';
import { log } from './logger';
import { FEED_FETCH_TIMEOUT_MS, FEED_CONCURRENCY, colors } from './config';
import { parseRSSItems, parseDate } from './rss-parser';

async function fetchFeed(feed: { name: string; xmlUrl: string; htmlUrl: string }): Promise<Article[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    log('debug', `开始抓取: ${feed.name}`);
    const startTime = Date.now();

    const response = await fetch(feed.xmlUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Daily-Digest/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const items = parseRSSItems(xml);

    const articles = items.map(item => ({
      title: item.title,
      link: item.link,
      pubDate: parseDate(item.pubDate) || new Date(0),
      description: item.description,
      sourceName: feed.name,
      sourceUrl: feed.htmlUrl,
    }));

    log('success', `${feed.name}: ${articles.length} 篇文章 (耗时 ${elapsed}ms)`);
    return articles;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Only log non-abort errors to reduce noise
    if (!msg.includes('abort')) {
      log('error', `${feed.name}: ${msg}`);
    } else {
      log('warn', `${feed.name}: 超时`);
    }
    return [];
  }
}

export async function fetchAllFeeds(feeds: Array<{ name: string; xmlUrl: string; htmlUrl: string }>): Promise<Article[]> {
  const allArticles: Article[] = [];
  let successCount = 0;
  let failCount = 0;

  log('info', `开始并发抓取 ${feeds.length} 个 RSS 源 (并发数: ${FEED_CONCURRENCY})...`);

  for (let i = 0; i < feeds.length; i += FEED_CONCURRENCY) {
    const batch = feeds.slice(i, i + FEED_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchFeed));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allArticles.push(...result.value);
        successCount++;
      } else {
        failCount++;
      }
    }

    const progress = Math.min(i + FEED_CONCURRENCY, feeds.length);
    const percentage = ((progress / feeds.length) * 100).toFixed(1);
    log('info', `进度: ${colors.bright}${progress}/${feeds.length}${colors.reset} (${percentage}%) | 成功: ${colors.green}${successCount}${colors.reset} | 失败: ${failCount > 0 ? colors.red : ''}${failCount}${colors.reset}`);
  }

  log('info', `抓取完成: ${colors.green}${successCount}${colors.reset} 成功, ${failCount > 0 ? colors.red : ''}${failCount}${colors.reset} 失败, 共 ${colors.bright}${allArticles.length}${colors.reset} 篇文章`);
  return allArticles;
}
