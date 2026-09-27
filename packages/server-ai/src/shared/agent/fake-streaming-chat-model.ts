import { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseLLMParams } from '@langchain/core/language_models/llms'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'

export class FakeStreamingChatModel extends BaseChatModel {
    sleep?: number = 50

    responses?: BaseMessage[]

    thrownErrorString?: string

    constructor(
        fields: {
            sleep?: number
            responses?: BaseMessage[]
            thrownErrorString?: string
        } & BaseLLMParams
    ) {
        super(fields)
        this.sleep = fields.sleep ?? this.sleep
        this.responses = fields.responses
        this.thrownErrorString = fields.thrownErrorString
    }

    _llmType() {
        return 'fake'
    }

    async _generate(
        messages: BaseMessage[],
        _options: this['ParsedCallOptions'],
        _runManager?: CallbackManagerForLLMRun
    ): Promise<ChatResult> {
        if (this.thrownErrorString) {
            throw new Error(this.thrownErrorString)
        }

        const response = this.responses?.[0] ?? messages[0]
        const content = response?.content
        const responseId = response?.id
        const generation: ChatResult = {
            generations: [
                {
                    text: '',
                    message: new AIMessage({
                        id: responseId,
                        content
                    })
                }
            ]
        }

        return generation
    }

    async *_streamResponseChunks(
        messages: BaseMessage[],
        _options: this['ParsedCallOptions'],
        _runManager?: CallbackManagerForLLMRun
    ): AsyncGenerator<ChatGenerationChunk> {
        if (this.thrownErrorString) {
            throw new Error(this.thrownErrorString)
        }
        for (const response of this.responses ?? messages) {
            const content = response.content
            const responseId = response.id
            if (typeof content !== 'string') {
                yield new ChatGenerationChunk({
                    text: '',
                    message: new AIMessageChunk({
                        id: responseId,
                        content
                    })
                })
            } else {
                yield new ChatGenerationChunk({
                    text: content,
                    message: new AIMessageChunk({
                        id: responseId,
                        content
                    })
                })
            }
        }
    }
}
