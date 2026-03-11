import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

import { CommonModule } from '@angular/common'
import { Component, forwardRef, Input } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { EntityCapacity, OcapCoreModule } from '@metad/ocap-angular/core'
import { C_MEASURES, DataSettings, isPropertyMeasure, Syntax } from '@metad/ocap-core'
import { BehaviorSubject, Subject } from 'rxjs'
import { MatSidenavModule } from '@angular/material/sidenav'
import { NgmEntitySchemaComponent } from '../entity-schema/entity-schema.component'
import { ResizerModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { MatTooltipModule } from '@angular/material/tooltip'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    MatSidenavModule,
    ZardIconComponent,
    MatTooltipModule,
    ZardButtonComponent,
    MonacoEditorModule,

    NgmEntitySchemaComponent,
    ResizerModule,
    OcapCoreModule,
  ],
  selector: 'ngm-formula-editor',
  templateUrl: 'editor.component.html',
  styleUrls: ['editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmFormulaEditorComponent)
    }
  ]
})
export class NgmFormulaEditorComponent implements ControlValueAccessor {
  Syntax = Syntax
  EntityCapacity = EntityCapacity

  @Input() dataSettings: DataSettings

  @Input() helpLink: string

  @Input() editorOptions: any = {
    theme: 'vs',
    automaticLayout: true,
    language: 'sql'
  }

  // CodeEditor
  get editor() {
    return this.editor$.value
  }
  protected editor$ = new BehaviorSubject<any>(null)

  private cursorSelection$ = new Subject()

  calculations = []

  get statement(): string {
    return this._statement
  }
  set statement(value) {
    this._statement = value
    this._onChange?.(this._statement)
  }
  private _statement = ''

  private _onChange: any

  writeValue(obj: any): void {
    this._statement = obj
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {}
  setDisabledState?(isDisabled: boolean): void {}

  onInit(editor: any) {
    this.editor$.next(editor)
    this.editor.onDidChangeCursorSelection((e) => {
      this.cursorSelection$.next(e)
    })
  }

  onResized(event) {
    this.editor?.layout()
  }

  drop(event: CdkDragDrop<Array<{ name: string }>>) {
    if (event.container.id === 'ngm-formula-editor') {
      if (event.previousContainer.id === 'ngm-formula-editor__entity-schema') {
        if (isPropertyMeasure(event.item.data)) {
          this.insert(`[${C_MEASURES}].[${event.item.data.name}]`)
        } else {
          this.insert(event.item.data.name)
        }
      }
    }
  }

  insert(text: string) {
    this.editor?.trigger('keyboard', 'type', { text: text })
  }

  formatDocument() {
    this.editor?.getAction('editor.action.formatDocument').run()
  }

  openHelpLink() {
    window.open(this.helpLink, '_blank')
  }
}
