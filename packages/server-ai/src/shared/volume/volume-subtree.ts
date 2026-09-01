import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { normalizeUploadedFileName } from '@xpert-ai/server-common'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { constants as fsConstants } from 'fs'
import fsPromises, { type FileHandle } from 'fs/promises'
import { t } from 'i18next'
import { basename, isAbsolute, relative, resolve } from 'path'
import { extractOfficePreviewText, getMediaTypeWithCharset } from '../utils'
import { isProjectGovernedContentPath } from './project-content-path'
import { listVolumeFiles, VolumeHandle } from './volume'

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

export type TVolumeSubtreeDownloadTarget =
    | {
          absolutePath: string
          fileHandle: FileHandle
          fileName: string
          mimeType: string
          type: 'file'
      }
    | {
          directoryHandle: FileHandle
          entries: AsyncGenerator<TVolumeSubtreeArchiveEntry>
          fileName: string
          mimeType: string
          type: 'directory'
      }

export type TVolumeSubtreeArchiveEntry =
    | { archivePath: string; type: 'directory' }
    | { archivePath: string; fileHandle: FileHandle; type: 'file' }

export class VolumeSubtreeClient {
    constructor(
        private readonly volume: VolumeHandle,
        private readonly options?: TVolumeSubtreeOptions
    ) {}

    async list(scopePath: string, params?: { path?: string; deepth?: number }): Promise<TFileDirectory[]> {
        const subtreeRoot = await this.openSubtreeRoot(scopePath)
        try {
            const relativePath = this.resolveSubtreeRelativePath(subtreeRoot.filePath, params?.path)
            const baseUrl = this.volume.publicUrl(normalizeSubtreePath(scopePath))
            const files = await listVolumeFiles(subtreeRoot.descriptorPath, relativePath, {
                boundaryRoot: this.volume.serverRoot,
                baseUrl,
                depth: params?.deepth ?? 1
            })

            return this.exposesDirectFileUrls() ? files : omitDirectFileUrls(files)
        } finally {
            await subtreeRoot.fileHandle.close()
        }
    }

    async readFile(scopePath: string, filePath: string, options?: { metadataOnly?: boolean }): Promise<TFile> {
        const { openedFile, relativePath } = await this.openSubtreeFile(scopePath, filePath)
        try {
            const stat = openedFile.fileStat
            const subtreePrefix = normalizeSubtreePath(scopePath)
            const publicPath = [subtreePrefix, relativePath].filter(Boolean).join('/')
            const publicUrl = this.exposesDirectFileUrls() ? this.volume.publicUrl(publicPath) : undefined
            const metadata: TFile = {
                filePath: relativePath,
                fileType: getSubtreeFileExtension(relativePath) || 'text',
                mimeType: getMediaTypeWithCharset(relativePath),
                size: stat.size,
                createdAt: stat.mtime,
                updatedAt: stat.mtime,
                ...(publicUrl ? { fileUrl: publicUrl, url: publicUrl } : {})
            }
            if (options?.metadataOnly) {
                return metadata
            }

            const buffer = await openedFile.fileHandle.readFile()
            const binary = isBinaryBuffer(buffer)
            return {
                ...metadata,
                contents: binary ? undefined : buffer.toString('utf8'),
                previewText: binary ? await extractOfficePreviewText(relativePath, buffer) : undefined
            }
        } finally {
            await openedFile.fileHandle.close()
        }
    }

    async readBuffer(scopePath: string, filePath: string): Promise<Buffer> {
        const { openedFile } = await this.openSubtreeFile(scopePath, filePath)
        try {
            return await openedFile.fileHandle.readFile()
        } finally {
            await openedFile.fileHandle.close()
        }
    }

    async getDownloadTarget(scopePath: string, filePath: string): Promise<TVolumeSubtreeDownloadTarget> {
        const { openedFile, relativePath } = await this.openSubtreeEntry(scopePath, filePath)
        const stat = openedFile.fileStat

        if (stat.isDirectory()) {
            return {
                directoryHandle: openedFile.fileHandle,
                entries: this.iterateArchiveEntries(openedFile),
                fileName: `${basename(relativePath)}.zip`,
                mimeType: 'application/zip',
                type: 'directory'
            }
        }

        if (!stat.isFile()) {
            await openedFile.fileHandle.close()
            throw new BadRequestException('Conversation file not found')
        }

        return {
            absolutePath: openedFile.descriptorPath,
            fileHandle: openedFile.fileHandle,
            fileName: basename(relativePath),
            mimeType: getMediaTypeWithCharset(relativePath),
            type: 'file'
        }
    }

