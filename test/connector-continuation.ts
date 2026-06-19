/**
 * OpenAI 兼容连接器 · 续写内容保全（回归）
 * 场景：第 1 轮命中 max_tokens(finish_reason=length) 已生成大量内容 → 触发续写；
 *       第 2 轮服务端 503。修复前：续写循环抛错丢弃已累计内容；
 *       修复后：错误上挂 partialContent，executor 可兜底保留。
 */
import http from 'node:http';
import { OpenAICompatibleConnector } from '../src/connectors/openai-compatible.js';

let passed = 0, failed = 0;
function assert(c: boolean, m: string): void {
  if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; }
}

console.log('\n─── OpenAI 兼容连接器 · 续写内容保全 ───');

const ROUND1 = 'A'.repeat(300);  // > 200，足以触发兜底保留
let reqCount = 0;
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => (b += d));
  req.on('end', () => {
    reqCount++;
    if (reqCount === 1) {
      // 第 1 轮：流式返回 300 字符 + finish_reason=length → 连接器自动续写
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ROUND1 }, finish_reason: 'length' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // 第 2 轮：服务端错误
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('service unavailable');
    }
  });
});

await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
const port = (srv.address() as any).port;

const conn = new OpenAICompatibleConnector({ apiKey: 'k', baseUrl: `http://127.0.0.1:${port}/v1` });

let thrown: any = null;
try {
  await conn.chat('s', 'u', { provider: 'deepseek', model: 'deepseek-chat', max_tokens: 50 });
} catch (e) {
  thrown = e;
}

assert(reqCount === 2, `应发生续写（2 次请求），实际 ${reqCount}`);
assert(thrown !== null, '第 2 轮 503 应最终抛错');
assert(typeof thrown?.partialContent === 'string', '错误应携带 partialContent（修复前会丢失）');
assert(thrown?.partialContent?.includes(ROUND1), `partialContent 应保留第 1 轮已生成内容，实际长度 ${thrown?.partialContent?.length}`);

srv.close();
console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
