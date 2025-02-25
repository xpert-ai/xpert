import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { EMPTY, of, switchMap } from 'rxjs'
import {
  getErrorMessage,
  IIntegration,
  injectToastr,
  INTEGRATION_PROVIDERS,
  IntegrationEnum,
  IntegrationService,
  IXpert,
  TIntegrationProvider,
  XpertService
} from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'
import { IntegrationFormComponent } from '../../integration'

@Component({
  standalone: true,
  selector: 'xpert-publish-dialog',
  templateUrl: './publish.component.html',
  styleUrls: ['publish.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    TextFieldModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    IntegrationFormComponent,
    NgmI18nPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertPublishComponent {
  eIntegrationEnum = IntegrationEnum
  readonly #dialogRef = inject(DialogRef)
  readonly #dialog = inject(Dialog)
  readonly #data = inject<{ xpert: IXpert }>(DIALOG_DATA)
  readonly #toastr = injectToastr()
  readonly integrationService = inject(IntegrationService)
  readonly xpertService = inject(XpertService)
  readonly i18n = new NgmI18nPipe()

  readonly xpertId = signal(this.#data.xpert.id)

  readonly loading = signal(false)

  readonly providers = signal(Object.keys(INTEGRATION_PROVIDERS).map((name) => INTEGRATION_PROVIDERS[name]).filter((p) => p.webhook))

  readonly xpert = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getById(this.xpertId(), { relations: ['integrations'] }) : of(null)
  })
  readonly integrations = signal<IIntegration[]>([])

  readonly selectedIntegrations = signal<IIntegration[]>([])
  readonly integration = model<IIntegration>()

  constructor() {
    effect(
      () => {
        if (this.xpert()) {
          this.integrations.set(this.xpert().integrations)
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.selectedIntegrations()) {
          this.integration.set(this.selectedIntegrations()[0])
        }
      },
      { allowSignalWrites: true }
    )
  }

  onStart(statement: string): void {
    this.#dialogRef.close(statement)
  }

  close() {
    this.#dialogRef.close()
  }

  selectIntegration(integration: IIntegration) {
    this.selectedIntegrations.set([integration])
  }

  addIntegration(provider: TIntegrationProvider) {
    if (!provider.pro) {
      const integration = {
        provider: provider.name,
        name: this.#data.xpert.name,
        description: this.#data.xpert.description,
        avatar: this.#data.xpert.avatar
      } as IIntegration

      this.selectedIntegrations.set([integration])
      this.integrations.update((state) => [...state, integration])
    }
  }

  updateIntegration(integration: IIntegration) {
    this.selectedIntegrations.set([integration])
  }

  cancel() {
    this.selectedIntegrations.set([])
  }

  save(value: Partial<IIntegration>) {
    this.loading.set(true)
    this.xpertService
      .publishIntegration(this.#data.xpert.id, {
        ...value,
        options: {
          ...value.options,
          xpertId: this.#data.xpert.id
        }
      })
      .subscribe({
        next: (response) => {
          this.#toastr.success('PAC.Xpert.XpertPublished', { Default: 'Xpert published successfully!' })
          this.loading.set(false)
          this.selectedIntegrations.set([response])
        },
        error: (error) => {
          this.#toastr.danger(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  remove(integration: IIntegration) {
    if (integration.id) {
      this.#dialog
        .open(CdkConfirmDeleteComponent, {
          data: {
            value: integration.name,
            information: integration.description
          }
        })
        .closed.pipe(switchMap((confirm) => (confirm ? this.delete(integration.id) : EMPTY)))
        .subscribe({
          next: () => {
            this.#toastr.success('PAC.Xpert.XpertPublishDeleted', { Default: 'Xpert publish deleted!' })
            this.loading.set(false)
            this.selectedIntegrations.set([])
            this.integrations.update((state) => state.filter((_) => _.id !== integration.id))
          },
          error: (error) => {
            this.#toastr.danger(getErrorMessage(error))
            this.loading.set(false)
          }
        })
    } else {
      this.selectedIntegrations.set([])
      this.integrations.update((state) => state.filter((_) => _ !== integration))
    }
  }

  delete(id: string) {
    this.loading.set(true)
    return this.xpertService.removeIntegration(this.#data.xpert.id, id)
  }
}
