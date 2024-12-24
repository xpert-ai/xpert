import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, HostListener, HostBinding, inject, input, model, effect } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { EmojiComponent } from '@ctrl/ngx-emoji-mart/ngx-emoji'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TAvatar } from '../../../@core'
import { EmojiAvatarEditorComponent } from '../emoji-avatar-editor/avatar-editor.component'

@Component({
  standalone: true,
  imports: [CommonModule, EmojiComponent],
  selector: 'emoji-avatar',
  hostDirectives: [NgxControlValueAccessor],
  template: `@if (avatar()?.url) {
      <img class="" [src]="avatar().url" [alt]="alt()" />
    } @else if (emoji()?.emoji) {
      <div class="emoji-container flex justify-center items-center w-full h-full" [ngStyle]="{ background: emoji().background }">
        <ngx-emoji
          class="flex"
          [emoji]="emoji().emoji.id"
          [set]="emoji().emoji.set"
          [isNative]="!emoji().emoji.set"
          [size]="emojiSize()"
        />
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
  readonly dialog = inject(MatDialog)
  protected cva = inject<NgxControlValueAccessor<Partial<TAvatar> | null>>(NgxControlValueAccessor)

  readonly alt = input<string>()
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

  readonly emoji = computed(
    () =>
      this.avatar() ??
      this.cva.value$() ?? {
        emoji: {
          id: 'robot_face'
        },
        background: 'rgb(213, 245, 246)'
      }
  )

  readonly emojiSize = computed(() => (this.large() ? 24 : this.small() ? 16 : this.xs() ? 14 : 18))

  @HostBinding('class.focused') focused = false;

  constructor() {
    effect(() => {
      if (this.cva.value$()) {
        this.avatar.set(this.cva.value$())
      }
    }, { allowSignalWrites: true })
  }

  @HostListener('click')
  onClick() {
    if (this.editable()) {
      this.focused = true
      this.dialog
        .open(EmojiAvatarEditorComponent, {
          data: this.avatar()
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
    this.focused = true;
  }

  @HostListener('blur')
  onBlur() {
    this.focused = false;
  }
}
