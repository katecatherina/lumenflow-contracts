/**
 * lumenflow-errors.js
 *
 * Frontend error taxonomy for LumenFlow.
 *
 * Maps API error codes (from the Soroban contract and SDK) to structured
 * frontend error objects with:
 *  - a semantic category for routing to the right UI component
 *  - a user-facing title and message
 *  - optional remediation hint
 *  - HTTP-equivalent status for logging / monitoring
 *
 * Usage
 * -----
 * import { resolveApiError, ErrorCategory, ERROR_TAXONOMY } from './lumenflow-errors.js';
 *
 * try {
 *   await processPayment(params);
 * } catch (err) {
 *   const fe = resolveApiError(err);
 *   showErrorBanner(fe.title, fe.message, fe.hint);
 * }
 *
 * The module is intentionally written as a plain ES module (no build step)
 * so it can be imported directly from any frontend HTML page.
 */

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

/**
 * Semantic categories that drive UI routing decisions.
 *
 * @enum {string}
 */
export const ErrorCategory = Object.freeze({
  /** The user is not logged in or their session has expired. */
  AUTH: 'auth',

  /** The user does not have permission to perform the action. */
  PERMISSION: 'permission',

  /** One or more input fields are invalid. */
  VALIDATION: 'validation',

  /** The requested resource (payment, merchant, refund, …) was not found. */
  NOT_FOUND: 'not_found',

  /** The resource already exists or the action has already been performed. */
  CONFLICT: 'conflict',

  /** The operation was rejected because a business rule was violated. */
  BUSINESS_RULE: 'business_rule',

  /** A transient network or RPC error — the user can retry. */
  NETWORK: 'network',

  /** An unexpected or unclassified server error. */
  UNEXPECTED: 'unexpected',
});

// ---------------------------------------------------------------------------
// Taxonomy map  (API error code → FrontendErrorDef)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} FrontendErrorDef
 * @property {string} category   - One of `ErrorCategory`.
 * @property {string} title      - Short, user-facing title (e.g. for toast headers).
 * @property {string} message    - Full user-facing explanation.
 * @property {string} [hint]     - Optional remediation hint shown beneath the message.
 * @property {number} httpStatus - HTTP-equivalent status code for logging.
 */

/**
 * Complete taxonomy of API error codes mapped to frontend error definitions.
 *
 * Keys are numeric `PaymentErrorCode` values from the SDK / contract.
 *
 * @type {Record<number, FrontendErrorDef>}
 */
