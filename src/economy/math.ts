export const MICRO = 1_000_000n;
export const MS_PER_SECOND = 1_000n;

export class EconomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EconomyError';
  }
}

export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export function requireInt(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new EconomyError(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

export function parseMicro(value: unknown, name = 'micro'): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new EconomyError(`${name} saved micro amounts must be nonnegative decimal strings`);
  }
  return BigInt(value);
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (a < 0n || b <= 0n) {
    throw new EconomyError('ceilDiv requires a nonnegative numerator and positive denominator');
  }
  return (a + b - 1n) / b;
}

export function exactDiv(numerator: bigint, denominator: bigint, name = 'value'): bigint {
  if (denominator <= 0n) {
    throw new EconomyError(`${name} denominator must be positive`);
  }
  if (numerator % denominator !== 0n) {
    throw new EconomyError(`${name} is not exactly representable in the configured micro unit`);
  }
  return numerator / denominator;
}

export function isqrt(n: bigint): bigint {
  if (n < 0n) {
    throw new EconomyError('isqrt requires a nonnegative integer');
  }
  if (n < 2n) {
    return n;
  }
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function powBigInt(base: bigint, exponent: number): bigint {
  requireInt(exponent, 'exponent', 0);
  let result = 1n;
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e & 1) {
      result *= b;
    }
    e >>= 1;
    if (e > 0) {
      b *= b;
    }
  }
  return result;
}

export function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function reduceRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) {
    throw new EconomyError('rational denominator cannot be zero');
  }
  const sign = denominator < 0n ? -1n : 1n;
  const num = numerator * sign;
  const den = denominator * sign;
  const g = gcdBigInt(num, den);
  return { numerator: num / g, denominator: den / g };
}

export function multiplyRationals(a: Rational, b: Rational): Rational {
  return reduceRational(a.numerator * b.numerator, a.denominator * b.denominator);
}

export function milestoneFactor(
  count: number,
  milestones: readonly number[] = [10, 25, 50],
  factor = 2n,
): bigint {
  requireInt(count, 'count', 0);
  let hits = 0;
  for (const milestone of milestones) {
    if (count >= milestone) {
      hits += 1;
    }
  }
  return powBigInt(factor, hits);
}

export function formatMicro(value: bigint, unit: bigint = MICRO): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const whole = abs / unit;
  const fraction = abs % unit;
  const decimals = unit.toString().length - 1;
  const digits =
    decimals > 0 ? fraction.toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return `${sign}${whole}${digits ? `.${digits}` : ''}`;
}

export function formatRate(perSecondMicro: bigint, unit: bigint = MICRO): string {
  return `${formatMicro(perSecondMicro, unit)}/s`;
}
