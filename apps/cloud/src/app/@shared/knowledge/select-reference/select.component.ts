import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { FormsModule } from '@angular/forms'
import { IKnowledgebase, KDocumentSourceType } from '../../../@core/types'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkListboxModule],
  selector: 'knowledge-select-reference',
  templateUrl: `select.component.html`,
  styleUrl: `select.component.scss`
})
export class KnowledgeSelectReferenceComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly data = inject<{ knowledgebases: IKnowledgebase[]; selected: string[] }>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  readonly knowledgebases = computed(() => this.data?.knowledgebases)
  readonly selected = model([...(this.data?.selected ?? [])])

  cancel() {
    this.dialogRef.close()
  }

  apply() {
    this.dialogRef.close(this.selected())
  }
}
