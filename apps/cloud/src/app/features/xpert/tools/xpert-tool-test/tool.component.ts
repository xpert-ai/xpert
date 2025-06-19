import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialogModule } from '@angular/material/dialog'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IfAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool, ToastrService, XpertToolService, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { of, shareReplay, switchMap, tap } from 'rxjs'
import { XpertToolsetToolTestComponent } from '../tool-test'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatDialogModule,
    MatTooltipModule,
    MatSlideToggleModule,
    NgmI18nPipe,
    NgmDensityDirective,
    NgmSpinComponent,
    XpertToolsetToolTestComponent
  ],
  selector: 'xpert-tool-test',
  templateUrl: './tool.component.html',
  styleUrl: 'tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [...IfAnimations]
})
export class XpertToolTestComponent {
  readonly toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly toolService = inject(XpertToolService)

  readonly tool = input<IXpertTool>()
  readonly disabled = input<boolean>(false)
  readonly enabled = model<boolean>()
  readonly toolId = computed(() => this.tool()?.id)

  readonly toolDetail$ = toObservable(this.toolId).pipe(
    switchMap((id) => {
      if (id) {
        this.loading.set(true)
        return this.toolService.getOneById(id)
      }
      return of(null)
    }),
    tap(() => this.loading.set(false)),
    shareReplay(1)
  )
  // readonly parameter$ = this.toolDetail$.pipe(map((toolDetail) => toolDetail?.provider.parameters))
  readonly toolAvatar = computed(() => this.tool()?.avatar)

  readonly expand = model(false)
  readonly loading = signal(false)

  toggleExpand() {
    if (!this.disabled()) {
      this.expand.update((state) => !state)
    }
  }

  updateTool(id: string, value: Partial<IXpertTool>) {}
}
