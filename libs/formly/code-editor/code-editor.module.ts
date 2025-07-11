import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { PACFormlyCodeEditorComponent } from './code-editor.component'

@NgModule({
  declarations: [PACFormlyCodeEditorComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    AppearanceDirective,
    
    FormlyModule.forChild({
      types: [
        {
          name: 'code-editor',
          component: PACFormlyCodeEditorComponent
        },
      ],
    }),
    
  ],
  exports: [PACFormlyCodeEditorComponent],
})
export class PACFormlyCodeEditorModule {}
