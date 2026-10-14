// 临时校验脚本：把 index.html 里每个 <script> 块抠出来做语法解析（只解析，不执行）
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, n = 0, bad = 0;
while ((m = re.exec(html))) {
  n++;
  const attrs = m[1] || "";
  const code = m[2];
  if (/\bsrc\s*=/.test(attrs)) { console.log(`script #${n} (external, skipped) ${attrs.trim()}`); continue; }
  const startLine = html.slice(0, m.index).split("\n").length;
  try {
    new Function(code);            // 解析即校验，不执行
    console.log(`script #${n} @ line ${startLine}  OK  (${code.length} chars)`);
  } catch (e) {
    bad++;
    console.log(`script #${n} @ line ${startLine}  SYNTAX ERROR: ${e.message}`);
  }
}
console.log(`\n${n} script block(s), ${bad} with syntax errors`);
process.exit(bad ? 1 : 0);
