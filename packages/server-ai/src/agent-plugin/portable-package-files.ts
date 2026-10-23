// Invariants: missing or unreadable roots never produce a digest. Import may exclude unsafe links; stored packages may not.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile, lstat } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { containedPath, PackagePathEscapeError } from './agent-plugin-path'

const MAX_BYTES = 100 * 1024 * 1024
const MAX_FILES = 10000
export class PortablePackageIntegrityError extends Error {}
export function fileErrorCode(error: unknown): string | undefined {
    return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined
}

/** Walk only contained regular files. Broken/escaping links are isolated like invalid components. */
async function walkPortablePackage(
    root: string,
    file: (path: string, data: Buffer) => Promise<void>,
    skipped?: (path: string) => void
) {
    if (!(await lstat(await containedPath(root, '.'))).isDirectory())
        throw new PortablePackageIntegrityError('Package root is not a directory')
    let bytes = 0
    let count = 0
    const visit = async (path: string, ancestors: Set<string>) => {
        if (++count > MAX_FILES) throw new PortablePackageIntegrityError('Plugin contains too many files')
        let real: string
        try {
            real = await containedPath(root, path)
        } catch (error) {
            // Only intentionally excluded links may be skipped; ordinary I/O failures are fatal.
            if (
                path !== '.' &&
                (error instanceof PackagePathEscapeError ||
                    fileErrorCode(error) === 'ENOENT' ||
                    fileErrorCode(error) === 'ELOOP') &&
                (await lstat(resolve(root, path))).isSymbolicLink()
            ) {
                skipped?.(path)
                return
            }
            throw error
        }
        if (ancestors.has(real)) {
            skipped?.(path)
            return
        }
        const info = await lstat(real)
        if (info.isDirectory()) {
            const next = new Set([...ancestors, real])
            for (const name of (await readdir(real)).sort()) {
                if (name !== '.git') await visit(join(path, name), next)
            }
        } else if (info.isFile()) {
            bytes += info.size
            if (bytes > MAX_BYTES) throw new PortablePackageIntegrityError('Plugin exceeds size limit')
            const data = await readFile(real)
            if (data.length !== info.size) throw new PortablePackageIntegrityError('Plugin changed during import')
            await file(path, data)
        } else {
            skipped?.(path)
        }
    }
    await visit('.', new Set())
}

export async function portablePackageDigest(root: string, strict = false) {
    const digest = createHash('sha256')
    await walkPortablePackage(
        root,
        async (path, data) => {
            digest.update(path).update('\0').update(data).update('\0')
        },
        strict
            ? () => {
                  throw new PortablePackageIntegrityError('Stored package contains an excluded entry')
              }
            : undefined
    )
    return digest.digest('hex')
}

/** Never dereference a link until its real path has passed the package boundary check. */
export async function copyPortablePackage(root: string, destination: string) {
    const skipped: string[] = []
    await walkPortablePackage(
        root,
        async (path, data) => {
            const target = join(destination, path)
            await mkdir(dirname(target), { recursive: true })
            await writeFile(target, data, { flag: 'wx' })
        },
        (path) => skipped.push(path)
    )
    return skipped
}
