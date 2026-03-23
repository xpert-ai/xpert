import { MarkdownModuleConfig, MARKED_EXTENSIONS, MARKED_OPTIONS, MarkedOptions, MarkedRenderer, provideMarkdown } from 'ngx-markdown'
import markedKatex from 'marked-katex-extension'
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

  return {
    renderer
  }
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
    // Configure marked extensions for KaTeX math rendering
    // Supports inline math ($...$) and display math ($$...$$)
    markedExtensions: [
      {
        provide: MARKED_EXTENSIONS,
        useValue: markedKatex({
          // Enable display mode for $$...$$ blocks
          displayMode: true,
          // Don't throw error on invalid LaTeX syntax (show error message instead)
          throwOnError: false,
          // Output HTML for rendering
          output: 'html'
        }),
        multi: true
      }
    ],
    ...(markdownModuleConfig ?? {})
  })
}
