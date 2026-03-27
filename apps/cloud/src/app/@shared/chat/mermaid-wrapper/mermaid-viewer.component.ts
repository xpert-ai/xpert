
import { AfterViewInit, Component, ElementRef, Input, OnDestroy } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import mermaid from 'mermaid'
import { CopyComponent } from '../../common'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
let idCounter = 0
const svgCache = new Map<string, string>()

@Component({
  standalone: true,
  imports: [...ZardTooltipImports, TranslateModule, CopyComponent],
  selector: 'chat-mermaid-viewer',
  template: `<div class="group/mermaid relative my-4">
    <copy
      #copy
      class="absolute -top-2 right-2 opacity-30 group-hover/mermaid:opacity-100 z-10"
      [content]="code"
      [zTooltip]="
        copy.copied()
          ? ('PAC.Xpert.Copied' | translate: { Default: 'Copied' })
          : ('PAC.Xpert.Copy' | translate: { Default: 'Copy' })
      "
      zPosition="top"
    />
    <div class="mermaid-container overflow-auto"></div>
  </div>`
})
export class MermaidViewerComponent implements AfterViewInit, OnDestroy {
  @Input() code!: string

  private destroyed = false
  private renderVersion = 0
  private container?: HTMLElement
  private themeObserver?: MutationObserver

  constructor(private el: ElementRef) {}

  ngOnDestroy() {
    this.destroyed = true
    this.themeObserver?.disconnect()
  }

  async ngAfterViewInit() {
    this.container = this.el.nativeElement.querySelector('.mermaid-container') ?? undefined
    if (!this.code || !this.container) return

    this.themeObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === 'data-theme')) {
        void this.render()
      }
    })
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    await this.render()
  }

  private async render() {
    const container = this.container
    if (!this.code || !container) return

    const renderVersion = ++this.renderVersion

    // Use cached SVG if available to avoid repeated rendering during streaming
    const isDark = document.documentElement.dataset.theme === 'dark'
    const cacheKey = `${isDark ? 'dark' : 'light'}:${this.code}`
    const cached = svgCache.get(cacheKey)
    if (cached) {
      container.innerHTML = cached
      return
    }

    mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' })

    // Validate syntax before rendering to avoid errors from incomplete code during streaming
    try {
      await mermaid.parse(this.code)
    } catch {
      container.textContent = this.code
      return
    }

    if (this.destroyed) return

    try {
      const id = `mermaid-graph-${idCounter++}`
      const { svg } = await mermaid.render(id, this.code)
      svgCache.set(cacheKey, svg)
      if (svgCache.size > 100) {
        svgCache.delete(svgCache.keys().next().value)
      }
      if (!this.destroyed && renderVersion === this.renderVersion) {
        container.innerHTML = svg
      }
    } catch (err) {
      if (!this.destroyed && renderVersion === this.renderVersion) {
        container.textContent = this.code
      }
    }
  }
}
