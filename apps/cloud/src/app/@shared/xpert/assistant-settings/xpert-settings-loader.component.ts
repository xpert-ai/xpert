import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NgComponentOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
  type Signal,
  type Type
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import type { XpertSettingsDialogData } from './xpert-settings.types'
import { XpertSettingsSkeletonComponent } from './xpert-settings-skeleton.component'

export type XpertSettingsLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; component: Type<unknown>; data: XpertSettingsDialogData }

export interface XpertSettingsLoaderData {
  state: Signal<XpertSettingsLoadState>
  retry: () => void
}

/** Keep this shell eager so neither API requests nor the editor chunk delay opening the dialog. */
@Component({
  selector: 'xp-xpert-settings-loader',
  standalone: true,
  imports: [
    NgComponentOutlet,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    XpertSettingsSkeletonComponent,
    ...XpDialogFrameImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-[min(780px,calc(100dvh-32px))] w-[min(1120px,calc(100vw-32px))]' },
  template: `
    @if (content(); as content) {
      <div #editorHost class="h-full" tabindex="-1">
        <ng-container *ngComponentOutlet="content.component; injector: content.injector" />
      </div>
    } @else if (state().status === 'loading') {
      <xp-xpert-settings-skeleton />
    } @else {
      <section xpDialogLayout="wide" xpDialogPurpose="workflow" class="h-full">
        <header xpDialogHeader>
          <h2 xpDialogHeading>{{ 'XP.XpertSettings.Title' | translate }}</h2>
          <button
            type="button"
            z-button
            zType="ghost"
            zSize="icon"
            xpDialogCloseButton
            [attr.aria-label]="'XP.ACTIONS.Close' | translate"
            (click)="dialogRef.close()"
          >
            <z-icon zType="x" />
          </button>
        </header>
        <div xpDialogBody class="flex flex-col items-center justify-center">
          @if (state(); as state) {
            @if (state.status === 'error') {
              <div role="alert" class="max-w-full space-y-2 text-center">
                <p class="font-medium text-destructive">{{ 'XP.XpertSettings.LoadFailed' | translate }}</p>
                <p class="wrap-anywhere text-muted-foreground">{{ state.message }}</p>
              </div>
            }
          }
        </div>
        @if (state().status === 'error') {
          <footer xpDialogFooter>
            <button type="button" z-button zType="outline" (click)="dialogRef.close()">
              {{ 'XP.ACTIONS.Close' | translate }}
            </button>
            <button type="button" z-button (click)="data.retry()">
              {{ 'XP.XpertSettings.Retry' | translate }}
            </button>
          </footer>
        }
      </section>
    }
  `
})
export class XpertSettingsLoaderComponent {
  readonly data = inject<XpertSettingsLoaderData>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)
  readonly state = this.data.state
  private readonly injector = inject(Injector)
  private readonly editorHost = viewChild<ElementRef<HTMLElement>>('editorHost')
  readonly content = computed(() => {
    const state = this.state()
    return state.status === 'ready'
      ? {
          component: state.component,
          injector: Injector.create({
            parent: this.injector,
            providers: [{ provide: DIALOG_DATA, useValue: state.data }]
          })
        }
      : null
  })

  constructor() {
    this.dialogRef.backdropClick.pipe(takeUntilDestroyed()).subscribe(() => this.closeWhileLoading())
    this.dialogRef.keydownEvents.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.key === 'Escape' && this.state().status !== 'ready') {
        event.preventDefault()
        this.closeWhileLoading()
      }
    })
    afterRenderEffect(() => this.editorHost()?.nativeElement.focus())
  }

  private closeWhileLoading() {
    // Once mounted, the editor owns close confirmation for unsaved changes.
    if (this.state().status !== 'ready') this.dialogRef.close()
  }
}
