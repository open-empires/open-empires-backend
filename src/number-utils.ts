import { SenderError } from "spacetimedb/server";

export const clampInt = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const clampU32 = (value: number, max: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const toSafeNumber = (value: bigint, field: string): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SenderError(`${field} is too large.`);
  }
  return Number(value);
};

export const toU64 = (value: number, _field?: string): bigint => BigInt(value);

export const toU32 = (value: number, _field?: string): number => value;

export const toU8 = (value: number, _field?: string): number => value;
