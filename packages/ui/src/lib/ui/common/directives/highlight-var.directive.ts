import { booleanAttribute, Directive, effect, ElementRef, HostBinding, input, SecurityContext } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'

@Directive({
  standalone: true,
  selector: '[ngmHighlightVar]'
})
export class NgmHighlightVarDirective {
  readonly regex = input<string>()
  readonly content = input<string>()
  readonly customClasses = input<string>('')
  readonly caseSensitive = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // @HostBinding('innerHtml')
  // _content: string

  constructor(
    private el: ElementRef,
    private sanitizer: DomSanitizer
  ) {
    effect(() => {
      const content = this.content()
      const regex = this.regex()
      if (this.el?.nativeElement) {
        this.updateContent(content, regex)
      }
    })
  }

  private updateContent(content: string, regexStr: string) {
    const text = content || ''
    if (!regexStr) {
      this.el.nativeElement.innerHTML = text
    } else {
      const regex = new RegExp(regexStr, this.caseSensitive() ? 'g' : 'gi')
      const newText = text.replace(regex, (match: string) => {
        return `<mark class="highlight ${this.customClasses()}">${match}</mark>`
      })
      const sanitzed = this.sanitizer.sanitize(SecurityContext.HTML, newText)
      // console.log(text)
      // this._content = sanitzed
      this.el.nativeElement.innerHTML = sanitzed
    }
  }
}
