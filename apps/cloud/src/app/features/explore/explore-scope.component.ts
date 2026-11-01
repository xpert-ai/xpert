import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { Building2, Globe2 } from 'lucide-angular'
import { ExploreScopeService } from './explore-scope.service'

@Component({
  standalone: true,
  selector: 'xp-explore-scope',
  imports: [TranslateModule, ZardButtonComponent, ZardIconComponent],
  template: `
    <div class="flex min-w-0 items-center" [class]="compact() ? 'gap-2' : 'flex-wrap gap-x-4 gap-y-2 py-1'">
      <div class="flex min-w-0 max-w-full items-center gap-3">
        <span class="shrink-0 text-xs font-medium text-muted-foreground">
          {{ 'XP.Explore.Scope.Label' | translate }}
        </span>
        <button
          z-button
          zType="outline"
          type="button"
          aria-haspopup="dialog"
          [title]="
            ('XP.Explore.Scope.Select' | translate) +
            ' · ' +
            ((scope.isTenant() ? 'XP.Explore.Scope.TenantHint' : 'XP.Explore.Scope.OrganizationHint') | translate)
          "
          class="group min-w-0 max-w-full shrink gap-2 rounded-full border-border/70 bg-card py-1 pl-1 pr-3 shadow-xs hover:border-border hover:bg-muted/60"
          [class]="compact() ? 'h-9' : 'h-10'"
          (click)="scope.choose()"
        >
          <span
            aria-hidden="true"
            class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground"
          >
            <z-icon [zType]="scope.isTenant() ? tenantIcon : organizationIcon" zSize="lg" [zStrokeWidth]="1.75" />
          </span>
          <span class="truncate text-sm font-medium text-foreground" [class]="compact() ? 'max-w-40' : 'max-w-72'">{{
            scope.isTenant() ? ('XP.Explore.Scope.Tenant' | translate) : scope.organizationName()
          }}</span>
          <z-icon zType="chevron-down" zSize="sm" class="ml-1 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
      @if (!compact()) {
        <span aria-hidden="true" class="hidden h-4 w-px bg-border sm:block"></span>
        <p class="min-w-0 basis-full text-sm leading-6 text-muted-foreground sm:basis-auto">
          {{ (scope.isTenant() ? 'XP.Explore.Scope.TenantHint' : 'XP.Explore.Scope.OrganizationHint') | translate }}
        </p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' }
})
export class ExploreScopeComponent {
  readonly compact = input(false)
  readonly scope = inject(ExploreScopeService)
  readonly tenantIcon = Globe2
  readonly organizationIcon = Building2
}
