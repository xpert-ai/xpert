import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardCardImports, ZardIconComponent, ZardInputDirective, ZardInputGroupComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-skill-plaza-hero',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ...ZardCardImports
  ],
  templateUrl: './skill-plaza-hero.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillPlazaHeroComponent {
  readonly search = input('')
  readonly searchChange = output<string>()

  updateSearch(value: string) {
    this.searchChange.emit(value)
  }
}
