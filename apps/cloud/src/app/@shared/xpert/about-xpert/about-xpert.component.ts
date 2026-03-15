
import { Component, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from '../../material.module'
import { IXpert } from '../../../@core'
import { KnowledgebaseCardComponent } from '../../copilot'
import { ToolsetCardComponent } from '../toolset-card/toolset.component'
import { EmojiAvatarComponent } from "../../avatar/emoji-avatar/avatar.component";

@Component({
  standalone: true,
  selector: 'pac-about-xpert',
  templateUrl: './about-xpert.component.html',
  styleUrls: ['about-xpert.component.scss'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    KnowledgebaseCardComponent,
    ToolsetCardComponent,
    EmojiAvatarComponent
]
})
export class AboutXpertComponent {
  private readonly _dialog = inject(MatDialog)
  readonly #dialogRef = inject(MatDialogRef)
  private readonly _data = inject<{ xpert: IXpert }>(MAT_DIALOG_DATA)

  get xpert() {
    return this._data.xpert
  }
  
  onStart(statement: string): void {
    this.#dialogRef.close(statement)
  }
}
