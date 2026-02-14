// ============================================================================
// Logger Utilities
// ============================================================================

import { colors } from './config';

// 全局调试模式
export let DEBUG_MODE = false;
export let TEST_MODE = false;

export function setDebugMode(value: boolean) {
  DEBUG_MODE = value;
}

export function setTestMode(value: boolean) {
  TEST_MODE = value;
}

export function isDebugMode(): boolean {
  return DEBUG_MODE;
}

export function isTestMode(): boolean {
  return TEST_MODE;
}

export function log(level: 'info' | 'success' | 'warn' | 'error' | 'debug', ...args: unknown[]) {
  const timestamp = new Date().toISOString().substr(11, 12);
  const prefix = {
    info: `${colors.cyan}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    debug: `${colors.dim}🔍${colors.reset}`,
  }[level];

  if (level === 'debug' && !DEBUG_MODE) return;

  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ');
  console.log(`${colors.dim}${timestamp}${colors.reset} ${prefix} ${message}`);
}

export function logSection(title: string) {
  console.log('');
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log('');
}

export { colors };
