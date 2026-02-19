import { MessageContent } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'

export class NgmChatOpenAI extends ChatOpenAI {

  /**
   * Directly use the approximate count method, tiktoken files url is blocked in some area.
   * 
   * @param content 
   * @returns 
   */
  override async getNumTokens(content: MessageContent) {
    // TODO: Figure out correct value.
    if (typeof content !== 'string') {
      return 0
    }
    // fallback to approximate calculation if tiktoken is not available
    const numTokens = Math.ceil(content.length / 4)

    // if (!this.#encoding) {
    //   try {
    //     this.#encoding = await encodingForModel(
    //       'modelName' in this ? getModelNameForTiktoken(this.modelName as string) : 'gpt2'
    //     )
    //   } catch (error) {
    //     console.warn('Failed to calculate number of tokens, falling back to approximate count', error)
    //   }
    // }

    // if (this.#encoding) {
    //   try {
    //     numTokens = this.#encoding.encode(content).length
    //   } catch (error) {
    //     console.warn('Failed to calculate number of tokens, falling back to approximate count', error)
    //   }
    // }

    return numTokens
  }
}
