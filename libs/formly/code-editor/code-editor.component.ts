import { Dialog } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { NgmConfirmCodeEditorComponent } from '@metad/ocap-angular/editor'
import { FieldType } from '@ngx-formly/core'
import { isUndefined } from 'lodash-es'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'pac-formly-code-editor',
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss']
})
export class PACFormlyCodeEditorComponent extends FieldType {
  readonly #dialog = inject(Dialog)

  async openCodeEditorDialog() {
    const result = await firstValueFrom(
      this.#dialog.open(NgmConfirmCodeEditorComponent, {
        panelClass: 'large',
        data: {
          model: this.field.formControl!.value,
          language: this.props?.language,
          onApply: (model) => {
            this.field.formControl!.setValue(model)
          }
        }
      }).closed
    )
    if (!isUndefined(result)) {
      this.field.formControl!.setValue(result)
    }
  }
}
