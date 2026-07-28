import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IModelGatewayCall, IModelGatewayCallBody } from '@xpert-ai/contracts'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogRef } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-model-gateway-call-body-dialog',
  imports: [CommonModule, TranslateModule, ZardButtonComponent],
  template: `
    <section class="flex max-h-[80vh] min-h-0 flex-col">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-text-primary">
            {{ 'PAC.ModelGateway.CallDetails' | translate: { Default: 'Call details' } }}
          </h2>
          <code class="mt-1 block truncate text-xs text-text-tertiary" [title]="data.call.requestId">
            {{ data.call.requestId }}
          </code>
        </div>
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'PAC.ACTIONS.Close' | translate: { Default: 'Close' } }}
        </button>
      </div>

      <div class="mt-4 min-h-0 space-y-4 overflow-auto">
        <section>
          <h3 class="mb-2 text-sm font-medium text-text-primary">
            {{ 'PAC.ModelGateway.RequestBody' | translate: { Default: 'Request body' } }}
          </h3>
          <pre
            class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-components-panel-bg p-3 text-xs text-text-secondary"
          >{{ format(data.body.request) }}</pre>
        </section>
        <section>
          <h3 class="mb-2 text-sm font-medium text-text-primary">
            {{ 'PAC.ModelGateway.ResponseBody' | translate: { Default: 'Response body' } }}
          </h3>
          <pre
            class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-components-panel-bg p-3 text-xs text-text-secondary"
          >{{ format(data.body.response) }}</pre>
        </section>
        @if (data.body.expiresAt) {
          <p class="text-xs text-text-tertiary">
            {{
              'PAC.ModelGateway.BodyExpiresAt'
                | translate
                  : {
                      Default: 'Retained until {{value}}',
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
  readonly data = inject<{ call: IModelGatewayCall; body: IModelGatewayCallBody }>(Z_MODAL_DATA)
  readonly #dialogRef = inject<ZardDialogRef<ModelGatewayCallBodyDialogComponent>>(ZardDialogRef)

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
