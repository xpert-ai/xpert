import { CommonModule } from '@angular/common'
import { Component, computed, input, numberAttribute } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { IconDefinition } from '@cloud/app/@core'


@Component({
  selector: 'xp-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="icon-root" [ngStyle]="inlineStyle()">
      @if (icon(); as i) {
        @switch (i.type) {

          @case ('image') {
            <img
              class="icon-image"
              [src]="i.value"
              [attr.alt]="i.alt || ''"
              [style.width]="sizePx()"
              [style.height]="sizePx()"
            />
          }

          @case ('svg') {
            <span
              class="icon-svg"
              role="img"
              [attr.aria-label]="i.alt || null"
              [innerHTML]="svgHtml()"
              [style.width]="sizePx()"
              [style.height]="sizePx()"
            ></span>
          }

          @case ('font') {
            <i
              class="icon-font"
              [class]="i.value"
              [attr.aria-hidden]="i.alt ? 'false' : 'true'"
              [attr.title]="i.alt || null"
              [style.fontSize.px]="i.size"
            ></i>
          }

          @case ('emoji') {
            <span
              class="icon-emoji"
              role="img"
              [attr.aria-label]="i.alt || 'emoji'"
              [style.fontSize.px]="i.size"
            >
              {{ i.value }}
            </span>
          }

          @default {
            <span class="icon-placeholder"></span>
          }
        }
      } @else {
        <span class="icon-placeholder"></span>
      }
    </div>
  `,
  styles: [`
    .icon-root {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      vertical-align: middle;
    }

    .icon-image {
      display: inline-block;
      object-fit: contain;
    }

    .icon-font {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .icon-emoji {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .icon-placeholder {
      width: 1em;
      height: 1em;
      display: inline-block;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
    }

    :host {
      ::ng-deep {
        .icon-svg svg {
          width: 100%;
          height: 100%;
          display: block;
        }
      }
    }
  `],
})
export class IconComponent {
  /** Input signal for the icon definition. */
  icon = input<IconDefinition | null>(null)
  size = input<number, number | string>(null, {
    transform: numberAttribute
  })

  constructor(private sanitizer: DomSanitizer) {}

  /** Derived size string (e.g., "24px"). */
  readonly sizePx = computed(() => {
    const v = this.icon()
    return this.size() ? `${this.size()}px` : v?.size ? `${v.size}px` : undefined
  })

  /** Combined inline style object. */
  readonly inlineStyle = computed(() => {
    const v = this.icon()
    const base: Record<string, string> = {}
    if (!v) return base
    if (v.size) {
      base['width'] = `${v.size}px`
      base['height'] = `${v.size}px`
      base['line-height'] = `${v.size}px`
    }
    if (v.color) base['color'] = v.color
    if (v.style) Object.assign(base, v.style)
    return base
  })

  /** Sanitized SVG HTML (for inline SVG rendering). */
  readonly svgHtml = computed<SafeHtml | null>(() => {
    const v = this.icon()
    if (!v || v.type !== 'svg') return null
    return this.sanitizer.bypassSecurityTrustHtml(v.value)
  })
}
