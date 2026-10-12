import { Dialog } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { FieldType } from '@ngx-formly/core'
import { isUndefined } from 'lodash-es'
import { firstValueFrom } from 'rxjs'
import { XpConfirmCodeEditorComponent } from './confirm-code-editor.component'

@Component({
  selector: 'xp-formly-code-editor',
  standalone: false,
  templateUrl: './code-editor.component.html',
  styleUrls: ['./code-editor.component.scss']
})
export class XpFormlyCodeEditorComponent extends FieldType {
  readonly #dialog = inject(Dialog)

  async openCodeEditorDialog() {
    const result = await firstValueFrom(
      this.#dialog.open(XpConfirmCodeEditorComponent, {
        panelClass: 'xp-overlay-pane-dialog',
        backdropClass: 'backdrop-blur-xs-black',
        maxWidth: 'calc(100vw - 32px)',
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
