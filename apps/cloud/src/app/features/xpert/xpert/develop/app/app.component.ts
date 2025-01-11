import { Clipboard } from '@angular/cdk/clipboard'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TChatApp } from '@metad/contracts'
import { SlideUpAnimation } from '@metad/core'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectToastr } from 'apps/cloud/src/app/@core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MatTooltipModule, MatButtonModule, MatSlideToggleModule, ButtonGroupDirective],
  selector: 'xpert-develop-app',
  templateUrl: './app.component.html',
  styleUrl: 'app.component.scss',
  animations: [SlideUpAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertDevelopAppComponent {
  readonly #data = inject<{ app: TChatApp }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()

  readonly app = model(this.#data.app)

  get public() {
    return this.app()?.public
  }
  set public(value) {
    this.app.update((state) => ({ ...(state ?? {}), public: value }))
  }

  close() {
    this.#dialogRef.close()
  }

  apply() {
    this.#dialogRef.close(this.app())
  }
}
