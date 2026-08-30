import {
  validateContractFields,
  validateProcessPayment,
  validateBatchPayment,
  validateRegisterMerchant,
  validateInitiateRefund,
  validatePagination,
  isValidAddress,
  isValidOrderId,
  isPositiveAmount,
} from './validation';
import { LumenFlowError, PaymentErrorCode } from './errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ADDRESS = 'GAF4FQF7WLE5BCU6O462YC52UR7734WGQOYZ6GSNH34BQGELQF7UTJ2Z';
const SIG = Buffer.alloc(64, 0xaa);
const PUBKEY = Buffer.alloc(32, 0xbb);

function expectInvalid(fn: () => void) {
  expect(fn).toThrow(LumenFlowError);
  try {
    fn();
  } catch (e) {
    expect((e as LumenFlowError).code).toBe(PaymentErrorCode.InvalidInput);
  }
}

// ---------------------------------------------------------------------------
// validateContractFields (backward-compat)
// ---------------------------------------------------------------------------

describe('validateContractFields', () => {
  it('accepts valid orderId and addresses', () => {
    expect(() =>
      validateContractFields({
        orderId: 'ORDER_123',
        tokenAddress: VALID_ADDRESS,
        payerAddress: VALID_ADDRESS,
        merchantAddress: VALID_ADDRESS,
      }),
    ).not.toThrow();
  });

  it('throws for empty orderId', () => expectInvalid(() => validateContractFields({ orderId: '' })));
  it('throws for whitespace orderId', () =>
    expectInvalid(() => validateContractFields({ orderId: '   ' })));
  it('throws for invalid tokenAddress', () =>
    expectInvalid(() => validateContractFields({ tokenAddress: 'INVALID' })));
  it('throws for invalid payerAddress', () =>
    expectInvalid(() => validateContractFields({ payerAddress: '123' })));
  it('throws for invalid merchantAddress', () =>
    expectInvalid(() => validateContractFields({ merchantAddress: 'XYZ' })));
});

// ---------------------------------------------------------------------------
// validateProcessPayment
// ---------------------------------------------------------------------------

describe('validateProcessPayment', () => {
  const base = {
    orderId: 'ORDER_001',
    merchantAddress: VALID_ADDRESS,
    tokenAddress: VALID_ADDRESS,
    payerAddress: VALID_ADDRESS,
    amount: 1000,
    signature: SIG,
    merchantPublicKey: PUBKEY,
  };

  it('accepts a fully valid payment request', () => {
    expect(() => validateProcessPayment(base)).not.toThrow();
  });

  it('accepts optional memo and tags', () => {
    expect(() =>
      validateProcessPayment({ ...base, memo: 'Invoice #1', tags: ['promo', 'vip'] }),
    ).not.toThrow();
  });

  it('throws for missing orderId', () =>
    expectInvalid(() => validateProcessPayment({ ...base, orderId: '' })));

  it('throws for invalid merchantAddress', () =>
    expectInvalid(() => validateProcessPayment({ ...base, merchantAddress: 'bad' })));

  it('throws for zero amount', () =>
    expectInvalid(() => validateProcessPayment({ ...base, amount: 0 })));

  it('throws for negative amount', () =>
    expectInvalid(() => validateProcessPayment({ ...base, amount: -1 })));

  it('throws for wrong-length signature', () =>
    expectInvalid(() =>
      validateProcessPayment({ ...base, signature: Buffer.alloc(32) }),
    ));

  it('throws for wrong-length merchantPublicKey', () =>
    expectInvalid(() =>
      validateProcessPayment({ ...base, merchantPublicKey: Buffer.alloc(64) }),
    ));

  it('throws for memo exceeding max length', () =>
    expectInvalid(() =>
      validateProcessPayment({ ...base, memo: 'x'.repeat(257) }),
    ));

  it('throws for too many tags', () =>
    expectInvalid(() =>
      validateProcessPayment({ ...base, tags: Array(11).fill('tag') }),
    ));

  it('collects multiple field errors in one throw', () => {
    expect(() =>
      validateProcessPayment({
        orderId: '',
        merchantAddress: 'bad',
        tokenAddress: 'bad',
        payerAddress: 'bad',
        amount: 0,
        signature: Buffer.alloc(1),
        merchantPublicKey: Buffer.alloc(1),
      }),
    ).toThrow(LumenFlowError);
  });
});

// ---------------------------------------------------------------------------
// validateBatchPayment
// ---------------------------------------------------------------------------

describe('validateBatchPayment', () => {
  const item = {
    orderId: 'ORDER_B01',
    merchantAddress: VALID_ADDRESS,
    tokenAddress: VALID_ADDRESS,
    amount: 500,
    signature: SIG,
    merchantPublicKey: PUBKEY,
  };

  it('accepts a valid batch of items', () => {
    expect(() => validateBatchPayment([item, { ...item, orderId: 'ORDER_B02' }])).not.toThrow();
  });

  it('throws when given a non-array', () =>
    expectInvalid(() => validateBatchPayment('not-an-array')));

  it('throws for an empty batch', () =>
    expectInvalid(() => validateBatchPayment([])));

  it('throws when batch exceeds 10 items', () =>
    expectInvalid(() => validateBatchPayment(Array(11).fill(item))));

  it('throws for an invalid item in the batch', () =>
    expectInvalid(() => validateBatchPayment([{ ...item, amount: 0 }])));

  it('includes item index in the error message', () => {
    try {
      validateBatchPayment([item, { ...item, orderId: '' }]);
    } catch (e) {
      expect((e as LumenFlowError).details).toContain('item[1]');
    }
  });
});

