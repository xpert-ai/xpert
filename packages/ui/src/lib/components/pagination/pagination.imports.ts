import {
  ZardPaginationButtonComponent,
  ZardPaginationComponent,
  ZardPaginationContentComponent,
  ZardPaginationEllipsisComponent,
  ZardPaginationItemComponent,
  ZardPaginationNextComponent,
  ZardPaginationPreviousComponent,
} from '@/src/lib/components/pagination/pagination.component';
import { ZardPaginatorComponent } from '@/src/lib/components/pagination/paginator.component';

export const ZardPaginationImports = [
  ZardPaginationContentComponent,
  ZardPaginationItemComponent,
  ZardPaginationButtonComponent,
  ZardPaginationPreviousComponent,
  ZardPaginationNextComponent,
  ZardPaginationEllipsisComponent,
  ZardPaginationComponent,
  ZardPaginatorComponent,
] as const;
