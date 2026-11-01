const INDENTATION_SPACES = 2

/**
 * Node.js command template for recursive directory listing with depth control.
 */
export function buildListDirCommand(
  dirPath: string,
  displayPath: string,
  offset: number,
  limit: number,
  depth: number
): string {
  const pathB64 = Buffer.from(dirPath, 'utf-8').toString('base64')
  const displayPathB64 = Buffer.from(displayPath, 'utf-8').toString('base64')
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 1
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 25
  const safeDepth = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 2

  return `node -e "
const fs = require('fs');
const path = require('path');

const dirPath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const displayPath = Buffer.from('${displayPathB64}', 'base64').toString('utf-8');
const offset = ${safeOffset};
const limit = ${safeLimit};
const maxDepth = ${safeDepth};
const INDENTATION_SPACES = ${INDENTATION_SPACES};

if (!path.isAbsolute(dirPath)) {
  console.error('Error: dir_path must be an absolute path');
  process.exit(1);
}

if (!fs.existsSync(dirPath)) {
  console.error('Error: Directory not found');
  process.exit(1);
}

if (!fs.statSync(dirPath).isDirectory()) {
  console.error('Error: Path is not a directory');
  process.exit(1);
}

function collectEntries(currentPath, relativePrefix, remainingDepth, entries) {
  if (remainingDepth === 0) return;

  try {
    const dirEntries = fs.readdirSync(currentPath, { withFileTypes: true });
    const sortedEntries = dirEntries
      .map(entry => {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.join(relativePrefix, entry.name);

        let kind = 'file';
        if (entry.isSymbolicLink()) kind = 'symlink';
        else if (entry.isDirectory()) kind = 'directory';

        return {
          fullPath,
          relativePath,
          kind,
          depth: relativePrefix.split(path.sep).filter(Boolean).length
        };
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const entry of sortedEntries) {
      entries.push(entry);
      if (entry.kind === 'directory' && remainingDepth > 1) {
        collectEntries(entry.fullPath, entry.relativePath, remainingDepth - 1, entries);
      }
    }
  } catch (e) {
    // Skip unreadable directories
  }
}

const allEntries = [];
collectEntries(dirPath, '', maxDepth, allEntries);

if (allEntries.length === 0) {
  console.log('Workspace-relative directory: ' + displayPath);
  console.log('(Empty directory)');
  process.exit(0);
}

const startIndex = offset - 1;
if (startIndex >= allEntries.length) {
  console.error('Error: offset exceeds directory entry count');
  process.exit(1);
}

const endIndex = Math.min(startIndex + limit, allEntries.length);
const selectedEntries = allEntries.slice(startIndex, endIndex);

console.log('Workspace-relative directory: ' + displayPath);

for (const entry of selectedEntries) {
  const indent = ' '.repeat(entry.depth * INDENTATION_SPACES);
  let name = path.posix.join(displayPath, entry.relativePath.split(path.sep).join('/'));
  if (entry.kind === 'directory') name += '/';
  else if (entry.kind === 'symlink') name += '@';
  console.log(indent + name);
}

if (endIndex < allEntries.length) {
  console.log('More than ' + limit + ' entries found');
}
"`
}
