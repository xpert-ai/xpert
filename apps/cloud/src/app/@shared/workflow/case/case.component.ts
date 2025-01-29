import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { injectToastr, TWFCase, WorkflowLogicalOperator, XpertService } from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-workflow-case',
  templateUrl: './case.component.html',
  styleUrls: ['./case.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, MatTooltipModule],
})
export class XpertWorkflowCaseComponent {
  eWorkflowLogicalOperator = WorkflowLogicalOperator

  readonly elementRef = inject(ElementRef)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly case = model<TWFCase>()
  readonly index = model<number>()
  readonly first = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly deleted = output<void>()

  // States
  readonly conditions = computed(() => this.case()?.conditions)
  readonly logicalOperator = computed(() => this.case()?.logicalOperator)

  readonly loading = signal(false)
}
