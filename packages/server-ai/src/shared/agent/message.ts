import { Document } from '@langchain/core/documents'
import { HumanMessage } from '@langchain/core/messages'
import { _TFile, IStorageFile, IXpert, TXpertAgentOptions } from '@xpert-ai/contracts'
import { FileStorage, GetStorageFileQuery } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { isUUID } from 'class-validator'
import fs from 'fs'
import { get } from 'lodash'
import sharp from 'sharp'
import {
    FileAsset,
    GetFileAssetByStorageFileQuery,
    GetFileAssetQuery,
    GetFilePreviewQuery
} from '../../file-understanding'
import type { FilePreviewResult } from '../../file-understanding'
import { LoadFileCommand } from '../commands'
import { AgentStateAnnotation } from './state'
import { buildReferencedPrompt, normalizeReferences } from './human-input'
import { isPromptWorkflowInvocationCandidate } from './prompt-workflow-invocation'
import { ResolvePromptWorkflowInvocationQuery } from './queries/resolve-prompt-workflow-invocation.query'
import { buildSelectedRuntimeSkillsPrompt } from './runtime-skills-prompt'

type ResolvedFile = _TFile & {
    id?: string
    fileId?: string
    fileAssetId?: string
    storageFileId?: string
    originalName?: string
    mimetype?: string
    size?: number
    fileAsset?: FileAsset
}

type CreateHumanMessageOptions = {
    xpert?: Pick<IXpert, 'id' | 'workspaceId' | 'commandProfile' | 'graph' | 'agent'>
}

const MAX_FILE_PROMPT_SUMMARY_LENGTH = 700
const MAX_FILE_PROMPT_PAGE_IMAGES = 8

// StorageFile remains the object-storage lookup layer; FileAsset carries the
// agent-facing understanding state and workspace path.
async function resolveStorageFile(queryBus: QueryBus, fileId: string): Promise<ResolvedFile | null> {
    const storageFiles = await queryBus.execute(new GetStorageFileQuery([fileId]))
    const storageFile = storageFiles[0] as IStorageFile | undefined
    if (!storageFile) {
        return null
    }

    const provider = new FileStorage().getProvider(storageFile.storageProvider)
    return {
        id: storageFile.id,
        storageFileId: storageFile.id,
        originalName: storageFile.originalName,
        size: storageFile.size,
        filePath: provider.path(storageFile.file),
        fileUrl: provider.url(storageFile.file),
        mimeType: storageFile.mimetype
    }
}

function normalizeLegacyStorageFileId(fileId: string | undefined) {
    return fileId && isUUID(fileId) ? fileId : undefined
}

// Accepts both new AgentFile/FileAsset handles and legacy StorageFile handles,
// resolving them to a single runtime shape before prompt construction.
async function resolveAttachmentFile(queryBus: QueryBus, file: ResolvedFile): Promise<ResolvedFile | null> {
    const explicitAssetId = file.fileAssetId
    const storageFileId = file.storageFileId ?? normalizeLegacyStorageFileId(file.id)
    const fileAsset = explicitAssetId
        ? await queryBus.execute<GetFileAssetQuery, FileAsset | null>(new GetFileAssetQuery(explicitAssetId))
        : storageFileId
          ? await queryBus.execute<GetFileAssetByStorageFileQuery, FileAsset | null>(
                new GetFileAssetByStorageFileQuery(storageFileId)
            )
          : null
    const resolvedStorageFileId = fileAsset?.storageFileId ?? storageFileId
    const resolvedStorageFile = resolvedStorageFileId ? await resolveStorageFile(queryBus, resolvedStorageFileId) : null

    if (resolvedStorageFile) {
        return {
            ...file,
            ...resolvedStorageFile,
            id: resolvedStorageFile.id,
            storageFileId: resolvedStorageFile.storageFileId,
            ...(fileAsset?.id ? { fileId: fileAsset.id, fileAssetId: fileAsset.id } : {}),
            fileAsset
        }
    }

    if (file.filePath || file.fileUrl) {
        return {
            ...file,
            fileAsset: fileAsset ?? file.fileAsset
        }
    }

    return null
}

async function toImageContentPart(
    file: ResolvedFile,
    attachment?: TXpertAgentOptions['attachment'] | TXpertAgentOptions['vision']
) {
    if (file.filePath) {
        const sourceImageData = await fs.promises.readFile(file.filePath)
        const imageData =
            attachment?.resolution === 'low'
                ? await sharp(Buffer.from(sourceImageData)).resize(1024).toBuffer()
                : Buffer.from(sourceImageData)
        return {
            type: 'image_url',
            image_url: {
                url: `data:${file.mimeType};base64,${imageData.toString('base64')}`
            }
        }
    }

    if (!file.fileUrl) {
        throw new Error('Image file path or url is required')
    }

    return {
        type: 'image_url',
        image_url: {
            url: file.fileUrl
        }
    }
}

