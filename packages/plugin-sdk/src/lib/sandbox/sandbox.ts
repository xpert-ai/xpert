/**
 * BaseSandbox: Abstract base class for sandbox backends with command execution.
 *
 * This class provides default implementations for all SandboxBackendProtocol
 * methods using shell commands executed via execute(). Concrete implementations
 * only need to implement the execute() method.
 *
 * Requires Node.js 20+ on the sandbox host.
 */

import type {
  EditOperation,
  EditResult,
  ExecuteResponse,
  FileDownloadResponse,
  FileInfo,
  FileUploadResponse,
  GrepMatch,
  IndentationOptions,
  MaybePromise,
  MultiEditResult,
  ReadMode,
  SandboxBackendProtocol,
  WriteResult,
} from "./protocol";

const MAX_LINE_LENGTH = 500;
const MAX_GREP_LINE_LENGTH = 2000;
const GREP_RESULT_LIMIT = 100;
const GLOB_RESULT_LIMIT = 100;
const WRITE_EXISTS_OUTPUT = "Error: File already exists";

/**
 * UTF-8 safe Base64 encoding function.
 * Replaces btoa() which only supports Latin1 characters.
 */
function utf8ToBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Format glob results into human-readable output.
 */
function formatGlobOutput(files: FileInfo[], pattern: string): string {
  const limit = GLOB_RESULT_LIMIT;
  const truncated = files.length > limit;
  const finalFiles = truncated ? files.slice(0, limit) : files;

  if (finalFiles.length === 0) {
    return "No files found";
  }

  const lines: string[] = [];
  for (const file of finalFiles) {
    lines.push(file.path);
  }

  if (truncated) {
    lines.push("");
    lines.push("(Results truncated. Consider using a more specific path or pattern.)");
  }

  return lines.join("\n");
}

/**
 * Format grep matches into human-readable output grouped by file.
 */
function formatGrepOutput(matches: GrepMatch[]): string {
  const limit = GREP_RESULT_LIMIT;
  const truncated = matches.length > limit;
  const finalMatches = truncated ? matches.slice(0, limit) : matches;

  if (finalMatches.length === 0) {
    return "No matches found";
  }

  const lines: string[] = [`Found ${finalMatches.length} matches`];
  let currentFile = "";

  for (const match of finalMatches) {
    if (currentFile !== match.path) {
      if (currentFile !== "") {
        lines.push("");
      }
      currentFile = match.path;
      lines.push(`${match.path}:`);
    }
    const text = match.text.length > MAX_GREP_LINE_LENGTH
      ? match.text.substring(0, MAX_GREP_LINE_LENGTH) + "..."
      : match.text;
    lines.push(`  Line ${match.line}: ${text}`);
  }

  if (truncated) {
    lines.push("");
    lines.push("(Results truncated. Consider using a more specific path or pattern.)");
  }

  return lines.join("\n");
}

/**
 * Node.js command template for glob operations.
 * Uses web-standard atob() for base64 decoding.
 */
function buildGlobCommand(searchPath: string, pattern: string): string {
  const pathB64 = utf8ToBase64(searchPath);
  const patternB64 = utf8ToBase64(pattern);

  return `node -e "
const fs = require('fs');
const path = require('path');

const searchPath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const pattern = Buffer.from('${patternB64}', 'base64').toString('utf-8');

function globMatch(relativePath, pattern) {
  const regexPattern = pattern
    .replace(/\\*\\*/g, '<<<GLOBSTAR>>>')
    .replace(/\\*/g, '[^/]*')
    .replace(/\\?/g, '.')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp('^' + regexPattern + '$').test(relativePath);
}

function walkDir(dir, baseDir, results) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        walkDir(fullPath, baseDir, results);
      } else if (globMatch(relativePath, pattern)) {
        const stat = fs.statSync(fullPath);
        console.log(JSON.stringify({
          path: relativePath,
          size: stat.size,
          mtime: stat.mtimeMs,
          isDir: false
        }));
      }
    }
  } catch (e) {
    // Silent failure for non-existent paths
  }
}

try {
  process.chdir(searchPath);
  walkDir('.', '.', []);
} catch (e) {
  // Silent failure for non-existent paths
}
"`;
}

/**
 * Node.js command template for listing directory contents.
 */
