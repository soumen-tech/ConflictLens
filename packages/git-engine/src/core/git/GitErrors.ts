/**
 * @file GitErrors.ts
 * Typed error factory. Never throws raw Error objects — always use makeError().
 */

import type { ConflictLensError, ConflictLensErrorCode } from "../../shared/types/gitConflictResult";

export function makeError(
  code: ConflictLensErrorCode,
  message: string,
  cause?: unknown
): ConflictLensError {
  const causeStr =
    cause instanceof Error
      ? cause.message
      : cause !== undefined
      ? String(cause)
      : undefined;

  return { code, message, ...(causeStr !== undefined ? { cause: causeStr } : {}) };
}

export class ConflictLensException extends Error {
  public readonly ConflictLensError: ConflictLensError;

  constructor(error: ConflictLensError) {
    super(error.message);
    this.name = "ConflictLensException";
    this.ConflictLensError = error;
  }
}

export function throwError(
  code: ConflictLensErrorCode,
  message: string,
  cause?: unknown
): never {
  throw new ConflictLensException(makeError(code, message, cause));
}
