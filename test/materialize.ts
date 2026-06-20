/**
 * materialize 解析器 + 路径安全 单测。
 */
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFileBlocks, safeRelPath, materializeFromResult } from '../src/cli/materialize.js';
import type { WorkflowResult } from '../src/types.js';

let passed = 0, failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`); failed++; }
}
function assert(c: boolean, m: string): void { if (!c) throw new Error(m); }

console.log('\n─── materialize 解析器 ───');

test('### path 标题 + 围栏 → 一个文件', () => {
  const txt = '一些说明\n\n### src/index.ts\n\n```ts\nexport const x = 1;\n```\n';
  const fs = parseFileBlocks(txt);
  assert(fs.length === 1, `应 1 个, 实际 ${fs.length}`);
  assert(fs[0].path === 'src/index.ts', `路径错: ${fs[0].path}`);
  assert(fs[0].content === 'export const x = 1;', `内容错: ${JSON.stringify(fs[0].content)}`);
});

test('多个文件按序解析', () => {
  const txt = '### package.json\n```json\n{"name":"x"}\n```\n### src/a.ts\n```ts\nconst a=1\n```\n';
  const fs = parseFileBlocks(txt);
  assert(fs.length === 2 && fs[0].path === 'package.json' && fs[1].path === 'src/a.ts', `解析错: ${JSON.stringify(fs.map(f=>f.path))}`);
});

test('反引号包裹的标题路径', () => {
  const fs = parseFileBlocks('### `src/b.ts`\n```ts\nconst b=2\n```\n');
  assert(fs.length === 1 && fs[0].path === 'src/b.ts', `应识别反引号路径: ${JSON.stringify(fs)}`);
});

test('围栏信息串 path= 形式', () => {
  const fs = parseFileBlocks('```ts path=src/c.ts\nconst c=3\n```\n');
  assert(fs.length === 1 && fs[0].path === 'src/c.ts', `应识别 path=: ${JSON.stringify(fs)}`);
});

test('围栏信息串第一个 token 即路径', () => {
  const fs = parseFileBlocks('```src/d.ts\nconst d=4\n```\n');
  assert(fs.length === 1 && fs[0].path === 'src/d.ts', `应识别裸路径: ${JSON.stringify(fs)}`);
});

test('普通散文前缀的代码块不算文件(无路径)', () => {
  const fs = parseFileBlocks('下面是示例代码：\n```js\nconsole.log(1)\n```\n');
  assert(fs.length === 0, `散文前缀不应被当文件: ${JSON.stringify(fs)}`);
});

test('四反引号外层可包裹含三反引号的文件(README 嵌套围栏)', () => {
  const txt = [
    '### README.md',
    '````markdown',
    '# Demo',
    '```bash',
    'npm start',
    '```',
    '````',
    '### src/a.ts',
    '```ts',
    'const a=1',
    '```',
  ].join('\n');
  const fs = parseFileBlocks(txt);
  assert(fs.length === 2, '应 2 文件(README 不被内层围栏截断), 实际 ' + fs.length + ': ' + fs.map(f => f.path).join(','));
  assert(fs[0].path === 'README.md' && fs[0].content.includes('npm start'), 'README 应含内层代码块完整内容');
  assert(fs[1].path === 'src/a.ts', '后续文件不应丢失');
});

test('CRLF 换行也能正确解析(不被尾随 \\r 破坏)', () => {
  const txt = '### a.ts\r\n```ts\r\nconst a=1\r\n```\r\n';
  const fs = parseFileBlocks(txt);
  assert(fs.length === 1 && fs[0].path === 'a.ts', `CRLF 应正常解析, 实际 ${JSON.stringify(fs)}`);
  assert(fs[0].content.indexOf('\r') === -1, '内容不应残留 \\r');
});

test('同路径后者覆盖前者', () => {
  const fs = parseFileBlocks('### a.ts\n```ts\nold\n```\n### a.ts\n```ts\nnew\n```\n');
  assert(fs.length === 1 && fs[0].content === 'new', `应后者覆盖: ${JSON.stringify(fs)}`);
});