function buildLsCommand(dirPath: string): string {
  const pathB64 = utf8ToBase64(dirPath);

  return `node -e "
const fs = require('fs');
const path = require('path');

const dirPath = Buffer.from('${pathB64}', 'base64').toString('utf-8');

try {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const stat = fs.statSync(fullPath);
    console.log(JSON.stringify({
      path: entry.isDirectory() ? fullPath + '/' : fullPath,
      size: stat.size,
      mtime: stat.mtimeMs,
      isDir: entry.isDirectory()
    }));
  }
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}
"`;
}

const INDENTATION_SPACES = 2;
const MAX_ENTRY_LENGTH = 500;

/**
 * Node.js command template for recursive directory listing with depth control.
 */
function buildListDirCommand(
  dirPath: string,
  offset: number,
  limit: number,
  depth: number,
): string {
  const pathB64 = utf8ToBase64(dirPath);
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 25;
  const safeDepth = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 2;

  return `node -e "
const fs = require('fs');
const path = require('path');

const dirPath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const offset = ${safeOffset};
const limit = ${safeLimit};
const maxDepth = ${safeDepth};
const INDENTATION_SPACES = ${INDENTATION_SPACES};
const MAX_ENTRY_LENGTH = ${MAX_ENTRY_LENGTH};

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
        const displayName = entry.name.length > MAX_ENTRY_LENGTH
          ? entry.name.substring(0, MAX_ENTRY_LENGTH)
          : entry.name;

        let kind = 'file';
        if (entry.isSymbolicLink()) kind = 'symlink';
        else if (entry.isDirectory()) kind = 'directory';

        return {
          fullPath,
          relativePath,
          displayName,
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
  console.log('Absolute path: ' + dirPath);
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

console.log('Absolute path: ' + dirPath);

for (const entry of selectedEntries) {
  const indent = ' '.repeat(entry.depth * INDENTATION_SPACES);
  let name = entry.displayName;
  if (entry.kind === 'directory') name += '/';
  else if (entry.kind === 'symlink') name += '@';
  console.log(indent + name);
}

if (endIndex < allEntries.length) {
  console.log('More than ' + limit + ' entries found');
}
"`;
}

const TAB_WIDTH = 4;
const COMMENT_PREFIXES = ['#', '//', '--'];

/**
 * Node.js command template for slice mode reading.
 */
function buildSliceReadCommand(
  filePath: string,
  offset: number,
  limit: number,
): string {
  const pathB64 = utf8ToBase64(filePath);
  const safeOffset =
    Number.isFinite(offset) && offset > 0 ? Math.floor(offset) - 1 : 0;
  const safeLimit =
    Number.isFinite(limit) && limit > 0 && limit < Number.MAX_SAFE_INTEGER
      ? Math.floor(limit)
      : 2000;

  return `node -e "
const fs = require('fs');
const MAX_LINE_LENGTH = ${MAX_LINE_LENGTH};

const filePath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const offset = ${safeOffset};
const limit = ${safeLimit};

if (!fs.existsSync(filePath)) {
  console.log('Error: File not found');
  process.exit(1);
}

const stat = fs.statSync(filePath);
if (stat.size === 0) {
  console.log('System reminder: File exists but has empty contents');
  process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\\n');

if (offset >= lines.length) {
  console.log('Error: offset exceeds file length');
  process.exit(1);
}

const selected = lines.slice(offset, offset + limit);

for (let i = 0; i < selected.length; i++) {
  const lineNum = offset + i + 1;
  let line = selected[i];
  if (line.length > MAX_LINE_LENGTH) {
    line = line.substring(0, MAX_LINE_LENGTH);
  }
  console.log('L' + lineNum + ': ' + line);
}
"`;
}

/**
 * Node.js command template for indentation mode reading.
 */
