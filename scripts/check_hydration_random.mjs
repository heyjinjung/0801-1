#!/usr/bin/env node
/**
 * SSR Hydration Random 검사 (Node 버전)
 * 규칙:
 * 1. .tsx / .ts / .jsx 파일 스캔 (node_modules, .next, dist, build, coverage, scripts 제외)
 * 2. 'Math.random(' 문자열 존재 시:
 *    - 파일 상단(첫 5개의 non-empty line)에 'use client' 포함 → PASS
 *    - 해당 라인 또는 바로 위 라인에 '@allow-ssr-random' 주석 존재 → PASS
 *    - 그 외 → VIOLATION 기록
 * 3. 위반 존재 시 목록 출력 후 종료 코드 1
 * 4. --json 옵션 시 JSON 출력
 */
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';

const ALLOW_TAG = '@allow-ssr-random';
const CLIENT_DIRECTIVE = 'use client';
const TARGET_EXT = new Set(['.tsx', '.ts', '.jsx']);
const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', 'scripts/__pycache__']);
const pattern = /Math\.random\(/;

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Collect all target files */
async function collectFiles(dir) {
  const out = [];
  async function walk(current) {
    const ents = await fs.readdir(current, { withFileTypes: true });
    for (const ent of ents) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.has(ent.name)) continue;
        // Skip hidden/system dirs optionally
        await walk(full);
      } else {
        const ext = path.extname(ent.name);
        if (!TARGET_EXT.has(ext)) continue;
        // directory ancestry exclusion check
        const parts = full.split(path.sep);
        if (parts.some(p => EXCLUDE_DIRS.has(p))) continue;
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
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    return { rel, error: e.message, violations: [] };
  }
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
    let allow = false;
    if (line.includes(ALLOW_TAG)) allow = true;
    else if (idx > 0 && lines[idx - 1].includes(ALLOW_TAG)) allow = true;
    if (allow) return;
    if (isClient) return; // client component
    violations.push({ file: rel, line: idx + 1, code: line.trim() });
  });
  return { rel, violations };
}

async function main() {
  const files = await collectFiles(repoRoot);
  const allViolations = [];
  for (const f of files) {
    // Skip our own checker files
    if (f.endsWith('check_hydration_random.mjs') || f.endsWith('check_hydration_random.py')) continue;
    const result = await scanFile(f);
    if (result.violations?.length) allViolations.push(...result.violations);
  }
  const isJson = process.argv.includes('--json');
  if (isJson) {
    process.stdout.write(JSON.stringify({ violations: allViolations }, null, 2));
  } else {
    if (allViolations.length) {
      console.error('✖ SSR 위험 Math.random 사용 감지:');
      for (const v of allViolations) {
        console.error(`  - ${v.file}:${v.line} :: ${v.code}`);
      }
    } else {
      console.log('✔ SSR random 검사 통과 (위반 없음)');
    }
  }
  if (allViolations.length) process.exit(1);
}

main().catch(e => {
  console.error('[error] random 검사 실패:', e);
  process.exit(2);
});
