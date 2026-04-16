import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import fsPromises from 'fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'path'
import { getMediaTypeWithCharset, listFiles } from '../utils'

const EDITABLE_WORKSPACE_EXTENSIONS = new Set([
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

export interface WorkspaceVolumeAccess {
    getVolumePath(path?: string): string
    getPublicUrl(filePath: string): string
}

type TWorkspaceVolumeOptions = {
    allowRootWorkspace?: boolean
}

export class WorkspaceVolumeClient {
    constructor(
        private readonly access: WorkspaceVolumeAccess,
        private readonly options?: TWorkspaceVolumeOptions
    ) {}

    async list(workspacePath: string, params?: { path?: string; deepth?: number }): Promise<TFileDirectory[]> {
        const workspaceRoot = this.resolveWorkspaceRoot(workspacePath)
        const relativePath = this.resolveWorkspaceRelativePath(workspaceRoot, params?.path)
        const baseUrl = this.access.getPublicUrl(normalizeWorkspacePath(workspacePath))

        const files = await listFiles(relativePath || '/', params?.deepth ?? 1, 0, {
            root: workspaceRoot,
            baseUrl
        })

        return files ?? []
    }

    async readFile(workspacePath: string, filePath: string): Promise<TFile> {
        const workspaceRoot = this.resolveWorkspaceRoot(workspacePath)
        const relativePath = this.resolveWorkspaceRelativePath(workspaceRoot, filePath)
        if (!relativePath) {
            throw new BadRequestException('File path is required')
        }

        const absolutePath = resolve(workspaceRoot, relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException('Conversation file not found')
        }

        const buffer = await fsPromises.readFile(absolutePath)
        const workspacePrefix = normalizeWorkspacePath(workspacePath)
        const publicPath = [workspacePrefix, relativePath].filter(Boolean).join('/')

        return {
            filePath: relativePath,
            fileType: getWorkspaceFileExtension(relativePath) || 'text',
            mimeType: getMediaTypeWithCharset(relativePath),
            contents: isBinaryBuffer(buffer) ? undefined : buffer.toString('utf8'),
            size: stat.size,
            createdAt: stat.mtime,
            fileUrl: this.access.getPublicUrl(publicPath),
            url: this.access.getPublicUrl(publicPath)
        }
    }

    async saveFile(workspacePath: string, filePath: string, content: string): Promise<TFile> {
        const workspaceRoot = this.resolveWorkspaceRoot(workspacePath)
        const relativePath = this.resolveWorkspaceRelativePath(workspaceRoot, filePath)
        if (!relativePath) {
            throw new BadRequestException('File path is required')
        }
        if (!isEditableWorkspaceFile(relativePath)) {
            throw new BadRequestException('This file type cannot be edited')
        }

        const absolutePath = resolve(workspaceRoot, relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException('Conversation file not found')
        }

        const existingBuffer = await fsPromises.readFile(absolutePath)
        if (isBinaryBuffer(existingBuffer)) {
            throw new BadRequestException('This file type cannot be edited')
        }

        await fsPromises.writeFile(absolutePath, content ?? '', 'utf8')
        return this.readFile(workspacePath, relativePath)
    }

    async uploadFile(
        workspacePath: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const workspaceRoot = this.resolveWorkspaceRoot(workspacePath)
        const relativeFolderPath = this.resolveWorkspaceRelativePath(workspaceRoot, folderPath)
        const fileName = basename(file.originalname || '')
        if (!fileName) {
            throw new BadRequestException('File name is required')
        }

        const relativeFilePath = [relativeFolderPath, fileName].filter(Boolean).join('/')
        const absoluteFilePath = resolve(workspaceRoot, relativeFilePath)
        const resolvedRelativePath = relative(workspaceRoot, absoluteFilePath)
        if (resolvedRelativePath.startsWith('..') || isAbsolute(resolvedRelativePath)) {
            throw new BadRequestException('Invalid conversation file path')
        }

        await fsPromises.mkdir(dirname(absoluteFilePath), { recursive: true })
        await fsPromises.writeFile(absoluteFilePath, file.buffer)
        return this.readFile(workspacePath, resolvedRelativePath.replace(/\\/g, '/'))
    }

    async deleteFile(workspacePath: string, filePath: string): Promise<void> {
        const workspaceRoot = this.resolveWorkspaceRoot(workspacePath)
        const relativePath = this.resolveWorkspaceRelativePath(workspaceRoot, filePath)
        if (!relativePath) {
            throw new BadRequestException('File path is required')
        }

        const absolutePath = resolve(workspaceRoot, relativePath)
        const stat = await fsPromises.stat(absolutePath).catch(() => null)
        if (!stat?.isFile()) {
            throw new BadRequestException('Conversation file not found')
        }

        await fsPromises.unlink(absolutePath)
    }

    private resolveWorkspaceRoot(workspacePath: string) {
        const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
        if (!normalizedWorkspacePath && !this.options?.allowRootWorkspace) {
            throw new BadRequestException('Workspace path is required')
        }

        const volumePath = this.access.getVolumePath()
        const workspaceRoot = normalizedWorkspacePath ? resolve(volumePath, normalizedWorkspacePath) : volumePath
        const relativeToVolume = relative(volumePath, workspaceRoot)
        if (relativeToVolume.startsWith('..') || isAbsolute(relativeToVolume)) {
            throw new BadRequestException('Invalid workspace path')
        }

        return workspaceRoot
    }

    private resolveWorkspaceRelativePath(workspaceRoot: string, filePath?: string | null) {
        const normalizedPath = normalizeWorkspacePath(filePath)
        if (!normalizedPath) {
            return ''
        }

        const absolutePath = resolve(workspaceRoot, normalizedPath)
        const relativePath = relative(workspaceRoot, absolutePath)
        if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            throw new BadRequestException('Invalid conversation file path')
        }

        return relativePath.replace(/\\/g, '/')
    }
}

function normalizeWorkspacePath(filePath?: string | null) {
    return (filePath ?? '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.\//, '')
}

function isEditableWorkspaceFile(filePath: string) {
    return EDITABLE_WORKSPACE_EXTENSIONS.has(getWorkspaceFileExtension(filePath))
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

function getWorkspaceFileExtension(filePath: string) {
    const fileName = basename(filePath).toLowerCase()
    if (fileName.startsWith('.') && fileName.indexOf('.', 1) === -1) {
        return fileName.slice(1)
    }

    const parts = fileName.split('.')
    return parts.length > 1 ? parts.pop() ?? '' : ''
}
