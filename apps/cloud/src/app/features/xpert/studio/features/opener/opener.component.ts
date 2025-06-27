import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel, OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'

@Component({
  selector: 'xpert-studio-features-opener',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, TranslateModule],
  templateUrl: './opener.component.html',
  styleUrl: './opener.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioFeaturesOpenerComponent {
  readonly apiService = inject(XpertStudioApiService)

  readonly features = linkedModel({
    initialValue: null,
    compute: () => this.apiService.xpert()?.features,
    update: (features) => {
      this.apiService.updateXpertTeam((xpert) => {
        return {
          ...xpert,
          features: {
            ...(xpert.features ?? {}),
            ...features
          }
        }
      })
    }
  })

  readonly opener = attrModel(this.features, 'opener')
  readonly message = attrModel(this.opener, 'message')
  readonly questions = attrModel(this.opener, 'questions')

  addQuestion() {
    if (this.questions()?.length >= 10) return
    this.questions.update((questions) => {
      return [...(questions ?? []), '']
    })
  }

  removeQuestion(index: number) {
    this.questions.update((questions) => {
      questions.splice(index, 1)
      return [...questions]
    })
  }

  updateQuestion(index: number, value: string) {
    this.questions.update((questions) => {
      questions = questions ?? []
      questions[index] = value
      return [...questions]
    })
  }

  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      this.questions.update((questions) => {
        questions = Array.from(questions ?? [])
        moveItemInArray(questions, event.previousIndex, event.currentIndex)
        return questions
      })
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex)
    }
  }
}
