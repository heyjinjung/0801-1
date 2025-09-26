#!/usr/bin/env node
/** Node SSR Hydration Random Checker (frontend local path)
 * 동일 규칙:
 * - Scan .ts/.tsx/.jsx excluding node_modules/.next/dist/build/coverage/scripts/__pycache__
 * - Allow if file top (first 5 non-empty lines) contains 'use client'
 * - Allow if line or previous line has '@allow-ssr-random'
 * - Else record violation; exit 1 if any
 */
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const ALLOW_TAG = '@allow-ssr-random';
const CLIENT_DIRECTIVE = 'use client';
const TARGET_EXT = new Set(['.tsx', '.ts', '.jsx']);
const EXCLUDE_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'coverage', 'scripts/__pycache__',
  // 테스트/스토리북/예시 디렉토리 제외 (SSR 안전성 영향 없음)
  '__tests__', 'tests', 'e2e', 'storybook'
]);
const pattern = /Math\.random\(/;

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..'); // frontend root

async function collectFiles(dir) {
  const out = [];
  async function walk(current) {
    const ents = await fs.readdir(current, { withFileTypes: true });
    for (const ent of ents) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.has(ent.name)) continue;
        await walk(full);
      } else {
  const ext = path.extname(ent.name);
        if (!TARGET_EXT.has(ext)) continue;
        const parts = full.split(path.sep);
        if (parts.some(p => EXCLUDE_DIRS.has(p))) continue;
  // 단일 파일명 패턴 제외: *.spec.ts(x) / *.test.ts(x)
  if (/\.(spec|test)\.[jt]sx?$/.test(ent.name)) continue;
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function scanFile(file) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch { return { rel, violations: [] }; }
  if (!pattern.test(text)) return { rel, violations: [] };
  const lines = text.split(/\r?\n/);
  const firstNon = [];
  for (const l of lines) {
    const trimmed = l.trim().replace(/^[\ufeff]+/, '');
    if (trimmed) firstNon.push(trimmed);
    if (firstNon.length >= 5) break;
  }
  const isClient = firstNon.some(l => l === CLIENT_DIRECTIVE || l.startsWith(`"${CLIENT_DIRECTIVE}`) || l.startsWith(`'${CLIENT_DIRECTIVE}`));
  const violations = [];
  lines.forEach((line, idx) => {
    if (!line.includes('Math.random(')) return;
    if (line.includes(ALLOW_TAG) || (idx > 0 && lines[idx - 1].includes(ALLOW_TAG))) return;
    if (isClient) return;
    violations.push({ file: rel, line: idx + 1, code: line.trim() });
  });
  return { rel, violations };
}

async function main() {
  const files = await collectFiles(repoRoot);
  const all = [];
  for (const f of files) {
    if (f.endsWith('check_hydration_random.mjs') || f.endsWith('check_hydration_random.py')) continue;
    const r = await scanFile(f);
    if (r.violations.length) all.push(...r.violations);
  }
  const isJson = process.argv.includes('--json');
  if (isJson) {
    process.stdout.write(JSON.stringify({ violations: all }, null, 2));
  } else {
    if (all.length) {
      console.error('✖ SSR 위험 Math.random 사용 감지:');
      for (const v of all) console.error(`  - ${v.file}:${v.line} :: ${v.code}`);
    } else {
      console.log('✔ SSR random 검사 통과 (위반 없음)');
    }
  }
  if (all.length) process.exit(1);
}

main().catch(e => { console.error('[error] random 검사 실패:', e); process.exit(2); });
