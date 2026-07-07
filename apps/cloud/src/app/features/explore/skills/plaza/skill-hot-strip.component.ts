import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'
import { SkillHotCardViewModel } from './skill-plaza.models'

@Component({
  standalone: true,
  selector: 'xp-skill-hot-strip',
  imports: [CommonModule, TranslateModule, ZardButtonComponent, ZardIconComponent, ...ZardCardImports],
  templateUrl: './skill-hot-strip.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillHotStripComponent {
  readonly items = input<SkillHotCardViewModel[]>([])
  readonly viewMore = output<void>()
  readonly view = output<SkillHotCardViewModel>()

  open(item: SkillHotCardViewModel) {
    this.view.emit(item)
  }
}
