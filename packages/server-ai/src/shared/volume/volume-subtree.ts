import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { normalizeUploadedFileName } from '@xpert-ai/server-common'
import { BadRequestException } from '@nestjs/common'
import fsPromises from 'fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'path'
import { extractOfficePreviewText, getMediaTypeWithCharset, listFiles } from '../utils'
import { VolumeHandle } from './volume'

const EDITABLE_SUBTREE_EXTENSIONS = new Set([
    'md',
    'mdx',
    'txt',
    'js',
    'jsx',
    'ts',
    'tsx',
    'json',
    'yml',
    'yaml',
    'py',
    'sh',
    'html',
    'css',
    'xml',
    'env'
])

type TVolumeSubtreeOptions = {
    allowRootWorkspace?: boolean
}

export class VolumeSubtreeClient {
    constructor(
        private readonly volume: VolumeHandle,
        private readonly options?: TVolumeSubtreeOptions
    ) {}

    async list(scopePath: string, params?: { path?: string; deepth?: number }): Promise<TFileDirectory[]> {
        const subtreeRoot = this.resolveSubtreeRoot(scopePath)
        const relativePath = this.resolveSubtreeRelativePath(subtreeRoot, params?.path)
        const baseUrl = this.volume.publicUrl(normalizeSubtreePath(scopePath))
        const files = await listFiles(relativePath || '/', params?.deepth ?? 1, 0, {
            root: subtreeRoot,
            baseUrl
        })

        return files ?? []
    }

    async readFile(scopePath: string, filePath: string): Promise<TFile> {
        const subtreeRoot = this.resolveSubtreeRoot(scopePath)
        const relativePath = this.resolveSubtreeRelativePath(subtreeRoot, filePath)
        if (!relativePath) {
            throw new BadRequestException('File path is required')
        }

        const absolutePath = resolve(subtreeRoot, relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException('Conversation file not found')
        }

        const buffer = await fsPromises.readFile(absolutePath)
        const subtreePrefix = normalizeSubtreePath(scopePath)
        const publicPath = [subtreePrefix, relativePath].filter(Boolean).join('/')

        return {
            filePath: relativePath,
            fileType: getSubtreeFileExtension(relativePath) || 'text',
            mimeType: getMediaTypeWithCharset(relativePath),
            contents: isBinaryBuffer(buffer) ? undefined : buffer.toString('utf8'),
            previewText: isBinaryBuffer(buffer) ? await extractOfficePreviewText(relativePath, buffer) : undefined,
            size: stat.size,
            createdAt: stat.mtime,
            fileUrl: this.volume.publicUrl(publicPath),
            url: this.volume.publicUrl(publicPath)
        }
    }

    async saveFile(scopePath: string, filePath: string, content: string): Promise<TFile> {
        const subtreeRoot = this.resolveSubtreeRoot(scopePath)
        const relativePath = this.resolveSubtreeRelativePath(subtreeRoot, filePath)
        if (!relativePath) {
            throw new BadRequestException('File path is required')
        }
        if (!isEditableSubtreeFile(relativePath)) {
            throw new BadRequestException('This file type cannot be edited')
        }

        const absolutePath = resolve(subtreeRoot, relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException('Conversation file not found')
        }

        const existingBuffer = await fsPromises.readFile(absolutePath)
        if (isBinaryBuffer(existingBuffer)) {
            throw new BadRequestException('This file type cannot be edited')
        }

        await fsPromises.writeFile(absolutePath, content ?? '', 'utf8')
        return this.readFile(scopePath, relativePath)
    }

    async uploadFile(
        scopePath: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const subtreeRoot = this.resolveSubtreeRoot(scopePath)
        const relativeFolderPath = this.resolveSubtreeRelativePath(subtreeRoot, folderPath)
        let fileName = ''
        try {
            fileName = normalizeUploadedFileName(file.originalname)
        } catch {
            throw new BadRequestException('File name is required')
        }

        const relativeFilePath = [relativeFolderPath, fileName].filter(Boolean).join('/')
        const absoluteFilePath = resolve(subtreeRoot, relativeFilePath)
        const resolvedRelativePath = relative(subtreeRoot, absoluteFilePath)
        if (resolvedRelativePath.startsWith('..') || isAbsolute(resolvedRelativePath)) {
            throw new BadRequestException('Invalid conversation file path')
        }

        await fsPromises.mkdir(dirname(absoluteFilePath), { recursive: true })
        await fsPromises.writeFile(absoluteFilePath, file.buffer)
        return this.readFile(scopePath, resolvedRelativePath.replace(/\\/g, '/'))
    }

    async deleteFile(scopePath: string, filePath: string): Promise<void> {
        const subtreeRoot = this.resolveSubtreeRoot(scopePath)
        const relativePath = this.resolveSubtreeRelativePath(subtreeRoot, filePath)
        if (!relativePath) {
            throw new BadRequestException('File path is required')
        }

        const absolutePath = resolve(subtreeRoot, relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException('Conversation file not found')
        }

        await fsPromises.unlink(absolutePath)
    }

    private resolveSubtreeRoot(scopePath: string) {
        const normalizedScopePath = normalizeSubtreePath(scopePath)
        if (!normalizedScopePath && !this.options?.allowRootWorkspace) {
            throw new BadRequestException('Workspace path is required')
        }

        const volumeRoot = this.volume.path()
        const subtreeRoot = normalizedScopePath ? resolve(volumeRoot, normalizedScopePath) : volumeRoot
        const relativeToVolume = relative(volumeRoot, subtreeRoot)
        if (relativeToVolume.startsWith('..') || isAbsolute(relativeToVolume)) {
            throw new BadRequestException('Invalid workspace path')
        }

        return subtreeRoot
    }

    private resolveSubtreeRelativePath(subtreeRoot: string, filePath?: string | null) {
        const normalizedPath = normalizeSubtreePath(filePath)
        if (!normalizedPath) {
            return ''
        }

        const absolutePath = resolve(subtreeRoot, normalizedPath)
        const relativePath = relative(subtreeRoot, absolutePath)
        if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            throw new BadRequestException('Invalid conversation file path')
        }

        return relativePath.replace(/\\/g, '/')
    }
}

function normalizeSubtreePath(filePath?: string | null) {
    return (filePath ?? '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.\//, '')
}

function isEditableSubtreeFile(filePath: string) {
    return EDITABLE_SUBTREE_EXTENSIONS.has(getSubtreeFileExtension(filePath))
}

function isBinaryBuffer(buffer: Buffer) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8000))
    for (const value of sample) {
        if (value === 0) {
            return true
        }
    }

    return false
}

function getSubtreeFileExtension(filePath: string) {
    const fileName = basename(filePath).toLowerCase()
    if (fileName.startsWith('.') && fileName.indexOf('.', 1) === -1) {
        return fileName.slice(1)
    }

    const parts = fileName.split('.')
    return parts.length > 1 ? parts.pop() ?? '' : ''
}
