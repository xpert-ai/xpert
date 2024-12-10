import { TextFieldModule } from '@angular/cdk/text-field'
import { Component, effect, inject, signal } from '@angular/core'
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { EMPTY, pipe, switchMap } from 'rxjs'
import { AiBusinessRole, AiProvider, CopilotExampleService, ToastrService, getErrorMessage } from '../../../../@core'
import { CopilotExamplesComponent } from '../examples/examples.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot-example',
  templateUrl: './example.component.html',
  styleUrls: ['./example.component.scss'],
  imports: [TranslateModule, MaterialModule, TextFieldModule, FormsModule, ReactiveFormsModule, NgmCommonModule]
})
export class CopilotExampleComponent extends TranslationBaseComponent {

  DisplayBehaviour = DisplayBehaviour

  readonly examplesComponent = inject(CopilotExamplesComponent)
  readonly exampleService = inject(CopilotExampleService)
  readonly _toastrService = inject(ToastrService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly fb = inject(FormBuilder)
  readonly paramId = injectParams('id')

  readonly formGroup = this.fb.group({
    provider: new FormControl<AiProvider | string>(null),
    role: new FormControl<AiBusinessRole | string>(null),
    command: new FormControl(null, [Validators.required]),
    input: new FormControl(null, [Validators.required]),
    output: new FormControl(null, [Validators.required]),
  })

  readonly roles = this.examplesComponent.roles
  readonly commands = this.examplesComponent.commands

  readonly example = derivedFrom([this.paramId], pipe(
    switchMap(([id]) => id ? this.exampleService.getById(id) : EMPTY)
  ), {
    initialValue: null
  })

  readonly loading = signal(true)

  constructor() {
    super()

    effect(() => {
      if (this.example()) {
        this.formGroup.patchValue(this.example())
      } else {
        this.formGroup.reset()
        this.formGroup.patchValue({
          role: this.examplesComponent.roleFilter(),
          command: this.examplesComponent.commandFilter()
        })
      }
      this.formGroup.markAsPristine()
      this.loading.set(false)
    }, { allowSignalWrites: true })
  }

  close(refresh = false) {
    this.examplesComponent.refresh()
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
      this.exampleService.create(this.formGroup.value).subscribe({
        next: () => {
          this.loading.set(false)
          this._toastrService.success('PAC.Messages.SavedSuccessfully', {Default: 'Saved successfully'})
          this.close(true)
        },
        error: (error) => {
          this.loading.set(false)
          this._toastrService.error(getErrorMessage(error))
        }
      })
    }
  }

  update() {
    this.loading.set(true)
    this.exampleService.update(this.paramId(), this.formGroup.value).subscribe({
      next: () => {
        this.loading.set(false)
        this._toastrService.success('PAC.Messages.UpdatedSuccessfully', {Default: 'Updated successfully'})
        this.close(true)
      },
      error: (error) => {
        this.loading.set(false)
        this._toastrService.error(getErrorMessage(error))
      }
    })
  }
}
