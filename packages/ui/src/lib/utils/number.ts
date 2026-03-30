function clamp(value: number, [min, max]: [number, number]): number {
  return Math.min(max, Math.max(min, value));
}

function getPrecision(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = `${value}`.toLowerCase();
  if (normalized.includes('e-')) {
    const [coefficient, exponent] = normalized.split('e-');
    return (coefficient.split('.')[1]?.length ?? 0) + Number(exponent);
  }

  return normalized.split('.')[1]?.length ?? 0;
}

function roundToStep(value: number, min: number, step: number): number {
  const rounded = Math.round((value - min) / step) * step + min;
  return Number(rounded.toFixed(Math.max(getPrecision(step), getPrecision(min))));
}

function convertValueToPercentage(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

export { clamp, roundToStep, convertValueToPercentage };
