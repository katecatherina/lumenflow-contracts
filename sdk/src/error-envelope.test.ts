import {
  ok,
  fail,
  failUnknown,
  isSuccess,
  isError,
  assertEnvelopeVersion,
  withEnvelope,
  ENVELOPE_VERSION,
} from './error-envelope';
import { LumenFlowError, PaymentErrorCode } from './errors';

// ---------------------------------------------------------------------------
// ok()
// ---------------------------------------------------------------------------

describe('ok()', () => {
  it('wraps data in a success envelope', () => {
    const env = ok({ orderId: 'ORDER_001' });
    expect(env.ok).toBe(true);
    expect(env.envelope_version).toBe(ENVELOPE_VERSION);
    expect((env as any).data).toEqual({ orderId: 'ORDER_001' });
  });

  it('works with primitive data', () => {
    const env = ok(42);
    expect(env.ok).toBe(true);
    expect((env as any).data).toBe(42);
  });

  it('works with null data', () => {
    const env = ok(null);
    expect(env.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fail()
// ---------------------------------------------------------------------------

describe('fail()', () => {
  const lfe = new LumenFlowError(PaymentErrorCode.InvalidAmount, { field: 'amount' });

  it('wraps a LumenFlowError in an error envelope', () => {
    const env = fail(lfe);
    expect(env.ok).toBe(false);
    expect(env.envelope_version).toBe(ENVELOPE_VERSION);
    expect(env.error.code).toBe(PaymentErrorCode.InvalidAmount);
    expect(env.error.name).toBe('InvalidAmount');
    expect(env.error.message).toBe(lfe.message);
    expect(env.error.details).toEqual({ field: 'amount' });
    expect(env.error.timestamp).toBeTruthy();
  });

  it('includes request_id when provided', () => {
    const env = fail(lfe, 'req-abc-123');
    expect(env.error.request_id).toBe('req-abc-123');
  });

  it('timestamp is a valid ISO-8601 string', () => {
    const env = fail(lfe);
    expect(() => new Date(env.error.timestamp)).not.toThrow();
    expect(isNaN(new Date(env.error.timestamp).getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// failUnknown()
// ---------------------------------------------------------------------------

describe('failUnknown()', () => {
  it('delegates to fail() for a LumenFlowError', () => {
    const lfe = new LumenFlowError(PaymentErrorCode.Unauthorized);
    const env = failUnknown(lfe);
    expect(env.error.code).toBe(PaymentErrorCode.Unauthorized);
    expect(env.error.name).toBe('Unauthorized');
  });

  it('wraps a plain Error with InvalidInput code', () => {
    const env = failUnknown(new Error('unexpected'));
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe(PaymentErrorCode.InvalidInput);
    expect(env.error.name).toBe('UnexpectedError');
    expect(env.error.message).toBe('unexpected');
  });

  it('wraps a non-Error value', () => {
    const env = failUnknown('string error');
    expect(env.ok).toBe(false);
    expect(env.error.message).toBe('An unexpected error occurred.');
  });
});

// ---------------------------------------------------------------------------
// isSuccess() / isError()
// ---------------------------------------------------------------------------

describe('isSuccess() / isError()', () => {
  it('isSuccess returns true for a success envelope', () => {
    const env = ok('data');
    expect(isSuccess(env)).toBe(true);
    expect(isError(env)).toBe(false);
  });

  it('isError returns true for an error envelope', () => {
    const env = fail(new LumenFlowError(PaymentErrorCode.PaymentNotFound));
    expect(isError(env)).toBe(true);
    expect(isSuccess(env)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertEnvelopeVersion()
// ---------------------------------------------------------------------------

describe('assertEnvelopeVersion()', () => {
  it('does not throw when versions match', () => {
    expect(() =>
      assertEnvelopeVersion({ envelope_version: ENVELOPE_VERSION }),
    ).not.toThrow();
  });

  it('throws when version mismatches', () => {
    expect(() =>
      assertEnvelopeVersion({ envelope_version: 99 }),
    ).toThrow(/Unsupported envelope version/);
  });

  it('accepts an explicit expected version parameter', () => {
    expect(() =>
      assertEnvelopeVersion({ envelope_version: 2 }, 2),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// withEnvelope()
// ---------------------------------------------------------------------------

describe('withEnvelope()', () => {
  it('returns a success envelope when the wrapped fn resolves', async () => {
    const fn = async (x: number) => x * 2;
    const wrapped = withEnvelope(fn);
    const result = await wrapped(5);
    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.data).toBe(10);
    }
  });

  it('returns an error envelope when the wrapped fn throws LumenFlowError', async () => {
    const fn = async () => {
      throw new LumenFlowError(PaymentErrorCode.InvalidSignature);
    };
    const wrapped = withEnvelope(fn);
    const result = await wrapped();
    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.error.code).toBe(PaymentErrorCode.InvalidSignature);
    }
  });

  it('returns an error envelope when the wrapped fn throws a plain Error', async () => {
    const fn = async () => {
      throw new Error('network failure');
    };
    const wrapped = withEnvelope(fn);
    const result = await wrapped();
    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.error.message).toBe('network failure');
    }
  });

  it('forwards requestId into error envelopes', async () => {
    const fn = async () => {
      throw new LumenFlowError(PaymentErrorCode.PaymentExpired);
    };
    const wrapped = withEnvelope(fn, 'trace-xyz');
    const result = await wrapped();
    if (isError(result)) {
      expect(result.error.request_id).toBe('trace-xyz');
    }
  });
});
