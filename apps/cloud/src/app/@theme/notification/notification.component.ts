import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { DensityDirective, NgmAgentService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { TranslateModule } from '@ngx-translate/core'
import { merge } from 'rxjs'

@Component({
  standalone: true,
  selector: 'pac-notification',
  templateUrl: 'notification.component.html',
  styleUrl: 'notification.component.scss',
  host: {
    class: 'pac-notification'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatMenuModule,
    MatListModule,
    DensityDirective
  ]
})
export class NotificationComponent {
  readonly wasmAgentService = inject(WasmAgentService)
  readonly agentService = inject(NgmAgentService)

  readonly errors = signal([])

  private errorSub = merge(this.wasmAgentService.selectError(), this.agentService.selectError())
    .pipe(takeUntilDestroyed())
    .subscribe((error) => {
      const message = typeof error === 'string' ? error : error?.message
      if (error) {
        this.errors.update((errors) => {
          if (errors.length > 100) {
            errors = errors.slice(1)
          }
          errors.push(message)
          return [...errors]
        })
      }
    })

  clearErrors() {
    this.errors.update(() => [])
  }

  clearError(i: number) {
    this.errors.update((errors) => {
      errors.splice(i, 1)
      return [...errors]
    })
  }
}
