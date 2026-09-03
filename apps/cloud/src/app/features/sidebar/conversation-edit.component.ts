import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { A11yModule } from '@angular/cdk/a11y'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [A11yModule, ReactiveFormsModule, TranslateModule],
  template: `
    <form class="flex w-[min(26rem,90vw)] flex-col gap-4 p-6" (ngSubmit)="submit()">
      <h2 class="text-lg font-semibold text-text-primary">
        {{ (data.mode === 'rename' ? 'XP.Sidebar.RenameConversation' : 'XP.Sidebar.DeleteConversation') | translate }}
      </h2>
      @if (data.mode === 'rename') {
        <input
          cdkFocusInitial
          class="w-full rounded-md border border-border bg-components-input-bg-normal px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-ring"
          [formControl]="title"
          [attr.aria-label]="'XP.Sidebar.ConversationTitle' | translate"
          maxlength="200"
        />
      } @else {
        <p class="break-words text-sm text-text-secondary">
          {{ 'XP.Sidebar.DeleteConversationConfirm' | translate: { title: data.title } }}
        </p>
      }
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-hover-bg"
          (click)="dialog.close()"
        >
          {{ 'XP.Sidebar.CancelConversationAction' | translate }}
        </button>
        <button
          type="submit"
          class="rounded-md px-4 py-2 text-sm disabled:opacity-40"
          [class]="
            data.mode === 'delete' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
          "
          [disabled]="data.mode === 'rename' && (title.invalid || !title.value.trim())"
        >
          {{
            (data.mode === 'rename' ? 'XP.Sidebar.SaveConversationTitle' : 'XP.Sidebar.DeleteConversation') | translate
          }}
        </button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarConversationEditComponent {
  readonly data = inject<{ mode: 'rename' | 'delete'; title: string }>(DIALOG_DATA)
  readonly dialog = inject(DialogRef)
  readonly title = new FormControl(this.data.title, {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(200)]
  })

  submit() {
    if (this.data.mode === 'delete') this.dialog.close(true)
    else if (this.title.valid && this.title.value.trim()) this.dialog.close(this.title.value.trim())
  }
}
