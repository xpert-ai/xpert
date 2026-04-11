import { cva, type VariantProps } from 'class-variance-authority';

export const accordionVariants = cva('block w-full', {
  variants: {},
  defaultVariants: {},
});

export const accordionItemVariants = cva('flex w-full flex-col overflow-hidden', {
  variants: {},
  defaultVariants: {},
});

export const accordionHeaderVariants = cva(
  'group flex w-full min-w-0 items-center gap-4 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60',
  {
    variants: {
      density: {
        compact: 'min-h-9 px-3.5 py-2',
        cosy: 'min-h-10 px-4 py-2.5',
        default: 'min-h-12 px-4 py-3',
        null: 'min-h-12 px-4 py-3',
      },
    },
    defaultVariants: {
      density: 'default',
    },
  },
);

export const accordionTitleVariants = cva('flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-sm font-medium', {
  variants: {},
  defaultVariants: {},
});

export const accordionDescriptionVariants = cva('flex flex-1 items-center justify-end gap-2 text-right', {
  variants: {},
  defaultVariants: {},
});

export const accordionContentVariants = cva('grid text-sm transition-all duration-200 ease-in-out', {
  variants: {
    isOpen: {
      true: 'grid-rows-[1fr]',
      false: 'grid-rows-[0fr]',
    },
  },
  defaultVariants: {
    isOpen: false,
  },
});

export type ZardAccordionVariants = VariantProps<typeof accordionVariants>;
export type ZardAccordionItemVariants = VariantProps<typeof accordionItemVariants>;
export type ZardAccordionHeaderVariants = VariantProps<typeof accordionHeaderVariants>;
export type ZardAccordionTitleVariants = VariantProps<typeof accordionTitleVariants>;
export type ZardAccordionDescriptionVariants = VariantProps<typeof accordionDescriptionVariants>;
export type ZardAccordionContentVariants = VariantProps<typeof accordionContentVariants>;
