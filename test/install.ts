/**
 * ao install 核心逻辑测试：collectRoleFiles（识别真角色、跳过非角色/示例）+ installRoles（写入目标）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectRoleFiles, installRoles, INSTALL_TARGETS } from '../src/cli/install.js';

let passed = 0, failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`); failed++; }
}
function assert(c: boolean, m: string): void { if (!c) throw new Error(m); }

console.log('\n─── ao install 核心 ───');

// 造一个临时角色库：engineering/ 2 个真角色 + 1 个无 frontmatter 的 + README + examples/
const src = mkdtempSync(join(tmpdir(), 'ao-install-src-'));
mkdirSync(join(src, 'engineering'), { recursive: true });
mkdirSync(join(src, 'design'), { recursive: true });
mkdirSync(join(src, 'examples'), { recursive: true });
const role = (name: string) => `---\nname: ${name}\ndescription: 测试角色 ${name}\n---\n\n你是 ${name}。`;
writeFileSync(join(src, 'engineering', 'coder.md'), role('Coder'));
writeFileSync(join(src, 'engineering', 'reviewer.md'), role('Reviewer'));
writeFileSync(join(src, 'engineering', 'notes.md'), '# 没有 frontmatter 的普通文档');
writeFileSync(join(src, 'design', 'ux.md'), role('UX'));
writeFileSync(join(src, 'README.md'), '# 角色库');
writeFileSync(join(src, 'examples', 'demo.md'), role('Demo')); // examples 应被跳过

test('collectRoleFiles 只收真角色，跳过 README/无 frontmatter/examples', () => {
  const roles = collectRoleFiles(src);
  const paths = roles.map((r) => r.rolePath).sort();
  assert(paths.length === 3, `应 3 个角色, 实际 ${paths.length}: ${paths.join(',')}`);
  assert(paths.includes('engineering/coder') && paths.includes('engineering/reviewer') && paths.includes('design/ux'), `路径不对: ${paths.join(',')}`);
  assert(!paths.some((p) => p.includes('notes') || p.includes('demo') || p.includes('README')), '不应含非角色');
});

test('installRoles 写入目标目录(claude-code .md, 文件名 category-id)', () => {
  const dest = mkdtempSync(join(tmpdir(), 'ao-install-dest-'));
  const res = installRoles(src, INSTALL_TARGETS['claude-code'], { home: dest, cwd: dest });
  assert(res.installed === 3, `应装 3 个, 实际 ${res.installed}`);
  const agentsDir = join(dest, '.claude', 'agents');
  const files = readdirSync(agentsDir).sort();
  assert(files.includes('engineering-coder.md') && files.includes('design-ux.md'), `文件名不对: ${files.join(',')}`);
  rmSync(dest, { recursive: true, force: true });
});

test('cursor 目标用 .mdc 扩展名 + 项目级目录', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ao-install-proj-'));
  const res = installRoles(src, INSTALL_TARGETS['cursor'], { home: '/nonexistent', cwd });
  const dir = join(cwd, '.cursor', 'rules');
  assert(existsSync(join(dir, 'engineering-coder.mdc')), 'cursor 应写 .mdc');
  assert(res.destDir === dir, `destDir 应是项目级 .cursor/rules, 实际 ${res.destDir}`);
  rmSync(cwd, { recursive: true, force: true });
});

test('--category 过滤 + dry-run 不写文件', () => {
  const dest = mkdtempSync(join(tmpdir(), 'ao-install-dry-'));
  const res = installRoles(src, INSTALL_TARGETS['claude-code'], { home: dest, cwd: dest, category: 'design', dryRun: true });
  assert(res.installed === 1, `design 分类应 1 个, 实际 ${res.installed}`);
  assert(!existsSync(join(dest, '.claude')), 'dry-run 不应写入');
  rmSync(dest, { recursive: true, force: true });
});

rmSync(src, { recursive: true, force: true });

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
