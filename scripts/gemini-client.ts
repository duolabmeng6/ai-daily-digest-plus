// ============================================================================
// Gemini API Client
// ============================================================================

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Config } from './types';
import { log } from './logger';

let currentApiIndex = 0;
let config: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (config) return config;

  log('debug', '开始加载配置文件...');

  // 尝试多个可能的 config.json 路径
  const possiblePaths = [
    join(process.cwd(), 'config.json'),
    join(dirname(fileURLToPath(import.meta.url)), '..', 'config.json'),
    join(process.env.HOME || '', '.claude', 'skills', 'ai-daily-digest', 'config.json'),
  ];

  log('debug', '可能的配置文件路径:', possiblePaths);

  for (const configPath of possiblePaths) {
    if (existsSync(configPath)) {
      try {
        log('debug', `尝试加载: ${configPath}`);
        const content = await readFile(configPath, 'utf-8');
        config = JSON.parse(content) as Config;
        log('success', `配置文件加载成功: ${configPath}`);
        log('info', `可用 API 数量: ${config!.apis.length}`);

        config!.apis.forEach((api, idx) => {
          log('debug', `API ${idx + 1}: ${api.base_url} (${api.model})`);
        });

        return config!;
      } catch (error) {
        log('warn', `配置文件加载失败 ${configPath}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  throw new Error('Config file not found. Checked paths:\n' + possiblePaths.join('\n'));
}

export async function callGemini(prompt: string, _apiKey?: string): Promise<string> {
  const cfg = await loadConfig();

  // 尝试所有 API 配置，直到成功
  const startIndex = currentApiIndex;
  let attempts = 0;

  while (attempts < cfg.apis.length) {
    const api = cfg.apis[currentApiIndex];
    attempts++;
    const startTime = Date.now();

    try {
      const url = `${api.base_url}/chat/completions`;
      log('debug', `尝试 API ${currentApiIndex + 1}/${cfg.apis.length}: ${api.base_url}`);
      log('debug', `请求 URL: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.api_key}`,
          ...cfg.extra_headers,
        },
        body: JSON.stringify({
          model: api.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          top_p: 0.8,
          stream: false,  // 明确要求非流式响应
          ...cfg.extra_body,
        }),
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      // 先获取文本，再尝试解析 JSON
      const responseText = await response.text();
      log('debug', `API 原始响应 (前500字符): ${responseText.substring(0, 500)}`);

      // 检查是否是 SSE 流式响应（以 "data:" 开头）
      let jsonText = responseText;
      if (responseText.trim().startsWith('data:')) {
        log('debug', '检测到 SSE 流式响应，开始解析...');
        // 解析 SSE 格式
        const lines = responseText.split('\n');
        const dataLines: string[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const data = trimmed.substring(5).trim();
            if (data === '[DONE]') continue;
            dataLines.push(data);
          }
        }

        // 合并所有 delta 内容
        let fullContent = '';
        for (const dataLine of dataLines) {
          try {
            const chunk = JSON.parse(dataLine);
            const delta = chunk.choices?.[0]?.delta?.content || '';
            fullContent += delta;
          } catch (e) {
            log('debug', `解析 chunk 失败: ${e}`);
          }
        }

        if (fullContent) {
          log('success', `SSE 流解析成功，合并内容长度: ${fullContent.length} 字符`);
          log('success', `API ${currentApiIndex + 1} 调用成功 (耗时 ${elapsed}ms)`);
          return fullContent;
        }
      }

      let data;
      try {
        data = JSON.parse(jsonText) as {
          choices?: Array<{
            message?: { content?: string };
          }>;
        };
      } catch (parseError) {
        throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${responseText.substring(0, 200)}`);
      }

      const result = data.choices?.[0]?.message?.content || '';
      if (!result) {
        log('warn', `API 返回空内容，完整响应: ${JSON.stringify(data)}`);
      }

      log('success', `API ${currentApiIndex + 1} 调用成功 (耗时 ${elapsed}ms, 返回 ${result.length} 字符)`);
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      log('error', `API ${currentApiIndex + 1} 失败 (耗时 ${elapsed}ms):`, error instanceof Error ? error.message : error);

      // 切换到下一个 API
      currentApiIndex = (currentApiIndex + 1) % cfg.apis.length;

      if (attempts < cfg.apis.length) {
        log('warn', `切换到下一个 API...`);
      }
    }
  }

  throw new Error(`All ${cfg.apis.length} APIs failed. Please check your config.json.`);
}

export function parseJsonResponse<T>(text: string): T {
  let jsonText = text.trim();

  log('debug', `开始解析 JSON (长度: ${jsonText.length})`);
  log('debug', `JSON 前200字符: ${jsonText.substring(0, 200)}`);

  // Strip markdown code blocks if present
  if (jsonText.includes('```')) {
    jsonText = jsonText.replace(/```(?:json)?\n?/g, '').replace(/\n?```/g, '');
    log('debug', '移除了 markdown 代码块');
  }

  // 尝试多种方式提取 JSON
  const extractionPatterns = [
    // 完整的 JSON 对象
    () => {
      const jsonStart = jsonText.indexOf('{');
      const jsonEnd = jsonText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        return jsonText.substring(jsonStart, jsonEnd + 1);
      }
      return null;
    },
    // 使用正则匹配 "results": [...] 模式
    () => {
      const match = jsonText.match(/\{\s*"results"\s*:\s*\[[\s\S]*?\]\s*\}/);
      return match ? match[0] : null;
    },
  ];

  for (let i = 0; i < extractionPatterns.length; i++) {
    const extracted = extractionPatterns[i]();
    if (!extracted) continue;

    log('debug', `尝试提取方法 ${i + 1}`);
    try {
      const result = JSON.parse(extracted) as T;
      log('success', `JSON 解析成功 (使用方法 ${i + 1})`);
      return result;
    } catch (e) {
      log('debug', `方法 ${i + 1} 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 所有方法都失败了
  log('error', `所有 JSON 提取方法都失败`);
  log('error', `原始文本 (前800字符): ${jsonText.substring(0, 800)}`);
  throw new Error(`Failed to parse JSON response after trying all extraction methods`);
}
