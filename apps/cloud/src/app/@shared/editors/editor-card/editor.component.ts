import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  Component,
  HostListener,
  inject,
  input,
  numberAttribute,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { CodeEditorComponent } from '../code-editor/editor.component'
import { Copy2Component } from '../../common'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, CodeEditorComponent, Copy2Component],
  selector: 'pac-code-editor-card',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CodeEditorCardComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)

  // Inputs
  readonly initHeight = input<number, number | string>(210, {
    transform: numberAttribute
  })
  readonly fileName = input<string>()
  readonly title = input<string>()
  readonly tooltip = input<string>()

  readonly lineNumbers = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly value$ = this.cva.value$

  readonly wordWrap = signal(false)

  height = this.initHeight()
  private isResizing = false
  private startY = 0
  private startHeight = 0
  readonly copied = signal(false)

  readonly editor = viewChild('editor', { read: CodeEditorComponent })

  toggleWrap() {
    this.wordWrap.update((state) => !state)
  }

  clear() {
    this.cva.writeValue(null)
  }

  onResized() {
    this.editor()?.onResized()
  }

  onMouseDown(event: MouseEvent): void {
    this.isResizing = true
    this.startY = event.clientY
    this.startHeight = this.height
    event.preventDefault()
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isResizing) {
      const offset = event.clientY - this.startY
      this.height = this.startHeight + offset
      if (this.height < 50) this.height = 50 // Set minimum height

      this.onResized()
      event.preventDefault()
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false
  }
}