function dedupeFiles(files: Array<ResolvedFile>) {
    const seen = new Set<string>()
    return files.filter((file) => {
        const key = file.fileAssetId ?? file.storageFileId ?? file.id ?? file.filePath ?? file.fileUrl ?? file.fileId
        if (!key) {
            return true
        }
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

/**
 * Create human message using input string and image (or othter types) files
 *
 * @param state
 * @returns
 */
export async function createHumanMessage(
    commandBus: CommandBus,
    queryBus: QueryBus,
    state: Partial<typeof AgentStateAnnotation.State>,
    attachment?: TXpertAgentOptions['attachment'] | TXpertAgentOptions['vision'],
    options?: CreateHumanMessageOptions
) {
    const { human } = state
    const agentHuman = await resolvePromptWorkflowHumanInput(queryBus, human, options?.xpert)
    const input = typeof agentHuman?.input === 'string' ? agentHuman.input : JSON.stringify(agentHuman?.input ?? '')
    const references = normalizeReferences(agentHuman?.references)
    const referencePrompt = buildReferencedPrompt(references)
    const selectedSkillsPrompt = await buildSelectedRuntimeSkillsPrompt(
        queryBus,
        state,
        human,
        agentHuman,
        options?.xpert
    )
    const finalTextWithoutSkills =
        input.trim().length > 0 && referencePrompt.trim().length > 0
            ? input.includes(referencePrompt)
                ? input
                : `${input.trimEnd()}\n\n${referencePrompt}`
            : input.trim().length > 0
              ? input
              : referencePrompt
    const finalText = appendPromptSection(finalTextWithoutSkills, selectedSkillsPrompt)
    const imageReferences = references.filter(
        (reference): reference is Extract<(typeof references)[number], { type: 'image' }> => reference.type === 'image'
    )

    const _files = [] as Array<ResolvedFile>
    if (attachment?.enabled && attachment.variable) {
        const variableFiles = get(state, attachment.variable, []) as Array<_TFile> | _TFile
        _files.push(...(Array.isArray(variableFiles) ? variableFiles : variableFiles ? [variableFiles] : []))
    }
    if (agentHuman.files?.length) {
        _files.push(...(agentHuman.files as Array<ResolvedFile>))
    }
    const files: Array<ResolvedFile> = (
        await Promise.all(dedupeFiles(_files).map(async (file) => resolveAttachmentFile(queryBus, file)))
    ).filter((file): file is ResolvedFile => Boolean(file))

    const imageReferenceParts = (
        await Promise.all(
            imageReferences.map(async (reference) => {
                if (reference.fileId) {
                    const resolvedFile = await resolveStorageFile(queryBus, reference.fileId)
                    if (
                        resolvedFile?.mimeType?.startsWith('image') &&
                        (resolvedFile.filePath || resolvedFile.fileUrl)
                    ) {
                        return await toImageContentPart(resolvedFile, attachment)
                    }
                }

                if (reference.url?.trim()) {
                    return {
                        type: 'image_url',
                        image_url: {
                            url: reference.url.trim()
                        }
                    }
                }

                return null
            })
        )
    ).filter((part): part is { type: 'image_url'; image_url: { url: string } } => Boolean(part))

    if (files.length || imageReferenceParts.length) {
        const fileParts = await Promise.all(
            files.map(async (file) => {
                if (file.mimeType?.startsWith('image')) {
                    return await toImageContentPart(file, attachment)
                }

                if (file.mimeType?.startsWith('video')) {
                    // Process video files
                    const videoData = await fs.promises.readFile(file.filePath)
                    return {
                        type: 'video_url',
                        video_url: {
                            url: `data:${file.mimeType};base64,${videoData.toString('base64')}`
                        }
                    }
                }

                if (file.mimeType?.startsWith('audio')) {
                    throw new Error('Audio files are not supported yet')
                }

                if (file.fileAsset?.id && ['ready', 'partial'].includes(file.fileAsset.status)) {
                    const preview = await queryBus.execute(new GetFilePreviewQuery(file.fileAsset.id))
                    if (shouldBuildFileUnderstandingPrompt(preview)) {
                        return {
                            type: 'text',
                            text: buildFileUnderstandingPrompt(file, preview)
                        }
                    }
                }

                // Compatibility fallback for legacy attachments or unsupported
                // parser states. Ready FileAssets should reach the compact card above.
                const docs = await commandBus.execute(new LoadFileCommand(file))
                return {
                    type: 'text',
                    text: `Attachment File: ${file.filePath}\n<file_content>\n${docs?.map((doc) => doc.pageContent).join('\n') || 'No text recognized!'}\n</file_content>`
                }
            })
        )

        return new HumanMessage({
            content: [
                ...imageReferenceParts,
                ...fileParts,
                {
                    type: 'text',
                    text: finalText
                }
            ]
        })
    }

    return new HumanMessage(finalText)
}

/**
 * Builds the compact file card sent to the LLM. It exposes identifiers,
 * capabilities, anchors, and an optional workspacePath, but intentionally avoids
 * embedding chunk/page content in the prompt.
 */
function buildFileUnderstandingPrompt(file: ResolvedFile, preview: FilePreviewResult | null | undefined) {
    const asset = {
        ...(file.fileAsset ?? {}),
        ...(preview?.file ?? {})
    } as Partial<FileAsset>
    const chunks = Array.isArray(preview?.chunks) ? preview.chunks : []
    const pageImages = formatPageImageArtifacts(preview)
    const anchors = chunks
        .map((chunk) => {
            const anchor = chunk.anchor
            return anchor?.page != null
                ? `page ${anchor.page}`
                : anchor?.sheet
                  ? `sheet ${anchor.sheet}`
                  : anchor?.slide != null
                    ? `slide ${anchor.slide}`
                    : anchor?.path
                      ? anchor.path
                      : `chunk ${chunk.orderNo}`
        })
        .filter(Boolean)
        .slice(0, 8)
    return [
        `Attachment File: ${file.originalName ?? file.filePath ?? asset?.originalName ?? asset?.id}`,
        '<file_understanding>',
        `fileId: ${asset?.id ?? file.fileAssetId ?? ''}`,
        `storageFileId: ${file.storageFileId ?? normalizeLegacyStorageFileId(file.id) ?? ''}`,
        `status: ${asset?.status ?? 'unknown'}`,
        `capabilities: ${(asset?.capabilities ?? []).join(', ') || 'preview, read'}`,
        asset?.workspacePath ? `workspacePath: ${asset.workspacePath}` : '',
        asset?.summary ? `summary: ${truncatePromptText(asset.summary, MAX_FILE_PROMPT_SUMMARY_LENGTH)}` : '',
        anchors.length ? `availableAnchors: ${anchors.join(', ')}` : '',
        pageImages.length ? `pageImages:\n${pageImages.map((image) => `- ${image}`).join('\n')}` : '',
        'Do not assume the summary is exhaustive. Use file_search/file_read when the user asks about parsed file contents. If workspacePath is present and sandbox_file or shell tools are available, you may read the original file by that path. If pageImages are present, use file_page_images for the complete or page-specific image list, then use a view-image tool on the listed image path or URL when visual layout, charts, screenshots, tables, or OCR are needed. Cite page/sheet/slide/path anchors when available.',
        '</file_understanding>'
    ]
        .filter(Boolean)
        .join('\n')
}

function shouldBuildFileUnderstandingPrompt(preview: FilePreviewResult | null | undefined) {
    return Boolean(preview?.chunks?.length || preview?.file?.summary || preview?.artifacts?.length)
}

function formatPageImageArtifacts(preview: FilePreviewResult | null | undefined) {
    const artifacts = Array.isArray(preview?.artifacts) ? preview.artifacts : []
    return artifacts
        .flatMap((artifact) => {
            if (artifact.kind !== 'page_image') {
                return []
            }
            const imagePath = artifact.file?.workspacePath ?? artifact.file?.url
            if (!imagePath) {
                return []
            }
            const page = artifact.anchor?.page
            const label =
                typeof page === 'number'
                    ? `page ${page}`
                    : (artifact.file?.fileName ?? artifact.anchor?.path ?? 'page image')
            return [`${label}: ${imagePath}`]
        })
        .slice(0, MAX_FILE_PROMPT_PAGE_IMAGES)
}

function truncatePromptText(text: string, maxLength: number) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

function appendPromptSection(text: string, section: string | null) {
    if (!section) {
        return text
    }
    return text.trim().length ? `${text.trimEnd()}\n\n${section}` : section
}

async function resolvePromptWorkflowHumanInput(
    queryBus: QueryBus,
    human: Partial<typeof AgentStateAnnotation.State>['human'],
    xpert?: Pick<IXpert, 'id' | 'workspaceId' | 'commandProfile' | 'graph' | 'agent'>
) {
    if (!xpert || !human?.input || !isPromptWorkflowInvocationCandidate(human.input)) {
        return human
    }

    const resolution = await queryBus.execute(new ResolvePromptWorkflowInvocationQuery(xpert, human))
    return resolution?.input ?? human
}