function buildIndentationReadCommand(
  filePath: string,
  offset: number,
  limit: number,
  options: IndentationOptions,
): string {
  const pathB64 = utf8ToBase64(filePath);
  const safeOffset =
    Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 1;
  const safeLimit =
    Number.isFinite(limit) && limit > 0 && limit < Number.MAX_SAFE_INTEGER
      ? Math.floor(limit)
      : 2000;
  const anchorLine = options.anchor_line ?? safeOffset;
  const maxLevels = options.max_levels ?? 0;
  const includeSiblings = options.include_siblings ?? false;
  const includeHeader = options.include_header ?? true;
  const maxLines = options.max_lines ?? safeLimit;

  return `node -e "
const fs = require('fs');
const MAX_LINE_LENGTH = ${MAX_LINE_LENGTH};
const TAB_WIDTH = ${TAB_WIDTH};
const COMMENT_PREFIXES = ${JSON.stringify(COMMENT_PREFIXES)};

const filePath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const anchorLine = ${anchorLine};
const limit = ${safeLimit};
const maxLevels = ${maxLevels};
const includeSiblings = ${includeSiblings};
const includeHeader = ${includeHeader};
const maxLines = ${maxLines};

if (!fs.existsSync(filePath)) {
  console.log('Error: File not found');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const rawLines = content.split('\\n');

if (rawLines.length === 0 || anchorLine > rawLines.length) {
  console.log('Error: anchor_line exceeds file length');
  process.exit(1);
}

function measureIndent(line) {
  let indent = 0;
  for (const c of line) {
    if (c === ' ') indent++;
    else if (c === '\\t') indent += TAB_WIDTH;
    else break;
  }
  return indent;
}

function isBlank(line) { return line.trim() === ''; }
function isComment(line) { return COMMENT_PREFIXES.some(p => line.trim().startsWith(p)); }
function formatLine(line) { return line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH) : line; }

const records = rawLines.map((raw, i) => ({
  number: i + 1,
  raw,
  display: formatLine(raw),
  indent: measureIndent(raw)
}));

const effectiveIndents = [];
let prevIndent = 0;
for (const r of records) {
  if (isBlank(r.raw)) {
    effectiveIndents.push(prevIndent);
  } else {
    prevIndent = r.indent;
    effectiveIndents.push(prevIndent);
  }
}

const anchorIndex = anchorLine - 1;
const anchorIndent = effectiveIndents[anchorIndex];
const minIndent = maxLevels === 0 ? 0 : Math.max(0, anchorIndent - maxLevels * TAB_WIDTH);
const finalLimit = Math.min(limit, maxLines, records.length);

if (finalLimit === 1) {
  console.log('L' + records[anchorIndex].number + ': ' + records[anchorIndex].display);
  process.exit(0);
}

const out = [records[anchorIndex]];
let i = anchorIndex - 1;
let j = anchorIndex + 1;
let iCounterMinIndent = 0;
let jCounterMinIndent = 0;

while (out.length < finalLimit) {
  let progressed = 0;

  if (i >= 0) {
    if (effectiveIndents[i] >= minIndent) {
      out.unshift(records[i]);
      progressed++;
      const curI = i;
      i--;

      if (effectiveIndents[curI] === minIndent && !includeSiblings) {
        const allowHeaderComment = includeHeader && isComment(records[curI].raw);
        const canTakeLine = allowHeaderComment || iCounterMinIndent === 0;
        if (canTakeLine) {
          iCounterMinIndent++;
        } else {
          out.shift();
          progressed--;
          i = -1;
        }
      }

      if (out.length >= finalLimit) break;
    } else {
      i = -1;
    }
  }

  if (j < records.length) {
    if (effectiveIndents[j] >= minIndent) {
      out.push(records[j]);
      progressed++;
      const curJ = j;
      j++;

      if (effectiveIndents[curJ] === minIndent && !includeSiblings) {
        if (jCounterMinIndent > 0) {
          out.pop();
          progressed--;
          j = records.length;
        }
        jCounterMinIndent++;
      }
    } else {
      j = records.length;
    }
  }

  if (progressed === 0) break;
}

while (out.length > 0 && isBlank(out[0].raw)) out.shift();
while (out.length > 0 && isBlank(out[out.length - 1].raw)) out.pop();

for (const r of out) {
  console.log('L' + r.number + ': ' + r.display);
}
"`;
}

/**
 * Node.js command template for writing files.
 */
function buildWriteCommand(filePath: string, content: string): string {
  const pathB64 = utf8ToBase64(filePath);
  const contentB64 = utf8ToBase64(content);

  return `node -e "
const fs = require('fs');
const path = require('path');

const filePath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const content = Buffer.from('${contentB64}', 'base64').toString('utf-8');

if (fs.existsSync(filePath)) {
  console.error('${WRITE_EXISTS_OUTPUT}');
  process.exit(1);
}

const parentDir = path.dirname(filePath) || '.';
fs.mkdirSync(parentDir, { recursive: true });

fs.writeFileSync(filePath, content, 'utf-8');
console.log('OK');
"`;
}

