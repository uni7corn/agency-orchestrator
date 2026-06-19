/**
 * parseInputPairs 测试 —— 尤其是 @file 安全开关（AO_NO_AT_FILE）。
 * 回归：网页 Studio 设置 AO_NO_AT_FILE=1 后，-i k=@/path 不得读取本机文件。
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseInputPairs } from '../src/cli/parse-inputs.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

const fail = (msg: string): never => { throw new Error(msg); };
const argv = (...pairs: string[]) => ['run', 'wf.yaml', ...pairs.flatMap(p => ['-i', p])];

console.log('\n─── parseInputPairs ───');

const dir = mkdtempSync(resolve(tmpdir(), 'ao-parse-inputs-'));
const secretPath = resolve(dir, 'web-keys.json');
const SECRET = '{"deepseek":"sk-SECRET-KEY"}';
writeFileSync(secretPath, SECRET);

delete process.env.AO_NO_AT_FILE;

test('普通 key=value 正常解析', () => {
  const out = parseInputPairs(argv('topic=hello', 'lang=zh'), fail);
  assert(out.topic === 'hello' && out.lang === 'zh', `解析错误: ${JSON.stringify(out)}`);
});

test('value 里含 = 只在第一个 = 处分割', () => {
  const out = parseInputPairs(argv('q=a=b=c'), fail);
  assert(out.q === 'a=b=c', `应保留后续 =，实际: ${out.q}`);
});

test('默认放行 @file：读取文件内容（CLI 行为不变）', () => {
  const out = parseInputPairs(argv(`k=@${secretPath}`), fail);
  assert(out.k === SECRET, `@file 应读取文件内容，实际: ${out.k}`);
});

test('AO_NO_AT_FILE=1 时 @ 按字面处理，不读文件（网页安全开关）', () => {
  process.env.AO_NO_AT_FILE = '1';
  try {
    const out = parseInputPairs(argv(`k=@${secretPath}`), fail);
    assert(out.k === `@${secretPath}`, `应原样保留 @path，实际: ${out.k}`);
    assert(!out.k.includes('SECRET'), `绝不能泄露文件内容！实际: ${out.k}`);
  } finally {
    delete process.env.AO_NO_AT_FILE;
  }
});

test('AO_NO_AT_FILE=1 时不存在的 @path 也不报错（按字面）', () => {
  process.env.AO_NO_AT_FILE = '1';
  try {
    const out = parseInputPairs(argv('k=@/nonexistent/path/x'), fail);
    assert(out.k === '@/nonexistent/path/x', `应原样保留，实际: ${out.k}`);
  } finally {
    delete process.env.AO_NO_AT_FILE;
  }
});

rmSync(dir, { recursive: true, force: true });

console.log('\n' + '='.repeat(50));
console.log(`  parseInputPairs 测试: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`);
if (failed === 0) {
  console.log('  全部通过!');
} else {
  process.exit(1);
}
console.log('='.repeat(50) + '\n');
