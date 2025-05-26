import { MarkdownModuleConfig, MARKED_OPTIONS, MarkedOptions, MarkedRenderer, provideMarkdown } from 'ngx-markdown'
import { CustomElementsService } from './custom-elements.service'

export function markedOptionsFactory(): MarkedOptions {
  const renderer = new MarkedRenderer()

  renderer.code = (code: string, language: string | undefined) => {
    if (language === 'echarts') {
      const escaped = encodeURIComponent(code)
      return `<echarts-wrapper code="${escaped}"></echarts-wrapper>`
    }
    return `<pre><code class="language-${language}">${code}</code></pre>`
  }

  return { renderer,  }
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
