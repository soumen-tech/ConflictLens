/**
 * @file GitErrors.ts
 * Typed error factory. Never throws raw Error objects — always use makeError().
 */

import type { CodeGuardError, CodeGuardErrorCode } from "../../shared/types/gitConflictResult";

export function makeError(
  code: CodeGuardErrorCode,
  message: string,
  cause?: unknown
): CodeGuardError {
  const causeStr =
    cause instanceof Error
      ? cause.message
      : cause !== undefined
      ? String(cause)
      : undefined;

  return { code, message, ...(causeStr !== undefined ? { cause: causeStr } : {}) };
}

export class CodeGuardException extends Error {
  public readonly codeGuardError: CodeGuardError;

  constructor(error: CodeGuardError) {
    super(error.message);
    this.name = "CodeGuardException";
    this.codeGuardError = error;
  }
}

export function throwError(
  code: CodeGuardErrorCode,
  message: string,
  cause?: unknown
): never {
  throw new CodeGuardException(makeError(code, message, cause));
}
