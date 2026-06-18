import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 解析 `--input key=value` / `-i key=@file` 参数。
 * argv 形如 process.argv.slice(2)（即包含命令与工作流文件，故从下标 2 起扫描）。
 *
 * 安全：`@file` 会读取本机文件作为输入值。网页 Studio 把请求里的 input 原样拼成 `-i k=v`，
 * 若放行 @file，任意 CSRF/同机来源即可用 `@/path` 读取本机文件（如保存的 API key）经 LLM
 * 输出回传。故网页入口设置 `AO_NO_AT_FILE=1` 关闭展开，此时 `@` 值按字面字符串处理。
 *
 * onError 由调用方提供（CLI 走 console.error + process.exit；测试可抛异常）。
 */
export function parseInputPairs(
  argv: string[],
  onError: (msg: string) => never,
): Record<string, string> {
  const allowAtFile = process.env.AO_NO_AT_FILE !== '1';
  const inputs: Record<string, string> = {};

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' || argv[i] === '-i') {
      const pair = argv[++i];
      if (!pair) onError('--input 需要 key=value 参数');
      const eqIdx = pair.indexOf('=');
      if (eqIdx < 1) onError(`无效的 input 格式: ${pair} (应为 key=value)`);

      const key = pair.slice(0, eqIdx);
      let value = pair.slice(eqIdx + 1);

      if (value.startsWith('@') && allowAtFile) {
        const filePath = resolve(value.slice(1));
        try {
          value = readFileSync(filePath, 'utf-8');
        } catch {
          onError(`无法读取文件: ${filePath}`);
        }
      }

      inputs[key] = value;
    }
  }

  return inputs;
}
