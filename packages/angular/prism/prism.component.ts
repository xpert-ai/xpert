import { CommonModule } from '@angular/common'
import { Component, effect, input, numberAttribute, signal } from '@angular/core'
import { NgmCopyComponent } from '@metad/ocap-angular/common'

@Component({
  standalone: true,
  imports: [CommonModule, NgmCopyComponent],
  selector: 'ngm-prism-highlight',
  template: `<pre class="m-0 overflow-auto"><code [innerHTML]="highlightedCode()" class="m-0"></code></pre>
<ngm-copy class="absolute right-1 top-1 text-lg !text-white rounded-md w-6 h-6 flex justify-center items-center bg-white/30 backdrop-blur-sm" [content]="code()" />
`,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
    `
  ],
  host: {
    class: 'ngm-prism-highlight'
  }
})
export class NgmPrismHighlightComponent {
  readonly code = input.required<string>()
  readonly language = input.required<'sql' | 'json' | string>()
  readonly maximum = input<number, string | number>(0, {
    transform: numberAttribute
  })

  readonly highlightedCode = signal('')

  #effRef = effect(
    async () => {
      const Prism = await import('prismjs')
      switch (this.language()) {
        case 'sql':
          await import('prismjs/components/prism-sql')
          break
        case 'json':
          await import('prismjs/components/prism-json')
          break
      }
      // await import('prismjs/plugins/toolbar/prism-toolbar')
      // await import('prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard')
      // await import('clipboard')
      this.highlightedCode.set(
        Prism.highlight(
          this.maximum() ? this.code().slice(0, this.maximum()) : this.code(),
          Prism.languages[this.language()],
          this.language()
        )
      )
    },
    { allowSignalWrites: true }
  )
}
