// ============================================================================
// Feed Cache
// 缓存原始 RSS 数据，避免频繁抓取
// ============================================================================

import { Article } from './types';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cache');
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟
const CACHE_PREFIX = 'feeds-';
const CACHE_SUFFIX = '.json';

interface CacheEntry {
  timestamp: number;
  articles: Article[];
  sourceCount: number;
}

/**
 * 生成缓存文件路径
 */
function getCacheFilePath(timestamp: number): string {
  return join(CACHE_DIR, `${CACHE_PREFIX}${timestamp}${CACHE_SUFFIX}`);
}

/**
 * 清理过期缓存文件
 */
async function cleanExpiredCache(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const files = await readdir(CACHE_DIR);
    const now = Date.now();

    for (const file of files) {
      if (!file.startsWith(CACHE_PREFIX) || !file.endsWith(CACHE_SUFFIX)) {
        continue;
      }

      const filePath = join(CACHE_DIR, file);
      const content = await readFile(filePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(content);

      if (now - entry.timestamp > CACHE_TTL_MS) {
        await unlink(filePath);
      }
    }
  } catch (error) {
    // 静默失败，不影响主流程
  }
}

/**
 * 读取最新有效缓存
 * @returns 缓存的文章数组，如果没有有效缓存则返回 null
 */
export async function readCache(): Promise<Article[] | null> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const files = await readdir(CACHE_DIR);
    const now = Date.now();

    // 找到最新的缓存文件
    let latestEntry: CacheEntry | null = null;
    let latestTimestamp = 0;

    for (const file of files) {
      if (!file.startsWith(CACHE_PREFIX) || !file.endsWith(CACHE_SUFFIX)) {
        continue;
      }

      const filePath = join(CACHE_DIR, file);
      const content = await readFile(filePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(content);

      // 检查是否过期
      if (now - entry.timestamp > CACHE_TTL_MS) {
        continue;
      }

      if (entry.timestamp > latestTimestamp) {
        latestTimestamp = entry.timestamp;
        latestEntry = entry;
      }
    }

    if (latestEntry) {
      const age = Math.floor((now - latestEntry.timestamp) / 1000 / 60);
      console.log(`[cache] ✅ 使用缓存数据 (距今 ${age} 分钟, ${latestEntry.sourceCount} 个源, ${latestEntry.articles.length} 篇文章)`);

      // 恢复 Date 对象
      return latestEntry.articles.map(article => ({
        ...article,
        pubDate: new Date(article.pubDate),
      }));
    }

    return null;
  } catch (error) {
    // 缓存读取失败，继续正常流程
    return null;
  }
}

/**
 * 写入缓存
 * @param articles 文章数组
 * @param sourceCount 源数量
 */
export async function writeCache(articles: Article[], sourceCount: number): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });

    // 先清理过期缓存
    await cleanExpiredCache();

    // 写入新缓存
    const entry: CacheEntry = {
      timestamp: Date.now(),
      articles,
      sourceCount,
    };

    const cachePath = getCacheFilePath(entry.timestamp);
    await writeFile(cachePath, JSON.stringify(entry), 'utf-8');

    console.log(`[cache] 💾 缓存已保存 (30分钟有效)`);
  } catch (error) {
    // 缓存写入失败，不影响主流程
    console.warn('[cache] ⚠️  缓存写入失败:', error instanceof Error ? error.message : error);
  }
}

/**
 * 清除所有缓存（用于测试或手动刷新）
 */
export async function clearCache(): Promise<void> {
  try {
    const files = await readdir(CACHE_DIR);

    for (const file of files) {
      if (file.startsWith(CACHE_PREFIX) && file.endsWith(CACHE_SUFFIX)) {
        await unlink(join(CACHE_DIR, file));
      }
    }

    console.log('[cache] 🗑️  所有缓存已清除');
  } catch (error) {
    // 静默失败
  }
}
