import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IModelGatewayCall, IModelGatewayCallBody } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-model-gateway-call-body-dialog',
  imports: [CommonModule, TranslateModule, ZardButtonComponent, ...XpDialogFrameImports],
  template: `
    <section xpDialogLayout="wide" class="max-h-[80vh]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.ModelGateway.CallDetails' | translate: { Default: 'Call details' } }}
        </h2>
        <code class="block truncate text-xs text-text-tertiary" [title]="data.call.requestId">
          {{ data.call.requestId }}
        </code>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>

      <div xpDialogBody>
        <section>
          <h3 class="mb-2 text-sm font-medium text-text-primary">
            {{ 'XP.ModelGateway.RequestBody' | translate: { Default: 'Request body' } }}
          </h3>
          <pre
            class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-components-panel-bg p-3 text-xs text-text-secondary"
            >{{ format(data.body.request) }}</pre
          >
        </section>
        <section>
          <h3 class="mb-2 text-sm font-medium text-text-primary">
            {{ 'XP.ModelGateway.ResponseBody' | translate: { Default: 'Response body' } }}
          </h3>
          <pre
            class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-components-panel-bg p-3 text-xs text-text-secondary"
            >{{ format(data.body.response) }}</pre
          >
        </section>
        @if (data.body.expiresAt) {
          <p class="text-xs text-text-tertiary">
            {{
              'XP.ModelGateway.BodyExpiresAt'
                | translate
                  : {
                      Default: 'Retained until ' + formatDate(data.body.expiresAt),
                      value: formatDate(data.body.expiresAt)
                    }
            }}
          </p>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelGatewayCallBodyDialogComponent {
  readonly data = inject<{ call: IModelGatewayCall; body: IModelGatewayCallBody }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)

  format(value: unknown) {
    if (value === null || value === undefined) {
      return '—'
    }
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }

  formatDate(value: Date | string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  }

  close() {
    this.#dialogRef.close()
  }
}
