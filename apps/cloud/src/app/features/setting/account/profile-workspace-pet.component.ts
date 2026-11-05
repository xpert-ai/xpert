import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { rxResource } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { AssistantBindingService } from '../../../@core'
import { WorkspacePetPreference } from '../../assistant/workspace-pet-preference'

@Component({
  selector: 'xp-profile-workspace-pet',
  standalone: true,
  imports: [TranslateModule, ZardSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-border pb-6' },
  template: `
    <section
      aria-labelledby="profile-workspace-heading"
      class="grid min-w-0 gap-5 md:grid-cols-[170px_minmax(0,1fr)] md:gap-8"
    >
      <h2 id="profile-workspace-heading" class="text-base font-semibold text-foreground">
        {{ 'XP.Assistant.XpertShared.Label' | translate }}
      </h2>
      <div class="min-w-0 space-y-2">
        <z-switch
          labelPosition="before"
          class="flex w-full justify-between gap-3 pointer-coarse:min-h-[44px]"
          [checked]="canChoose() && (preference()?.visible() ?? true)"
          [disabled]="!canChoose()"
          (change)="setVisible($event.checked)"
        >
          {{ 'XP.ProfileSettings.ShowWorkspacePet' | translate }}
        </z-switch>
        <p class="text-sm text-muted-foreground" role="status">{{ hint() | translate }}</p>
      </div>
    </section>
  `
})
export class ProfileWorkspacePetComponent {
  private readonly bindings = inject(AssistantBindingService)
  protected readonly preference = inject(WorkspacePetPreference).current
  private readonly binding = rxResource({
    params: () => this.preference()?.key,
    stream: () => this.bindings.isWorkspaceAssistantAvailable()
  })
  protected readonly canChoose = computed(() => this.binding.hasValue() && this.binding.value() === true)
  protected readonly hint = computed(() => {
    if (!this.preference()) return 'XP.ProfileSettings.WorkspacePetSelectOrg'
    if (this.binding.isLoading()) return 'XP.ProfileSettings.WorkspacePetLoading'
    if (this.binding.error()) return 'XP.ProfileSettings.WorkspacePetLoadFailed'
    return this.canChoose() ? 'XP.ProfileSettings.WorkspacePetHint' : 'XP.ProfileSettings.WorkspacePetDisabled'
  })

  protected setVisible(visible: boolean) {
    if (this.canChoose()) this.preference()?.setVisible(visible)
  }
}
