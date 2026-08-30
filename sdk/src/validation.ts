/**
 * validation.ts
 *
 * Strict request schema validation at the LumenFlow API boundary.
 *
 * Every public SDK method should call the corresponding `validate*` function
 * before forwarding a request to the Soroban contract.  Violations throw a
 * `LumenFlowError` with `code: PaymentErrorCode.InvalidInput` so callers
 * receive a typed, actionable error rather than a raw contract rejection.
 *
 * Design principles
 * -----------------
 *  - All validators are pure functions with no side-effects.
 *  - Validators collect all field errors before throwing so that callers
 *    receive a complete list of violations in one pass.
 *  - Type-guard helpers (`isValid*`) are exported for use in UI layers.
 */

import { LumenFlowError, PaymentErrorCode } from './errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;
const ORDER_ID_MAX_LEN = 64;
const MEMO_MAX_LEN = 256;
const REASON_MAX_LEN = 512;
const TAG_MAX_LEN = 64;
const TAG_MAX_COUNT = 10;
const NAME_MAX_LEN = 128;
const DESCRIPTION_MAX_LEN = 1024;
const CONTACT_INFO_MAX_LEN = 256;
const BATCH_MAX_SIZE = 10;

// ---------------------------------------------------------------------------
// Primitive type-guard helpers
// ---------------------------------------------------------------------------

/** True when value is a non-empty, non-whitespace-only string. */
export function isValidOrderId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= ORDER_ID_MAX_LEN;
}

/** True when value matches the Stellar public key format (G…, 56 chars). */
export function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && STELLAR_ADDRESS_REGEX.test(value);
}

/** True when value is a bigint or safe integer string greater than zero. */
export function isPositiveAmount(value: unknown): boolean {
  if (typeof value === 'bigint') return value > 0n;
  if (typeof value === 'number') return Number.isInteger(value) && value > 0;
  return false;
}

/** True when value is a non-negative bigint or integer. */
export function isNonNegativeAmount(value: unknown): boolean {
  if (typeof value === 'bigint') return value >= 0n;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0;
  return false;
}

/** True when value is a non-empty string within the maximum length. */
function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

/** True when value is a string (possibly empty) within the maximum length. */
function isString(value: unknown, maxLen: number): value is string {
  return typeof value === 'string' && value.length <= maxLen;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throws a single `LumenFlowError` with all collected violation messages.
 * @internal
 */
function throwIfErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new LumenFlowError(PaymentErrorCode.InvalidInput, errors.join('; '));
  }
}

// ---------------------------------------------------------------------------
// Legacy field-level helper (backward-compatible)
// ---------------------------------------------------------------------------

/**
 * Validates individual contract field options.
 *
 * @deprecated Prefer the typed `validate*` functions below for new code.
 */
export function validateContractFields(options: {
  orderId?: unknown;
  tokenAddress?: unknown;
  payerAddress?: unknown;
  merchantAddress?: unknown;
}): void {
  const errors: string[] = [];

  if (options.orderId !== undefined && !isValidOrderId(options.orderId)) {
    errors.push('orderId must be a non-empty string (max 64 chars)');
  }
  if (options.tokenAddress !== undefined && !isValidAddress(options.tokenAddress)) {
    errors.push('tokenAddress must be a valid Stellar address');
  }
  if (options.payerAddress !== undefined && !isValidAddress(options.payerAddress)) {
    errors.push('payerAddress must be a valid Stellar address');
  }
  if (options.merchantAddress !== undefined && !isValidAddress(options.merchantAddress)) {
    errors.push('merchantAddress must be a valid Stellar address');
  }

  throwIfErrors(errors);
}

// ---------------------------------------------------------------------------
// Payment request validation
// ---------------------------------------------------------------------------

export interface ProcessPaymentParams {
  orderId: unknown;
  merchantAddress: unknown;
  tokenAddress: unknown;
  payerAddress: unknown;
  amount: unknown;
  memo?: unknown;
  tags?: unknown;
  signature: unknown;
  merchantPublicKey: unknown;
}

