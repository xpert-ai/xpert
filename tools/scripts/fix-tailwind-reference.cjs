const fs = require('fs');
const path = require('path');

const roots = ['apps/cloud/src', 'libs', 'packages'];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      walk(full, acc);
    } else if (entry.name.endsWith('.scss')) {
      acc.push(full);
    }
  }
  return acc;
}

function getInsertionIndex(lines) {
  let index = 0;
  if ((lines[0] || '').trim().startsWith('@charset')) index = 1;

  let inBlockComment = false;
  let lastUse = -1;

  for (let i = index; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }

    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    if (/^@(use|forward)\b/.test(trimmed)) {
      lastUse = i;
      continue;
    }

    break;
  }

  return lastUse >= 0 ? lastUse + 1 : index;
}

let changed = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const files = walk(root);

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const hadApply = /@apply\b/.test(original);

    let lines = original.split('\n');
    lines = lines.filter((line) => !/^\s*@reference\s+"tailwindcss";\s*$/.test(line));

    if (hadApply) {
      const insertAt = getInsertionIndex(lines);
      lines.splice(insertAt, 0, '@reference "tailwindcss";', '');
    }

    const next = lines.join('\n');
    if (next !== original) {
      fs.writeFileSync(file, next);
      changed++;
    }
  }
}

console.log(`fixed-tailwind-reference files=${changed}`);
