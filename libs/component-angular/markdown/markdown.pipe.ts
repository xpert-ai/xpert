import { Pipe, PipeTransform } from '@angular/core'
// import marked from 'marked'

/**
 * @deprecated
 */
@Pipe({
  name: 'markdown',
  standalone: false,
})
export class MarkdownPipe implements PipeTransform {
  transform(value: any, args?: any[]): any {
    if (value && value.length > 0) {
      // marked.setOptions({
      //   highlight: (code, lang) => {
      //     // const hljs = require('highlight.js')
      //     const hljs = null
      //     const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      //     return hljs.highlight(code, { language }).value
      //   },
      // })

      // return marked(value)
    }
    return value
  }
}
