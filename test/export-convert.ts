/**
 * export/convert.ts 测试:真生成各格式并校验。
 * docx/xlsx 是二进制(zip),验魔数 + 读回内容;skill/plan 验包装;表格解析验正确性。
 */
import * as XLSX from 'xlsx';
import { exportMarkdown, extractMarkdownTables, hasPandoc } from '../src/export/convert.js';

let passed = 0, failed = 0;
function assert(c: boolean, m: string): void { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; } }

console.log('\n─── export/convert ───');

const MD = `# 进销存系统报告

## 概述
这是一份多智能体协作生成的报告。

## 模块清单

| 模块 | 负责人 | 状态 |
|------|--------|------|
| 入库 | 后端 | 完成 |
| 出库 | 后端 | 进行中 |

- 要点 A
- 要点 B
`;

console.log(`  (本机 pandoc: ${hasPandoc() ? '有' : '无,走 JS 兜底'})`);

// 表格解析
const tables = extractMarkdownTables(MD);
assert(tables.length === 1, `解析出 1 个表格(${tables.length})`);
assert(tables[0].rows.length === 3, '表格 3 行(表头+2数据)');
assert(tables[0].rows[1][0] === '入库', '表格首数据格=入库');
assert(tables[0].title === '模块清单', '表格标题取上方 heading');

// docx:zip 魔数 PK
const docx = await exportMarkdown(MD, 'docx');
assert(docx.ext === 'docx' && docx.buffer.length > 0, `docx 非空(${docx.engine}, ${docx.buffer.length}B)`);
assert(docx.buffer[0] === 0x50 && docx.buffer[1] === 0x4b, 'docx 是有效 zip(PK 魔数)');

// xlsx:读回验数据
const xlsx = await exportMarkdown(MD, 'xlsx');
assert(xlsx.ext === 'xlsx' && xlsx.buffer[0] === 0x50, 'xlsx 是有效 zip');
const wb = XLSX.read(xlsx.buffer, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
assert(aoa.some((r) => r.includes('入库')), 'xlsx 读回含"入库"');

// skill:frontmatter
const skill = await exportMarkdown(MD, 'skill', { name: '进销存方案', description: '测试' });
const st = skill.buffer.toString('utf-8');
assert(skill.ext === 'md' && /^---\nname:/.test(st) && st.includes('description:'), 'skill 带 frontmatter');

// plan:执行包装
const plan = await exportMarkdown(MD, 'plan');
assert(plan.buffer.toString('utf-8').includes('严格按下面的计划自动执行'), 'plan 含执行指令包装');

// pdf:有 pandoc→pdf,无→html 兜底(都可接受)
const pdf = await exportMarkdown(MD, 'pdf');
assert(['pdf', 'html'].includes(pdf.ext), `pdf 产出 ${pdf.ext}(${pdf.engine})`);

console.log(`\n  结果: ${passed} 通过, ${failed} 失败\n`);
if (failed > 0) process.exit(1);
