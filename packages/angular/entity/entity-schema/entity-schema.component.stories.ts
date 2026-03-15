import { DragDropModule } from '@angular/cdk/drag-drop'

import { Component, Input } from '@angular/core'
import { MatSidenavModule } from '@angular/material/sidenav'
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations'
import {
  NgmDSCoreService,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN,
  OCAP_MODEL_TOKEN,
  provideOcapCore
} from '@metad/ocap-angular/core'
import { provideTranslate } from '@metad/ocap-angular/mock'
import { AgentType, DataSettings, DataSource, Type } from '@metad/ocap-core'
import { Meta, StoryObj, applicationConfig, moduleMetadata } from '@storybook/angular'
import { CUBE_SALES_ORDER, MockAgent } from '../../mock/agent-mock.service'
import { NgmEntitySchemaComponent } from './entity-schema.component'
import { provideHttpClient } from '@angular/common/http'
import { EntityCapacity } from './types'

@Component({
  standalone: true,
  imports: [MatSidenavModule, DragDropModule, NgmEntitySchemaComponent],
  selector: 'ngm-story-component-drag',
  template: `<mat-drawer-container class="example-container" autosize cdkDropListGroup>
      <mat-drawer mode="side" opened cdkDropList>
        <ngm-entity-schema [dataSettings]="dataSettings"></ngm-entity-schema>
        <ngm-entity-schema
        [dataSettings]="{
          dataSource: dataSettings.dataSource,
          entitySet: 'sales_fact'
        }"
        ></ngm-entity-schema>
      </mat-drawer>
      <mat-drawer-content cdkDropList [cdkDropListData]="drops" (cdkDropListDropped)="drop($event)">
        <ul>
          @for (item of drops; track item) {
            <li>
              {{ item.entity }}/{{ item.name || item.raw.memberKey }}/{{ item.type }}/{{ item.dataType }}/{{ item.dbType }}
            </li>
          }
        </ul>
      </mat-drawer-content>
    </mat-drawer-container>`,
  styles: [
    `
      .mat-drawer-container {
        height: 500px;
      }
    `
  ]
})
class DragComponent {
  @Input() dataSettings: DataSettings

  drops = []

  drop(event) {
    this.drops.push(event.item.data)
  }
}

const meta: Meta<NgmEntitySchemaComponent> = {
  title: 'Entity/EntitySchema',
  component: NgmEntitySchemaComponent,
  decorators: [
    applicationConfig({
      providers: [
        provideAnimations(),
        provideTranslate(),
        provideHttpClient(),
        provideOcapCore(),
        {
          provide: OCAP_AGENT_TOKEN,
          useClass: MockAgent,
          multi: true
        },
        {
          provide: OCAP_DATASOURCE_TOKEN,
          useValue: {
            type: 'SQL',
            factory: async (): Promise<Type<DataSource>> => {
              const { SQLDataSource } = await import('@metad/ocap-sql')
              return SQLDataSource
            }
          },
          multi: true
        },
        {
          provide: OCAP_MODEL_TOKEN,
          useValue: {
            name: 'Sales',
            type: 'SQL',
            agentType: AgentType.Browser,
            settings: {
              ignoreUnknownProperty: true
            },
            schema: {
              cubes: [CUBE_SALES_ORDER]
            }
          },
          multi: true
        }
      ]
    }),
    moduleMetadata({
      imports: [BrowserAnimationsModule, MatSidenavModule, DragDropModule, NgmEntitySchemaComponent, DragComponent],
      providers: [NgmDSCoreService]
    })
  ]
}

export default meta

type Story = StoryObj<NgmEntitySchemaComponent>

export const Primary: Story = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
  }
}

export const SelectedHierarchy = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    selectedHierarchy: '[Product]'
  }
}

export const Capacity = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder'
    },
    capacities: [
      EntityCapacity.Dimension,
      EntityCapacity.Measure,
      EntityCapacity.Calculation,
      EntityCapacity.Indicator,
    ]
  }
}

// const DragTemplate = (args: DragComponent) => ({
//   props: args,
//   template: `<ngm-story-component-drag [dataSettings]="dataSettings"></ngm-story-component-drag>`,
// })

// export const DragPrimary = DragTemplate.bind({})
// DragPrimary.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder'
//   }
// }
