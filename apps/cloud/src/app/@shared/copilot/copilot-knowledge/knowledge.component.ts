import { Dialog } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { EMPTY, pipe, switchMap } from 'rxjs'
import { CopilotExampleService, getErrorMessage, injectToastr, IXpert } from '../../../@core'
import { MatInputModule } from '@angular/material/input'
import { CopilotCommandEnum } from '../types'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatButtonModule,
    MatInputModule,
    NgmCommonModule,
    ButtonGroupDirective
  ],
  selector: 'copilot-knowledge',
  templateUrl: 'knowledge.component.html',
  styleUrls: ['knowledge.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CopilotKnowledgeComponent {
  eDisplayBehaviour = DisplayBehaviour

  readonly exampleService = inject(CopilotExampleService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly fb = inject(FormBuilder)

  readonly paramId = injectParams('id')

  readonly xpert = input<Partial<IXpert>>()

  readonly formGroup = this.fb.group({
    // provider: new FormControl<string>(null),
    // role: new FormControl<string>(null),
    command: new FormControl(null, [Validators.required]),
    input: new FormControl(null, [Validators.required]),
    output: new FormControl(null, [Validators.required])
  })

  readonly xpertName = computed(() => this.xpert()?.name)
  // readonly commands = computed(() => this.examplesComponent()?.commands())
  // readonly commandFilter = computed(() => this.examplesComponent()?.commandFilter())

  readonly commands = signal(Object.values(CopilotCommandEnum))
  readonly commandLabels = toSignal(this.#translate.stream('PAC.Copilot.Commands', {Default: {}}))
  readonly commandOptions = computed(() => {
    const commandLabels = this.commandLabels()
    const commands = this.commands()
    return commands.map((command) => ({
      key: command,
      caption: commandLabels[command] || command.toUpperCase()
    }))
  })

  readonly example = derivedFrom(
    [this.paramId],
    pipe(switchMap(([id]) => (id ? this.exampleService.getById(id) : EMPTY))),
    {
      initialValue: null
    }
  )

  readonly loading = signal(true)

  constructor() {
    effect(
      () => {
        if (this.example()) {
          this.formGroup.patchValue(this.example())
        } else {
          this.formGroup.reset()
          this.formGroup.patchValue({
            // role: this.examplesComponent.roleFilter(),
            // command: this.commandFilter()
          })
        }
        this.formGroup.markAsPristine()
        this.loading.set(false)
      },
      { allowSignalWrites: true }
    )
  }

  close(refresh = false) {
    // this.examplesComponent().refresh()
    this.router.navigate(['../'], { relativeTo: this.route })
  }

  upsert() {
    if (this.paramId()) {
      this.update()
    } else {
      this.save()
    }
  }

  save() {
    if (this.formGroup.valid) {
      this.loading.set(true)
      this.exampleService.create({...this.formGroup.value, role: this.xpertName(), xpertId: this.xpert().id}).subscribe({
        next: () => {
          this.loading.set(false)
          this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
          this.close(true)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
    }
  }

  update() {
    this.loading.set(true)
    this.exampleService.update(this.paramId(), this.formGroup.value).subscribe({
      next: () => {
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
        this.close(true)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
}
