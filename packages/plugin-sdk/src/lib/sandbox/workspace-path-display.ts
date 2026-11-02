import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Format tool-owned paths only; file contents and backend filesystem authorization stay unchanged. */
export function workspaceRelativeDisplayPath(workingDirectory: string, filePath: string): string {
  if (!workingDirectory || !isAbsolute(workingDirectory)) {
    throw new Error('Sandbox working directory is not available.')
  }
  const value = relative(workingDirectory, resolve(workingDirectory, filePath))
  if (isAbsolute(value) || value === '..' || value.startsWith(`..${sep}`)) {
    throw new Error('Sandbox discovery path is outside the workspace.')
  }
  return value.split(sep).join('/') || '.'
}