console.log('\n─── 路径安全 ───');
const D = '/tmp/proj';
test('普通相对路径放行', () => assert(safeRelPath('src/x.ts', D) === 'src/x.ts', 'should pass'));
test('停留目录内的 .. 规整放行', () => assert(safeRelPath('a/b/../c.ts', D) === 'a/c.ts', `got ${safeRelPath('a/b/../c.ts', D)}`));
test('绝对路径拒绝', () => assert(safeRelPath('/etc/passwd', D) === null, 'abs should be null'));
test('.. 逃逸拒绝', () => assert(safeRelPath('../escape.ts', D) === null, '.. should be null'));
test('深层 .. 逃逸拒绝', () => assert(safeRelPath('a/../../b.ts', D) === null, 'deep escape should be null'));
test('~ 家目录拒绝', () => assert(safeRelPath('~/x.ts', D) === null, '~ should be null'));
test('Windows 盘符拒绝', () => assert(safeRelPath('C:\\x.ts', D) === null, 'win abs should be null'));
test('Windows 盘符相对(C:foo,无斜杠)也拒绝', () => assert(safeRelPath('C:foo.ts', D) === null, 'drive-relative should be null'));
test('规整后指向根本身(foo/..)拒绝(防 EISDIR)', () => assert(safeRelPath('foo/..', D) === null, '"." should be null'));

console.log('\n─── materializeFromResult ───');
const mkResult = (steps: { id: string; status: string; output?: string }[]) => ({ steps } as unknown as WorkflowResult);

test('从含文件块的步落盘到目标目录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mat-'));
  const r = mkResult([
    { id: 'plan', status: 'completed', output: '计划：先建 package.json' },
    { id: 'build', status: 'completed', output: '### package.json\n```json\n{"name":"x"}\n```\n### src/i.ts\n```ts\nconst i=1\n```' },
  ]);
  const res = materializeFromResult(r, dir);
  assert(res.stepId === 'build', `应取 build 步, 实际 ${res.stepId}`);
  assert(res.files.length === 2, `应写 2 文件, 实际 ${res.files.length}`);
  assert(existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src/i.ts')), '文件应存在');
  assert(readFileSync(join(dir, 'src/i.ts'), 'utf-8').trim() === 'const i=1', '内容应正确');
  rmSync(dir, { recursive: true, force: true });
});

test('收尾步(verify)无文件块时自动回退到 build 步', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mat2-'));
  const r = mkResult([
    { id: 'build', status: 'completed', output: '### a.ts\n```ts\nconst a=1\n```' },
    { id: 'verify', status: 'completed', output: '审查通过，无缺漏。' }, // 最后一步无代码块
  ]);
  const res = materializeFromResult(r, dir);
  assert(res.stepId === 'build', `应回退到 build, 实际 ${res.stepId}`);
  assert(res.files.length === 1 && existsSync(join(dir, 'a.ts')), '应写 a.ts');
  rmSync(dir, { recursive: true, force: true });
});

test('多块的 build 步优先于顺带 1 块的 verify 步(取块最多)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mat5-'));
  const r = mkResult([
    { id: 'build', status: 'completed', output: '### a.ts\n```ts\nA\n```\n### b.ts\n```ts\nB\n```' },
    { id: 'verify', status: 'completed', output: '审查意见……\n### suggested.test.ts\n```ts\nT\n```' },
  ]);
  const res = materializeFromResult(r, dir);
  assert(res.stepId === 'build', `应取块最多的 build, 实际 ${res.stepId}`);
  assert(res.files.length === 2 && !existsSync(join(dir, 'suggested.test.ts')), '只落 build 的文件');
  rmSync(dir, { recursive: true, force: true });
});

test('不安全路径被跳过、不写盘', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mat3-'));
  const r = mkResult([{ id: 'build', status: 'completed', output: '### ../evil.ts\n```ts\nbad\n```\n### ok.ts\n```ts\ngood\n```' }]);
  const res = materializeFromResult(r, dir);
  assert(res.skipped.includes('../evil.ts'), '逃逸路径应被跳过');
  assert(res.files.length === 1 && existsSync(join(dir, 'ok.ts')) && !existsSync(join(dir, '..', 'evil.ts')), '只写安全文件');
  rmSync(dir, { recursive: true, force: true });
});

test('无任何文件块 → stepId null、不写盘', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ao-mat4-'));
  const res = materializeFromResult(mkResult([{ id: 's', status: 'completed', output: '纯文字报告' }]), dir);
  assert(res.stepId === null && res.files.length === 0, '应无落盘');
  rmSync(dir, { recursive: true, force: true });
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
