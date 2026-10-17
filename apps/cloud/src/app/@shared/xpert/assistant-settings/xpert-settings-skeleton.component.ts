import { DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-xpert-settings-skeleton',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, ...XpDialogFrameImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <p role="status" class="sr-only">{{ 'XP.XpertSettings.LoadingConfiguration' | translate }}</p>
    <section xpDialogLayout="wide" xpDialogPurpose="workflow" class="h-full flex-row" aria-busy="true">
      <aside
        aria-hidden="true"
        class="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-divider-regular bg-background-default-subtle p-3 sm:flex lg:w-60"
      >
        <div class="space-y-5 motion-safe:animate-pulse">
          <div class="flex items-center gap-2.5">
            <div class="size-10 shrink-0 rounded-xl bg-muted-foreground/15"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="h-4 w-4/5 rounded bg-muted-foreground/15"></div>
              <div class="h-3 w-1/2 rounded bg-muted-foreground/15"></div>
            </div>
          </div>
          <div class="h-9 rounded-md bg-muted-foreground/15"></div>
          @for (group of navigationRows; track $index) {
            <div class="space-y-3 px-2">
              <div class="h-3 w-16 rounded bg-muted-foreground/15"></div>
              @for (row of group; track row) {
                <div class="flex items-center gap-2.5">
                  <div class="size-4 shrink-0 rounded bg-muted-foreground/15"></div>
                  <div class="h-4 rounded bg-muted-foreground/15" [class]="row % 2 ? 'w-24' : 'w-16'"></div>
                </div>
              }
            </div>
          }
        </div>
      </aside>
      <main class="flex min-w-0 flex-1 flex-col">
        <header xpDialogHeader class="border-b border-divider-regular">
          <h2 xpDialogHeading>{{ 'XP.XpertSettings.Title' | translate }}</h2>
          <p xpDialogDescription aria-hidden="true">
            <span class="block h-4 w-64 max-w-full rounded bg-muted-foreground/15 motion-safe:animate-pulse"></span>
          </p>
          <div aria-hidden="true" class="h-9 w-36 rounded-md bg-muted-foreground/15 motion-safe:animate-pulse"></div>
          <button
            type="button"
            z-button
            zType="ghost"
            zSize="icon"
            xpDialogCloseButton
            [attr.aria-label]="'XP.ACTIONS.Close' | translate"
            (click)="dialogRef.close()"
          >
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </header>
        <div xpDialogBody="section" aria-hidden="true">
          <div class="space-y-6 motion-safe:animate-pulse">
            <div class="flex items-center gap-3">
              <div class="size-10 shrink-0 rounded-xl bg-muted-foreground/15"></div>
              <div class="min-w-0 flex-1 space-y-2">
                <div class="h-4 w-20 rounded bg-muted-foreground/15"></div>
                <div class="h-3 w-52 max-w-full rounded bg-muted-foreground/15"></div>
              </div>
            </div>
            @for (row of [0, 1, 2, 3]; track row) {
              <div class="space-y-2">
                <div class="h-4 w-16 rounded bg-muted-foreground/15"></div>
                <div class="w-full rounded-md bg-muted-foreground/15" [class]="row === 1 ? 'h-20' : 'h-9'"></div>
              </div>
            }
            <div class="flex items-center justify-between gap-4 border-t border-divider-regular pt-4">
              <div class="h-4 w-24 rounded bg-muted-foreground/15"></div>
              <div class="h-4 w-12 rounded bg-muted-foreground/15"></div>
            </div>
          </div>
        </div>
        <footer xpDialogFooter aria-hidden="true" class="justify-between">
          <div class="h-4 w-32 rounded bg-muted-foreground/15 motion-safe:animate-pulse"></div>
          <div class="h-10 w-24 rounded-md bg-muted-foreground/15 motion-safe:animate-pulse"></div>
        </footer>
      </main>
    </section>
  `
})
export class XpertSettingsSkeletonComponent {
  readonly dialogRef = inject(DialogRef)
  readonly navigationRows = [
    [0, 1],
    [0, 1, 2, 3],
    [0, 1, 2, 3, 4, 5]
  ]
}
