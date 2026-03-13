import {
  ZardAccordionContentDirective,
  ZardAccordionDescriptionComponent,
  ZardAccordionHeaderComponent,
  ZardAccordionItemComponent,
  ZardAccordionTitleComponent,
} from '@/src/lib/components/accordion/accordion-item.component';
import { ZardAccordionComponent } from '@/src/lib/components/accordion/accordion.component';

export const ZardAccordionImports = [
  ZardAccordionComponent,
  ZardAccordionItemComponent,
  ZardAccordionHeaderComponent,
  ZardAccordionTitleComponent,
  ZardAccordionDescriptionComponent,
  ZardAccordionContentDirective,
] as const;
