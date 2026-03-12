import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { SafePipe } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ITag } from '../../../@core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, ...ZardTooltipImports, NgmI18nPipe, SafePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tag',
  templateUrl: './tag.component.html',
  styleUrls: ['./tag.component.scss'],
  host: {
    '[class.xs]': 'xs()',
    '[class.sm]': 'sm()',
    '[class.lg]': 'lg()'
  }
})
export class TagComponent {
  readonly tag = input<ITag>()

  readonly xs = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly sm = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly lg = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly styles = computed(() => {
    if (!this.tag()?.color) {
      return null
    }

    const color = this.tag().color
    if (/^#[0-9A-F]{6}$/i.test(color) || /^(rgb|hsl)a?\(/i.test(color)) {
      return { 'background-color': color }
    }
    const cssArray = color.split(';').filter(Boolean)
    const cssJson = cssArray.reduce((acc, item) => {
      const [key, value] = item.split(':').map((str) => str.trim())
      if (key && value) {
        acc[key] = value
      }
      return acc
    }, {})

    return cssJson
  })
}
