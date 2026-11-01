import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Announcement } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { NotificationTextComponent } from './notification-text.component'

@Component({
  standalone: true,
  selector: 'xp-announcement-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardIconComponent,
    NotificationTextComponent
  ],
  template: `<section xpDialogLayout="standard">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ item.title }}</h2>
      <p xpDialogDescription>
        {{ 'XP.Notifications.Announcement' | translate }}
        @if (item.severity === 'important') {
          · {{ 'XP.Notifications.Important' | translate }}
        }
      </p>
      <button
        xpDialogCloseButton
        z-button
        zType="ghost"
        zSize="icon"
        (click)="close()"
        [attr.aria-label]="'XP.ACTIONS.Close' | translate"
      >
        <z-icon zType="x" />
      </button>
    </header>
    <div xpDialogBody><xp-notification-text [text]="item.body" /></div>
    <footer xpDialogFooter>
      @if (item.action; as action) {
        <a z-button zType="secondary" [href]="action.url" target="_blank" rel="noopener noreferrer">{{
          action.label
        }}</a>
      }
      <button z-button (click)="close()">{{ 'XP.Notifications.Dismiss' | translate }}</button>
    </footer>
  </section>`
})
export class AnnouncementDialogComponent {
  readonly item = inject<Announcement>(DIALOG_DATA)
  readonly ref = inject(DialogRef)
  close() {
    this.ref.close('dismiss')
  }
}
