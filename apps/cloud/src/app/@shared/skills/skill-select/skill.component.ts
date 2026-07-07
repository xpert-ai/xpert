import { ClipboardModule } from '@angular/cdk/clipboard'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule } from '@angular/forms'
import { debouncedSignal, myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { injectWorkspace } from '@xpert-ai/cloud/state'
import { injectSkillPackageAPI } from 'apps/cloud/src/app/@core'
import { of } from 'rxjs'
import { JSON_SCHEMA_WIDGET_CONTEXT, JsonSchemaWidgetContext } from '../../forms'

@Component({
  selector: 'xp-skill-select',
  templateUrl: './skill.component.html',
  styleUrls: ['./skill.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ClipboardModule,
    CdkMenuModule,
    TranslateModule,
    NgmI18nPipe,
    NgmCommonModule,
    ...ZardTooltipImports,
    ZardSwitchComponent
  ]
})
export class XpertSkillSelectComponent implements ControlValueAccessor {
  readonly skillPackageAPI = injectSkillPackageAPI()
  readonly widgetContext = inject<JsonSchemaWidgetContext<string[]> | null>(JSON_SCHEMA_WIDGET_CONTEXT, {
    optional: true
  })
  readonly selectedWorkspace = injectWorkspace()
  readonly i18n = new NgmI18nPipe()

  // Models
  readonly skills = signal<string[] | null>(null)

  // States
  readonly #workspaceId = computed(() => this.selectedWorkspace()?.id)
  readonly #contextWorkspaceId = computed(() => {
    const workspaceId = this.widgetContext?.context?.()?.['workspaceId']
    return typeof workspaceId === 'string' && workspaceId ? workspaceId : null
  })
  readonly #effectiveWorkspaceId = computed(() => this.#contextWorkspaceId() ?? this.#workspaceId())

  // Resource
  readonly #skillResource = myRxResource({
    request: () => this.#effectiveWorkspaceId(),
    loader: ({ request: workspaceId }) => {
      return workspaceId
        ? this.skillPackageAPI.getAllByWorkspace(workspaceId, {
            relations: ['skillIndex', 'skillIndex.repository']
          })
        : of({ items: [] })
    }
  })

  readonly loading = computed(() => this.#skillResource.status() === 'loading')

  readonly search = model<string>()
  readonly searchTerm = debouncedSignal(this.search, 300)
  readonly allSkills = computed(() => this.#skillResource.value()?.items || [])
  readonly skillList = computed(() => {
    const items = this.allSkills()
    const term = this.searchTerm()?.toLowerCase()
    if (term) {
      const terms = term.split(' ').filter((t) => t)
      return items.filter((skill) =>
        terms.every(
          (term) =>
            skill.name.toLowerCase().includes(term) ||
            this.i18n.transform(skill.metadata?.description).toLowerCase().includes(term)
        )
      )
    }
    return items
  })

  readonly configuredSkillIds = computed(() => [...new Set(this.skills() ?? [])])
  readonly availableSkillIdSet = computed(
    () =>
      new Set(
        this.allSkills()
          .map((skill) => skill.id)
          .filter((id): id is string => !!id)
      )
  )
  readonly unavailableSelectedSkillIds = computed(() => {
    const availableSkillIds = this.availableSkillIdSet()
    return this.configuredSkillIds().filter((id) => !availableSkillIds.has(id))
  })
  readonly usesDefaultSkills = computed(() => {
    const configuredSkillIds = this.configuredSkillIds()
    if (this.skills() == null || !configuredSkillIds.length) {
      return true
    }
    return configuredSkillIds.every((id) => !this.availableSkillIdSet().has(id))
  })
  readonly selectedSkillIdSet = computed(() =>
    this.usesDefaultSkills() ? this.availableSkillIdSet() : new Set(this.configuredSkillIds())
  )
  readonly visibleSelectedSkillIds = computed(() => {
    const selectedSkillIds = this.selectedSkillIdSet()
    return this.skillList()
      .map((skill) => skill.id)
      .filter((id): id is string => !!id && selectedSkillIds.has(id))
  })
  readonly allSelected = computed(
    () =>
      this.skillList().length > 0 &&
      this.skillList().every((skill) => !!skill.id && this.selectedSkillIdSet().has(skill.id))
  )
  readonly partialSelected = computed(
    () => this.visibleSelectedSkillIds().length > 0 && this.visibleSelectedSkillIds().length < this.skillList().length
  )

  onChange: (value: string[] | null) => void = () => undefined
  onTouched: () => void = () => undefined

  writeValue(obj: unknown): void {
    this.skills.set(Array.isArray(obj) ? obj.filter((id): id is string => typeof id === 'string') : null)
  }
  registerOnChange(fn: (value: string[] | null) => void): void {
    this.onChange = fn
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  enabledSkill(id?: string | null) {
    return !!id && this.selectedSkillIdSet().has(id)
  }

  onChangeSkill(id: string | null | undefined, enabled: boolean) {
    if (!id) {
      return
    }

    const currentSkills = Array.from(this.selectedSkillIdSet())
    const nextSkills = enabled
      ? [...new Set([...currentSkills, id])]
      : currentSkills.filter((skillId) => skillId !== id)
    this.setSelectedSkills(nextSkills)
  }

  toggleSelectAll(event: Event) {
    const checkbox = event.target as HTMLInputElement
    if (checkbox.checked) {
      this.resetToDefaultSkills()
    } else {
      this.setSelectedSkills([])
    }
  }

  resetToDefaultSkills() {
    this.skills.set(null)
    this.onChange(null)
  }

  removeUnavailableSkills() {
    const availableSkillIds = this.availableSkillIdSet()
    const nextSkills = this.configuredSkillIds().filter((id) => availableSkillIds.has(id))
    if (this.usesDefaultSkills() || nextSkills.length === availableSkillIds.size) {
      this.resetToDefaultSkills()
    } else {
      this.setSelectedSkills(nextSkills)
    }
  }

  private setSelectedSkills(skillIds: string[]) {
    const nextSkills = [...new Set(skillIds)]
    if (nextSkills.length === this.availableSkillIdSet().size) {
      this.resetToDefaultSkills()
      return
    }

    this.skills.set(nextSkills)
    this.onChange(nextSkills)
  }
}
