import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgeDocument, isNativeKnowledgeTableDocument } from '@xpert-ai/contracts'
import { ZardAccordionImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-knowledge-table-metadata',
  standalone: true,
  imports: [TranslateModule, ...ZardAccordionImports],
  template: `
    @if (visible()) {
      <section class="border-b border-divider-subtle py-4" data-table-metadata>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-base font-semibold text-text-primary">{{ prefix + '.Title' | translate }}</h3>
          <span class="text-xs text-text-tertiary" role="status">{{ statusKey() | translate }}</span>
        </div>
        @if (state()?.reason) {
          <p class="mt-2 text-sm text-text-tertiary">{{ prefix + '.Reason.' + state().reason | translate }}</p>
        }
        @if (state()?.error) {
          <p class="mt-2 text-sm text-text-destructive" role="alert">{{ state().error }}</p>
        }
        <p class="mt-2 text-xs text-text-tertiary">{{ prefix + '.ReprocessHint' | translate }}</p>
        <z-accordion class="mt-3 block" zType="multiple">
          @for (table of state()?.tables ?? []; track table.tableId) {
            <z-accordion-item [zValue]="table.tableId" [zTitle]="table.sheetName + ' · ' + table.range">
              <div class="space-y-3 py-3">
                <p class="text-xs text-text-tertiary">
                  {{ prefix + '.Dimensions' | translate: { rows: table.rowCount, columns: table.columns.length } }}
                </p>
                @if (table.summary) {
                  <p class="whitespace-pre-wrap text-sm text-text-secondary">{{ table.summary }}</p>
                }
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-sm">
                    <thead class="border-b border-divider-subtle text-text-tertiary">
                      <tr>
                        <th class="py-2 pr-3 font-medium">{{ prefix + '.Column' | translate }}</th>
                        <th class="py-2 pr-3 font-medium">{{ prefix + '.Description' | translate }}</th>
                        <th class="py-2 pr-3 font-medium">{{ prefix + '.Unit' | translate }}</th>
                        <th class="py-2 font-medium">{{ prefix + '.ValueMeanings' | translate }}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-divider-subtle text-text-secondary">
                      @for (column of table.columns; track column.columnId) {
                        <tr>
                          <td class="py-2 pr-3 align-top">
                            {{ column.label }} <span class="text-xs text-text-tertiary">{{ column.columnId }}</span>
                          </td>
                          <td class="whitespace-pre-wrap py-2 pr-3 align-top">{{ column.description }}</td>
                          <td class="py-2 pr-3 align-top">{{ column.unit }}</td>
                          <td class="whitespace-pre-wrap py-2 align-top">{{ column.valueMeanings }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </z-accordion-item>
          }
        </z-accordion>
      </section>
    }
  `
})
export class KnowledgeTableMetadataComponent {
  readonly document = input.required<IKnowledgeDocument>()
  readonly prefix = 'XP.Knowledgebase.TableMetadata'
  readonly state = computed(() => this.document()?.metadata?.tableMetadata)
  readonly visible = computed(
    () => !!this.state() || (this.document() && isNativeKnowledgeTableDocument(this.document()))
  )
  readonly statusKey = computed(() =>
    this.state() ? this.prefix + '.Status.' + this.state().status : this.prefix + '.NotGenerated'
  )
}
