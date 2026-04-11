import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SharedUiModule } from './ui.module'
import { CreatedByPipe, UserPipe } from './pipes/index'
import { TagEditorComponent, TagViewerComponent } from './tag'
import { CdkMenuModule } from '@angular/cdk/menu'

const Modules = [TranslateModule, FormsModule, ReactiveFormsModule, OcapCoreModule]

/**
 * @deprecated
 */
@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    RouterModule,
    SharedUiModule,
    ...Modules,
    CdkMenuModule,
    CreatedByPipe,
    UserPipe,
    TagEditorComponent,
    TagViewerComponent
  ],
  exports: [
    CommonModule,
    RouterModule,
    SharedUiModule,
    ...Modules,
    CdkMenuModule,
    UserPipe,
    CreatedByPipe,
    TagEditorComponent,
    TagViewerComponent
  ],
  providers: []
})
export class SharedModule {}
