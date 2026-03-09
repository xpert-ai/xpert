import { MarkdownModuleConfig, MARKED_OPTIONS, MarkedOptions, MarkedRenderer, provideMarkdown } from 'ngx-markdown'
import { CustomElementsService } from './custom-elements.service'

export function markedOptionsFactory(): MarkedOptions {
  const renderer = new MarkedRenderer()

  const originalCode = renderer.code.bind(renderer)
  renderer.code = (token: { text: string; lang?: string; escaped?: boolean }) => {
    if (token.lang === 'echarts') {
      const escaped = encodeURIComponent(token.text)
      return `<echarts-wrapper code="${escaped}"></echarts-wrapper>`
    }
    if (token.lang === 'mermaid') {
      const escaped = encodeURIComponent(token.text)
      return `<mermaid-wrapper code="${escaped}"></mermaid-wrapper>`
    }
    return originalCode(token as any)
  }

  return { renderer }
}

export function initializeCustomElements(customElementsService: CustomElementsService) {
  return () => customElementsService.setupCustomElements()
}

export function provideChatMarkdown(markdownModuleConfig?: MarkdownModuleConfig) {
  return provideMarkdown({
    markedOptions: {
      provide: MARKED_OPTIONS,
      useFactory: markedOptionsFactory
    },
    ...(markdownModuleConfig ?? {})
  })
}
