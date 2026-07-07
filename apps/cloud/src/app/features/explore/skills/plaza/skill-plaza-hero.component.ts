import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardCardImports, ZardIconComponent, ZardInputDirective, ZardInputGroupComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-skill-plaza-hero',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
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
  readonly workspaceId = input<string | null>(null)
  readonly searchChange = output<string>()

  updateSearch(value: string) {
    this.searchChange.emit(value)
  }

  workspaceSkillsLink() {
    const workspaceId = this.workspaceId()
    return workspaceId ? ['/xpert/w', workspaceId, 'skills'] : ['/xpert/w']
  }
}
