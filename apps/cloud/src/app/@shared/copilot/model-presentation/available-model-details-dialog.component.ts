import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { IModelAccessCatalogItem, ParameterRule } from '@xpert-ai/contracts'
import { XpDialogFrameImports, XpI18nPipe, ZardButtonComponent, ZardTableImports } from '@xpert-ai/headless-ui'
import { catchError, map, Observable, of, startWith, Subject, switchMap } from 'rxjs'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { AvailableModelMetadata, findAvailableModelMetadata, modelParameterValue } from './available-model-metadata'
import { ModelCapabilityTagComponent } from './model-capability-tag.component'

export type ModelDetailsItem = Pick<
  IModelAccessCatalogItem,
  | 'copilotId'
  | 'copilotModelId'
  | 'copilotName'
  | 'provider'
  | 'providerLabel'
  | 'modelType'
  | 'model'
  | 'modelLabel'
  | 'ownershipScope'
>

export interface ModelDetailsData {
  item: ModelDetailsItem
  metadata?: AvailableModelMetadata
}

interface ModelDetailsState {
  metadata: AvailableModelMetadata | null
  rules: ParameterRule[]
  loading?: boolean
  failed?: boolean
}

@Component({
  standalone: true,
  selector: 'xp-available-model-details-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslateModule,
    XpI18nPipe,
    ModelCapabilityTagComponent,
    ZardButtonComponent,
    ...ZardTableImports,
    ...XpDialogFrameImports
  ],
  templateUrl: './available-model-details-dialog.component.html'
})
export class AvailableModelDetailsDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly data = inject<ModelDetailsData>(DIALOG_DATA)
  readonly item = this.data.item
  readonly #server = inject(CopilotServerService)
  readonly #providers = inject(CopilotProviderService)
  readonly #retry = new Subject<void>()
  readonly formatValue = modelParameterValue
  readonly state = toSignal(
    this.#retry.pipe(
      startWith(undefined),
      switchMap(() => this.loadDetails().pipe(startWith(undefined)))
    )
  )

  private loadDetails(): Observable<ModelDetailsState> {
    // Management passes its full catalog metadata, including disabled models. Account callers retain governed lookup.
    const metadata$ = this.data.metadata
      ? of(this.data.metadata)
      : this.#server
          .getCopilotModels(this.item.modelType)
          .pipe(map((copilots) => findAvailableModelMetadata(this.item, copilots)))
    return metadata$.pipe(
      switchMap((metadata): Observable<ModelDetailsState> => {
        if (!metadata?.providerId) return of({ metadata, rules: [] })
        return this.#providers
          .getModelParameterRules(metadata.providerId, this.item.modelType, this.item.copilotModelId)
          .pipe(
            map((rules) => ({ metadata, rules })),
            startWith({ metadata, rules: [], loading: true }),
            catchError(() => of({ metadata, rules: [], failed: true }))
          )
      }),
      catchError(() => of({ metadata: null, rules: [], failed: true }))
    )
  }

  retry() {
    this.#retry.next()
  }
  close() {
    this.#dialogRef.close()
  }
}
