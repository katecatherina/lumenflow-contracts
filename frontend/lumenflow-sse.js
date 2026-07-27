/**
 * lumenflow-sse.js
 * Real-time in-app payment status notifications via Horizon Server-Sent Events.
 *
 * Usage:
 *   import { subscribePaymentStatus, dismissNotification } from './lumenflow-sse.js';
 *
 *   // After submitting a payment, subscribe for real-time updates:
 *   subscribePaymentStatus({
 *     orderId: 'ORD-1234',
 *     contractId: 'CABC...XYZ',
 *     network: 'testnet',   // 'testnet' | 'mainnet'
 *     onSuccess: (event) => console.log('Payment confirmed!', event),
 *     onFailure: (event) => console.error('Payment failed', event),
 *     onTimeout: ()      => console.warn('SSE timed out, switched to polling'),
 *   });
 */

// ── Horizon endpoints ──────────────────────────────────────────────────────────
const HORIZON_ENDPOINTS = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

const SSE_TIMEOUT_MS      = 5 * 60 * 1000;  // 5 minutes
const POLL_INTERVAL_MS    = 5 * 1000;        // 5 seconds (fallback polling)
const POLL_MAX_ATTEMPTS   = 60;              // 5 min / 5 s = 60 polls

// ── Active subscriptions ───────────────────────────────────────────────────────
/** @type {Map<string, {cleanup: function}>} */
const activeSubscriptions = new Map();

// ── Notification container ─────────────────────────────────────────────────────
let _notificationContainer = null;

