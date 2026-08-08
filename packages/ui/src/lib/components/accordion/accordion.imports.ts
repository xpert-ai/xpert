import {
  ZardAccordionContentDirective,
  ZardAccordionDescriptionComponent,
  ZardAccordionHeaderComponent,
  ZardAccordionItemComponent,
  ZardAccordionTitleComponent
} from './accordion-item.component'
import { ZardAccordionComponent } from './accordion.component'

export const ZardAccordionImports = [
  ZardAccordionComponent,
  ZardAccordionItemComponent,
  ZardAccordionHeaderComponent,
  ZardAccordionTitleComponent,
  ZardAccordionDescriptionComponent,
  ZardAccordionContentDirective
] as const