/**
 * Validates all fields required by `process_payment_with_signature`.
 * Throws `LumenFlowError(InvalidInput, <all violations joined by "; ">)` on
 * the first (and only) invalid pass.
 */
export function validateProcessPayment(params: ProcessPaymentParams): void {
  const errors: string[] = [];

  if (!isValidOrderId(params.orderId)) {
    errors.push(`orderId must be a non-empty string (max ${ORDER_ID_MAX_LEN} chars)`);
  }
  if (!isValidAddress(params.merchantAddress)) {
    errors.push('merchantAddress must be a valid Stellar address');
  }
  if (!isValidAddress(params.tokenAddress)) {
    errors.push('tokenAddress must be a valid Stellar address');
  }
  if (!isValidAddress(params.payerAddress)) {
    errors.push('payerAddress must be a valid Stellar address');
  }
  if (!isPositiveAmount(params.amount)) {
    errors.push('amount must be a positive integer');
  }
  if (params.memo !== undefined && !isString(params.memo, MEMO_MAX_LEN)) {
    errors.push(`memo must be a string (max ${MEMO_MAX_LEN} chars)`);
  }
  if (params.tags !== undefined) {
    if (!Array.isArray(params.tags)) {
      errors.push('tags must be an array of strings');
    } else {
      if (params.tags.length > TAG_MAX_COUNT) {
        errors.push(`tags array must not exceed ${TAG_MAX_COUNT} items`);
      }
      const badTag = params.tags.find(
        (t) => typeof t !== 'string' || t.length === 0 || t.length > TAG_MAX_LEN,
      );
      if (badTag !== undefined) {
        errors.push(`each tag must be a non-empty string (max ${TAG_MAX_LEN} chars)`);
      }
    }
  }
  if (!(params.signature instanceof Uint8Array || Buffer.isBuffer(params.signature)) ||
      (params.signature as Buffer | Uint8Array).length !== 64) {
    errors.push('signature must be a 64-byte Buffer or Uint8Array');
  }
  if (!(params.merchantPublicKey instanceof Uint8Array || Buffer.isBuffer(params.merchantPublicKey)) ||
      (params.merchantPublicKey as Buffer | Uint8Array).length !== 32) {
    errors.push('merchantPublicKey must be a 32-byte Buffer or Uint8Array');
  }

  throwIfErrors(errors);
}

// ---------------------------------------------------------------------------
// Batch payment validation
// ---------------------------------------------------------------------------

export interface BatchPaymentItemParams {
  orderId: unknown;
  merchantAddress: unknown;
  tokenAddress: unknown;
  amount: unknown;
  memo?: unknown;
  signature: unknown;
  merchantPublicKey: unknown;
}

/**
 * Validates a batch payment request (up to 10 items).
 */
export function validateBatchPayment(items: unknown): void {
  const errors: string[] = [];

  if (!Array.isArray(items)) {
    errors.push('batch payments must be an array');
    throwIfErrors(errors);
  }

  const batch = items as unknown[];
  if (batch.length === 0) {
    errors.push('batch must contain at least one payment item');
  }
  if (batch.length > BATCH_MAX_SIZE) {
    errors.push(`batch must not exceed ${BATCH_MAX_SIZE} items`);
  }

  batch.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`item[${index}] must be an object`);
      return;
    }
    const p = item as Record<string, unknown>;
    if (!isValidOrderId(p.orderId)) errors.push(`item[${index}].orderId invalid`);
    if (!isValidAddress(p.merchantAddress)) errors.push(`item[${index}].merchantAddress invalid`);
    if (!isValidAddress(p.tokenAddress)) errors.push(`item[${index}].tokenAddress invalid`);
    if (!isPositiveAmount(p.amount)) errors.push(`item[${index}].amount must be positive integer`);
    if (p.memo !== undefined && !isString(p.memo, MEMO_MAX_LEN)) {
      errors.push(`item[${index}].memo must be a string (max ${MEMO_MAX_LEN} chars)`);
    }
    if (!(p.signature instanceof Uint8Array || Buffer.isBuffer(p.signature)) ||
        (p.signature as Buffer | Uint8Array).length !== 64) {
      errors.push(`item[${index}].signature must be a 64-byte Buffer`);
    }
    if (!(p.merchantPublicKey instanceof Uint8Array || Buffer.isBuffer(p.merchantPublicKey)) ||
        (p.merchantPublicKey as Buffer | Uint8Array).length !== 32) {
      errors.push(`item[${index}].merchantPublicKey must be a 32-byte Buffer`);
    }
  });

  throwIfErrors(errors);
}