    async saveFile(scopePath: string, filePath: string, content: string): Promise<TFile> {
        const { openedFile, relativePath } = await this.openSubtreeFile(scopePath, filePath, fsConstants.O_RDWR)
        try {
            this.assertMutationAllowed(openedFile.volumeRelativePath, openedFile.fileStat)
            if (!isEditableSubtreeFile(relativePath)) {
                throw new BadRequestException(
                    t('server-ai:Error.VolumeSubtreeFileTypeNotEditable', {
                        defaultValue: 'This file type cannot be edited'
                    })
                )
            }
            const existingBuffer = await openedFile.fileHandle.readFile()
            if (isBinaryBuffer(existingBuffer)) {
                throw new BadRequestException(
                    t('server-ai:Error.VolumeSubtreeFileTypeNotEditable', {
                        defaultValue: 'This file type cannot be edited'
                    })
                )
            }

            const nextBuffer = Buffer.from(content ?? '', 'utf8')
            await openedFile.fileHandle.truncate(0)
            let offset = 0
            while (offset < nextBuffer.length) {
                const { bytesWritten } = await openedFile.fileHandle.write(
                    nextBuffer,
                    offset,
                    nextBuffer.length - offset,
                    offset
                )
                offset += bytesWritten
            }
        } finally {
            await openedFile.fileHandle.close()
        }
        return this.readFile(scopePath, relativePath)
    }

    async uploadFile(
        scopePath: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const subtreeRoot = await this.openSubtreeRoot(scopePath)
        let relativeFilePath: string
        try {
            const relativeFolderPath = this.resolveSubtreeRelativePath(subtreeRoot.filePath, folderPath)
            let fileName = ''
            try {
                fileName = normalizeUploadedFileName(file.originalname)
            } catch {
                throw new BadRequestException(
                    t('server-ai:Error.VolumeSubtreeFileNameRequired', { defaultValue: 'File name is required' })
                )
            }

            relativeFilePath = [relativeFolderPath, fileName].filter(Boolean).join('/')
            await VolumeHandle.writeFile(subtreeRoot.descriptorPath, relativeFilePath, file.buffer, {
                boundaryRoot: this.volume.serverRoot,
                assertCanWrite: (canonicalRelativePath, fileStat) =>
                    this.assertMutationAllowed(canonicalRelativePath, fileStat)
            })
        } finally {
            await subtreeRoot.fileHandle.close()
        }
        return this.readFile(scopePath, relativeFilePath)
    }

