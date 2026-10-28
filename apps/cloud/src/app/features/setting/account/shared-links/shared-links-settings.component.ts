import { Dialog } from '@angular/cdk/dialog'
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-shared-links-settings',
  imports: [TranslateModule, ZardButtonComponent],
  template: `
    <section class="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
      <div>
        <h2 class="text-sm font-medium text-foreground">{{ 'ConversationShare.ManagementTitle' | translate }}</h2>
        <p class="mt-1 text-xs text-muted-foreground">{{ 'ConversationShare.ManagementHint' | translate }}</p>
      </div>
      <button z-button zType="outline" type="button" (click)="open()">
        {{ 'ConversationShare.Manage' | translate }}
      </button>
      @if (failed()) {
        <p role="alert" class="w-full text-sm text-destructive">
          {{ 'ConversationShare.ManagementLoadFailed' | translate }}
        </p>
      }
    </section>
  `
})
export class SharedLinksSettingsComponent implements OnInit {
  private readonly dialog = inject(Dialog)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private opening = false
  readonly failed = signal(false)

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params.get('dialog') === 'shared-links') void this.open()
    })
  }

  async open() {
    if (this.opening) return
    this.opening = true
    this.failed.set(false)
    try {
      const { SharedLinksDialogComponent } = await import('./shared-links-dialog.component')
      if (this.destroyRef.destroyed) return
      const ref = this.dialog.open(SharedLinksDialogComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        ariaLabelledBy: 'shared-links-heading'
      })
      this.destroyRef.onDestroy(() => ref.close())
      ref.closed.subscribe(() => {
        this.opening = false
        if (!this.destroyRef.destroyed && this.route.snapshot.queryParamMap.get('dialog') === 'shared-links') {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { dialog: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
          })
        }
      })
    } catch {
      this.opening = false
      this.failed.set(true)
    }
  }
}
