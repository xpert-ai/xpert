
import { Component, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from '../../material.module'
import { IXpert } from '../../../@core'
import { KnowledgebaseCardComponent } from '../../copilot'
import { ToolsetCardComponent } from '../toolset-card/toolset.component'
import { EmojiAvatarComponent } from "../../avatar/emoji-avatar/avatar.component";

import { Z_MODAL_DATA, ZardDialogRef, ZardDialogService } from '@xpert-ai/headless-ui'
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
  private readonly _dialog = inject(ZardDialogService)
  readonly #dialogRef = inject(ZardDialogRef)
  private readonly _data = inject<{ xpert: IXpert }>(Z_MODAL_DATA)

  get xpert() {
    return this._data.xpert
  }
  
  onStart(statement: string): void {
    this.#dialogRef.close(statement)
  }
}
