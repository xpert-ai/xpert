import { FILE_EDIT_DIFF_SCRIPT } from './file-edit-diff'

/** Compare actual file contents inside the sandbox; reporting must never prevent an edit. */
export function buildEditCommand(filePath: string, oldString: string, newString: string, replaceAll: boolean): string {
  const encoded = Buffer.from(JSON.stringify({ filePath, oldString, newString, replaceAll })).toString('base64')
  const script = `
const fs = require('node:fs');
const input = JSON.parse(Buffer.from('${encoded}', 'base64').toString('utf8'));
const lines = text => text.length ? text.split('\\n').length - Number(text.endsWith('\\n')) : 0;
const metrics = { oldLines: lines(input.oldString), newLines: lines(input.newString) };

${FILE_EDIT_DIFF_SCRIPT}

function unchanged(exitCode) {
  console.log(JSON.stringify({ ...metrics, occurrences: 0, changed: false, diff: { removed: 0, added: 0 } }));
  process.exit(exitCode);
}
let before;
try { before = fs.readFileSync(input.filePath, 'utf8'); } catch { unchanged(3); }
const occurrences = before.split(input.oldString).length - 1;
if (occurrences === 0) unchanged(1);
if (occurrences > 1 && !input.replaceAll) unchanged(2);
const after = before.split(input.oldString).join(input.newString);
const changed = before !== after;
if (changed) fs.writeFileSync(input.filePath, after, 'utf8');
try {
  Object.assign(metrics, inspectLineDiff(before, after));
} catch {
  metrics.diffUnavailable = 'diff_unavailable';
}
console.log(JSON.stringify({ ...metrics, occurrences, changed }));
`
  return `node -e '${script.replace(/'/g, "'\\''")}'`
}
