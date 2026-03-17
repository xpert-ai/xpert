import { cva, type VariantProps } from 'class-variance-authority';

import { mergeClasses } from '../../utils/merge-classes';

export const buttonVariants = cva(
  mergeClasses(
    'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
    'aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 border border-transparent bg-clip-padding',
    "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4",
    'cursor-pointer origin-bottom select-none shrink-0 outline-none transition-all active:scale-95 disabled:pointer-events-none',
    'disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 group/button',
  ),
  {
    variants: {
      zType: {
        default:
          'border-components-button-primary-border bg-components-button-primary-bg text-components-button-primary-text shadow-md hover:border-components-button-primary-border hover:bg-components-button-primary-bg data-[color=warn]:border-red-50 data-[color=warn]:bg-gray-100 data-[color=warn]:text-red-500 data-[color=warn]:shadow-none data-[color=warn]:hover:border-red-500 data-[color=warn]:hover:bg-red-50',
        destructive:
          'border-red-50 bg-gray-100 text-red-500 shadow-none hover:border-red-500 hover:bg-red-50 focus-visible:border-red-500 focus-visible:ring-red-200/60',
        outline:
          'border-[0.5px] border-(--color-components-button-secondary-border) bg-transparent text-zinc-600 shadow-none hover:border-(--color-components-button-secondary-border-hover) hover:bg-(--color-components-button-secondary-bg-hover) data-[color=warn]:border-red-50 data-[color=warn]:text-red-500 data-[color=warn]:hover:border-red-500 data-[color=warn]:hover:bg-red-50',
        secondary:
          'border-[0.5px] border-(--color-components-button-secondary-border) bg-(--color-components-button-secondary-bg) text-zinc-600 shadow-sm hover:border-(--color-components-button-secondary-border-hover) hover:bg-(--color-components-button-secondary-bg-hover) data-[color=warn]:border-red-50 data-[color=warn]:text-red-500 data-[color=warn]:hover:border-red-500 data-[color=warn]:hover:bg-red-50',
        ghost:
          'border-transparent bg-transparent shadow-none hover:bg-gray-200 aria-expanded:bg-gray-200 data-[color=warn]:text-red-500 data-[color=warn]:hover:bg-red-50 data-[color=warn]:hover:text-red-500',
        link: 'h-auto border-transparent bg-transparent px-0 shadow-none text-primary underline-offset-4 hover:underline active:scale-100',
      },
      zSize: {
        default:
          'h-8 gap-1.5 rounded-lg px-3.5 text-[13px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: 'h-6 gap-1 rounded-lg px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=\'size-\'])]:size-3',
        sm: 'h-7 gap-1.5 rounded-lg px-2.5 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*=\'size-\'])]:size-3.5',
        lg: 'h-9 gap-1.5 rounded-[10px] px-4 text-base font-semibold has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-8 rounded-xl p-0',
        'icon-xs':
          'size-6 rounded-lg p-0 [&_svg:not([class*=\'size-\'])]:size-3',
        'icon-sm': 'size-7 rounded-lg p-0 [&_svg:not([class*=\'size-\'])]:size-3.5',
        'icon-lg': 'size-9 rounded-[10px] p-0',
      },
      zShape: {
        default: '',
        circle: 'rounded-full',
        square: 'rounded-none',
      },
      zFull: {
        true: 'w-full',
      },
      zLoading: {
        true: 'pointer-events-none opacity-50',
      },
      zDisabled: {
        true: 'pointer-events-none opacity-50',
      },
    },
    defaultVariants: {
      zType: 'default',
      zSize: 'default',
      zShape: 'default',
    },
  },
);
export type ZardButtonShapeVariants = NonNullable<VariantProps<typeof buttonVariants>['zShape']>;
export type ZardButtonSizeVariants = NonNullable<VariantProps<typeof buttonVariants>['zSize']>;
export type ZardButtonTypeVariants = NonNullable<VariantProps<typeof buttonVariants>['zType']>;
