import { Dialog, DialogRef } from '@angular/cdk/dialog'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  untracked,
  ViewContainerRef
} from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpI18nPipe, ZardButtonComponent, ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, ToastrService, TWorkflowTriggerMeta, XpertAPIService } from '../../../@core'
import { IconComponent } from '../../../@shared/avatar'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'
import { AssistantTriggerDialogComponent } from './assistant-trigger-dialog.component'
import {
  AssistantTriggerCard,
  buildAssistantTriggerCards,
  isAssistantTriggerConnected,
  mergeAssistantTrigger
} from './assistant-trigger.utils'

@Component({
  standalone: true,
  selector: 'xp-assistant-triggers',
  imports: [TranslateModule, XpI18nPipe, IconComponent, ZardButtonComponent, ZardIconComponent, ...ZardCardImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-base font-semibold">{{ 'XP.AssistantSettings.AvailableTriggers' | translate }}</h2>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          {{ 'XP.AssistantSettings.TriggersIntro' | translate }}
        </p>
      </div>
      <button
        z-button
        zType="outline"
        type="button"
        [zDisabled]="loading() || !facade.organizationId()"
        (click)="refresh()"
      >
        <z-icon zType="refresh" />{{ 'XP.AssistantSettings.Refresh' | translate }}
      </button>
    </div>
    @if (facade.loading() || loading() || facade.loadingTriggerDraft()) {
      <p role="status" class="py-12 text-center text-sm text-muted-foreground">
        {{ 'XP.AssistantSettings.LoadingTriggers' | translate }}
      </p>
    } @else if (facade.viewState() !== 'ready' || !facade.xpertId()) {
      <p
        role="status"
        class="rounded-lg border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground"
      >
        {{ 'XP.AssistantSettings.BindingRequired' | translate }}
      </p>
    } @else if (error() || facade.triggerDraftErrorMessage()) {
      <p role="alert" class="rounded-lg border border-border p-4 text-sm text-destructive">
        {{ error() || facade.triggerDraftErrorMessage() }}
      </p>
    } @else {
      <div class="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2">
        @for (card of cards(); track card.key) {
          <z-card class="gap-0 p-0 shadow-none"
            ><z-card-content class="p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  @if (card.icon) {
                    <xp-icon [icon]="card.icon" [size]="24" class="shrink-0" />
                  } @else {
                    <z-icon zType="zap" zSize="xl" />
                  }
                  <h3 class="text-base font-medium">{{ card.provider.label | i18n }}</h3>
                </div>
                <button
                  z-button
                  [zType]="connected(card) ? 'outline' : 'default'"
                  type="button"
                  [zDisabled]="
                    (!card.available && !connected(card)) ||
                    !!connectingKey() ||
                    disconnecting() ||
                    facade.savingTriggerDraft()
                  "
                  [attr.aria-label]="(actionLabel(card) | translate) + ' ' + (card.provider.label | i18n)"
                  (click)="toggleConnection(card)"
                >
                  {{ actionLabel(card) | translate }}
                </button>
              </div>
              <p class="mt-3 text-xs leading-5 text-muted-foreground">
                {{
                  (!card.available
                    ? 'XP.AssistantSettings.TriggerUnavailable'
                    : connected(card)
                      ? 'XP.AssistantSettings.TriggerInDraft'
                      : 'XP.AssistantSettings.TriggerAvailable'
                  ) | translate
                }}
              </p>
            </z-card-content></z-card
          >
        } @empty {
          <p
            class="col-span-full rounded-lg border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground"
          >
            {{ 'XP.AssistantSettings.NoAvailableTriggers' | translate }}
          </p>
        }
      </div>
      <p class="mt-5 text-xs leading-5 text-muted-foreground">
        {{ 'XP.AssistantSettings.TriggerSaveHint' | translate }}
      </p>
    }
  `
})
export class AssistantTriggersComponent implements OnDestroy {
  readonly facade = inject(ClawXpertFacade)
  private readonly toastr = inject(ToastrService)
  private readonly api = inject(XpertAPIService)
  private readonly dialog = inject(Dialog)
  private readonly viewContainerRef = inject(ViewContainerRef)
  private readonly translate = inject(TranslateService)
  private readonly i18n = new XpI18nPipe()
  readonly providers = signal<TWorkflowTriggerMeta[]>([])
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly cards = computed(() => buildAssistantTriggerCards(this.providers(), this.facade.triggerEditorItems()))
  readonly connectingKey = signal<string | null>(null)
  readonly disconnecting = signal(false)
  readonly connected = isAssistantTriggerConnected
  private requestId = 0
  private configDialog: DialogRef<boolean> | null = null

  constructor() {
    effect(() => {
      const organizationId = this.facade.organizationId()
      const xpertId = this.facade.xpertId()
      untracked(() => {
        this.requestId++
        this.providers.set([])
        this.error.set(null)
        this.loading.set(false)
        this.configDialog?.close()
        if (organizationId && xpertId) void this.refresh()
      })
    })
  }

  async refresh() {
    const requestId = ++this.requestId
    this.loading.set(true)
    this.error.set(null)
    try {
      const providers = await firstValueFrom(this.api.getTriggerProviders())
      if (requestId === this.requestId) this.providers.set(providers)
    } catch (error) {
      if (requestId === this.requestId)
        this.error.set(getErrorMessage(error) || this.translate.instant('XP.AssistantSettings.TriggerLoadFailed'))
    } finally {
      if (requestId === this.requestId) this.loading.set(false)
    }
  }

  configure(card: AssistantTriggerCard) {
    if (
      this.configDialog ||
      this.disconnecting() ||
      this.facade.savingTriggerDraft() ||
      !card.available ||
      this.facade.viewState() !== 'ready'
    )
      return
    this.configDialog = this.dialog.open<boolean>(AssistantTriggerDialogComponent, {
      viewContainerRef: this.viewContainerRef,
      data: {
        card: structuredClone(card),
        organizationId: this.facade.organizationId(),
        xpertId: this.facade.xpertId()
      },
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      ariaLabel: this.i18n.transform(card.provider.label)
    })
    this.connectingKey.set(card.key)
    this.configDialog.closed.subscribe(() => {
      this.configDialog = null
      this.connectingKey.set(null)
    })
  }

  actionLabel(card: AssistantTriggerCard) {
    if (this.connectingKey() === card.key) return 'XP.AssistantSettings.Connecting'
    return this.connected(card) ? 'XP.AssistantSettings.Disconnect' : 'XP.AssistantSettings.Connect'
  }

  async toggleConnection(card: AssistantTriggerCard) {
    if (
      this.connectingKey() ||
      this.disconnecting() ||
      this.facade.savingTriggerDraft() ||
      this.facade.viewState() !== 'ready'
    )
      return
    if (!this.connected(card)) {
      this.configure(card)
      return
    }
    const items = this.facade.triggerEditorItems()
    const item = items.find((item) => item.nodeKey === card.item?.nodeKey)
    if (!item) return
    this.disconnecting.set(true)
    try {
      const saved = await this.facade.saveTriggerDraft(
        mergeAssistantTrigger(items, {
          ...item,
          config: { ...item.config, enabled: false }
        })
      )
      if (!saved) this.toastr.error(this.translate.instant('XP.AssistantSettings.TriggerSaveFailed'))
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.disconnecting.set(false)
    }
  }

  ngOnDestroy() {
    this.requestId++
    this.configDialog?.close()
  }
}
