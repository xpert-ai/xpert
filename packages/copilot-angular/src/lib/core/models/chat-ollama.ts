import { ChatOllama, ChatOllamaInput } from '@langchain/ollama'
import { Ollama } from 'ollama/dist/browser'

export class NgmChatOllama extends ChatOllama {
  constructor(fields?: ChatOllamaInput & { headers: HeadersInit }) {
    super(fields ?? {})

    this.client = new Ollama({
      host: fields?.baseUrl,
      // For add custom headers (server token)
      fetch: async (url: string | RequestInfo | URL, options: RequestInit | undefined) => {
        return fetch(url, {
          ...options,
          headers: {
            ...(options?.headers ?? {}),
            ...(fields?.headers ?? {})
          } as HeadersInit
        })
      }
    })
  }
}
