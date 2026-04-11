import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, ViewChild, ViewContainerRef, inject } from '@angular/core'
import { FormArray, FormsModule, ReactiveFormsModule } from '@angular/forms'

import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { cloneDeep } from '@xpert-ai/ocap-core'
import { FieldArrayType, FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardDialogModule, ZardDialogService, ZardIconComponent, ZardTableImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-formly-table',
  templateUrl: `table.type.html`,
  styleUrls: [`table.type.scss`],
  host: {
    class: 'pac-formly-table'
  },
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    ZardDialogModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTableImports,
    FormlyModule,

    TranslateModule,

    OcapCoreModule
  ]
})
export class PACFormlyTableComponent extends FieldArrayType implements OnInit {
  private readonly _dialog = inject(ZardDialogService)
  private readonly _viewContainerRef = inject(ViewContainerRef)

  @ViewChild('dialogRef') dialogRef: TemplateRef<any>

  data = []
  columns: Array<{ key: string; label: string; width?: string }>
  displayedColumns: string[] = []
  defaultOptions = {
    templateOptions: { options: [] }
  }

  ngOnInit() {
    this.columns = (this.field.fieldArray as FormlyFieldConfig).fieldGroup.map((field) => ({
      key: field.key as string,
      label: field.props?.title || field.props?.label,
      width: field.props?.width
    }))
    this.displayedColumns = ['_sort_', ...this.columns.map((column) => column.key), '_actions_']

    for (let i = 0; i < this.field.model?.length || 0; i++) {
      this.data.push({})
    }
  }

  open(): void {
    this._dialog
      .open(this.dialogRef, {
        panelClass: ['ngm-dialog-container', 'pac-formly__table'],
        viewContainerRef: this._viewContainerRef
      })
      .afterClosed()
      .subscribe((value) => {
        console.warn(value)
      })
  }

  addRow(): void {
    this.add()
    this.data = [...this.data, {}]
  }

  deleteRow(id: number): void {
    this.remove(id)
    this.data.splice(id, 1)
    this.data = [...this.data]
  }

  drop(event: CdkDragDrop<string[]>): void {
    // 由于 formly fieldGroup 有与 key path 绑定的属性, 所以 moveItemInArray 应该实现不了交换
    // 只能通过克隆 model 值交换后再付给 formControl
    const model = cloneDeep(this.field.model)
    moveItemInArray(model, event.previousIndex, event.currentIndex)
    this.field.formControl.reset()
    this.field.formControl.patchValue(model)
  }

  clear() {
    ;(this.field.formControl as FormArray).clear()
    // this.field.formControl.reset()
    this.data = []
  }
}
