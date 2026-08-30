/**
 * error-envelope.ts
 *
 * Versioned API error envelope for all LumenFlow SDK endpoints.
 *
 * Every SDK method that can fail should wrap its error in an `ErrorEnvelope`
 * before surfacing it to the caller.  The envelope provides a stable,
 * version-stamped shape that clients can reliably parse regardless of which
 * SDK version they are running against.
 *
 * Envelope shape (v1)
 * -------------------
 * {
 *   "envelope_version": 1,
 *   "ok": false,
 *   "error": {
 *     "code": 22,
 *     "name": "InvalidAmount",
 *     "message": "The payment amount must be greater than zero.",
 *     "details": <any | undefined>,
 *     "request_id": "<uuid | undefined>",
 *     "timestamp": "<ISO-8601>"
 *   }
 * }
 *
 * Success shape
 * -------------
 * {
 *   "envelope_version": 1,
 *   "ok": true,
 *   "data": <T>
 * }
 *
 * Versioning contract
 * -------------------
 *  - The `envelope_version` field is a positive integer that increments when
 *    the envelope shape changes in a breaking way.
 *  - Clients should check `envelope_version` before accessing fields so that
 *    future breaking changes can be detected and handled gracefully.
 *  - Non-breaking additions (new optional fields) do NOT increment the version.
 */

import { LumenFlowError, PaymentErrorCode, ERROR_MESSAGES } from './errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current envelope schema version. Increment on breaking shape changes. */
export const ENVELOPE_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Error detail block inside an error envelope. */
export interface ErrorDetail {
  /** Numeric error code from `PaymentErrorCode`. */
  code: number;
  /** Human-readable name of the error code (e.g. `"InvalidAmount"`). */
  name: string;
  /** User-facing error message. */
  message: string;
  /** Optional structured context (field name, constraint, raw contract error, …). */
  details?: unknown;
  /** Optional request correlation ID for distributed tracing. */
  request_id?: string;
  /** ISO-8601 timestamp when the error was generated. */
  timestamp: string;
}

/** Envelope returned when an operation succeeds. */
export interface SuccessEnvelope<T> {
  envelope_version: typeof ENVELOPE_VERSION;
  ok: true;
  data: T;
}

/** Envelope returned when an operation fails. */
export interface ErrorEnvelope {
  envelope_version: typeof ENVELOPE_VERSION;
  ok: false;
  error: ErrorDetail;
}

/** Union type for all possible envelope responses. */
export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a successful result in a versioned success envelope.
 *
 * @param data - The operation result.
 * @returns A `SuccessEnvelope<T>`.
 *
 * @example
 * return ok({ orderId: 'ORDER_001', amount: 1000n });
 */
export function ok<T>(data: T): SuccessEnvelope<T> {
  return {
    envelope_version: ENVELOPE_VERSION,
    ok: true,
    data,
  };
}

/**
 * Wraps a `LumenFlowError` in a versioned error envelope.
 *
 * @param error      - The `LumenFlowError` to wrap.
 * @param requestId  - Optional request correlation ID.
 * @returns An `ErrorEnvelope`.
 *
 * @example
 * try {
 *   validateProcessPayment(params);
 * } catch (e) {
 *   if (e instanceof LumenFlowError) return fail(e);
 *   throw e;
 * }
 */
export function fail(error: LumenFlowError, requestId?: string): ErrorEnvelope {
  return {
    envelope_version: ENVELOPE_VERSION,
    ok: false,
    error: {
      code: error.code,
      name: PaymentErrorCode[error.code] ?? `Unknown(${error.code})`,
      message: error.message,
      details: error.details,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Wraps an arbitrary `Error` (or any thrown value) in a versioned error
 * envelope using the `InvalidInput` code for domain errors and a generic
 * code for unexpected errors.
 *
 * Prefer `fail()` when you have a `LumenFlowError`; use this only for
 * untyped catch clauses.
 *
 * @param error      - Any thrown value.
 * @param requestId  - Optional request correlation ID.
 * @returns An `ErrorEnvelope`.
 */
export function failUnknown(error: unknown, requestId?: string): ErrorEnvelope {
  if (error instanceof LumenFlowError) {
    return fail(error, requestId);
  }

  const message =
    error instanceof Error
      ? error.message
      : 'An unexpected error occurred.';

  return {
    envelope_version: ENVELOPE_VERSION,
    ok: false,
    error: {
      code: PaymentErrorCode.InvalidInput,
      name: 'UnexpectedError',
      message,
      details: error instanceof Error ? { stack: error.stack } : undefined,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Type-guard helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the envelope represents a success response.
 * Narrows the type to `SuccessEnvelope<T>`.
 */
export function isSuccess<T>(envelope: ApiEnvelope<T>): envelope is SuccessEnvelope<T> {
  return envelope.ok === true;
}

/**
 * Returns `true` when the envelope represents an error response.
 * Narrows the type to `ErrorEnvelope`.
 */
export function isError<T>(envelope: ApiEnvelope<T>): envelope is ErrorEnvelope {
  return envelope.ok === false;
}

/**
 * Asserts that `envelope_version` is the expected version.
 * Throws a plain `Error` (not a `LumenFlowError`) when there is a mismatch
 * so that callers can distinguish version incompatibilities from domain errors.
 *
 * @param envelope  - Any envelope object received from the API.
 * @param expected  - Expected version (defaults to `ENVELOPE_VERSION`).
 */
export function assertEnvelopeVersion(
  envelope: { envelope_version: number },
  expected: number = ENVELOPE_VERSION,
): void {
  if (envelope.envelope_version !== expected) {
    throw new Error(
      `Unsupported envelope version: received ${envelope.envelope_version}, ` +
      `expected ${expected}. Please upgrade the LumenFlow SDK.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Higher-order helper: wrap an async fn and always return an ApiEnvelope
// ---------------------------------------------------------------------------

/**
 * Wraps an async function so that it always returns an `ApiEnvelope<T>`
 * instead of throwing.  Useful for adapting existing SDK methods to the
 * envelope pattern without rewriting their internals.
 *
 * @param fn         - Async function to wrap.
 * @param requestId  - Optional request correlation ID forwarded to error envelopes.
 * @returns A new async function with the same parameters but returning `ApiEnvelope<T>`.
 *
 * @example
 * const safeProcessPayment = withEnvelope(processPayment);
 * const result = await safeProcessPayment(params);
 * if (isSuccess(result)) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export function withEnvelope<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  requestId?: string,
): (...args: TArgs) => Promise<ApiEnvelope<TReturn>> {
  return async (...args: TArgs): Promise<ApiEnvelope<TReturn>> => {
    try {
      const data = await fn(...args);
      return ok(data);
    } catch (error) {
      return failUnknown(error, requestId);
    }
  };
}
