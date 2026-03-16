
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { routeAnimations } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IBuiltinTool, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { ZardDialogModule, ZardDialogService, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardDialogModule,
    ...ZardTooltipImports,
    NgmI18nPipe,
    ZardSwitchComponent
],
  selector: 'xpert-tool-builtin-parameters',
  templateUrl: './parameters.component.html',
  styleUrl: 'parameters.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertToolBuiltinParametersComponent {
  readonly toolsetService = inject(XpertToolsetService)
  readonly #formBuilder = inject(FormBuilder)
  readonly #dialog = inject(ZardDialogService)
  readonly #cdr = inject(ChangeDetectorRef)

  readonly tool = input<IBuiltinTool>()
}
