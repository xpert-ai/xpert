import { Component, computed, input } from '@angular/core'
import { isPolygonGeometry, pptxPolygonPoints } from './pptx-editor-view.utils'
import type { PptxShape } from './pptx-file.utils'

@Component({
  standalone: true,
  selector: 'xp-pptx-polygon',
  styleUrl: './pptx-polygon.component.css',
  template: `
    @if (isPolygon()) {
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon
          [attr.points]="points()"
          [attr.fill]="shape().fillCss ? 'transparent' : shape().fill || 'transparent'"
          [attr.stroke]="shape().stroke || 'transparent'"
          [attr.stroke-width]="strokeWidth()"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    }
  `
})
export class PptxPolygonComponent {
  readonly shape = input.required<PptxShape>()
  readonly isPolygon = computed(() => isPolygonGeometry(this.shape().geometry))
  readonly strokeWidth = computed(() => (this.shape().stroke ? Math.max(1, this.shape().strokeWidth) : 0))
  readonly points = computed(() => {
    return pptxPolygonPoints(this.shape().geometry)
  })
}
