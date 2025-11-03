import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, effect, HostListener, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { injectOrganizationId } from '@metad/cloud/state'
import { AiProviderRole, ICopilot } from '@metad/contracts'
import { CapitalizePipe, DisappearAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, injectCopilots, injectCopilotServer, injectToastr } from 'apps/cloud/src/app/@core'
import { CopilotAiProvidersComponent, CopilotProviderComponent } from 'apps/cloud/src/app/@shared/copilot'
import { capitalize } from 'lodash-es'
import { map, Observable, switchMap } from 'rxjs'
import { PACCopilotService } from '../../../services'
import { CopilotFormComponent } from '../copilot-form/copilot-form.component'


@Component({
  standalone: true,
  selector: 'pac-settings-copilot-basic',
  templateUrl: './basic.component.html',
  styleUrls: ['./basic.component.scss'],
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatTooltipModule,
    NgmDensityDirective,
    NgmSpinComponent,
    NgmI18nPipe,
    CapitalizePipe,
    CopilotProviderComponent,
    CopilotFormComponent
  ],
  animations: [...DisappearAnimations]
})
export class CopilotBasicComponent {
  eAiProviderRole = AiProviderRole
  
  readonly copilotService = inject(PACCopilotService)
  readonly copilotServer = injectCopilotServer()
  readonly #toastr = injectToastr()
  readonly organizationId = injectOrganizationId()
  readonly avaliableCopilots = injectCopilots()
  readonly #dialog = inject(Dialog)

  readonly #copilots = toSignal(
    this.copilotServer.refresh$.pipe(
      switchMap(() => this.copilotServer.getAllInOrg()),
      map(({ items }) => items)
    )
  )
  readonly primary = computed(() =>
    this.#copilots()?.find((_) => _.role === AiProviderRole.Primary)
  )

  readonly copilots = computed(() =>
    this.#copilots()?.filter((_) => _.role !== AiProviderRole.Primary)
  )

  // Free quota for organizations in tenant
  readonly quotaCopilots = computed(() => {
    return this.organizationId() ? this.avaliableCopilots()?.filter((item) => !item.organizationId && item.modelProvider) : []
  })

  readonly providers = signal([
    {
      value: AiProviderRole.Secondary,
      label: capitalize(AiProviderRole.Secondary)
    },
    {
      value: AiProviderRole.Embedding,
      label: capitalize(AiProviderRole.Embedding)
    },
    {
      value: AiProviderRole.Reasoning,
      label: capitalize(AiProviderRole.Reasoning)
    }
  ])

  readonly loading = signal(false)

  // Edit
  readonly editingId = signal<string | null>(null)
  readonly name = model<string>('')
  
  constructor() {
    this.copilotServer.refresh()

    effect(() => {
      // console.log(this.quotaCopilots())
    })
  }

  onToggle(copilot: ICopilot, role: AiProviderRole, current: boolean, expansion: MatExpansionPanel) {
    let updateObs: Observable<unknown>
    if (copilot) {
      updateObs = this.copilotServer.update(copilot.id, { enabled: !current })
    } else {
      updateObs = current ? this.copilotServer.disableCopilot(role) : this.copilotServer.enableCopilot(role)
    }

    this.loading.set(true)
    updateObs.subscribe({
      next: () => {
        this.loading.set(false)
        current ? expansion.close() : expansion.open()
        this.copilotServer.refresh()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  /**
   * Add AI Model Provider for role.
   * 
   * @param role Provider role
   */
  addProvider(role: AiProviderRole) {
    this.loading.set(true)
    this.copilotServer.create({ role, enabled: true })
        .pipe(
          switchMap((copilot) => {
            return this.#dialog.open<string>(CopilotAiProvidersComponent, {
              data: {
                copilot
              }
            }).closed
          })
        )
    .subscribe({
      next: (copilotProvider) => {
        this.loading.set(false)
        this.copilotServer.refresh()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  deleteCopilot(copilot: ICopilot) {
    this.loading.set(true)
    this.copilotServer.delete(copilot.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.copilotServer.refresh()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  editName(event: Event, copilot: ICopilot) {
    event.stopPropagation();
    this.editingId.set(copilot.id)
    this.name.set(copilot.name || '')
  }

  saveCopilotName(copilot: ICopilot) {
    this.loading.set(true)
    this.copilotServer.update(copilot.id, { name: this.name() }).subscribe({
      next: () => {
        this.loading.set(false)
        this.editingId.set(null)
        this.name.set('')
        this.copilotServer.refresh()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.editingId()) {
      this.editingId.set(null)
      this.name.set('')
    }
  }
}
