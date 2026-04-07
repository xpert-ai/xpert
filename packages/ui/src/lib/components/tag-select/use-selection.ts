import { normalizeTagSelectStringComparison, normalizeTagSelectToken } from './use-tokenization';
import type { ZardTagSelectCompareWith, ZardTagSelectOption } from './tag-select.types';

export function formatTagSelectValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizeTagSelectToken(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }

  if (typeof value === 'object') {
    if ('label' in value && typeof value.label === 'string') {
      return value.label;
    }
    if ('name' in value && typeof value.name === 'string') {
      return value.name;
    }
    if ('id' in value && value.id != null) {
      return `${value.id}`;
    }
    if ('key' in value && value.key != null) {
      return `${value.key}`;
    }
  }

  return `${value}`;
}

export function valuesEqual(
  a: unknown,
  b: unknown,
  compareWith: ZardTagSelectCompareWith<unknown> | null,
  normalizeStrings = false,
): boolean {
  if (typeof a === 'string' && typeof b === 'string' && normalizeStrings) {
    return normalizeTagSelectStringComparison(a) === normalizeTagSelectStringComparison(b);
  }

  if (compareWith) {
    return compareWith(a, b);
  }

  return Object.is(a, b);
}

export function hasTagSelectValue(
  values: readonly unknown[],
  candidate: unknown,
  compareWith: ZardTagSelectCompareWith<unknown> | null,
  normalizeStrings = false,
): boolean {
  return values.some((value) => valuesEqual(value, candidate, compareWith, normalizeStrings));
}

export function addTagSelectValue(
  values: readonly unknown[],
  candidate: unknown,
  compareWith: ZardTagSelectCompareWith<unknown> | null,
  normalizeStrings = false,
): unknown[] {
  if (hasTagSelectValue(values, candidate, compareWith, normalizeStrings)) {
    return [...values];
  }

  return [...values, candidate];
}

export function removeTagSelectValue(
  values: readonly unknown[],
  candidate: unknown,
  compareWith: ZardTagSelectCompareWith<unknown> | null,
  normalizeStrings = false,
): unknown[] {
  return values.filter((value) => !valuesEqual(value, candidate, compareWith, normalizeStrings));
}

export function resolveTagSelectLabel(
  value: unknown,
  options: readonly ZardTagSelectOption<unknown>[],
  compareWith: ZardTagSelectCompareWith<unknown> | null,
): string {
  const option = options.find((item) => valuesEqual(item.value, value, compareWith));
  return option?.label ?? formatTagSelectValue(value);
}

export function findExactLabelMatchOption(
  text: string,
  options: readonly ZardTagSelectOption<unknown>[],
): ZardTagSelectOption<unknown> | null {
  const normalized = normalizeTagSelectStringComparison(text);
  if (!normalized) {
    return null;
  }

  return options.find((option) => normalizeTagSelectStringComparison(option.label) === normalized) ?? null;
}

export function filterTagSelectOptions(
  options: readonly ZardTagSelectOption<unknown>[],
  searchTerm: string,
  searchable: boolean,
): ZardTagSelectOption<unknown>[] {
  if (!searchable) {
    return [...options];
  }

  const normalized = normalizeTagSelectStringComparison(searchTerm);
  if (!normalized) {
    return [...options];
  }

  return options.filter((option) => {
    if (normalizeTagSelectStringComparison(option.label).includes(normalized)) {
      return true;
    }

    return option.keywords?.some((keyword) => normalizeTagSelectStringComparison(keyword).includes(normalized)) ?? false;
  });
}