// ---------------------------------------------------------------------------
// Merchant registration validation
// ---------------------------------------------------------------------------

export interface RegisterMerchantParams {
  merchantAddress: unknown;
  name: unknown;
  description: unknown;
  contactInfo: unknown;
  category: unknown;
}

const VALID_CATEGORIES = ['Retail', 'Food', 'Services', 'Digital', 'Other'];

/**
 * Validates fields required by `register_merchant`.
 */
export function validateRegisterMerchant(params: RegisterMerchantParams): void {
  const errors: string[] = [];

  if (!isValidAddress(params.merchantAddress)) {
    errors.push('merchantAddress must be a valid Stellar address');
  }
  if (!isNonEmptyString(params.name, NAME_MAX_LEN)) {
    errors.push(`name must be a non-empty string (max ${NAME_MAX_LEN} chars)`);
  }
  if (!isString(params.description, DESCRIPTION_MAX_LEN)) {
    errors.push(`description must be a string (max ${DESCRIPTION_MAX_LEN} chars)`);
  }
  if (!isNonEmptyString(params.contactInfo, CONTACT_INFO_MAX_LEN)) {
    errors.push(`contactInfo must be a non-empty string (max ${CONTACT_INFO_MAX_LEN} chars)`);
  }
  if (typeof params.category !== 'string' || !VALID_CATEGORIES.includes(params.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  throwIfErrors(errors);
}

// ---------------------------------------------------------------------------
// Refund request validation
// ---------------------------------------------------------------------------

export interface InitiateRefundParams {
  refundId: unknown;
  orderId: unknown;
  callerAddress: unknown;
  amount: unknown;
  reason: unknown;
}

/**
 * Validates fields required by `initiate_refund`.
 */
export function validateInitiateRefund(params: InitiateRefundParams): void {
  const errors: string[] = [];

  if (!isNonEmptyString(params.refundId, ORDER_ID_MAX_LEN)) {
    errors.push(`refundId must be a non-empty string (max ${ORDER_ID_MAX_LEN} chars)`);
  }
  if (!isValidOrderId(params.orderId)) {
    errors.push('orderId must be a non-empty string');
  }
  if (!isValidAddress(params.callerAddress)) {
    errors.push('callerAddress must be a valid Stellar address');
  }
  if (!isPositiveAmount(params.amount)) {
    errors.push('amount must be a positive integer');
  }
  if (!isNonEmptyString(params.reason, REASON_MAX_LEN)) {
    errors.push(`reason must be a non-empty string (max ${REASON_MAX_LEN} chars)`);
  }

  throwIfErrors(errors);
}

// ---------------------------------------------------------------------------
// Pagination / history query validation
// ---------------------------------------------------------------------------

export interface PaginationParams {
  limit: unknown;
  cursor?: unknown;
}

const PAGINATION_MAX_LIMIT = 100;

/**
 * Validates pagination parameters for history queries.
 */
export function validatePagination(params: PaginationParams): void {
  const errors: string[] = [];

  if (
    typeof params.limit !== 'number' ||
    !Number.isInteger(params.limit) ||
    params.limit < 1 ||
    params.limit > PAGINATION_MAX_LIMIT
  ) {
    errors.push(`limit must be an integer between 1 and ${PAGINATION_MAX_LIMIT}`);
  }
  if (params.cursor !== undefined && params.cursor !== null) {
    if (!isNonEmptyString(params.cursor, ORDER_ID_MAX_LEN)) {
      errors.push('cursor must be a non-empty string when provided');
    }
  }

  throwIfErrors(errors);
}
