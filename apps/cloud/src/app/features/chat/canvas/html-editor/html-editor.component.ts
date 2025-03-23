import { CommonModule } from '@angular/common'
import { Component, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { SafePipe } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { FileEditorComponent } from 'apps/cloud/src/app/@shared/files'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SafePipe, FileEditorComponent],
  selector: 'xpert-canvas-html-editor',
  templateUrl: './html-editor.component.html',
  styleUrls: ['./html-editor.component.scss']
})
export class CanvasHtmlEditorComponent {
  // Inputs
  readonly url = input<string>()
  readonly content = input<string>()

  // States
  readonly preview = signal(false)
}
