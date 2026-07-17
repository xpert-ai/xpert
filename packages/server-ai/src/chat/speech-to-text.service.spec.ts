import { QueryBus } from '@nestjs/cqrs'
import { UploadedFile } from '@xpert-ai/contracts'
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

    it('preserves real media extensions when staging plugin speech-to-text bytes', () => {
        expect(normalizeSpeechToTextFileName('NG7A4524.MOV', 'video/quicktime')).toBe('NG7A4524.MOV')
        expect(normalizeSpeechToTextFileName('interview', 'video/mp4')).toBe('interview.mp4')
        expect(normalizeSpeechToTextFileName('voice', 'audio/mpeg; charset=binary')).toBe('voice.mp3')
        expect(normalizeSpeechToTextFileName('../speech', undefined)).toBe('speech.wav')
    })

    it('returns clear error when the target Xpert has no speech-to-text model', async () => {
        const { service, queryBus } = createService()
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
    })

    it('invokes the configured speech-to-text chat model with the uploaded file URL', async () => {
        const { service, queryBus } = createService()
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
