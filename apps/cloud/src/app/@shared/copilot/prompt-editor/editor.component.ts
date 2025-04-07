import { Clipboard } from '@angular/cdk/clipboard'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Overlay, OverlayRef } from '@angular/cdk/overlay'
import { TemplatePortal } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  numberAttribute,
  output,
  signal,
  TemplateRef,
  viewChild,
  ViewChild,
  ViewContainerRef
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { effectAction, NgmI18nPipe } from '@metad/ocap-angular/core'
import { switchMap, tap } from 'rxjs/operators'
import { timer } from 'rxjs'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { agentLabel, TStateVariable, TWorkflowVarGroup } from '../../../@core'
import { CopilotPromptGeneratorComponent } from '../prompt-generator/generator.component'

declare var monaco: any

@Component({
  selector: 'copilot-prompt-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    MonacoEditorModule,
    MatTooltipModule,
    NgmI18nPipe,
  ],
  host: {
    '[class.fullscreen]': 'fullscreen()'
  }
})
export class CopilotPromptEditorComponent {
  agentLabel = agentLabel
  
  readonly #clipboard = inject(Clipboard)
  readonly #dialog = inject(MatDialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly elementRef = inject(ElementRef)

  readonly regex = `{{(.*?)}}`

  // Inputs
  readonly prompt = model<string>()
  readonly initHeight = input<number, number | string>(210, {
    transform: numberAttribute
  })
  readonly tooltip = input<string>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly role = input<'system' | 'ai' | 'human'>()
  readonly fullscreen = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly deleted = output<void>()

  // Children
  @ViewChild('editablePrompt', { static: true }) editablePrompt!: ElementRef
  @ViewChild('suggestionsTemplate', { static: true }) suggestionsTemplate!: TemplateRef<any>
  readonly suggestionsMenu = viewChild('suggestions', {read: ElementRef})
  overlayRef: OverlayRef | null = null

  // States
  readonly promptLength = computed(() => this.prompt()?.length)

  height = this.initHeight()
  private isResizing = false
  private startY = 0
  private startHeight = 0
  readonly copied = signal(false)

  readonly editorOptions = signal({
    theme: 'vs',
    automaticLayout: true,
    language: 'markdown',
    lineNumbers: 'off',
    glyphMargin: 0,
    wordWrap: false,
    minimap: {
      enabled: false
    }
  })

  readonly #editor = signal(null)

  constructor(private overlay: Overlay) {
    effect(() => {
      if (this.initHeight()) {
        this.height = this.initHeight()
      }
    })
  }

  toggleWrap() {
    this.editorOptions.update((state) => ({...state, wordWrap: !state.wordWrap}))
  }

  generate() {
    this.#dialog
      .open(CopilotPromptGeneratorComponent, {
        panelClass: 'large'
      })
      .afterClosed()
      .subscribe({
        next: (result) => {
          if (result) {
            this.prompt.set(result)
          }
        }
      })
  }

  onKeyup(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      return this.hideSuggestions()
    }

    const inputText = (event.target as HTMLElement).innerText
    const regex = /{{(?=\s+\S*)|{{$/

    if (regex.test(inputText)) {
      this.showSuggestions()
    } else {
      this.hideSuggestions()
    }
  }

  setVariable(g: string, variable: TStateVariable) {
    // Get the current cursor position
    const position = this.getPosition();

    // Get the content of the current line
    const lineContent = this.#editor().getModel().getLineContent(position.lineNumber);

    // Checks if the character before the cursor is { or {{
    const beforeCursor = lineContent.substring(0, position.column - 1);
    const regex = /{{?$/
    const match = beforeCursor.match(regex);

    // If it matches, replace { or {{ and also release after } or }}
    const afterCursor = lineContent.substring(position.column - 1);
    const endRegex = /^}}?/;
    const endMatch = afterCursor.match(endRegex);

    // If it matches, replace { or {{
    const range = new monaco.Range(
      position.lineNumber,
      match ? (position.column - match[0].length) : position.column,
      position.lineNumber,
      endMatch ? (position.column + endMatch[0].length) : position.column
    );
    const text = g ? `{{${g}.${variable.name}}}` : `{{${variable.name}}}`

    const operation = {
      range: range,
      text: text
    };

    // Performing Edit Operations
    this.#editor().executeEdits("insert-string", [operation])
    this.#editor().focus()
    this.hideSuggestions()
  }

  showSuggestions() {
    if (!this.variables()?.length) {
      return
    }
    const caretCoords = this.getCursorPagePosition()
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(caretCoords)
      .withPositions([{ originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }])

    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({ positionStrategy })
      const portal = new TemplatePortal(this.suggestionsTemplate, this.#vcr)
      this.overlayRef.attach(portal)
    } else {
      this.overlayRef.updatePositionStrategy(positionStrategy)
    }
    this.suggestionsMenu().nativeElement.focus()
  }

  hideSuggestions() {
    if (this.overlayRef) {
      this.overlayRef.detach()
      this.overlayRef = null
    }
  }

  remove() {
    this.prompt.set(null)
    this.deleted.emit()
  }

  copy = effectAction((origin$) => origin$.pipe(
      tap(() => {
        this.#clipboard.copy(this.prompt())
        this.copied.set(true)
      }),
      switchMap(() => timer(3000)),
      tap(() => this.copied.set(false))
    ))

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)

    editor.onDidChangeModelContent((event) => {
      event.changes.forEach((change) => {
        if (change.text === '{' || change.text === '{}') {
          this.showSuggestions()
        }
      });
    })
  }

  onResized() {
    this.#editor()?.layout()
  }

  getPosition() {
    return this.#editor().getPosition()
  }

  getCursorPagePosition() {
    const editor = this.#editor();
    // Get the cursor position
    const position = editor.getPosition();
    
    // Get the cursor coordinates within the editor content
    const cursorCoords = editor.getScrolledVisiblePosition(position);
    
    // Get the editor DOM element and content container
    const editorDom = editor.getDomNode();
    const viewLines = editorDom.querySelector('.view-lines');
    
    // Check if viewLines exists
    const rect = viewLines ? viewLines.getBoundingClientRect() : editorDom.getBoundingClientRect();
    
    // Calculate the absolute coordinates of the cursor on the page
    const cursorX = rect.left + cursorCoords.left;
    const cursorY = rect.top + cursorCoords.top;
    
    return { x: cursorX, y: cursorY };
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

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    this.hideSuggestions()
    this.#editor()?.focus()
  }

}