function getNotificationContainer() {
  if (_notificationContainer) return _notificationContainer;
  _notificationContainer = document.createElement('div');
  _notificationContainer.id = 'lf-notifications';
  _notificationContainer.setAttribute('aria-live', 'polite');
  _notificationContainer.setAttribute('aria-atomic', 'false');
  _notificationContainer.style.cssText = [
    'position:fixed',
    'bottom:1.5rem',
    'right:1.5rem',
    'z-index:9999',
    'display:flex',
    'flex-direction:column',
    'gap:0.75rem',
    'max-width:360px',
    'width:100%',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(_notificationContainer);
  return _notificationContainer;
}

/**
 * Show an in-app notification toast.
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} title
 * @param {string} message
 * @param {string} [notificationId] - Optional ID so it can be dismissed programmatically.
 * @param {number} [autoRemoveMs] - Auto-remove after this many ms (default 8000; 0 = never).
 */
export function showNotification(type, title, message, notificationId, autoRemoveMs = 8000) {
  const container = getNotificationContainer();

  const colors = {
    success: { bg: '#d1fae5', border: '#10b981', titleColor: '#065f46', icon: '✔' },
    error:   { bg: '#fee2e2', border: '#ef4444', titleColor: '#7f1d1d', icon: '✖' },
    warning: { bg: '#fef3c7', border: '#f59e0b', titleColor: '#78350f', icon: '⚠' },
    info:    { bg: '#dbeafe', border: '#3b82f6', titleColor: '#1e3a5f', icon: 'ℹ' },
  };
  const c = colors[type] || colors.info;

  const id = notificationId || `lf-notif-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const toast = document.createElement('div');
  toast.id = id;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-label', `${title}: ${message}`);
  toast.style.cssText = [
    `background:${c.bg}`,
    `border-left:4px solid ${c.border}`,
    'border-radius:8px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.12)',
    'padding:1rem 1.25rem',
    'pointer-events:all',
    'display:flex',
    'align-items:flex-start',
    'gap:0.75rem',
    'animation:lf-slide-in 0.2s ease',
  ].join(';');

  // Inject animation keyframes once
  if (!document.getElementById('lf-notif-styles')) {
    const style = document.createElement('style');
    style.id = 'lf-notif-styles';
    style.textContent = `
      @keyframes lf-slide-in {
        from { opacity: 0; transform: translateX(120%); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes lf-slide-out {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(120%); }
      }
    `;
    document.head.appendChild(style);
  }

  toast.innerHTML = `
    <span style="font-size:1.2rem;line-height:1.4;flex-shrink:0;" aria-hidden="true">${c.icon}</span>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:0.875rem;color:${c.titleColor};margin-bottom:0.2rem;">${escapeHtml(title)}</div>
      <div style="font-size:0.8rem;color:#374151;word-break:break-word;">${escapeHtml(message)}</div>
    </div>
    <button
      aria-label="Dismiss notification"
      style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:1.1rem;padding:0;line-height:1;flex-shrink:0;"
      onclick="(function(el){el.closest('[role=status]').remove();})(this)"
    >&times;</button>
  `;

  container.appendChild(toast);

  if (autoRemoveMs > 0) {
    setTimeout(() => dismissNotification(id), autoRemoveMs);
  }

  return id;
}

/**
 * Programmatically dismiss a notification by its ID.
 * @param {string} notificationId
 */
export function dismissNotification(notificationId) {
  const el = document.getElementById(notificationId);
  if (!el) return;
  el.style.animation = 'lf-slide-out 0.2s ease forwards';
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

// ── SSE subscription ───────────────────────────────────────────────────────────

/**
 * Subscribe to Horizon SSE for payment status changes for a given order.
 * Falls back to polling if SSE is unavailable.
 *
 * @param {object} opts
 * @param {string}   opts.orderId      - The order ID to watch
 * @param {string}   opts.contractId   - The LumenFlow contract address
 * @param {'testnet'|'mainnet'} opts.network  - Stellar network
 * @param {function} [opts.onSuccess]  - Called with Horizon event when payment is confirmed
 * @param {function} [opts.onFailure]  - Called with Horizon event when payment fails
 * @param {function} [opts.onTimeout]  - Called when the 5-minute window expires without confirmation
 * @param {number}   [opts.timeoutMs]  - Override default 5-minute SSE timeout
 * @returns {function} cancel          - Call to cancel the subscription early
 */
export function subscribePaymentStatus(opts) {
  const {
    orderId,
    contractId,
    network = 'testnet',
    onSuccess,
    onFailure,
    onTimeout,
    timeoutMs = SSE_TIMEOUT_MS,
  } = opts;

  if (!orderId || !contractId) {
    console.error('[lumenflow-sse] orderId and contractId are required');
    return () => {};
  }

  // Cancel any existing subscription for this order
  if (activeSubscriptions.has(orderId)) {
    activeSubscriptions.get(orderId).cleanup();
  }

  // Show a "pending" notification
  const pendingId = showNotification(
    'info',
    'Payment Submitted',
    `Waiting for on-chain confirmation of ${orderId}…`,
    `lf-pending-${orderId}`,
    0 // never auto-remove; we'll dismiss it manually
  );

  const horizonBase = HORIZON_ENDPOINTS[network] || HORIZON_ENDPOINTS.testnet;
  let cancelled = false;
  let timeoutHandle = null;
  let pollHandle = null;
  let sse = null;

  function cleanup() {
    cancelled = true;
    clearTimeout(timeoutHandle);
    clearInterval(pollHandle);
    if (sse) { sse.close(); sse = null; }
    activeSubscriptions.delete(orderId);
    dismissNotification(pendingId);
  }

  function handleConfirmed(event) {
    cleanup();
    showNotification(
      'success',
      'Payment Confirmed',
      `Order ${orderId} confirmed on-chain.`,
      undefined,
      10000
    );
    if (onSuccess) onSuccess(event);
  }

  function handleFailed(event) {
    const code = (event && event.value && event.value.error_code) ? ` (code: ${event.value.error_code})` : '';
    cleanup();
    showNotification(
      'error',
      'Payment Failed',
      `Order ${orderId} could not be confirmed${code}.`,
      undefined,
      0 // keep until dismissed
    );
    if (onFailure) onFailure(event);
  }

  function handleTimeout() {
    cleanup();
    showNotification(
      'warning',
      'Confirmation Timeout',
      `No on-chain confirmation received for ${orderId} within 5 minutes.`,
      undefined,
      0
    );
    if (onTimeout) onTimeout();
  }

  function matchesOrder(event) {
    // Horizon event value may be an object with order_id
    if (!event) return false;
    const value = event.value || {};
    // Value can be a native object or a raw string; be tolerant
    if (typeof value === 'object' && value.order_id === orderId) return true;
    if (typeof value === 'string' && value.includes(orderId)) return true;
    return false;
  }

  function processSseEvent(event) {
    if (cancelled) return;
    const topic = Array.isArray(event.topic) ? event.topic : [];
    const name  = topic[1] || '';
    if (name === 'payment_processed' && matchesOrder(event)) {
      handleConfirmed(event);
    } else if (name === 'payment_failed' && matchesOrder(event)) {
      handleFailed(event);
    }
  }

  // ── Try SSE ────────────────────────────────────────────────────────────────
  function startSSE() {
    const url = `${horizonBase}/contracts/${encodeURIComponent(contractId)}/events?cursor=now`;
    try {
      sse = new EventSource(url);

      sse.addEventListener('message', (e) => {
        if (cancelled) return;
        try {
          const event = JSON.parse(e.data);
          processSseEvent(event);
        } catch (_) {}
      });

      sse.addEventListener('error', () => {
        if (cancelled) return;
        sse.close();
        sse = null;
        // Fall back to polling
        startPolling();
      });

      // Set global timeout
      timeoutHandle = setTimeout(handleTimeout, timeoutMs);

    } catch (e) {
      // EventSource not supported or CORS blocked – fall back to polling
      startPolling();
    }
  }

  // ── Fallback: polling ──────────────────────────────────────────────────────
  function startPolling() {
    if (cancelled) return;
    let attempts = 0;
    const maxAttempts = Math.ceil(timeoutMs / POLL_INTERVAL_MS);

    pollHandle = setInterval(async () => {
      if (cancelled) return;
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(pollHandle);
        handleTimeout();
        return;
      }
      try {
        const url = `${horizonBase}/contracts/${encodeURIComponent(contractId)}/events?order=desc&limit=50`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const data = await resp.json();
        const records = data._embedded?.records || [];
        for (const event of records) {
          const topic = Array.isArray(event.topic) ? event.topic : [];
          const name  = topic[1] || '';
          if ((name === 'payment_processed' || name === 'payment_failed') && matchesOrder(event)) {
            clearInterval(pollHandle);
            if (name === 'payment_processed') handleConfirmed(event);
            else handleFailed(event);
            return;
          }
        }
      } catch (_) {
        // Network error; keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  // Check if EventSource is supported
  if (typeof EventSource !== 'undefined') {
    startSSE();
  } else {
    startPolling();
  }

  const cancel = () => { cleanup(); };
  activeSubscriptions.set(orderId, { cleanup });
  return cancel;
}

/**
 * Cancel all active SSE subscriptions.
 */
export function cancelAllSubscriptions() {
  for (const [, sub] of activeSubscriptions) {
    sub.cleanup();
  }
  activeSubscriptions.clear();
}

// ── Internal helpers ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
