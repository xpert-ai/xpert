import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, model, signal } from '@angular/core'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'
import { PickerComponent } from '@ctrl/ngx-emoji-mart'
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji'
import { AppearanceDirective, ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { pick } from 'lodash-es'
import { firstValueFrom } from 'rxjs'
import { ScreenshotService, TAvatar } from '../../../@core'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'emoji-avatar-editor',
  templateUrl: './avatar-editor.component.html',
  styleUrl: './avatar-editor.component.scss',
  imports: [
    CommonModule,
    CdkListboxModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    TranslateModule,
    ButtonGroupDirective,
    AppearanceDirective,
    PickerComponent,
    EmojiComponent
  ]
})
export class EmojiAvatarEditorComponent {
  readonly screenshotService = inject(ScreenshotService)
  readonly #dialogRef = inject(MatDialogRef)
  readonly avatar = inject<TAvatar>(MAT_DIALOG_DATA)

  readonly disabled = signal<boolean>(false)
  readonly type = model<'emoji' | 'image'>('emoji')

  readonly background = model<string>('rgba(213, 245, 246, 0.8)')
  readonly emoji = model<TAvatar['emoji']>()

  readonly colors = [
    'rgba(255, 234, 213, 0.8)',
    'rgba(228, 251, 204, 0.8)',
    'rgba(211, 248, 223, 0.8)',
    'rgba(224, 242, 254, 0.8)',
    'rgba(224, 234, 255, 0.8)',
    'rgba(239, 241, 245, 0.8)',
    'rgba(251, 232, 255, 0.8)',
    'rgba(252, 231, 246, 0.8)',
    'rgba(254, 247, 195, 0.8)',
    'rgba(230, 244, 215, 0.8)',
    'rgba(213, 245, 246, 0.8)',
    'rgba(209, 233, 255, 0.8)',
    'rgba(209, 224, 255, 0.8)',
    'rgba(213, 217, 235, 0.8)',
    'rgba(236, 233, 254, 0.8)',
    'rgba(255, 228, 232, 0.8)'
  ]

  readonly sets = [null, 'apple', 'google', 'twitter', 'facebook']

  readonly set = model<TAvatar['emoji']['set']>(null)

  readonly imageUrl = signal<string>(null)

  constructor() {
    effect(
      () => {
        if (this.avatar) {
          this.background.set(this.avatar.background)
          this.emoji.set(this.avatar.emoji)
          this.set.set(this.avatar.emoji?.set)
          this.imageUrl.set(this.avatar.url)
        }
      },
      { allowSignalWrites: true }
    )
  }

  async uploadAvatar(event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    const screenshot = await this.uploadScreenshot(file!)
    this.imageUrl.set(screenshot.url)
    this.emoji.set(null)
  }

  async uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return await firstValueFrom(this.screenshotService.create(formData))
  }

  addEmoji(event: { emoji: any }) {
    this.emoji.set(pick(event.emoji, 'id', 'set', 'colons', 'unified'))
  }

  apply() {
    this.#dialogRef.close(this.type() === 'image' ? {
      url: this.imageUrl()
    } : {
      emoji: this.emoji(),
      background: this.background(),
    })
  }
}
