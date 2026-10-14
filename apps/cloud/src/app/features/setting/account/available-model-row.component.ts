import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { IModelAccessCatalogItem, ModelAccessSourceEnum } from '@xpert-ai/contracts'
import {
  XpI18nPipe,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardTableImports,
  ZardTableRowComponent,
  ZardIconComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { catchError, map, of, startWith, switchMap } from 'rxjs'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { findAvailableModelMetadata } from './available-model-metadata'
import { AvailableModelDetailsDialogComponent } from './available-model-details-dialog.component'
import { ModelCapabilityTagComponent } from './model-capability-tag.component'
import { ModelTypeIconComponent } from './model-type-icon.component'

@Component({
  standalone: true,
  selector: 'tr[xpAvailableModelRow]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslateModule,
    XpI18nPipe,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ModelCapabilityTagComponent,
    ModelTypeIconComponent,
    ...ZardTooltipImports,
    ...ZardTableImports
  ],
  template: `
    <td z-table-cell class="w-14 py-3 text-center text-muted-foreground">
      @let typeLabel = 'XP.ModelAccess.ModelTypeValue.' + item().modelType | translate: { Default: item().modelType };
      <span
        class="inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabindex="0"
        role="img"
        [attr.aria-label]="typeLabel"
        [zTooltip]="typeLabel"
      >
        <xp-model-type-icon [type]="item().modelType" />
      </span>
    </td>
    <td z-table-cell class="max-w-64 py-3">
      <h3 class="truncate text-sm font-medium" [title]="item().modelLabel ? (item().modelLabel | i18n) : item().model">
        {{ item().modelLabel ? (item().modelLabel | i18n) : item().model }}
      </h3>
      @if (item().unavailableReason) {
        <p class="mt-1 flex items-start gap-1.5 text-xs text-text-warning">
          <z-icon zType="info" class="size-3.5 shrink-0" />{{
            'XP.ModelAccess.Unavailable.' + item().unavailableReason | translate
          }}
        </p>
      }
    </td>
    <td z-table-cell class="py-3">
      <div class="flex w-80 items-center gap-1.5 pointer-coarse:w-[32rem]">
        @for (feature of metadata()?.model?.features; track feature) {
          <xp-model-capability-tag [feature]="feature" />
        }
        @if (!metadata()?.model?.features?.length) {
          <span class="text-xs text-muted-foreground">—</span>
        }
      </div>
    </td>
    <td z-table-cell class="whitespace-nowrap py-3 text-xs tabular-nums text-muted-foreground">
      @if (metadata()?.contextSize; as contextSize) {
        <span [zTooltip]="(contextSize | number) + ' tokens'" [attr.aria-label]="(contextSize | number) + ' tokens'">
          @if (contextSize >= 1000000) {
            {{ contextSize / 1000000 | number: '1.0-2' }}M
          } @else if (contextSize >= 1000) {
            {{ contextSize / 1000 | number: '1.0-2' }}K
          } @else {
            {{ contextSize | number }}
          }
        </span>
      } @else {
        —
      }
    </td>
    <td z-table-cell class="py-3">
      <div class="flex flex-wrap items-center gap-2 whitespace-nowrap text-xs">
        <z-badge zType="secondary">{{
          'XP.ModelAccess.Source.' + (item().accessSource || planSource) | translate
        }}</z-badge>
        <span class="text-muted-foreground">{{ 'XP.ModelAccess.Scope.' + item().ownershipScope | translate }}</span>
      </div>
    </td>
    <td
      z-table-cell
      class="sticky right-0 border-l border-border bg-background py-3 text-right md:static md:border-l-0 md:bg-transparent"
    >
      <button z-button zType="ghost" zSize="sm" type="button" (click)="showDetails()">
        {{ 'XP.ModelSettings.PropertiesAndParameters' | translate }}<z-icon zType="chevron-right" />
      </button>
    </td>
  `
})
export class AvailableModelRowComponent extends ZardTableRowComponent {
  readonly item = input.required<IModelAccessCatalogItem>()
  readonly #server = inject(CopilotServerService)
  readonly #dialog = inject(Dialog)
  readonly planSource = ModelAccessSourceEnum.Plan
  // The shared service caches one live, permission-filtered catalog per model type.
  readonly metadata = toSignal(
    toObservable(this.item).pipe(
      switchMap((item) =>
        this.#server.getCopilotModels(item.modelType).pipe(
          map((copilots) => findAvailableModelMetadata(item, copilots)),
          startWith(undefined),
          catchError(() => of(null))
        )
      )
    )
  )

  showDetails() {
    this.#dialog.open(AvailableModelDetailsDialogComponent, {
      data: { item: this.item() },
      width: '800px',
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
  }
}