export const ERROR_TAXONOMY = Object.freeze({
  // ── Auth & admin ──────────────────────────────────────────────────────────
  1: {
    category: ErrorCategory.PERMISSION,
    title: 'Not Authorised',
    message: 'You do not have permission to perform this action.',
    hint: 'Make sure you are signed in with the correct wallet address.',
    httpStatus: 403,
  },
  2: {
    category: ErrorCategory.CONFLICT,
    title: 'Admin Already Set',
    message: 'The contract administrator has already been initialised.',
    httpStatus: 409,
  },
  3: {
    category: ErrorCategory.VALIDATION,
    title: 'Invalid Admin Address',
    message: 'The provided admin address is not a valid account address.',
    hint: 'Use a regular Stellar account address, not a contract address.',
    httpStatus: 422,
  },
  4: {
    category: ErrorCategory.VALIDATION,
    title: 'Invalid Nonce',
    message: 'The transaction nonce is incorrect.',
    hint: 'Refresh the page and try again to obtain a fresh nonce.',
    httpStatus: 422,
  },

  // ── Merchant ──────────────────────────────────────────────────────────────
  10: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Merchant Not Found',
    message: 'No merchant profile could be found for this address.',
    hint: 'Double-check the merchant address or ask the merchant to register.',
    httpStatus: 404,
  },
  11: {
    category: ErrorCategory.CONFLICT,
    title: 'Already Registered',
    message: 'A merchant profile already exists for this wallet address.',
    httpStatus: 409,
  },
  12: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Merchant Inactive',
    message: 'This merchant is currently inactive and cannot accept payments.',
    hint: 'Contact the merchant or try a different merchant.',
    httpStatus: 403,
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  20: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Payment Not Found',
    message: 'The payment record for this order could not be found.',
    hint: 'Verify the order ID and try again.',
    httpStatus: 404,
  },
  21: {
    category: ErrorCategory.CONFLICT,
    title: 'Duplicate Order',
    message: 'A payment with this order ID already exists.',
    hint: 'Use a unique order ID for each payment.',
    httpStatus: 409,
  },
  22: {
    category: ErrorCategory.VALIDATION,
    title: 'Invalid Amount',
    message: 'The payment amount must be greater than zero.',
    hint: 'Enter a valid amount in stroops (1 XLM = 10,000,000 stroops).',
    httpStatus: 422,
  },
  23: {
    category: ErrorCategory.VALIDATION,
    title: 'Invalid Signature',
    message: 'The payment signature is invalid or does not match the merchant key.',
    hint: 'Ensure the correct merchant key was used to sign the payment.',
    httpStatus: 422,
  },
  24: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Payment Expired',
    message: 'This payment request has expired.',
    hint: 'Create a new payment request and try again.',
    httpStatus: 410,
  },
  25: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Insufficient Balance',
    message: 'Your wallet does not have enough funds to complete this payment.',
    hint: 'Top up your wallet and try again.',
    httpStatus: 402,
  },
  26: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Token Not Accepted',
    message: 'The selected token is not accepted by this contract.',
    hint: 'Switch to an accepted token (e.g. native XLM).',
    httpStatus: 422,
  },

  // ── Refund ────────────────────────────────────────────────────────────────
  30: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Refund Not Found',
    message: 'The refund record could not be found.',
    httpStatus: 404,
  },
  31: {
    category: ErrorCategory.CONFLICT,
    title: 'Duplicate Refund',
    message: 'A refund with this ID already exists.',
    httpStatus: 409,
  },
  32: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Refund Window Closed',
    message: 'The 30-day refund window for this payment has expired.',
    httpStatus: 410,
  },
  33: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Refund Exceeds Original',
    message: 'The requested refund amount is greater than the original payment.',
    hint: 'Enter an amount up to the original payment value.',
    httpStatus: 422,
  },
  34: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Refund Not Approved',
    message: 'This refund has not yet been approved by the merchant.',
    hint: 'Wait for merchant approval before executing the refund.',
    httpStatus: 409,
  },
  35: {
    category: ErrorCategory.CONFLICT,
    title: 'Refund Already Completed',
    message: 'This refund has already been executed.',
    httpStatus: 409,
  },
  36: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Too Many Refunds',
    message: 'The maximum number of partial refunds for this order has been reached.',
    httpStatus: 409,
  },
  37: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Refund Not Rejected',
    message: 'This refund cannot be disputed because it was not rejected.',
    httpStatus: 409,
  },
  38: {
    category: ErrorCategory.CONFLICT,
    title: 'Dispute Already Exists',
    message: 'A dispute has already been raised for this refund.',
    httpStatus: 409,
  },
  39: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Dispute Not Found',
    message: 'No dispute record was found for this refund.',
    httpStatus: 404,
  },

  // ── Multi-sig ─────────────────────────────────────────────────────────────
  40: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Multisig Payment Not Found',
    message: 'The multi-signature payment could not be found.',
    httpStatus: 404,
  },
  41: {
    category: ErrorCategory.CONFLICT,
    title: 'Already Signed',
    message: 'You have already signed this multi-signature payment.',
    httpStatus: 409,
  },
  42: {
    category: ErrorCategory.CONFLICT,
    title: 'Multisig Already Executed',
    message: 'This multi-signature payment has already been executed.',
    httpStatus: 409,
  },
  43: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Insufficient Signatures',
    message: 'The payment does not have enough signatures to meet the required threshold.',
    hint: 'Collect the remaining signatures before executing.',
    httpStatus: 409,
  },
  44: {
    category: ErrorCategory.CONFLICT,
    title: 'Multisig Cancelled',
    message: 'This multi-signature payment has been cancelled.',
    httpStatus: 410,
  },

  // ── Input / pagination ────────────────────────────────────────────────────
  50: {
    category: ErrorCategory.VALIDATION,
    title: 'Invalid Input',
    message: 'One or more input fields are invalid.',
    hint: 'Check the highlighted fields and correct any errors.',
    httpStatus: 422,
  },
  51: {
    category: ErrorCategory.VALIDATION,
    title: 'Page Size Too Large',
    message: 'The requested page size exceeds the maximum allowed limit.',
    hint: 'Request 100 or fewer items per page.',
    httpStatus: 422,
  },
  52: {
    category: ErrorCategory.VALIDATION,
    title: 'Batch Too Large',
    message: 'The payment batch exceeds the maximum size of 10 items.',
    hint: 'Split the batch into smaller groups of 10 or fewer.',
    httpStatus: 422,
  },
  53: {
    category: ErrorCategory.VALIDATION,
    title: 'Invalid Tags',
    message: 'One or more payment tags exceed the allowed length or count.',
    hint: 'Use at most 10 tags, each no longer than 64 characters.',
    httpStatus: 422,
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  60: {
    category: ErrorCategory.CONFLICT,
    title: 'Plan Already Exists',
    message: 'A subscription plan with this ID already exists.',
    httpStatus: 409,
  },
  61: {
    category: ErrorCategory.CONFLICT,
    title: 'Subscription Already Exists',
    message: 'You already have an active subscription with this ID.',
    httpStatus: 409,
  },
  62: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Plan Not Found',
    message: 'The subscription plan could not be found.',
    httpStatus: 404,
  },
  63: {
    category: ErrorCategory.NOT_FOUND,
    title: 'Subscription Not Found',
    message: 'The subscription record could not be found.',
    httpStatus: 404,
  },
  64: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Subscription Inactive',
    message: 'This subscription is not active.',
    hint: 'Check whether the subscription was cancelled or completed.',
    httpStatus: 409,
  },
  65: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Max Cycles Reached',
    message: 'This subscription has reached its maximum number of billing cycles.',
    httpStatus: 410,
  },
  66: {
    category: ErrorCategory.BUSINESS_RULE,
    title: 'Billing Interval Not Elapsed',
    message: 'The required time between subscription charges has not passed yet.',
    hint: 'Wait for the next billing date before charging again.',
    httpStatus: 409,
  },
});

