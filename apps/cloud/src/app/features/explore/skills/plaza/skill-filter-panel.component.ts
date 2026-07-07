import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { ISkillMarketFilterGroup, ISkillRepository } from '@cloud/app/@core'
import { ZardButtonComponent, ZardIconComponent, ZardSelectImports } from '@xpert-ai/headless-ui'

const EMPTY_FILTER_GROUP: ISkillMarketFilterGroup = {
  label: '',
  options: []
}

@Component({
  standalone: true,
  selector: 'xp-skill-filter-panel',
  imports: [CommonModule, TranslateModule, ZardButtonComponent, ZardIconComponent, ...ZardSelectImports],
  templateUrl: './skill-filter-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillFilterPanelComponent {
  readonly repositories = input<ISkillRepository[]>([])
  readonly repositoryCount = input(0)
  readonly selectedRepositoryId = input('__all__')
  readonly roleFilterGroup = input<ISkillMarketFilterGroup>(EMPTY_FILTER_GROUP)
  readonly appTypeFilterGroup = input<ISkillMarketFilterGroup>(EMPTY_FILTER_GROUP)
  readonly hotFilterGroup = input<ISkillMarketFilterGroup>(EMPTY_FILTER_GROUP)
  readonly selectedRole = input('all')
  readonly selectedAppType = input('all')
  readonly selectedHot = input('all')

  readonly repositoryChange = output<string>()
  readonly roleChange = output<string>()
  readonly appTypeChange = output<string>()
  readonly hotChange = output<string>()

  readonly open = signal(false)

  readonly roleOptions = computed(() => this.roleFilterGroup().options)
  readonly appTypeOptions = computed(() => this.appTypeFilterGroup().options)
  readonly hotOptions = computed(() => this.hotFilterGroup().options)

  toggleOpen() {
    this.open.update((state) => !state)
  }

  selectRepository(id: string) {
    this.repositoryChange.emit(id)
  }

  selectRole(value: string | number | Array<string | number> | null) {
    this.roleChange.emit(normalizeSingleSelectValue(value) ?? 'all')
  }

  selectAppType(value: string | number | Array<string | number> | null) {
    this.appTypeChange.emit(normalizeSingleSelectValue(value) ?? 'all')
  }

  selectHot(value: string | number | Array<string | number> | null) {
    this.hotChange.emit(normalizeSingleSelectValue(value) ?? 'all')
  }
}

function normalizeSingleSelectValue(value: string | number | Array<string | number> | null): string | null {
  const normalized = Array.isArray(value) ? value[0] : value
  if (typeof normalized === 'number') {
    return `${normalized}`
  }
  return typeof normalized === 'string' && normalized ? normalized : null
}
