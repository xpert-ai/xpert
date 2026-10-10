import { FileStorage } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { UploadedFile } from '@xpert-ai/contracts'
import { IFileStorageProvider, SpeechToTextTranscribeResult } from '@xpert-ai/plugin-sdk'
import { normalizeSpeechToTextFileName, SpeechToTextService } from './speech-to-text.service'

describe('SpeechToTextService', () => {
    const uploadedFile: UploadedFile = {
        fieldname: 'file',
        key: 'files/speech.wav',
        originalname: 'speech.wav',
        size: 12,
        encoding: '7bit',
        mimetype: 'audio/wav',
        filename: 'speech.wav',
        url: 'http://localhost/public/files/speech.wav',
        path: '/tmp/speech.wav'
    }

    function createService() {
        const queryBus = {
            execute: jest.fn()
        }
        return {
            queryBus,
            service: new SpeechToTextService(queryBus as unknown as QueryBus)
        }
    }

    afterEach(() => jest.restoreAllMocks())

    function mockStorage(storedFile: UploadedFile = uploadedFile) {
        const provider = {
            name: 'test-storage',
            url: jest.fn(),
            path: jest.fn(),
            handler: jest.fn(),
            getFile: jest.fn(),
            putFile: jest.fn().mockResolvedValue(storedFile),
            deleteFile: jest.fn().mockResolvedValue(undefined)
        } satisfies IFileStorageProvider
        jest.spyOn(FileStorage.prototype, 'getProvider').mockReturnValue(provider)
        return provider
    }

    const bufferInput = {
        xpertId: 'assistant',
        tenantId: 'tenant',
        file: { data: Buffer.from('audio'), originalName: 'speech.wav', mimeType: 'audio/wav' }
    }

    it.each([
        { transcriptionFails: false, cleanupFails: false },
        { transcriptionFails: true, cleanupFails: false },
        { transcriptionFails: false, cleanupFails: true },
        { transcriptionFails: true, cleanupFails: true }
    ])(
        'preserves transcription outcome and cleans up staged bytes: %j',
        async ({ transcriptionFails, cleanupFails }) => {
            const { service } = createService()
            const provider = mockStorage()
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
            const modelError = new Error('provider offline')
            const transcribe = jest.spyOn(service, 'transcribeUploadedFile')
            if (transcriptionFails) transcribe.mockRejectedValue(modelError)
            else transcribe.mockResolvedValue({ text: 'saved transcript' })
            if (cleanupFails) provider.deleteFile.mockRejectedValue(new Error('storage offline'))

            const result = service.transcribe(bufferInput)

            if (transcriptionFails) await expect(result).rejects.toBe(modelError)
            else await expect(result).resolves.toEqual({ text: 'saved transcript' })
            expect(provider.deleteFile).toHaveBeenCalledWith(uploadedFile.key)
            expect(provider.deleteFile).toHaveBeenCalledTimes(1)
            expect(warn).toHaveBeenCalledTimes(cleanupFails ? 1 : 0)
        }
    )

    it('keeps the staged file until the model has finished reading it', async () => {
        const { service } = createService()
        const provider = mockStorage()
        let finishTranscription: (result: SpeechToTextTranscribeResult) => void
        const transcript = new Promise<SpeechToTextTranscribeResult>((resolve) => {
            finishTranscription = resolve
        })
        const transcribe = jest.spyOn(service, 'transcribeUploadedFile').mockReturnValue(transcript)

        const result = service.transcribe(bufferInput)
        await Promise.resolve()
        expect(transcribe).toHaveBeenCalled()
        expect(provider.deleteFile).not.toHaveBeenCalled()
        finishTranscription({ text: 'finished reading' })

        await expect(result).resolves.toEqual({ text: 'finished reading' })
        expect(provider.deleteFile).toHaveBeenCalledTimes(1)
    })

    it('cleans up by the staging path when storage does not return a key', async () => {
        const { service } = createService()
        const provider = mockStorage({ ...uploadedFile, key: undefined })
        jest.spyOn(service, 'transcribeUploadedFile').mockResolvedValue({ text: 'transcript' })

        await service.transcribe(bufferInput)

        const path = provider.putFile.mock.calls[0][1]
        expect(path).toMatch(/^files\/speech-to-text\/tenant\/.+-speech\.wav$/)
        expect(provider.deleteFile).toHaveBeenCalledWith(path)
    })

    it('preserves staging failure without transcribing or deleting an unconfirmed file', async () => {
        const { service } = createService()
        const provider = mockStorage()
        const storageError = new Error('upload failed')
        provider.putFile.mockRejectedValue(storageError)
        const transcribe = jest.spyOn(service, 'transcribeUploadedFile')

        await expect(service.transcribe(bufferInput)).rejects.toBe(storageError)

        expect(transcribe).not.toHaveBeenCalled()
        expect(provider.deleteFile).not.toHaveBeenCalled()
    })

    it('preserves real media extensions when staging plugin speech-to-text bytes', () => {
        expect(normalizeSpeechToTextFileName('NG7A4524.MOV', 'video/quicktime')).toBe('NG7A4524.MOV')
        expect(normalizeSpeechToTextFileName('interview', 'video/mp4')).toBe('interview.mp4')
        expect(normalizeSpeechToTextFileName('voice', 'audio/mpeg; charset=binary')).toBe('voice.mp3')
        expect(normalizeSpeechToTextFileName('../speech', undefined)).toBe('speech.wav')
    })

    it('returns clear error when the target Xpert has no speech-to-text model', async () => {
        const { service, queryBus } = createService()
        const provider = mockStorage()
        queryBus.execute.mockResolvedValueOnce({
            features: {
                speechToText: {
                    enabled: true
                }
            }
        })

        await expect(
            service.transcribeUploadedFile(uploadedFile, {
                xpertId: 'xpert-1',
                tenantId: 'tenant-1'
            })
        ).rejects.toThrow('speech_to_text_model_missing')
        expect(provider.deleteFile).not.toHaveBeenCalled()
    })

    it('invokes the configured speech-to-text chat model with the uploaded file URL', async () => {
        const { service, queryBus } = createService()
        const provider = mockStorage()
        const invoke = jest.fn().mockResolvedValue({
            content: '转写文本'
        })
        queryBus.execute
            .mockResolvedValueOnce({
                features: {
                    speechToText: {
                        copilotModel: {
                            copilotId: 'copilot-1',
                            model: 'stt-model'
                        }
                    }
                }
            })
            .mockResolvedValueOnce({
                id: 'copilot-1',
                modelProvider: {
                    providerName: 'openai-compatible'
                }
            })
            .mockResolvedValueOnce({
                invoke
            })

        await expect(
            service.transcribeUploadedFile(uploadedFile, {
                xpertId: 'xpert-1',
                tenantId: 'tenant-1'
            })
        ).resolves.toEqual({
            text: '转写文本'
        })

        expect(invoke).toHaveBeenCalledWith([
            expect.objectContaining({
                content: [
                    {
                        url: uploadedFile.url
                    }
                ]
            })
        ])
        expect(provider.deleteFile).not.toHaveBeenCalled()
    })

    it('rejects empty transcription output', async () => {
        const { service, queryBus } = createService()
        queryBus.execute
            .mockResolvedValueOnce({
                features: {
                    speechToText: {
                        copilotModel: {
                            copilotId: 'copilot-1',
                            model: 'stt-model'
                        }
                    }
                }
            })
            .mockResolvedValueOnce({
                id: 'copilot-1',
                modelProvider: {
                    providerName: 'openai-compatible'
                }
            })
            .mockResolvedValueOnce({
                invoke: jest.fn().mockResolvedValue({
                    content: '   '
                })
            })

        await expect(
            service.transcribeUploadedFile(uploadedFile, {
                xpertId: 'xpert-1',
                tenantId: 'tenant-1'
            })
        ).rejects.toThrow('speech_to_text_transcription_empty')
    })
})
