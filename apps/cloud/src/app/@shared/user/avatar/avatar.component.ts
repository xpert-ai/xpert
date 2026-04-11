import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { IUser } from '../../../@core'

@Component({
  standalone: true,
  selector: 'pac-user-avatar',
  template: `@if (imageUrl()) {
    <img class="h-full w-full object-cover object-center" [src]="imageUrl()" [alt]="alt()" />
  } @else if (initials()) {
    <span class="inline-flex h-full w-full items-center justify-center px-1 font-semibold uppercase leading-none [font-size:0.75em]">
      {{ initials() }}
    </span>
  } @else {
    <img class="h-full w-full object-cover object-center" src="/assets/images/avatar-default.svg" [alt]="alt()" />
  }`,
  styles: [``],
  host: {
    class: 'inline-flex shrink-0 items-center justify-center overflow-hidden'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserAvatarComponent {
  readonly user = input<IUser>()

  readonly imageUrl = computed(() => this.user()?.imageUrl?.trim() || null)
  readonly alt = computed(() => this.userText(this.user()))
  readonly initials = computed(() => this.initialsFromText(this.alt()))

  private userText(user: IUser | undefined) {
    if (!user) {
      return ''
    }

    return (
      user.fullName ||
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      user.username ||
      user.id ||
      ''
    )
  }

  private initialsFromText(value: string) {
    const parts = value.trim().split(/\s+/).filter(Boolean)

    if (!parts.length) {
      return ''
    }

    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  }
}
