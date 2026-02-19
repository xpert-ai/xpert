import { Directive, ElementRef, HostBinding, Input, OnChanges, SecurityContext, SimpleChanges } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'

@Directive({
  standalone: true,
  selector: '[ngmHighlight]'
})
export class NgmHighlightDirective implements OnChanges {
  @Input('ngmHighlight') searchTerm: string
  @Input() content: string
  @Input() caseSensitive = false
  @Input() customClasses = ''

  @HostBinding('innerHtml')
  _content: string
  constructor(private el: ElementRef, private sanitizer: DomSanitizer) {}

  ngOnChanges({ content, searchTerm, caseSensitive }: SimpleChanges) {
    if (this.el?.nativeElement) {
      if (searchTerm || content || caseSensitive) {
        this.updateContent()
      }
    }
  }

  private updateContent() {
    const text = this.content || (this.el.nativeElement as HTMLElement).textContent
    if (!this.searchTerm) {
      this._content = text
    } else {
      const regex = new RegExp(this.searchTerm, this.caseSensitive ? 'g' : 'gi')
      const newText = text.replace(regex, (match: string) => {
        return `<mark class="highlight ${this.customClasses}">${match}</mark>`
      })
      const sanitzed = this.sanitizer.sanitize(SecurityContext.HTML, newText)
      this._content = sanitzed
    }
  }
}
