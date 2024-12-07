import { CommonModule } from '@angular/common'
import { Component, inject, model, computed, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpertComponent } from '../../xpert.component'
import { ExampleVectorStoreRetriever } from 'apps/cloud/src/app/@core/copilot'
import { CopilotExampleService, getErrorMessage, injectToastr } from 'apps/cloud/src/app/@core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { DocumentInterface } from '@langchain/core/documents'
import { NgmSliderInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { MatTooltipModule } from '@angular/material/tooltip'
import { derivedFrom } from 'ngxtension/derived-from'
import { map, pipe, switchMap } from 'rxjs'

@Component({
  selector: 'xpert-copilot-knowledge-testing',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, MatTooltipModule, NgmSelectComponent, NgmSpinComponent, NgmSliderInputComponent],
  templateUrl: './testing.component.html',
  styleUrl: './testing.component.scss',
})
export class XpertCopilotKnowledgeTestingComponent {
  readonly xpertComponent = inject(XpertComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly exampleService = inject(CopilotExampleService)

  readonly xpert = this.xpertComponent.xpert

  readonly xpertName = computed(() => this.xpert()?.name)

  readonly command = model<string>()
  readonly score = model<number>(0.01)
  readonly topK = model<number>(10)
  readonly search = model<string>()

  readonly exampleRetriever = computed(() => {
    const command = this.command()
    const score = this.score()
    const k = this.topK()
    return new ExampleVectorStoreRetriever(
      {
        vectorStore: null,
        command,
        role: this.xpertName,
        score,
        k
      },
      this.exampleService
    )
  })

  readonly items = signal<DocumentInterface[]>([])

  // readonly commands = signal<TSelectOption[]>(Object.values(CopilotCommandEnum).map((command) => ({
  //   value: command,
  //   label: this.#translate.instant('PAC.Copilot.Commands.' + command, {Default: command})
  // })))

  readonly commands = derivedFrom(
    [this.xpertName],
    pipe(
      switchMap(([xpertName]) =>
        this.exampleService.getCommands({ role: xpertName })
      ),
      map((commands) =>
        commands.map((command) => ({
          value: command,
          label: this.#translate.instant('PAC.Copilot.Commands.' + command, {Default: command})
        }))
      )
    ),
    { initialValue: [] }
  )

  readonly loading = signal(false)

  close() {
    this.router.navigate(['..'], { relativeTo: this.route })
  }

  async retrieve() {
    const search = this.search()?.trim()
    if (search) {
      this.loading.set(true)
      try {
        const docs = await this.exampleRetriever().invoke(search)
        this.items.set(docs)
      } catch(err) {
        this.#toastr.error(getErrorMessage(err))
      } finally {
        this.loading.set(false)
      }
    } else {
      this.items.set([])
    }
  }
}
