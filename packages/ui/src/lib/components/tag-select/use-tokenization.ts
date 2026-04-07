const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ZardTagSelectTypedTokenizationResult {
  committedTokens: string[];
  remainder: string;
}

export function normalizeTagSelectToken(value: string): string {
  return value.trim();
}

export function normalizeTagSelectStringComparison(value: string): string {
  return normalizeTagSelectToken(value).toLocaleLowerCase();
}

export function hasTokenSeparator(value: string, separators: readonly string[]): boolean {
  if (!value || !separators.length) {
    return false;
  }

  return separators.some((separator) => separator && value.includes(separator));
}

function createTokenSeparatorRegex(separators: readonly string[]): RegExp | null {
  const sanitizedSeparators = separators.filter(Boolean);
  if (!sanitizedSeparators.length) {
    return null;
  }

  return new RegExp(`(?:${sanitizedSeparators.map(escapeRegExp).join('|')})`, 'g');
}

export function tokenizeTypedValue(value: string, separators: readonly string[]): ZardTagSelectTypedTokenizationResult {
  if (!value || !separators.length) {
    return {
      committedTokens: [],
      remainder: value,
    };
  }

  const separatorRegex = createTokenSeparatorRegex(separators);
  if (!separatorRegex || !separatorRegex.test(value)) {
    return {
      committedTokens: [],
      remainder: value,
    };
  }

  const trailingSeparator = separators.some((separator) => separator && value.endsWith(separator));
  const segments = value.split(separatorRegex).map(normalizeTagSelectToken);
  const remainder = trailingSeparator ? '' : (segments.pop() ?? '');

  return {
    committedTokens: segments.filter(Boolean),
    remainder,
  };
}

export function tokenizePastedValue(value: string, separators: readonly string[]): string[] {
  if (!value || !separators.length) {
    return [];
  }

  const separatorRegex = createTokenSeparatorRegex(separators);
  if (!separatorRegex || !separatorRegex.test(value)) {
    return [];
  }

  return value.split(separatorRegex).map(normalizeTagSelectToken).filter(Boolean);
}
