import { ScrollingModule } from '@angular/cdk/scrolling'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatAutocomplete, MatAutocompleteActivatedEvent, MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatButtonModule } from '@angular/material/button'
import { MatChipsModule } from '@angular/material/chips'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatInputModule } from '@angular/material/input'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CopilotContextItem, CopilotEngine } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { uniq } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, delay, tap } from 'rxjs'
import { NgmSearchComponent } from '../common/search/search.component'
import { NgmHighlightDirective } from '../core/directives'
import { getCtrlCharacter, getOperatingSystem } from '../core/index'
import { NgmCopilotEngineService, NgmCopilotService } from '../services'

/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  selector: 'copilot-command-dialog',
  templateUrl: './command-dialog.component.html',
  styleUrls: ['./command-dialog.component.scss'],
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatChipsModule,
    MatInputModule,
    TextFieldModule,
    MatProgressBarModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatMenuModule,
    MatIconModule,
    ScrollingModule,

    NgmHighlightDirective,
    NgmSearchComponent
  ]
})
export class CommandDialogComponent {
  readonly #copilotEngine: CopilotEngine = inject(NgmCopilotEngineService)

  readonly data = inject<{ commands: string[] }>(MAT_DIALOG_DATA)
  readonly dialogRef = inject(MatDialogRef)
  readonly copilotService = inject(NgmCopilotService)

  readonly copilotEnabled = toSignal(this.copilotService.enabled$)
  readonly ctrlKey = getCtrlCharacter(getOperatingSystem())

  readonly commandName = model<string>(this.data.commands[0])

  readonly command = computed(() => {
    const command = this.commandName()
    return this.#copilotEngine.commands().find((item) => item.name === command)
  })

  readonly prompt = model<string>('')
  readonly creating = signal(false)
  readonly error = signal('')
  readonly character = signal<string>(null)
  readonly currentWord = signal<string>(null)
  readonly beforeCurrentWord = signal<string>(null)
  readonly afterCurrentWord = signal<string>(null)

  readonly promptEmpty = computed(() => this.prompt().trim().length === 0)

  readonly commandWithContext = computed(() => {
    const command = this.commandName()
    return this.#copilotEngine.getCommandWithContext(command)
  })
  readonly commandContext = computed(() => this.commandWithContext()?.context)
  readonly hasContextTrigger = computed(() => this.prompt().includes('@'))
  readonly loadingContext$ = new BehaviorSubject(false)
  readonly contextItems = derivedAsync(() => {
    const context = this.commandContext()
    const hasContextTrigger = this.hasContextTrigger()
    const contextObservable = context?.getContextObservable()
    if (hasContextTrigger && contextObservable) {
      this.loadingContext$.next(true)
      return contextObservable.pipe(tap(() => this.loadingContext$.next(false)))
    }
    return null
  })

  readonly isContextTrigger = computed(() => this.currentWord()?.startsWith('@'))
  readonly contextSearch = computed(() => this.currentWord()?.slice(1))
  readonly filteredContextItems = computed(() => {
    const isContextTrigger = this.isContextTrigger()
    const text = this.contextSearch()
    const items = this.contextItems()
    if (isContextTrigger) {
      if (text) {
        const words = text.toLowerCase().split('_')
        return items?.filter((item) =>
          words.length
            ? words.every((word) => item.key.toLowerCase().includes(word) || item.caption?.toLowerCase().includes(word))
            : true
        )
      }
      return items
    }
    return null
  })

  readonly contextWords = computed(() =>
    uniq(
      this.prompt()
        .split(' ')
        .filter((word) => word.startsWith('@'))
        .map((word) => word.slice(1))
        .filter((word) => word.length > 0)
    )
  )
  readonly contexts = derivedAsync(
    () => {
      const words = this.contextWords()
      return Promise.all(words.map((word) => this.commandContext().getContextItem(word))).then((items) =>
        items.filter((item) => !!item)
      )
    },
    { initialValue: [] }
  )

