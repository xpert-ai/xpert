import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
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
import type { MembershipAdminComponent } from './membership.component'

/** Presentation only: the existing membership controller owns validation and mutations. */
@Component({
  selector: 'xp-membership-plan-editor',
  standalone: true,
  imports: [
    CommonModule,
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
  readonly admin = input.required<MembershipAdminComponent>()
}
