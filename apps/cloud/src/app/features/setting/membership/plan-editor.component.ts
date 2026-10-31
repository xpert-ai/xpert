import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardCheckboxComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import type { MembershipAdminComponent } from './membership.component'

/** Presentation only: the existing membership controller owns validation and mutations. */
@Component({
  selector: 'xp-membership-plan-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardCardImports,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './plan-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' }
})
export class MembershipPlanEditorComponent {
  readonly modelFilter = signal('')
  readonly modelSearch = signal('')
  readonly modelTypes = Object.values(AiModelTypeEnum)
  filteredModels() {
    return this.admin()
      .allowedModelOptions()
      .filter(
        (option) =>
          (!this.modelFilter() || option.modelType === this.modelFilter()) &&
          this.admin().modelTargetLabel(option).toLowerCase().includes(this.modelSearch().toLowerCase())
      )
  }
  toggleModel(value: string, checked: boolean) {
    const selected = new Set(this.admin().allowedModelValues())
    checked ? selected.add(value) : selected.delete(value)
    this.admin().setAllowedModelValues([...selected])
  }
  readonly admin = input.required<MembershipAdminComponent>()
}