// ---------------------------------------------------------------------------
// validateRegisterMerchant
// ---------------------------------------------------------------------------

describe('validateRegisterMerchant', () => {
  const base = {
    merchantAddress: VALID_ADDRESS,
    name: 'My Store',
    description: 'Sells stuff',
    contactInfo: 'store@example.com',
    category: 'Retail',
  };

  it('accepts a valid merchant registration', () => {
    expect(() => validateRegisterMerchant(base)).not.toThrow();
  });

  it('throws for invalid address', () =>
    expectInvalid(() => validateRegisterMerchant({ ...base, merchantAddress: 'bad' })));

  it('throws for empty name', () =>
    expectInvalid(() => validateRegisterMerchant({ ...base, name: '' })));

  it('throws for invalid category', () =>
    expectInvalid(() => validateRegisterMerchant({ ...base, category: 'Gaming' })));

  it('accepts all valid categories', () => {
    ['Retail', 'Food', 'Services', 'Digital', 'Other'].forEach((cat) => {
      expect(() => validateRegisterMerchant({ ...base, category: cat })).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// validateInitiateRefund
// ---------------------------------------------------------------------------

describe('validateInitiateRefund', () => {
  const base = {
    refundId: 'REFUND_001',
    orderId: 'ORDER_001',
    callerAddress: VALID_ADDRESS,
    amount: 500,
    reason: 'Customer request',
  };

  it('accepts a valid refund request', () => {
    expect(() => validateInitiateRefund(base)).not.toThrow();
  });

  it('throws for missing refundId', () =>
    expectInvalid(() => validateInitiateRefund({ ...base, refundId: '' })));

  it('throws for invalid callerAddress', () =>
    expectInvalid(() => validateInitiateRefund({ ...base, callerAddress: 'bad' })));

  it('throws for zero amount', () =>
    expectInvalid(() => validateInitiateRefund({ ...base, amount: 0 })));

  it('throws for missing reason', () =>
    expectInvalid(() => validateInitiateRefund({ ...base, reason: '' })));
});

// ---------------------------------------------------------------------------
// validatePagination
// ---------------------------------------------------------------------------

describe('validatePagination', () => {
  it('accepts valid limit', () => {
    expect(() => validatePagination({ limit: 10 })).not.toThrow();
  });

  it('accepts limit at max boundary', () => {
    expect(() => validatePagination({ limit: 100 })).not.toThrow();
  });

  it('accepts a cursor', () => {
    expect(() => validatePagination({ limit: 10, cursor: 'ORDER_001' })).not.toThrow();
  });

  it('accepts null cursor (no pagination)', () => {
    expect(() => validatePagination({ limit: 10, cursor: null })).not.toThrow();
  });

  it('throws for limit of 0', () =>
    expectInvalid(() => validatePagination({ limit: 0 })));

  it('throws for limit exceeding max', () =>
    expectInvalid(() => validatePagination({ limit: 101 })));

  it('throws for non-integer limit', () =>
    expectInvalid(() => validatePagination({ limit: 10.5 })));

  it('throws for empty string cursor', () =>
    expectInvalid(() => validatePagination({ limit: 10, cursor: '' })));
});

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

describe('helper functions', () => {
  describe('isValidOrderId', () => {
    it('returns true for a valid order ID', () => expect(isValidOrderId('ORDER_1')).toBe(true));
    it('returns false for empty string', () => expect(isValidOrderId('')).toBe(false));
    it('returns false for whitespace', () => expect(isValidOrderId('   ')).toBe(false));
    it('returns false for null', () => expect(isValidOrderId(null)).toBe(false));
    it('returns false when exceeding max length', () =>
      expect(isValidOrderId('x'.repeat(65))).toBe(false));
  });

  describe('isValidAddress', () => {
    it('returns true for a valid Stellar address', () =>
      expect(isValidAddress(VALID_ADDRESS)).toBe(true));
    it('returns false for a short string', () => expect(isValidAddress('C12345')).toBe(false));
    it('returns false for empty string', () => expect(isValidAddress('')).toBe(false));
    it('returns false for undefined', () => expect(isValidAddress(undefined)).toBe(false));
  });

  describe('isPositiveAmount', () => {
    it('returns true for positive bigint', () => expect(isPositiveAmount(100n)).toBe(true));
    it('returns true for positive integer', () => expect(isPositiveAmount(1)).toBe(true));
    it('returns false for zero', () => expect(isPositiveAmount(0)).toBe(false));
    it('returns false for zero bigint', () => expect(isPositiveAmount(0n)).toBe(false));
    it('returns false for negative', () => expect(isPositiveAmount(-1)).toBe(false));
    it('returns false for a float', () => expect(isPositiveAmount(1.5)).toBe(false));
  });
});
