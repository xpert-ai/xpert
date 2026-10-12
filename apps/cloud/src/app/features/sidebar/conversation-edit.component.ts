import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { A11yModule } from '@angular/cdk/a11y'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    A11yModule,
    ReactiveFormsModule,
    TranslateModule
  ],
  template: `
    <form
      xpDialogLayout="wide"
      class="w-[min(440px,calc(100vw-32px))] max-h-[84dvh]"
      [formGroup]="form"
      (ngSubmit)="submit()"
    >
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ (data.mode === 'rename' ? 'XP.Sidebar.RenameConversation' : 'XP.Sidebar.DeleteConversation') | translate }}
        </h2>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="dialog.close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>
      <div xpDialogBody>
        @if (data.mode === 'rename') {
          <input
            z-input
            cdkFocusInitial
            class="w-full"
            formControlName="title"
            [attr.aria-label]="'XP.Sidebar.ConversationTitle' | translate"
            maxlength="200"
          />
        } @else {
          <p class="break-words text-muted-foreground">
            {{ 'XP.Sidebar.DeleteConversationConfirm' | translate: { title: data.title } }}
          </p>
        }
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="dialog.close()">
          {{ 'XP.Sidebar.CancelConversationAction' | translate }}</button
        ><button
          z-button
          type="submit"
          [zType]="data.mode === 'delete' ? 'destructive' : 'default'"
          [zDisabled]="data.mode === 'rename' && (title.invalid || !title.value.trim())"
        >
          {{
            (data.mode === 'rename' ? 'XP.Sidebar.SaveConversationTitle' : 'XP.Sidebar.DeleteConversation') | translate
          }}
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarConversationEditComponent {
  readonly data = inject<{ mode: 'rename' | 'delete'; title: string }>(DIALOG_DATA)
  readonly dialog = inject(DialogRef)
  readonly form = new FormGroup({
    title: new FormControl(this.data.title, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)]
    })
  })
  readonly title = this.form.controls.title

  submit() {
    if (this.data.mode === 'delete') this.dialog.close(true)
    else if (this.title.valid && this.title.value.trim()) this.dialog.close(this.title.value.trim())
  }
}
