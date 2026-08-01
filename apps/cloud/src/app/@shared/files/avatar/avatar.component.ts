import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { TAvatar } from '../../../@core'

/**
 * @deprecated use EmojiAvatar
 */
@Component({
  standalone: true,
  selector: 'xp-avatar',
  template: `@if (avatar(); as avatar) {
      @if (avatar.url) {
        <img class="" [src]="avatar.url" [alt]="alt()" />
      } @else {
        <div class="flex" [ngStyle]="{ background: avatar.background }">
          <span>{{ avatar.emoji }}</span>
        </div>
      }
    } @else {
      <img class="" [src]="avatar()?.url || imageUrl() || '/assets/images/avatar-default.svg'" [alt]="alt()" />
    }`,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        align-items: center;
      }
    `
  ],
  imports: [CommonModule]
})
export class AvatarComponent {
  readonly imageUrl = input<string>()
  readonly alt = input<string>()
  readonly avatar = input<TAvatar>()
}
