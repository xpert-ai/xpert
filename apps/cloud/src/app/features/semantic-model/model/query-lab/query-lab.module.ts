import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgmCommonModule, NgmTableComponent, ResizerModule, SplitterModule } from '@metad/ocap-angular/common'
import { NgmCopilotChatComponent } from '@metad/copilot-angular'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmEntitySchemaComponent } from '@metad/ocap-angular/entity'
import { NgmMDXEditorComponent } from '@metad/ocap-angular/mdx'
import { NgmSQLEditorComponent } from '@metad/ocap-angular/sql'
import { QueryLabRoutingModule } from './query-lab-routing.module'
import { QueryLabComponent } from './query-lab.component'
import { QueryComponent } from './query/query.component'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

@NgModule({
  imports: [
    SharedModule,
    MaterialModule,
    ReactiveFormsModule,

    NgmTableComponent,
    OcapCoreModule,
    ResizerModule,
    SplitterModule,
    NgmEntitySchemaComponent,
    NgmCopilotChatComponent,
    NgmCommonModule,
    NgmMDXEditorComponent,
    NgmSQLEditorComponent,

    QueryLabRoutingModule
  ],
  exports: [QueryLabComponent, QueryComponent],
  declarations: [QueryLabComponent, QueryComponent],
  providers: []
})
export class QueryLabModule {}
