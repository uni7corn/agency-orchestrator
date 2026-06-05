/**
 * 动态首次超时测试：按输入规模抬高未显式设置 timeout 的首跑超时。
 */
import { dynamicInitialTimeout, timeoutFailureHint } from '../src/core/executor.js';

let passed = 0, failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`); failed++; }
}
function assert(c: boolean, msg: string): void { if (!c) throw new Error(msg); }

console.log('\n=== dynamicInitialTimeout ===');

const DEF = 120_000; // API 默认

test('小输入 → 维持默认', () => {
  assert(dynamicInitialTimeout(DEF, 300) === DEF, '小输入不该加时');
});

test('每 1K 字符 +8s', () => {
  assert(dynamicInitialTimeout(DEF, 1000) === DEF + 8_000, '1K → +8s');
  assert(dynamicInitialTimeout(DEF, 5000) === DEF + 40_000, '5K → +40s');
});

test('大输入显著抬高（20KB PRD 场景）', () => {
  const t = dynamicInitialTimeout(DEF, 20_000);
  assert(t === DEF + 160_000, `20K → +160s, got ${t}`);
  assert(t > DEF, '应高于默认');
});

test('动态部分有上限 +600s', () => {
  const t = dynamicInitialTimeout(DEF, 10_000_000); // 超大
  assert(t === DEF + 600_000, `应封顶 +600s, got ${t}`);
});

test('timeout:0（不限时）原样返回', () => {
  assert(dynamicInitialTimeout(0, 999_999) === 0, '0 不该被改');
});

test('CLI 默认(600s)同样叠加', () => {
  assert(dynamicInitialTimeout(600_000, 2000) === 600_000 + 16_000, '600s + 2K*8s');
});

test('负 inputChars 不报错也不减时', () => {
  assert(dynamicInitialTimeout(DEF, -50) === DEF, '负数当 0 处理');
});

console.log('\n=== timeoutFailureHint ===');

test('通用 provider：给出增大超时/拆分/换 provider 三条指引', () => {
  const h = timeoutFailureHint('openai');
  assert(h.includes('增大超时') && h.includes('拆分') && h.includes('换'), h);
  assert(!h.includes('DeepSeek'), '非 deepseek 不该带 deepseek 专条');
});

test('deepseek：附带服务端中断专属说明', () => {
  const h = timeoutFailureHint('deepseek');
  assert(h.includes('DeepSeek') && h.includes('流式'), h);
});

console.log('\n' + '='.repeat(50));
console.log(`  Timeout 测试: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`);
if (failed === 0) console.log('  全部通过!');
else process.exit(1);
console.log('='.repeat(50) + '\n');
