import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { Crepe } from '@milkdown/crepe'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-markdown-editor',
  templateUrl: './markdown-editor.component.html',
  styleUrls: ['./markdown-editor.component.css'],
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkdownEditorComponent implements OnDestroy {
  readonly content = input('')
  readonly placeholder = input('Start writing...')
  readonly contentChange = output<string>()

  readonly ready = signal(false)
  readonly loadError = signal(false)

  private readonly editorHost = viewChild.required<ElementRef<HTMLElement>>('editorHost')
  readonly #zone = inject(NgZone)
  #crepe: Crepe | null = null
  #created = false
  #destroyed = false
  #lastMarkdown = ''

  constructor() {
    afterNextRender(() => void this.createEditor())
  }

  ngOnDestroy() {
    this.#destroyed = true

    if (this.#created && this.#crepe) {
      void this.#crepe.destroy()
    }
  }

  private async createEditor() {
    const crepe = new Crepe({
      root: this.editorHost().nativeElement,
      defaultValue: this.content(),
      features: {
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.AI]: false
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: this.placeholder(),
          mode: 'block'
        }
      }
    })

    this.#crepe = crepe
    crepe.on((listener) => {
      listener.markdownUpdated((_context, markdown, previousMarkdown) => {
        if (!this.#created || markdown === previousMarkdown || markdown === this.#lastMarkdown) {
          return
        }

        this.#lastMarkdown = markdown
        this.#zone.run(() => this.contentChange.emit(markdown))
      })
    })

    try {
      await crepe.create()

      if (this.#destroyed) {
        await crepe.destroy()
        return
      }

      this.#lastMarkdown = crepe.getMarkdown()
      this.#created = true
      this.ready.set(true)
    } catch {
      if (!this.#destroyed) {
        this.loadError.set(true)
      }
    }
  }
}
