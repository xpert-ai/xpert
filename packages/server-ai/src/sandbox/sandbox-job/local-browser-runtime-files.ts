import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { chmod, lstat, mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SandboxRuntimeReadOnlyFile, SandboxRuntimeFileOperationError } from '@xpert-ai/plugin-sdk'
const execFileAsync = promisify(execFile)

/**
 * Development-only copy-on-write mapping. A forced filesystem clone creates a
 * distinct read-only inode without eagerly copying media blocks, so the Action
 * can seek it without learning or mutating the original Workspace file.
 * Production relies on a hardened Provider bind mount instead.
 */
export async function exposeLocalReadOnlyFile(workspaceRoot: string, file: SandboxRuntimeReadOnlyFile): Promise<void> {
    const source = await lstat(file.source.serverPath)
    if (
        !source.isFile() ||
        source.size !== file.source.size ||
        source.mtimeMs !== file.source.mtimeMs ||
        source.dev !== file.source.device ||
        source.ino !== file.source.inode ||
        source.size !== file.size
    ) {
        throw new Error(`Local Browser Runtime read-only input changed: ${file.targetPath}`)
    }
    const target = resolveWorkspaceFile(workspaceRoot, file.targetPath)
    await ensureSafeDirectory(workspaceRoot, path.dirname(target))
    const existing = await lstat(target).catch(() => null)
    if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
        throw invalidPathError('Runtime read-only input target is invalid.')
    }
    if (existing) await unlink(target)
    await cloneLocalFile(file.source.serverPath, target).catch((error) => {
        throw new Error(
            `Local Browser Runtime could not clone read-only input ${file.targetPath}; ` +
                `the Workspace and Job volume must share a clone-capable filesystem: ${error instanceof Error ? error.message : String(error)}`
        )
    })
    await chmod(target, 0o444)
}

async function cloneLocalFile(source: string, target: string): Promise<void> {
    const args =
        process.platform === 'darwin'
            ? ['-c', '--', source, target]
            : process.platform === 'linux'
              ? ['--reflink=always', '--', source, target]
              : null
    if (!args) throw new Error(`copy-on-write file cloning is unsupported on ${process.platform}`)
    await execFileAsync('cp', args, { windowsHide: true })
}

export function validateRunnerCommand(
    argv: readonly string[],
    trustedCommand: readonly string[],
    workspaceRoot: string
): string[] {
    if (argv.length !== trustedCommand.length + 8 || trustedCommand.some((value, index) => argv[index] !== value)) {
        throw new Error('Local Browser Runtime rejected an untrusted Runner command.')
    }
    const args = Array.from(argv.slice(trustedCommand.length))
    const expectedFlags = ['--request', '--output', '--action-root', '--action-manifest']
    for (let index = 0; index < expectedFlags.length; index += 1) {
        const offset = index * 2
        if (args[offset] !== expectedFlags[index] || !args[offset + 1]) {
            throw new Error('Local Browser Runtime rejected malformed Runner arguments.')
        }
        assertWithinWorkspace(workspaceRoot, path.resolve(args[offset + 1]), false)
    }
    return args
}

export function resolveWorkspaceFile(workspaceRoot: string, requestedPath: string): string {
    if (!requestedPath || requestedPath.includes('\0')) throw invalidPathError('Runtime file path is invalid.')
    const target = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(workspaceRoot, requestedPath)
    assertWithinWorkspace(workspaceRoot, target, false)
    return target
}

export function assertWithinWorkspace(workspaceRoot: string, candidate: string, allowRoot: boolean): void {
    const relative = path.relative(path.resolve(workspaceRoot), path.resolve(candidate))
    if (
        (!allowRoot && relative === '') ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw invalidPathError('Runtime path escapes the Job workspace.')
    }
}

export async function ensureSafeDirectory(workspaceRoot: string, directory: string): Promise<void> {
    assertWithinWorkspace(workspaceRoot, directory, true)
    const relative = path.relative(workspaceRoot, directory)
    let current = workspaceRoot
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment)
        await mkdir(current).catch((error) => {
            if (nodeErrorCode(error) !== 'EEXIST') throw error
        })
        const stat = await lstat(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw invalidPathError('Runtime workspace contains an unsafe directory component.')
        }
    }
}

export async function writeRegularFile(target: string, content: Uint8Array): Promise<void> {
    const existing = await lstat(target).catch((error) => {
        if (nodeErrorCode(error) === 'ENOENT') return null
        throw error
    })
    if (existing?.isSymbolicLink() || existing?.isDirectory()) {
        throw invalidPathError('Runtime upload target must be a regular file.')
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    const handle = await open(
        target,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollow,
        0o600
    )
    try {
        await handle.writeFile(content)
    } finally {
        await handle.close()
    }
}

export function fileOperationError(error: unknown): SandboxRuntimeFileOperationError {
    const code = nodeErrorCode(error)
    if (code === 'ENOENT') return 'file_not_found'
    if (code === 'EACCES' || code === 'EPERM') return 'permission_denied'
    if (code === 'EISDIR' || code === 'ENOTDIR') return 'is_directory'
    return 'invalid_path'
}

export function invalidPathError(message: string): Error & { code: 'EINVAL' } {
    return Object.assign(new Error(message), { code: 'EINVAL' as const })
}

export function isDirectoryError(message: string): Error & { code: 'EISDIR' } {
    return Object.assign(new Error(message), { code: 'EISDIR' as const })
}

function nodeErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) return undefined
    return typeof error.code === 'string' ? error.code : undefined
}
