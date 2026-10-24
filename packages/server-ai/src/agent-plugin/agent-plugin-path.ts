import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export class PackagePathEscapeError extends Error {
    constructor() {
        super('Package path escapes plugin root')
    }
}

export async function containedPath(root: string, path: string): Promise<string> {
    const [base, target] = await Promise.all([realpath(root), realpath(resolve(root, path))])
    const child = relative(base, target)
    if (isAbsolute(child) || child === '..' || child.startsWith('../')) throw new PackagePathEscapeError()
    return target
}