function buildExistsCommand(filePath: string): string {
  const pathB64 = utf8ToBase64(filePath);
  return `node -e "
const fs = require('fs');
const filePath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
process.exit(fs.existsSync(filePath) ? 0 : 1);
"`;
}

/**
 * Node.js command template for appending to files.
 */
function buildAppendCommand(filePath: string, content: string): string {
  const pathB64 = utf8ToBase64(filePath);
  const contentB64 = utf8ToBase64(content);

  return `node -e "
const fs = require('fs');
const path = require('path');

const filePath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const content = Buffer.from('${contentB64}', 'base64').toString('utf-8');

const parentDir = path.dirname(filePath) || '.';
fs.mkdirSync(parentDir, { recursive: true });

fs.appendFileSync(filePath, content, 'utf-8');
console.log('OK');
"`;
}

/**
 * Node.js command template for editing files.
 */
function buildEditCommand(
  filePath: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): string {
  const pathB64 = utf8ToBase64(filePath);
  const oldB64 = utf8ToBase64(oldStr);
  const newB64 = utf8ToBase64(newStr);

  return `node -e "
const fs = require('fs');

const filePath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const oldStr = Buffer.from('${oldB64}', 'base64').toString('utf-8');
const newStr = Buffer.from('${newB64}', 'base64').toString('utf-8');
const replaceAll = ${Boolean(replaceAll)};

let text;
try {
  text = fs.readFileSync(filePath, 'utf-8');
} catch (e) {
  process.exit(3);
}

const count = text.split(oldStr).length - 1;

if (count === 0) {
  process.exit(1);
}
if (count > 1 && !replaceAll) {
  process.exit(2);
}

const result = text.split(oldStr).join(newStr);
fs.writeFileSync(filePath, result, 'utf-8');
console.log(count);
"`;
}

/**
 * Node.js command template for grep operations.
 */
function buildGrepCommand(
  pattern: string,
  searchPath: string,
  globPattern: string | null,
): string {
  const patternB64 = utf8ToBase64(pattern);
  const pathB64 = utf8ToBase64(searchPath);
  const globB64 = globPattern ? utf8ToBase64(globPattern) : "";

  return `node -e "
const fs = require('fs');
const path = require('path');

const pattern = Buffer.from('${patternB64}', 'base64').toString('utf-8');
const searchPath = Buffer.from('${pathB64}', 'base64').toString('utf-8');
const globPattern = ${globPattern ? `Buffer.from('${globB64}', 'base64').toString('utf-8')` : "null"};

let regex;
try {
  regex = new RegExp(pattern);
} catch (e) {
  console.error('Invalid regex: ' + e.message);
  process.exit(1);
}

function globMatch(filePath, pattern) {
  if (!pattern) return true;
  const regexPattern = pattern
    .replace(/\\*\\*/g, '<<<GLOBSTAR>>>')
    .replace(/\\*/g, '[^/]*')
    .replace(/\\?/g, '.')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp('^' + regexPattern + '$').test(filePath);
}

function walkDir(dir, results) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, results);
      } else {
        const relativePath = path.relative(searchPath, fullPath);
        if (globMatch(relativePath, globPattern)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                console.log(JSON.stringify({
                  path: fullPath,
                  line: i + 1,
                  text: lines[i]
                }));
              }
            }
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    }
  } catch (e) {
    // Skip unreadable directories
  }
}

try {
  walkDir(searchPath, []);
} catch (e) {
  // Silent failure
}
"`;
}

/**
 * Base sandbox implementation with execute() as the only abstract method.
 *
 * This class provides default implementations for all SandboxBackendProtocol
 * methods using shell commands executed via execute(). Concrete implementations
 * only need to implement the execute() method.
 *
 * Requires Node.js 20+ on the sandbox host.
 */
export abstract class BaseSandbox implements SandboxBackendProtocol {
  public workingDirectory: string

  /** Unique identifier for the sandbox backend */
  abstract readonly id: string;

  /**
   * Execute a command in the sandbox.
   * This is the only method concrete implementations must provide.
   */
  abstract execute(command: string): MaybePromise<ExecuteResponse>;

  /**
   * Upload multiple files to the sandbox.
   * Implementations must support partial success.
   */
  abstract uploadFiles(
    files: Array<[string, Uint8Array]>,
  ): MaybePromise<FileUploadResponse[]>;

