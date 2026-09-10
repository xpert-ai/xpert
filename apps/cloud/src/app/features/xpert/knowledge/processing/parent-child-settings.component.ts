import { Component, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardFormImports, ZardInputDirective, ZardSelectImports, ZardTagSelectComponent } from '@xpert-ai/headless-ui'
import { ParentChildChunkForm } from './parent-child-form'
import { createSeparatorSelectOptions } from './separator-options'

@Component({
  selector: 'xp-parent-child-chunk-settings',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ...ZardFormImports,
    ZardInputDirective,
    ...ZardSelectImports,
    ZardTagSelectComponent
  ],
  templateUrl: './parent-child-settings.component.html'
})
export class ParentChildChunkSettingsComponent {
  readonly form = input.required<ParentChildChunkForm>()
  readonly prefix = 'XP.Knowledgebase.SharedProcessing.ParentChild'
  readonly separatorSelect = createSeparatorSelectOptions()
  readonly addSeparatorKey = 'XP.Knowledgebase.WorkspaceConfiguration.Chunk.AddSeparator'
}
