import { Component, computed, input } from '@angular/core'
import { IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'


@Component({
  standalone: true,
  selector: 'xpert-inline-profile',
  template: `<emoji-avatar [avatar]="avatar()" xs class="xpert-avatar shrink-0 overflow-hidden rounded-lg shadow-sm mr-1" />
  <span class="xpert-title truncate mr-8" [title]="xpert().title || xpert().name">{{xpert().title || xpert().name}}</span>
@if (xpert().version) {
  <div class="absolute right-0 text-xs font-medium flex h-5 shrink-0 items-center rounded-md border border-bg-slate-100 shadow-sm
    px-[5px] text-text-secondary bg-slate-50">v{{xpert().version}}</div>
}
`,
  styleUrl: 'inline-xpert.component.scss',
  imports: [EmojiAvatarComponent]
})
export class XpertInlineProfileComponent {
  readonly xpert = input<IXpert>()
  readonly avatar = computed(() => this.xpert()?.avatar)
}
