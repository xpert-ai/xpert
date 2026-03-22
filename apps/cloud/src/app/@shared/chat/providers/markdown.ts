import { MarkdownModuleConfig, MARKED_OPTIONS, MarkedOptions, MarkedRenderer, provideMarkdown } from 'ngx-markdown'
import markedKatex from 'marked-katex-extension'
import { CustomElementsService } from './custom-elements.service'

export function markedOptionsFactory(): MarkedOptions {
  const renderer = new MarkedRenderer()

  const _codeFun = renderer.code
  renderer.code = (code: string, language: string | undefined, escaped: boolean) => {
    if (language === 'echarts') {
      const escaped = encodeURIComponent(code)
      return `<echarts-wrapper code="${escaped}"></echarts-wrapper>`
    }
    if (language === 'mermaid') {
      const escaped = encodeURIComponent(code)
      return `<mermaid-wrapper code="${escaped}"></mermaid-wrapper>`
    }
    return _codeFun.apply(renderer, [code, language, escaped])
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
      markedKatex({
        // Enable display mode for $$...$$ blocks
        displayMode: true,
        // Don't throw error on invalid LaTeX syntax (show error message instead)
        throwOnError: false,
        // Output HTML for rendering
        output: 'html'
      })
    ],
    ...(markdownModuleConfig ?? {})
  })
}