    async deleteFile(scopePath: string, filePath: string): Promise<void> {
        const subtreeRoot = await this.openSubtreeRoot(scopePath)
        try {
            const relativePath = this.resolveSubtreeRelativePath(subtreeRoot.filePath, filePath)
            if (!relativePath) {
                throw new BadRequestException(
                    t('server-ai:Error.VolumeSubtreeFilePathRequired', { defaultValue: 'File path is required' })
                )
            }
            await VolumeHandle.removePath(subtreeRoot.descriptorPath, relativePath, {
                boundaryRoot: this.volume.serverRoot,
                assertCanRemove: (canonicalRelativePath) => this.assertMutationAllowed(canonicalRelativePath)
            })
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof ForbiddenException) {
                throw error
            }
            throw new BadRequestException(
                t('server-ai:Error.VolumeSubtreeEntryNotFound', { defaultValue: 'Conversation file not found' })
            )
        } finally {
            await subtreeRoot.fileHandle.close()
        }
    }

    private async openSubtreeRoot(scopePath: string) {
        const normalizedScopePath = normalizeSubtreePath(scopePath)
        if (!normalizedScopePath && !this.options?.allowRootWorkspace) {
            throw new BadRequestException(
                t('server-ai:Error.VolumeSubtreeWorkspacePathRequired', {
                    defaultValue: 'Workspace path is required'
                })
            )
        }

        try {
            const openedRoot = await VolumeHandle.openExistingFile(this.volume.path(), normalizedScopePath, {
                boundaryRoot: this.volume.path(),
                flags:
                    fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
            })
            if (!openedRoot.fileStat.isDirectory()) {
                await openedRoot.fileHandle.close()
                throw new BadRequestException(
                    t('server-ai:Error.VolumeSubtreeWorkspacePathInvalid', {
                        defaultValue: 'Invalid workspace path'
                    })
                )
            }
            return openedRoot
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error
            }
            throw new BadRequestException(
                t('server-ai:Error.VolumeSubtreeWorkspacePathInvalid', { defaultValue: 'Invalid workspace path' })
            )
        }
    }

    private async openSubtreeEntry(scopePath: string, filePath: string, flags = fsConstants.O_RDONLY) {
        const subtreeRoot = await this.openSubtreeRoot(scopePath)
        try {
            const relativePath = this.resolveSubtreeRelativePath(subtreeRoot.filePath, filePath)
            if (!relativePath) {
                throw new BadRequestException(
                    t('server-ai:Error.VolumeSubtreeFilePathRequired', { defaultValue: 'File path is required' })
                )
            }
            const openedFile = await VolumeHandle.openExistingFile(subtreeRoot.descriptorPath, relativePath, {
                boundaryRoot: this.volume.serverRoot,
                flags
            })
            return { openedFile, relativePath }
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error
            }
            throw new BadRequestException(
                t('server-ai:Error.VolumeSubtreeEntryNotFound', { defaultValue: 'Conversation file not found' })
            )
        } finally {
            await subtreeRoot.fileHandle.close()
        }
    }

    private async openSubtreeFile(scopePath: string, filePath: string, flags = fsConstants.O_RDONLY) {
        const result = await this.openSubtreeEntry(scopePath, filePath, flags)
        if (!result.openedFile.fileStat.isFile()) {
            await result.openedFile.fileHandle.close()
            throw new BadRequestException(
                t('server-ai:Error.VolumeSubtreeEntryNotFound', { defaultValue: 'Conversation file not found' })
            )
        }
        return result
    }

    private async *iterateArchiveEntries(
        openedDirectory: TOpenedSubtreePath,
        prefix = ''
    ): AsyncGenerator<TVolumeSubtreeArchiveEntry> {
        try {
            const entries = await fsPromises.readdir(openedDirectory.descriptorPath, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isSymbolicLink()) {
                    continue
                }

                let openedEntry: TOpenedSubtreePath | null = null
                try {
                    openedEntry = await VolumeHandle.openExistingFile(openedDirectory.descriptorPath, entry.name, {
                        boundaryRoot: this.volume.serverRoot,
                        flags: entry.isDirectory()
                            ? fsConstants.O_RDONLY |
                              (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
                            : fsConstants.O_RDONLY
                    })
                    const archivePath = [prefix, entry.name].filter(Boolean).join('/')
                    if (openedEntry.fileStat.isDirectory()) {
                        yield { archivePath: `${archivePath}/`, type: 'directory' }
                        const childDirectory = openedEntry
                        openedEntry = null
                        yield* this.iterateArchiveEntries(childDirectory, archivePath)
                    } else if (openedEntry.fileStat.isFile()) {
                        yield { archivePath, fileHandle: openedEntry.fileHandle, type: 'file' }
                    }
                } finally {
                    await openedEntry?.fileHandle.close()
                }
            }
        } finally {
            await openedDirectory.fileHandle.close()
        }
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

    private exposesDirectFileUrls() {
        return this.volume.exposesDirectFileUrls()
    }

    private assertMutationAllowed(canonicalRelativePath: string, fileStat?: { nlink: number }) {
        if (fileStat && fileStat.nlink !== 1) {
            throw new ForbiddenException(
                t('server-ai:Error.VolumeSubtreeMultipleLinksForbidden', {
                    defaultValue: 'Files with multiple hard links cannot be changed'
                })
            )
        }
        if (this.volume.scope.catalog === 'projects' && isProjectGovernedContentPath(canonicalRelativePath)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectContentGenericWriteForbidden', {
                    defaultValue: 'Project instructions and skills must be changed from Project configuration'
                })
            )
        }
    }
}

type TOpenedSubtreePath = Awaited<ReturnType<typeof VolumeHandle.openExistingFile>>

function omitDirectFileUrls(files: TFileDirectory[]): TFileDirectory[] {
    return files.map(({ url: _url, fileUrl: _fileUrl, children, ...file }) => ({
        ...file,
        ...(children ? { children: omitDirectFileUrls(children) } : {})
    }))
}

function normalizeSubtreePath(filePath?: string | null) {
    return (filePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
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
    return parts.length > 1 ? (parts.pop() ?? '') : ''
}
