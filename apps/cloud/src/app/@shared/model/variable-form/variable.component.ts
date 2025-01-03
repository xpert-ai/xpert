import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmVariableComponent } from '@metad/ocap-angular/controls'
import { ButtonGroupDirective, isNotNil, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DataSettings, VariableProperty } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { injectApiBaseUrl, injectToastr } from '../../../@core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    DragDropModule,
    TextFieldModule,
    TranslateModule,
    ContentLoaderModule,
    MatButtonModule,
    ButtonGroupDirective,
    NgmInputComponent,
    NgmSpinComponent,
    NgmVariableComponent
  ],
  selector: 'model-cube-variable-form',
  templateUrl: 'variable.component.html',
  styleUrls: ['variable.component.scss']
})
export class CubeVariableFormComponent {
  readonly #toastr = injectToastr()
  readonly apiBaseUrl = injectApiBaseUrl()
  readonly i18n = new NgmI18nPipe()
  readonly #data = inject<{
    dataSettings: DataSettings
    variable: VariableProperty
  }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)

  readonly dataSettings = signal(this.#data.dataSettings)
  readonly variable = signal(this.#data.variable)
  readonly name = computed(() => this.variable().name)
  readonly caption = model(this.variable().caption)
  readonly defaultLow = model({
    members: isNotNil(this.variable().defaultLow) ? [{ key: this.variable().defaultLow }] : []
  })

  cancel() {
    this.#dialogRef.close()
  }
  apply() {
    this.#dialogRef.close({
      ...this.variable(),
      caption: this.caption(),
      defaultLow: this.defaultLow()?.members?.[0]?.key
    })
  }
}
