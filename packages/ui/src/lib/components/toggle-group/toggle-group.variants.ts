import { cva, type VariantProps } from 'class-variance-authority';

export const toggleGroupVariants = cva('inline-flex w-fit', {
  variants: {
    orientation: {
      horizontal: 'flex-row items-center',
      vertical: 'flex-col items-stretch',
    },
    zType: {
      default: '',
      outline: '',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
    zType: 'default',
  },
});

export const toggleGroupItemVariants = cva(
  'inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium ring-offset-background transition-[background-color,color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  {
    variants: {
      orientation: {
        horizontal: 'w-auto',
        vertical: 'w-full',
      },
      zType: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent',
      },
      zSize: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-9 px-3 text-sm',
        lg: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
      zType: 'default',
      zSize: 'md',
    },
  },
);

export type ZardToggleGroupVariants = VariantProps<typeof toggleGroupVariants>;
export type ZardToggleGroupItemVariants = VariantProps<typeof toggleGroupItemVariants>;
export type ZardToggleGroupType = NonNullable<ZardToggleGroupVariants['zType']>;
export type ZardToggleGroupOrientation = NonNullable<ZardToggleGroupVariants['orientation']>;
export type ZardToggleGroupSize = NonNullable<ZardToggleGroupItemVariants['zSize']>;
export type ZardToggleGroupMode = 'single' | 'multiple';
