import { getErrorMessage } from '@xpert-ai/server-common'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { builtinTemplateFiles, templateDirectories, templateFiles } from '../template.constants'
import { isObjectValue } from './template-config'
export async function assertBuiltinTemplateSource(builtinRoot: string, externalRoot: string) {
    try {
        const stats = await fs.promises.stat(builtinRoot)
        if (!stats.isDirectory()) {
            throw new Error('Expected a directory')
        }
        await fs.promises.access(builtinRoot, fs.constants.R_OK)
    } catch (error) {
        throw new Error(
            `Built-in xpert template source '${builtinRoot}' is unavailable while initializing '${externalRoot}': ${getErrorMessage(error)}`
        )
    }
}

export async function assertBuiltinTemplateLayout(builtinRoot: string, externalRoot: string) {
    for (const fileName of builtinTemplateFiles) {
        await assertPathAvailable(
            path.join(builtinRoot, fileName),
            'file',
            externalRoot,
            'Built-in xpert template file is unavailable'
        )
    }

    for (const directoryName of templateDirectories) {
        await assertPathAvailable(
            path.join(builtinRoot, directoryName),
            'directory',
            externalRoot,
            'Built-in xpert template directory is unavailable'
        )
    }
}

export async function assertExternalTemplateLayout(externalRoot: string) {
    for (const fileName of templateFiles) {
        await assertPathAvailable(
            path.join(externalRoot, fileName),
            'file',
            externalRoot,
            'Required xpert template file is unavailable'
        )
    }

    for (const directoryName of templateDirectories) {
        await assertPathAvailable(
            path.join(externalRoot, directoryName),
            'directory',
            externalRoot,
            'Required xpert template directory is unavailable'
        )
    }
}

export async function assertPathAvailable(
    targetPath: string,
    kind: 'file' | 'directory',
    templateRoot: string,
    message: string
) {
    try {
        const stats = await fs.promises.stat(targetPath)
        if (kind === 'file' && !stats.isFile()) {
            throw new Error('Expected a file')
        }
        if (kind === 'directory' && !stats.isDirectory()) {
            throw new Error('Expected a directory')
        }
        await fs.promises.access(targetPath, fs.constants.R_OK)
    } catch (error) {
        throw new Error(
            `${message} at '${targetPath}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`
        )
    }
}

export async function copyFileIfMissing(sourcePath: string, targetPath: string, templateRoot: string) {
    if (await pathExists(targetPath)) {
        return
    }
    try {
        await fs.promises.copyFile(sourcePath, targetPath)
    } catch (error) {
        throw new Error(
            `Failed to seed xpert template asset from '${sourcePath}' to '${targetPath}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`
        )
    }
}

export async function copyDirectoryContentsIfMissing(
    sourceDirectory: string,
    targetDirectory: string,
    templateRoot: string
) {
    let entries: fs.Dirent[]
    try {
        entries = await fs.promises.readdir(sourceDirectory, { withFileTypes: true })
    } catch (error) {
        throw new Error(
            `Failed to read built-in xpert template directory '${sourceDirectory}' while seeding '${targetDirectory}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`
        )
    }

    for (const entry of entries) {
        const sourcePath = path.join(sourceDirectory, entry.name)
        const targetPath = path.join(targetDirectory, entry.name)

        if (entry.isDirectory()) {
            await fs.promises.mkdir(targetPath, { recursive: true })
            await copyDirectoryContentsIfMissing(sourcePath, targetPath, templateRoot)
            continue
        }

        await copyFileIfMissing(sourcePath, targetPath, templateRoot)
    }
}

export async function pathExists(targetPath: string) {
    try {
        await fs.promises.access(targetPath, fs.constants.F_OK)
        return true
    } catch {
        return false
    }
}

export function isFileNotFoundError(value: unknown) {
    return isObjectValue(value) && Reflect.get(value, 'code') === 'ENOENT'
}

export async function appendDirectoryFingerprint(
    hash: ReturnType<typeof createHash>,
    directoryPath: string,
    relativeDirectory: string
) {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true }).catch(() => [])
    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
        const absolutePath = path.join(directoryPath, entry.name)
        const relativePath = path.posix.join(relativeDirectory.replace(/\\/g, '/'), entry.name)
        if (entry.isDirectory()) {
            hash.update(`dir:${relativePath}`)
            await appendDirectoryFingerprint(hash, absolutePath, relativePath)
            continue
        }
        if (!entry.isFile()) {
            continue
        }

        hash.update(`file:${relativePath}`)
        hash.update(await fs.promises.readFile(absolutePath))
    }
}
