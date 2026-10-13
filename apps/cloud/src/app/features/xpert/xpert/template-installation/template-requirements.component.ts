import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import type { TemplateReadiness } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-template-requirements',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (readiness(); as details) {
      <section class="space-y-3 border-t border-components-panel-border pt-4">
        <h3 class="font-medium">
          {{ 'XP.Installation.Requirements' | translate }}
          @if (details.manifestVersion) {
            · v{{ details.manifestVersion }}
          }
        </h3>
        @if (details.legacy) {
          <p class="text-sm text-text-secondary">{{ 'XP.Installation.LegacyRequirements' | translate }}</p>
        }
        @if (details.capabilities; as capabilities) {
          <div class="space-y-2 text-sm">
            <p class="text-text-secondary">{{ 'XP.Installation.StructuralCapabilities' | translate }}</p>
            @for (agent of capabilities.agents; track agent.key) {
              <div>
                <strong>{{ agent.label }}</strong>
                @for (middleware of agent.middleware; track $index) {
                  <div class="text-text-secondary">
                    {{ middleware.provider }}
                    @if (middleware.toolNames.length) {
                      · {{ middleware.toolNames.join(', ') }}
                    }
                  </div>
                }
              </div>
            }
            @for (skill of capabilities.skills; track $index) {
              <div>Skill · {{ skill.componentKey }}</div>
            }
            <div>{{ 'XP.Installation.SeedMemoryCount' | translate: { count: capabilities.seedMemoryCount } }}</div>
            @if (capabilities.sandbox) {
              <div>{{ 'XP.Installation.ServerSandbox' | translate }}</div>
            }
          </div>
        }
        <ul class="space-y-2 text-sm">
          @for (check of details.checks; track $index) {
            <li class="flex justify-between gap-3">
              <span class="min-w-0 break-words"
                >{{ check.key }}
                @if (check.version) {
                  · {{ check.version }}
                }
                <span class="ml-2 text-text-secondary">{{
                  (check.required ? 'XP.Installation.Required' : 'XP.Installation.Optional') | translate
                }}</span>
              </span>
              <span
                [class]="
                  check.status === 'ready' || check.status === 'pending-configuration'
                    ? 'text-text-secondary'
                    : 'text-text-destructive'
                "
                >{{ check.message }}</span
              >
            </li>
          }
        </ul>
        @if (details.files; as files) {
          <p class="text-sm">
            {{ (files.scope === 'user' ? 'XP.Installation.UserFiles' : 'XP.Installation.SharedFiles') | translate }}
          </p>
          <ul class="font-mono text-xs">
            @for (entry of files.entries; track entry.path) {
              <li>
                {{ entry.path }}
                @if (entry.version) {
                  · {{ entry.version }}
                }
              </li>
            }
          </ul>
          <p class="text-sm text-text-secondary">{{ 'XP.Installation.PreserveFiles' | translate }}</p>
        }
        @if (needsDependencies()) {
          <button z-button zType="outline" type="button" (click)="manage.emit()">
            {{ 'XP.Installation.ManageDependencies' | translate }}
          </button>
        }
      </section>
    }
  `
})
export class TemplateRequirementsComponent {
  readonly readiness = input<TemplateReadiness>()
  readonly manage = output<void>()
  needsDependencies() {
    return this.readiness()?.checks.some(
      (check) => ['plugin', 'resource'].includes(check.kind) && ['missing', 'incompatible'].includes(check.status)
    )
  }
}