  #activatedContext = signal('')
  readonly suggestionsOpened$ = new BehaviorSubject(false)
  readonly #suggestionsOpened = toSignal(this.suggestionsOpened$.pipe(delay(100)), { initialValue: false })

  readonly contextMenuSearch = model<string>(null)
  readonly filteredContextMenuItems = computed(() => {
    const text = this.contextMenuSearch()
    const items = this.contextItems()
    if (text) {
      const words = text.toLowerCase().split(' ')
      return items?.filter((item) =>
        words.length
          ? words.every((word) => item.key.toLowerCase().includes(word) || item.caption?.toLowerCase().includes(word))
          : true
      )
    }
    return items
  })

  async execute() {
    if (!this.copilotEnabled()) {
      this.copilotService.enableCopilot()
      this.dialogRef.close()
    }
    if (this.creating()) return

    const prompt = this.prompt()
    this.creating.set(true)
    this.error.set(null)
    try {
      const message = await this.#copilotEngine.chat(prompt, {
        command: this.commandName(),
        interactive: false
      })
      this.dialogRef.close(message)
    } catch (err: any) {
      console.error(err)
      this.error.set(err.message)
    } finally {
      this.creating.set(false)
    }
  }

  stopExecute() {
    this.#copilotEngine.stopConversation()
  }

  trackByKey(index: number, item: CopilotContextItem) {
    return item?.key
  }

  triggerFun(event: KeyboardEvent, autocomplete: MatAutocomplete) {
    // Enter execute command
    if ((event.metaKey || event.ctrlKey) && !event.isComposing && event.key === 'Enter') {
      this.execute()
      return
    }

    this.character.set(event.key)
    setTimeout(() => {
      const { current, before, after } = getCurrentWord(event)
      this.currentWord.set(current)
      this.beforeCurrentWord.set(before)
      this.afterCurrentWord.set(after)
      // console.log(`'${before}'`, `'${current}'`, `'${after}'`)
    })

    // Tab 键补全提示语
    if (event.key === 'Tab' && this.#suggestionsOpened()) {
      event.preventDefault()
      if (this.isContextTrigger()) {
        if (this.#activatedContext()) {
          this.prompt.set(this.#activatedContext())
        } else {
          const item = this.filteredContextItems()[0]
          if (item) {
            this.prompt.set(
              (this.beforeCurrentWord() ? this.beforeCurrentWord() + ' ' : '') +
                '@' +
                item.uKey +
                ' ' +
                this.afterCurrentWord()
            )
          }
        }
      }
    }
  }

  onContextActivated(event: MatAutocompleteActivatedEvent) {
    this.#activatedContext.set(event.option?.value)
  }

  removeContext(item: CopilotContextItem) {
    const key = item.key
    const prompt = this.prompt()
    const newPrompt = prompt.replace(new RegExp(`@${key}`, 'g'), '')
    this.prompt.set(newPrompt)
  }

  repleaceContext(orginal: string, target: CopilotContextItem) {
    this.prompt.update((prompt) => prompt.split(`@${orginal}`).join(`@${target.uKey}`))
  }

  cancel() {
    this.dialogRef.close()
  }
}

function getCurrentWord(event: KeyboardEvent) {
  const inputElement = event.target as HTMLInputElement
  const inputText = inputElement.value
  const cursorPosition = inputElement.selectionStart

  // Get the text before and after the cursor
  const beforeCursor = inputText.slice(0, cursorPosition)
  const afterCursor = inputText.slice(cursorPosition)

  // Find the start of the current word
  const startOfWord = beforeCursor.lastIndexOf(' ') + 1
  // Find the end of the current word
  const endOfWord = afterCursor.indexOf(' ') === -1 ? inputText.length : cursorPosition + afterCursor.indexOf(' ') + 1

  // Extract the current word
  const current = inputText.slice(startOfWord, endOfWord)

  return {
    current,
    before: inputText.slice(0, startOfWord).trim(),
    after: inputText.slice(endOfWord)
  }
}
