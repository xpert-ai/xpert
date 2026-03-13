import { cva } from 'class-variance-authority';

import { mergeClasses } from '@/shared/utils/merge-classes';

export const cardVariants = cva(
  'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm',
);

export const cardHeaderVariants = cva(
  mergeClasses(
    '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6',
    'has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
  ),
);

export const cardTitleVariants = cva('leading-none font-semibold');

export const cardDescriptionVariants = cva('text-muted-foreground text-sm');

export const cardActionVariants = cva('col-start-2 row-span-2 row-start-1 self-start justify-self-end');

export const cardBodyVariants = cva('px-6');

export const cardFooterVariants = cva('flex flex-col gap-2 items-center px-6 [.border-t]:pt-6');

export const cardPrimitiveHeaderVariants = cva(
  'flex items-start gap-4 px-6 pt-6',
);

export const cardPrimitiveTitleVariants = cva('block leading-none font-semibold');

export const cardPrimitiveSubtitleVariants = cva('block text-muted-foreground text-sm');

export const cardPrimitiveContentVariants = cva('block px-6 pt-6 pb-6');

export const cardPrimitiveFooterVariants = cva('flex items-center gap-2 px-6 pt-6 pb-6');

export const cardPrimitiveActionsVariants = cva('flex items-center gap-2 px-6 pt-6 pb-6');

export const cardPrimitiveAvatarVariants = cva(
  'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full [&>img]:h-full [&>img]:w-full [&>img]:object-cover',
);
