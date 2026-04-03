import { ClipboardModule } from '@angular/cdk/clipboard'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, computed, effect, inject, model, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule } from '@angular/forms'
import { debouncedSignal, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { injectWorkspace } from '@metad/cloud/state'
import { injectSkillPackageAPI } from 'apps/cloud/src/app/@core'
import { tap } from 'rxjs'
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

  readonly cdr = inject(ChangeDetectorRef)
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

  // Resource
  readonly #skillResource = myRxResource({
    request: () => ({
      workspaceId: this.#workspaceId()
    }),
    loader: ({ request }) => {
      return request.workspaceId
        ? this.skillPackageAPI.getAllByWorkspace(request.workspaceId, {
            relations: ['skillIndex', 'skillIndex.repository']
          }).pipe(tap(() => {
            setTimeout(() => {
             this.cdr.detectChanges() 
            })
          }))
        : null
    }
  })
  
  readonly loading = computed(() => this.#skillResource.status() === 'loading')
  
  readonly search = model<string>()
  readonly searchTerm = debouncedSignal(this.search, 300)
  readonly skillList = computed(() => {
    const items = this.#skillResource.value()?.items || []
    const term = this.searchTerm()?.toLowerCase()
    if (term) {
      const terms = term.split(' ').filter((t) => t)
      return items.filter((skill) => 
        terms.every((term) =>
          skill.name.toLowerCase().includes(term) || (this.i18n.transform(skill.metadata?.description).toLowerCase().includes(term))
        )
      )
    }
    return items
  })

  readonly allSelected = computed(() => this.skills() == null)
  readonly partialSelected = computed(() => this.skills()?.length > 0 && this.skills()?.length < (this.skillList()?.length || 0))


  onChange: any = () => {}
  onTouched: any = () => {}

  constructor() {
    effect(() => {
      const skills = this.skills()
      if (this.skillList()) {
        this.cdr.detectChanges()
      }
    })
  }

  writeValue(obj: any): void {
    this.skills.set(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    //
  }

  enabledSkill(id: string) {
    return this.skills()?.includes(id)
  }

  onChangeSkill(id: string, enabled: boolean) {
    const currentSkills = this.skills() || []
    if (enabled) {
      this.skills.set([...currentSkills, id])
    } else {
      this.skills.set(currentSkills.filter((skillId) => skillId !== id))
    }
    this.onChange(this.skills())
  }

  toggleSelectAll(event: Event) {
    const checkbox = event.target as HTMLInputElement
    if (checkbox.checked) {
      this.skills.set(null)
    } else {
      this.skills.set([])
    }
    this.onChange(this.skills())
  }
}
