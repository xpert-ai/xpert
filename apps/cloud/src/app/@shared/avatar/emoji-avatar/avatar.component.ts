import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  Component,
  computed,
  HostListener,
  HostBinding,
  inject,
  input,
  model,
  effect
} from '@angular/core'
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TAvatar } from '../../../@core'
import { EmojiAvatarEditorComponent } from '../emoji-avatar-editor/avatar-editor.component'

import { ZardDialogService } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, EmojiComponent],
  selector: 'emoji-avatar',
  hostDirectives: [NgxControlValueAccessor],
  template: `@if (resolvedAvatar()?.url) {
      <img class="max-h-full" [src]="resolvedAvatar()?.url" [alt]="alt()" />
    } @else if (emoji()?.emoji) {
      <div
        class="emoji-container flex justify-center items-center w-full h-full"
        [ngStyle]="{ background: emoji().background }"
      >
        <ngx-emoji
          class="flex"
          [emoji]="emoji().emoji.id"
          [set]="emoji().emoji.set"
          [isNative]="!emoji().emoji.set"
          [size]="emojiSize()"
        />
      </div>
    } @else if (avatarFallback()) {
      <div
        class="flex h-full w-full items-center justify-center bg-background-default-subtle text-center font-medium text-text-primary"
        [attr.aria-label]="alt() || fallbackLabel()"
      >
        {{ avatarFallback() }}
      </div>
    }`,
  styleUrl: 'avatar.component.scss',
  host: {
    '[class.xs]': 'xs()',
    '[class.small]': 'small()',
    '[class.large]': 'large()',
    '[class.cursor-pointer]': 'editable()',
    '[class.editable]': 'editable()',
    '[class.focused]': 'focused'
  }
})
export class EmojiAvatarComponent {
  readonly dialog = inject(ZardDialogService)
  protected cva = inject<NgxControlValueAccessor<Partial<TAvatar> | null>>(NgxControlValueAccessor)

  readonly alt = input<string>()
  readonly fallbackLabel = input<string>()
  readonly avatar = model<TAvatar>()

  readonly editable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly xs = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly small = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly large = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly resolvedAvatar = computed(() => this.avatar() ?? this.cva.value$() ?? null)
  readonly avatarFallback = computed(() => buildAvatarFallback(this.fallbackLabel()))
  readonly emoji = computed(() => {
    const avatar = this.resolvedAvatar()
    if (avatar?.url || avatar?.emoji?.id) {
      return avatar
    }

    if (this.avatarFallback()) {
      return null
    }

    return {
      emoji: {
        id: 'robot_face'
      },
      background: 'rgb(213, 245, 246)'
    } satisfies Partial<TAvatar>
  })

  readonly emojiSize = computed(() => (this.large() ? 24 : this.small() ? 16 : this.xs() ? 14 : 18))

  @HostBinding('class.focused') focused = false

  constructor() {
    effect(() => {
      if (this.cva.value$()) {
        this.avatar.set(this.cva.value$())
      }
    })
  }

  @HostListener('click')
  onClick() {
    if (this.editable()) {
      this.focused = true
      this.dialog
        .open(EmojiAvatarEditorComponent, {
          data: this.avatar(),
          panelClass: 'gap-3 p-4'
        })
        .afterClosed()
        .subscribe({
          next: (result) => {
            this.focused = false
            if (result) {
              this.avatar.set(result)
              this.cva.value$.set(result)
            }
          }
        })
    }
  }

  @HostListener('focus')
  onFocus() {
    this.focused = true
  }

  @HostListener('blur')
  onBlur() {
    this.focused = false
  }
}

function buildAvatarFallback(label?: string | null) {
  const parts = label?.trim().split(/\s+/).filter(Boolean).slice(0, 2)

  return (parts?.map((part) => part[0]?.toUpperCase() ?? '').join('') || '').slice(0, 2)
}
