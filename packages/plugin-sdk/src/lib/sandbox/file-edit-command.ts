import type { EditOperation } from './protocol'
import { FILE_EDIT_DIFF_SCRIPT } from './file-edit-diff'

// The same comparison runs for single and grouped edits. Only values encoded as
// JSON/base64 enter the shell, never literal paths or replacement strings.
function command(filePath: string, edits: EditOperation[], batch: boolean): string {
  const encoded = Buffer.from(JSON.stringify({ filePath, edits, batch })).toString('base64')
  const script = `
const fs = require('node:fs');
const input = JSON.parse(Buffer.from('${encoded}', 'base64').toString('utf8'));
const lines = text => text.length ? text.split('\\n').length - Number(text.endsWith('\\n')) : 0;
${FILE_EDIT_DIFF_SCRIPT}
let source;
try { source = fs.readFileSync(input.filePath, 'utf8'); } catch {}
let content = source;
const steps = [];
for (const edit of input.edits) {
  const metrics = { oldLines: lines(edit.oldString), newLines: lines(edit.newString) };
  const parts = content === undefined ? [] : content.split(edit.oldString);
  const count = parts.length - 1;
  const code = content === undefined ? 3 : count === 0 ? 1 : count > 1 && !edit.replaceAll ? 2 : 0;
  if (code) {
    steps.push({ code, metrics: { ...metrics, occurrences: 0, changed: false, diff: { removed: 0, added: 0 } } });
    break;
  }
  const after = parts.join(edit.newString);
  try { Object.assign(metrics, inspectLineDiff(content, after)); } catch { metrics.diffUnavailable = 'diff_unavailable'; }
  // A direct SDK edit of empty search text in an empty file historically reports one no-op.
  const occurrences = input.batch && count < 0 ? 1 : count;
  steps.push({ code, metrics: { ...metrics, occurrences, changed: content !== after } });
  content = after;
}
// A logical mismatch commits its valid prefix. An I/O failure must never emit
// a successful receipt (or cause the host to replay a possibly committed edit).
if (source !== content) fs.writeFileSync(input.filePath, content, 'utf8');
if (input.batch) console.log(JSON.stringify(steps));
else { console.log(JSON.stringify(steps[0].metrics)); process.exitCode = steps[0].code; }
`
  return `node -e '${script.replace(/'/g, "'\\''")}'`
}

export function buildEditCommand(filePath: string, oldString: string, newString: string, replaceAll: boolean): string {
  return command(filePath, [{ oldString, newString, replaceAll }], false)
}

export function buildBatchEditCommand(filePath: string, edits: EditOperation[]): string {
  return command(filePath, edits, true)
}