// ---------------------------------------------------------------------------
// Fallback definition for unknown codes
// ---------------------------------------------------------------------------

/** @type {FrontendErrorDef} */
const UNKNOWN_ERROR = Object.freeze({
  category: ErrorCategory.UNEXPECTED,
  title: 'Unexpected Error',
  message: 'An unexpected error occurred. Please try again.',
  hint: 'If the problem persists, contact support.',
  httpStatus: 500,
});

/** @type {FrontendErrorDef} */
const NETWORK_ERROR = Object.freeze({
  category: ErrorCategory.NETWORK,
  title: 'Network Error',
  message: 'Could not reach the LumenFlow contract. Check your connection and try again.',
  hint: 'Ensure your wallet is connected and the RPC endpoint is reachable.',
  httpStatus: 503,
});

// ---------------------------------------------------------------------------
// resolveApiError()
// ---------------------------------------------------------------------------

/**
 * Maps any thrown value to a `FrontendErrorDef` from the taxonomy.
 *
 * Handles three input shapes:
 *  1. An SDK `LumenFlowError` (has a numeric `.code` property).
 *  2. An error envelope object (`{ ok: false, error: { code, message } }`).
 *  3. A network / fetch `Error` (message contains "network", "fetch", or "timeout").
 *  4. Any other value → `UNKNOWN_ERROR`.
 *
 * @param {unknown} error - Any caught value.
 * @returns {FrontendErrorDef & { rawMessage?: string }}
 */
export function resolveApiError(error) {
  // ── SDK LumenFlowError ───────────────────────────────────────────────────
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'number') {
    return {
      ...(ERROR_TAXONOMY[error.code] ?? { ...UNKNOWN_ERROR }),
      rawMessage: error.message,
    };
  }

  // ── Error envelope  { ok: false, error: { code } } ───────────────────────
  if (
    error &&
    typeof error === 'object' &&
    error.ok === false &&
    error.error &&
    typeof error.error.code === 'number'
  ) {
    return {
      ...(ERROR_TAXONOMY[error.error.code] ?? { ...UNKNOWN_ERROR }),
      rawMessage: error.error.message,
    };
  }

  // ── Network / RPC errors ─────────────────────────────────────────────────
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('econnrefused')
    ) {
      return { ...NETWORK_ERROR, rawMessage: error.message };
    }
    return { ...UNKNOWN_ERROR, rawMessage: error.message };
  }

  return { ...UNKNOWN_ERROR };
}

// ---------------------------------------------------------------------------
// UI helper: render an error banner
// ---------------------------------------------------------------------------

/**
 * Renders a dismissible error banner into `containerEl`.
 *
 * @param {HTMLElement} containerEl   - Element to append the banner into.
 * @param {FrontendErrorDef} errorDef - Resolved error definition.
 * @param {object} [options]
 * @param {boolean} [options.dismissible=true] - Whether the banner has a close button.
 */
export function renderErrorBanner(containerEl, errorDef, { dismissible = true } = {}) {
  const banner = document.createElement('div');
  banner.className = `lf-error-banner lf-error-${errorDef.category}`;
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');

  const closeBtn = dismissible
    ? `<button class="lf-error-close" aria-label="Dismiss error" onclick="this.closest('.lf-error-banner').remove()">✕</button>`
    : '';

  banner.innerHTML = `
    ${closeBtn}
    <strong class="lf-error-title">${escapeHtml(errorDef.title)}</strong>
    <p class="lf-error-message">${escapeHtml(errorDef.message)}</p>
    ${errorDef.hint ? `<p class="lf-error-hint">${escapeHtml(errorDef.hint)}</p>` : ''}
  `.trim();

  containerEl.appendChild(banner);
  return banner;
}

// ---------------------------------------------------------------------------
// Internal: HTML escaping
// ---------------------------------------------------------------------------

/** @param {string} str */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
