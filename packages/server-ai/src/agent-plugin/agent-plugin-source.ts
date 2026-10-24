import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute, dirname } from 'node:path'
import unzipper from 'unzipper'
import { containedPath } from './agent-plugin-parser'

const exec = promisify(execFile)
const MAX_BYTES = 100 * 1024 * 1024
const MAX_FILES = 10000

export async function extractPortableZip(buffer: Buffer, destination: string) {
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Plugin ZIP exceeds size limit')
    const archive = await unzipper.Open.buffer(buffer)
    if (archive.files.length > MAX_FILES) throw new Error('Plugin ZIP has too many entries')
    let total = 0
    const seen = new Set<string>()
    for (const file of archive.files) {
        const target = resolve(destination, file.path)
        const path = relative(destination, target)
        if (
            !path ||
            path === '..' ||
            path.startsWith('../') ||
            isAbsolute(path) ||
            isAbsolute(file.path) ||
            file.path.includes('\\') ||
            seen.has(path)
        )
            throw new Error('Unsafe or duplicate ZIP entry')
        seen.add(path)
        if (((file.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
            throw new Error('ZIP symlinks are not supported')
        total += file.uncompressedSize
        if (total > MAX_BYTES) throw new Error('Extracted plugin exceeds size limit')
        if (file.type === 'Directory') await mkdir(target, { recursive: true })
        else {
            await mkdir(dirname(target), { recursive: true })
            const chunks: Buffer[] = []
            let expanded = 0
            const stream = file.stream()
            for await (const chunk of stream) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
                expanded += bytes.length
                if (expanded > file.uncompressedSize || expanded > MAX_BYTES) {
                    stream.destroy()
                    throw new Error('ZIP entry exceeds its declared size')
                }
                chunks.push(bytes)
            }
            const data = Buffer.concat(chunks)
            if (data.length !== file.uncompressedSize) throw new Error('Invalid ZIP entry size')
            await writeFile(target, data, { flag: 'wx' })
        }
    }
}

export async function stagePortableGit(url: string, ref: string, subdirectory = '.') {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
        throw new Error('Use an HTTPS Git URL without embedded credentials')
    if (!ref || ref.startsWith('-') || /[\r\n\0]/.test(ref)) throw new Error('A valid Git ref is required')
    const temp = await mkdtemp(join(tmpdir(), 'agent-plugin-git-'))
    const options = {
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
    }
    try {
        await exec('git', ['init', temp], options)
        await exec(
            'git',
            [
                '-C',
                temp,
                '-c',
                'protocol.file.allow=never',
                '-c',
                'core.hooksPath=/dev/null',
                'fetch',
                '--depth=1',
                '--',
                url,
                ref
            ],
            options
        )
        const { stdout } = await exec('git', ['-C', temp, 'rev-parse', 'FETCH_HEAD'], options)
        await exec('git', ['-C', temp, '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', 'FETCH_HEAD'], options)
        const root = await containedPath(temp, subdirectory)
        return { temp, root, commit: stdout.trim() }
    } catch (error) {
        await rm(temp, { recursive: true, force: true })
        throw error
    }
}

export { portablePackageDigest, copyPortablePackage } from './portable-package-files'
