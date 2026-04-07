export type ZardTagSelectMode = 'multiple' | 'tags';

export interface ZardTagSelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  keywords?: string[];
  data?: unknown;
}

export type ZardTagSelectCompareWith<T> = (a: T, b: T) => boolean;
export type ZardTagSelectDisplayWith<T> = (value: T) => string;
export type ZardTagSelectCreateValueFromInput<T> = (text: string) => T | null;

export type ZardTagSelectControlledValue<T = string> = readonly T[];

export type ZardTagSelectTagValue = readonly string[];

export type ZardTagSelectMultipleValue<T> = readonly T[];