  /**
   * Download multiple files from the sandbox.
   * Implementations must support partial success.
   */
  abstract downloadFiles(paths: string[]): MaybePromise<FileDownloadResponse[]>;

  /**
   * List files and directories in the specified directory (non-recursive).
   *
   * @param path - Absolute path to directory
   * @returns List of FileInfo objects for files and directories directly in the directory.
   */
  async lsInfo(path: string): Promise<FileInfo[]> {
    const command = buildLsCommand(path);
    const result = await this.execute(command);

    if (result.exitCode !== 0) {
      return [];
    }

    const infos: FileInfo[] = [];
    const lines = result.output.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        infos.push({
          path: parsed.path,
          is_dir: parsed.isDir,
          size: parsed.size,
          modified_at: parsed.mtime
            ? new Date(parsed.mtime).toISOString()
            : undefined,
        });
      } catch {
        // Skip invalid JSON lines
      }
    }

    return infos;
  }

  /**
   * List directory contents recursively with depth control and pagination.
   *
   * @param dirPath - Absolute path to directory
   * @param offset - 1-indexed entry number to start from (default: 1)
   * @param limit - Maximum number of entries to return (default: 25)
   * @param depth - Maximum depth to traverse (default: 2)
   * @returns Human-readable directory tree with indentation
   */
  async listDir(
    dirPath: string,
    offset: number = 1,
    limit: number = 25,
    depth: number = 2,
  ): Promise<string> {
    if (offset < 1) {
      return "Error: offset must be a 1-indexed entry number";
    }

    if (limit < 1) {
      return "Error: limit must be greater than zero";
    }

    if (depth < 1) {
      return "Error: depth must be greater than zero";
    }

    const command = buildListDirCommand(dirPath, offset, limit, depth);
    const result = await this.execute(command);

    if (result.exitCode !== 0) {
      return result.output || `Error: Failed to list directory '${dirPath}'`;
    }

    return result.output;
  }

  /**
   * Read file content with line numbers.
   *
   * @param filePath - Absolute file path
   * @param offset - Line offset to start reading from (1-indexed)
   * @param limit - Maximum number of lines to read
   * @param mode - Read mode: 'slice' (default) or 'indentation'
   * @param indentation - Configuration for indentation mode
   * @returns Formatted file content with line numbers, or error message
   */
  async read(
    filePath: string,
    offset: number = 1,
    limit: number = 2000,
    mode: ReadMode = 'slice',
    indentation?: IndentationOptions,
  ): Promise<string> {
    const command = mode === 'indentation'
      ? buildIndentationReadCommand(filePath, offset, limit, indentation ?? {})
      : buildSliceReadCommand(filePath, offset, limit);
    const result = await this.execute(command);

    if (result.exitCode !== 0) {
      return result.output || `Error: File '${filePath}' not found`;
    }

    return result.output;
  }

  /**
   * Structured search results or error string for invalid input.
   */
  async grepRaw(
    pattern: string,
    path: string = "/",
    include: string | null = null,
  ): Promise<GrepMatch[] | string> {
    const command = buildGrepCommand(pattern, path, include);
    const result = await this.execute(command);

    if (result.exitCode === 1) {
      // Check if it's a regex error
      if (result.output.includes("Invalid regex:")) {
        return result.output.trim();
      }
    }

    const matches: GrepMatch[] = [];
    const lines = result.output.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        matches.push({
          path: parsed.path,
          line: parsed.line,
          text: parsed.text,
        });
      } catch {
        // Skip invalid JSON lines
      }
    }

    return matches;
  }

  /**
   * Search file contents for a regex pattern, returning human-readable output.
   */
  async grep(
    pattern: string,
    path: string = "/",
    include: string | null = null,
  ): Promise<string> {
    const result = await this.grepRaw(pattern, path, include);

    if (typeof result === "string") {
      return result;
    }

    if (result.length === 0) {
      return "No matches found";
    }

    return formatGrepOutput(result);
  }

  /**
   * Structured glob matching returning FileInfo objects.
   */
  async globInfo(pattern: string, path: string = "/"): Promise<FileInfo[]> {
    const command = buildGlobCommand(path, pattern);
    const result = await this.execute(command);

    const infos: FileInfo[] = [];
    const lines = result.output.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        infos.push({
          path: parsed.path,
          is_dir: parsed.isDir,
          size: parsed.size,
          modified_at: parsed.mtime
            ? new Date(parsed.mtime).toISOString()
            : undefined,
        });
      } catch {
        // Skip invalid JSON lines
      }
    }

    return infos;
  }

  /**
   * Find files matching a glob pattern, returning human-readable output.
   */
  async glob(pattern: string, path: string = "/"): Promise<string> {
    const files = await this.globInfo(pattern, path);

    if (files.length === 0) {
      return "No files found";
    }

    return formatGlobOutput(files, pattern);
  }

  /**
   * Create a new file with content.
   */
  async write(filePath: string, content: string): Promise<WriteResult> {
    const command = buildWriteCommand(filePath, content);
    const result = await this.execute(command);

    if (result.exitCode !== 0) {
      const output = (result.output || "").trim();
      if (output.includes(WRITE_EXISTS_OUTPUT)) {
        return {
          error: `Cannot write to ${filePath} because it already exists. Read and then make an edit, or write to a new path.`,
        };
      }
      const fallback = await this.writeViaUpload(filePath, content);
      if (!fallback.error) {
        return fallback;
      }
      return {
        error: output
          ? `Failed to write file '${filePath}': ${output}`
          : `Failed to write file '${filePath}'.`,
      };
    }

    return { path: filePath, filesUpdate: null };
  }

  private async writeViaUpload(
    filePath: string,
    content: string,
  ): Promise<WriteResult> {
    const existsCheck = await this.execute(buildExistsCommand(filePath));
    if (existsCheck.exitCode === 0) {
      return {
        error: `Cannot write to ${filePath} because it already exists. Read and then make an edit, or write to a new path.`,
      };
    }

    const uploads = await this.uploadFiles([
      [filePath, Buffer.from(content, "utf-8")],
    ]);
    const first = uploads[0];

    if (!first) {
      return { error: `Failed to write file '${filePath}': upload returned no result.` };
    }
    if (first.error) {
      return { error: `Failed to write file '${filePath}': ${first.error}` };
    }

    return { path: filePath, filesUpdate: null };
  }

  /**
   * Append content to a file. Creates the file if it doesn't exist.
   */
  async append(filePath: string, content: string): Promise<WriteResult> {
    const command = buildAppendCommand(filePath, content);
    const result = await this.execute(command);

    if (result.exitCode !== 0) {
      const output = (result.output || "").trim();
      return {
        error: output
          ? `Failed to append to file '${filePath}': ${output}`
          : `Failed to append to file '${filePath}'.`,
      };
    }

    return { path: filePath, filesUpdate: null };
  }

  /**
   * Edit a file by replacing string occurrences.
   */
  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll: boolean = false,
  ): Promise<EditResult> {
    const command = buildEditCommand(
      filePath,
      oldString,
      newString,
      replaceAll,
    );
    const result = await this.execute(command);

    switch (result.exitCode) {
      case 0: {
        const occurrences = parseInt(result.output.trim(), 10) || 1;
        return { path: filePath, filesUpdate: null, occurrences };
      }
      case 1:
        return { error: `String not found in file '${filePath}'` };
      case 2:
        return {
          error: `Multiple occurrences found in '${filePath}'. Use replaceAll=true to replace all.`,
        };
      case 3:
        return { error: `Error: File '${filePath}' not found` };
      default:
        return { error: `Unknown error editing file '${filePath}'` };
    }
  }

  /**
   * Perform multiple sequential edits on a single file.
   * All edits are applied sequentially, with each edit operating on the result of the previous edit.
   * All edits must succeed for the operation to succeed (atomic).
   */
  async multiEdit(
    filePath: string,
    edits: EditOperation[],
  ): Promise<MultiEditResult> {
    if (!edits || edits.length === 0) {
      return {
        error: "No edits provided",
      };
    }

    const results: EditResult[] = [];

    for (const edit of edits) {
      const result = await this.edit(
        filePath,
        edit.oldString,
        edit.newString,
        edit.replaceAll ?? false,
      );

      results.push(result);

      // If any edit fails, return immediately with error
      if (result.error) {
        return {
          error: `Multi-edit failed at edit ${results.length}: ${result.error}`,
          path: filePath,
          filesUpdate: null,
          results,
        };
      }
    }

    // All edits succeeded
    return {
      path: filePath,
      filesUpdate: null,
      results,
    };
  }
}
