import { Injectable, ViewContainerRef, inject } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { NxStoryService, StoryWidget } from '@metad/story/core'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { IStoryTemplate, StoryTemplateType, ToastrService } from '../../../@core'
import { DeepPartial } from '@metad/ocap-core'
import { StoryTemplateComponent } from '../../../@shared/story'
import { toSignal } from '@angular/core/rxjs-interop'

@Injectable()
export class StoryToolbarService {
  readonly #translate = inject(TranslateService)
  public readonly toastrService = inject(ToastrService)
  public readonly _viewContainerRef = inject(ViewContainerRef)
  private storyService = inject(NxStoryService)
  private _dialog = inject(MatDialog)

  public widgetComponents = []

  readonly creatingWidget = toSignal(this.storyService.creatingWidget$.pipe(
    map((widget) => widget?.component))
  )

  /**
   * Create a new StoryWidget
   */
  createWidget(widget: DeepPartial<StoryWidget>) {
    const currentWidget = this.creatingWidget()
    if (currentWidget === widget.component) {
      this.storyService.setCreatingWidget(null)
    } else {
      this.storyService.setCreatingWidget({
        title: this.#translate.instant('Story.Common.Untitled', { Default: 'Untitled' }),
        ...widget
      } as StoryWidget)
    }
  }

  async openTemplates() {
    const story = await firstValueFrom(this.storyService.story$)
    const template = await firstValueFrom(
      this._dialog
        .open<StoryTemplateComponent, { templateId: string }, IStoryTemplate>(StoryTemplateComponent, {
          viewContainerRef: this._viewContainerRef,
          panelClass: 'large',
          data: {
            templateId: story.templateId
          }
        })
        .afterClosed()
    )

    if (template) {
      const points = await firstValueFrom(this.storyService.pageStates$)
      if (template.type === StoryTemplateType.Template && points.length > 0) {
        const confirm = await firstValueFrom(
          this.toastrService.confirm(
            {
              code: 'Story.Template.ConfirmApply',
              params: {
                Default: 'Applying a template will overwrite all pages in this story. Do you want to continue?'
              }
            },
            {
              verticalPosition: 'top'
            }
          )
        )

        if (!confirm) {
          return
        }
      }

      this.storyService.applyTemplate(template)
    }
  }
}
