import { Document } from '@langchain/core/documents'
import { HumanMessage } from '@langchain/core/messages'
import { _TFile, IStorageFile, TXpertAgentOptions } from '@xpert-ai/contracts'
import { FileStorage, GetStorageFileQuery } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import fs from 'fs'
import { get } from 'lodash'
import sharp from 'sharp'
import { LoadFileCommand } from '../commands'
import { AgentStateAnnotation } from './state'
import { buildReferencedPrompt, normalizeReferences } from './human-input'

type ResolvedFile = _TFile & { id?: string }

async function resolveStorageFile(queryBus: QueryBus, fileId: string): Promise<ResolvedFile | null> {
    const storageFiles = await queryBus.execute(new GetStorageFileQuery([fileId]))
    const storageFile = storageFiles[0] as IStorageFile | undefined
    if (!storageFile) {
        return null
    }

    const provider = new FileStorage().getProvider(storageFile.storageProvider)
    return {
        id: storageFile.id,
        filePath: provider.path(storageFile.file),
        fileUrl: provider.url(storageFile.file),
        mimeType: storageFile.mimetype
    }
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
    attachment?: TXpertAgentOptions['attachment'] | TXpertAgentOptions['vision']
) {
    const { human } = state
    const input = typeof human?.input === 'string' ? human.input : JSON.stringify(human?.input ?? '')
    const references = normalizeReferences(human?.references)
    const referencePrompt = buildReferencedPrompt(references)
    const finalText =
        input.trim().length > 0 && referencePrompt.trim().length > 0
            ? input.includes(referencePrompt)
                ? input
                : `${input.trimEnd()}\n\n${referencePrompt}`
            : input.trim().length > 0
              ? input
              : referencePrompt
    const imageReferences = references.filter(
        (reference): reference is Extract<(typeof references)[number], { type: 'image' }> => reference.type === 'image'
    )

    let _files = [] as Array<ResolvedFile>
    if (attachment?.enabled && attachment.variable) {
        const variableFiles = get(state, attachment.variable, []) as Array<_TFile> | _TFile
        _files = Array.isArray(variableFiles) ? variableFiles : variableFiles ? [variableFiles] : []
    } else if (attachment?.enabled && human.files?.length) {
        _files = human.files as Array<ResolvedFile>
    }
    const files: Array<_TFile> = (
        await Promise.all(
            _files.map(async (file) => {
                if (file.id) {
                    return await resolveStorageFile(queryBus, file.id)
                }

                return file
            })
        )
    ).filter((file): file is _TFile => Boolean(file))

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

                // Process other files as text
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
