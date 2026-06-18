import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { UploadedFile } from '@xpert-ai/contracts'
import { SpeechToTextTranscribeInput, SpeechToTextTranscribeResult } from '@xpert-ai/plugin-sdk'
import { FileStorage, RequestContext } from '@xpert-ai/server-core'
import { CopilotGetOneQuery } from '../copilot'
import { CopilotModelGetChatModelQuery } from '../copilot-model'
import { FindXpertQuery } from '../xpert'

export interface SpeechToTextServiceOptions {
    xpertId?: string
    isDraft?: boolean
    tenantId?: string | null
    organizationId?: string | null
}

@Injectable()
export class SpeechToTextService {
    constructor(private readonly queryBus: QueryBus) {}

    async transcribeUploadedFile(
        file: UploadedFile,
        options: SpeechToTextServiceOptions = {}
    ): Promise<SpeechToTextTranscribeResult> {
        const xpertId = this.normalizeString(options.xpertId)
        if (!xpertId) {
            throw new BadRequestException('speech_to_text_xpert_id_required')
        }

        const tenantId = this.normalizeString(options.tenantId) || RequestContext.currentTenantId()
        if (!tenantId) {
            throw new BadRequestException('speech_to_text_tenant_required')
        }

        if (!file?.url) {
            throw new BadRequestException('speech_to_text_file_url_required')
        }

        const xpert = await this.queryBus.execute(
            new FindXpertQuery({ id: xpertId, tenantId }, { isDraft: options.isDraft })
        )
        if (!xpert) {
            throw new BadRequestException('speech_to_text_xpert_not_found')
        }

        const copilotModel = xpert.features?.speechToText?.copilotModel
        const copilotId = this.normalizeString(copilotModel?.copilotId)
        if (!copilotModel || !copilotId) {
            throw new BadRequestException('speech_to_text_model_missing')
        }

        const copilot = await this.queryBus.execute(
            new CopilotGetOneQuery(tenantId, copilotId, ['copilotModel', 'modelProvider'])
        )
        if (!copilot) {
            throw new BadRequestException('speech_to_text_copilot_not_found')
        }

        const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
            new CopilotModelGetChatModelQuery(copilot, copilotModel, {
                abortController: new AbortController(),
                usageCallback: null
            })
        )

        try {
            const message = await chatModel.invoke([
                new HumanMessage({
                    content: [
                        {
                            url: file.url
                        }
                    ]
                })
            ])
            const text = this.normalizeTranscriptionContent(message.content)
            if (!text) {
                throw new BadRequestException('speech_to_text_transcription_empty')
            }
            return { text }
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error
            }
            throw new InternalServerErrorException(
                error instanceof Error ? error.message : 'speech_to_text_transcription_failed'
            )
        }
    }

    async transcribe(input: SpeechToTextTranscribeInput): Promise<SpeechToTextTranscribeResult> {
        const buffer = Buffer.from(input.file?.data ?? [])
        if (!buffer.length) {
            throw new BadRequestException('speech_to_text_file_empty')
        }

        const originalName = this.safeFileName(input.file.originalName || 'speech.wav')
        const extension = originalName.toLowerCase().endsWith('.wav') ? '' : '.wav'
        const relativePath = [
            'files',
            'speech-to-text',
            this.safePathSegment(input.tenantId || RequestContext.currentTenantId() || 'tenant'),
            `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${originalName}${extension}`
        ].join('/')
        const storedFile = await new FileStorage().getProvider().putFile(buffer, relativePath)
        const uploadedFile: UploadedFile = {
            fieldname: 'file',
            encoding: '7bit',
            mimetype: input.file.mimeType || 'audio/wav',
            originalname: originalName,
            size: storedFile.size,
            filename: storedFile.filename,
            key: storedFile.key,
            url: storedFile.url,
            path: storedFile.path
        }
        return this.transcribeUploadedFile(uploadedFile, {
            xpertId: input.xpertId,
            isDraft: input.isDraft,
            tenantId: input.tenantId,
            organizationId: input.organizationId
        })
    }

    private normalizeTranscriptionContent(content: unknown): string {
        if (typeof content === 'string') {
            return content.trim()
        }
        if (Array.isArray(content)) {
            return content
                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean)
                .join('\n')
                .trim()
        }
        return ''
    }

    private normalizeString(value: unknown): string {
        return typeof value === 'string' ? value.trim() : ''
    }

    private safePathSegment(value: string): string {
        return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'tenant'
    }

    private safeFileName(value: string): string {
        const name = value.split(/[\\/]/).pop() || 'speech.wav'
        return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'speech.wav'
    }
}
