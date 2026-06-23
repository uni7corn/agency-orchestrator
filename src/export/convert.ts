// 把工作流产出的 Markdown 报告转成可用格式。
//   给人:Word(.docx)/ PDF / Excel(.xlsx,从 Markdown 表格抽)
//   给机器:Skill(.md + frontmatter,可复用方法论)/ 可执行计划(plan.md,交 Claude Code 执行)
//
// 设计(对齐 AO「零配置探测」):有 pandoc 就用它出最好看的 docx/pdf(pdf 走 xelatex 排版最佳);
// 没 pandoc 则用纯 JS 兜底(marked + html-to-docx)。Excel 一律用 SheetJS(不依赖 pandoc)。
// n8n 同款思路——转文件是确定性的库调用,不是 LLM。

import { spawnSync } from 'node:child_process';
import { marked } from 'marked';
import * as XLSX from 'xlsx';
import { isOnPath } from '../providers/detect.js';

export type ExportFormat = 'docx' | 'pdf' | 'xlsx' | 'skill' | 'plan';
export interface ExportResult { buffer: Buffer; ext: string; mime: string; engine: string; }

export function hasPandoc(): boolean {
  return isOnPath('pandoc');
}

/** Markdown → HTML(给 docx/pdf 兜底用),套一层基础打印样式。 */
function mdToHtml(md: string, title = 'Report'): string {
  const body = marked.parse(md, { async: false }) as string;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;max-width:820px;margin:24px auto;padding:0 16px;color:#1a1a1a}
h1,h2,h3{line-height:1.3}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px}
pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto}code{font-family:ui-monospace,monospace}
@media print{body{margin:0}}</style></head><body>${body}</body></html>`;
}

/** 用 pandoc 把 markdown 转成指定目标(stdout 二进制)。失败/无 pandoc 返回 null。 */
function pandocConvert(md: string, to: string, extraArgs: string[] = []): Buffer | null {
  if (!hasPandoc()) return null;
  const r = spawnSync('pandoc', ['-f', 'markdown', '-t', to, ...extraArgs], {
    input: md,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout || r.stdout.length === 0) return null;
  return Buffer.from(r.stdout);
}

async function toDocx(md: string): Promise<ExportResult> {
  const viaPandoc = pandocConvert(md, 'docx');
  if (viaPandoc) return { buffer: viaPandoc, ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', engine: 'pandoc' };
  // JS 兜底:marked → html → html-to-docx
  // @ts-expect-error html-to-docx 无类型声明文件
  const HTMLtoDOCX = (await import('html-to-docx')).default as (html: string, header?: string | null, opts?: unknown) => Promise<Buffer | ArrayBuffer>;
  const out = await HTMLtoDOCX(mdToHtml(md), null, { table: { row: { cantSplit: true } } });
  const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
  return { buffer, ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', engine: 'html-to-docx' };
}

function toPdf(md: string): ExportResult {
  // PDF 排版最好看的是 pandoc + xelatex;无 pandoc 时不硬出丑 PDF,改给打印就绪的 HTML(浏览器 Ctrl-P 存 PDF)。
  const viaPandoc = pandocConvert(md, 'pdf', ['--pdf-engine=xelatex', '-V', 'CJKmainfont=PingFang SC']);
  if (viaPandoc) return { buffer: viaPandoc, ext: 'pdf', mime: 'application/pdf', engine: 'pandoc+xelatex' };
  return { buffer: Buffer.from(mdToHtml(md), 'utf-8'), ext: 'html', mime: 'text/html', engine: 'html-fallback' };
}

/** 从 Markdown 里的表格抽成 xlsx(每个表格一个 sheet)。没有表格则把全文放一个 sheet 的首列。 */
function toXlsx(md: string): ExportResult {
  const wb = XLSX.utils.book_new();
  const tables = extractMarkdownTables(md);
  if (tables.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet(md.split('\n').map((line) => [line]));
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
  } else {
    tables.forEach((t, i) => {
      const ws = XLSX.utils.aoa_to_sheet(t.rows);
      XLSX.utils.book_append_sheet(wb, ws, (t.title || `Table${i + 1}`).slice(0, 28));
    });
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { buffer, ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', engine: 'sheetjs' };
}

/** 解析 markdown 表格(连续的 | … | 行),标题取表格上方最近的标题行。 */
export function extractMarkdownTables(md: string): Array<{ title?: string; rows: string[][] }> {
  const lines = md.split('\n');
  const tables: Array<{ title?: string; rows: string[][] }> = [];
  let lastHeading: string | undefined;
  let i = 0;
  const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    const h = line.match(/^#{1,6}\s+(.+)/);
    if (h) { lastHeading = h[1].trim(); i++; continue; }
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    const isSep = i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]);
    if (isRow && isSep) {
      const rows: string[][] = [splitRow(line)];
      i += 2; // 跳过表头 + 分隔行
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      tables.push({ title: lastHeading, rows });
      continue;
    }
    i++;
  }
  return tables;
}

/** 把报告包成可复用 Skill(.md + frontmatter)或可执行计划(交 Claude Code 跑)。 */
function toSkillOrPlan(md: string, format: 'skill' | 'plan', opts?: { name?: string; description?: string }): ExportResult {
  const name = (opts?.name || 'generated-plan').replace(/[^一-鿿a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase();
  const desc = opts?.description || '由 Agency Orchestrator 多智能体协作生成的方法论 / 计划';
  let content: string;
  if (format === 'skill') {
    content = `---\nname: ${name}\ndescription: ${desc}\n---\n\n${md}\n`;
  } else {
    // 可执行计划:给 Claude Code 等编码 agent 的执行说明(把"看的报告"变成"做的指令")
    content = `# 执行计划(由 Agency Orchestrator 生成)\n\n> 你是编码执行 agent。请**严格按下面的计划自动执行直到完成**,对不明确处用合理默认值,不要反问。完成后自检是否满足计划目标。\n\n---\n\n${md}\n`;
  }
  return { buffer: Buffer.from(content, 'utf-8'), ext: 'md', mime: 'text/markdown', engine: 'wrap' };
}

export async function exportMarkdown(md: string, format: ExportFormat, opts?: { name?: string; description?: string }): Promise<ExportResult> {
  switch (format) {
    case 'docx': return toDocx(md);
    case 'pdf': return toPdf(md);
    case 'xlsx': return toXlsx(md);
    case 'skill': return toSkillOrPlan(md, 'skill', opts);
    case 'plan': return toSkillOrPlan(md, 'plan', opts);
    default: throw new Error(`不支持的导出格式: ${format}`);
  }
}
