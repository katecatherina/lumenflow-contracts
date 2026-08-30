/**
 * lumenflow-errors.test.js
 *
 * Unit tests for the frontend error taxonomy (lumenflow-errors.js).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Load the ES module by converting exports to a returned object.
// We wrap the module code in a function that gathers named exports into
// an object and returns it.
// ---------------------------------------------------------------------------

const srcPath = path.join(__dirname, 'lumenflow-errors.js');
let srcRaw    = fs.readFileSync(srcPath, 'utf8');

// Collect exported names so we can build the return object.
const exportedNames = [];
const exportRegex = /^export\s+(?:const|function|class)\s+(\w+)/gm;
let m;
while ((m = exportRegex.exec(srcRaw)) !== null) {
  exportedNames.push(m[1]);
}

// Strip the export keyword from declarations so they become locals.
let cjsBody = srcRaw.replace(/^export\s+(const|function|class)\s+/gm, '$1 ');

// Build return statement.
const returnStmt = `\nreturn { ${exportedNames.join(', ')} };\n`;

// Wrap in an IIFE and execute.
const fn = new Function('require', 'console', cjsBody + returnStmt); // eslint-disable-line no-new-func
const exported = fn(require, console);

const { ErrorCategory, ERROR_TAXONOMY, resolveApiError } = exported;

// ---------------------------------------------------------------------------
// ErrorCategory
// ---------------------------------------------------------------------------

describe('ErrorCategory', () => {
  const expectedKeys = [
    'AUTH', 'PERMISSION', 'VALIDATION', 'NOT_FOUND',
    'CONFLICT', 'BUSINESS_RULE', 'NETWORK', 'UNEXPECTED',
  ];

  it('exposes all expected category keys', () => {
    expectedKeys.forEach((key) => {
      expect(ErrorCategory).toHaveProperty(key);
    });
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ErrorCategory)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ERROR_TAXONOMY completeness
// ---------------------------------------------------------------------------

describe('ERROR_TAXONOMY', () => {
  it('contains entries for auth/admin codes (1–4)', () => {
    [1, 2, 3, 4].forEach((code) => expect(ERROR_TAXONOMY).toHaveProperty(String(code)));
  });

  it('contains entries for merchant codes (10–12)', () => {
    [10, 11, 12].forEach((code) => expect(ERROR_TAXONOMY).toHaveProperty(String(code)));
  });

  it('contains entries for payment codes (20–26)', () => {
    [20, 21, 22, 23, 24, 25, 26].forEach((code) => expect(ERROR_TAXONOMY).toHaveProperty(String(code)));
  });

  it('contains entries for refund codes (30–39)', () => {
    for (let c = 30; c <= 39; c++) expect(ERROR_TAXONOMY).toHaveProperty(String(c));
  });

  it('contains entries for multisig codes (40–44)', () => {
    [40, 41, 42, 43, 44].forEach((code) => expect(ERROR_TAXONOMY).toHaveProperty(String(code)));
  });

  it('contains entries for input/pagination codes (50–53)', () => {
    [50, 51, 52, 53].forEach((code) => expect(ERROR_TAXONOMY).toHaveProperty(String(code)));
  });

  it('contains entries for subscription codes (60–66)', () => {
    for (let c = 60; c <= 66; c++) expect(ERROR_TAXONOMY).toHaveProperty(String(c));
  });

  it('every entry has required fields with correct types', () => {
    Object.entries(ERROR_TAXONOMY).forEach(([, def]) => {
      expect(typeof def.category).toBe('string');
      expect(typeof def.title).toBe('string');
      expect(typeof def.message).toBe('string');
      expect(typeof def.httpStatus).toBe('number');
    });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ERROR_TAXONOMY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveApiError() — SDK LumenFlowError shape
// ---------------------------------------------------------------------------

describe('resolveApiError() with SDK error shape', () => {
  it('resolves code 22 → VALIDATION / Invalid Amount', () => {
    const result = resolveApiError({ code: 22, message: 'amount must be > 0' });
    expect(result.category).toBe(ErrorCategory.VALIDATION);
    expect(result.title).toBe('Invalid Amount');
    expect(result.rawMessage).toBe('amount must be > 0');
  });

  it('resolves code 10 → NOT_FOUND', () => {
    const result = resolveApiError({ code: 10, message: '' });
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
  });

  it('falls back to UNEXPECTED for an unknown code', () => {
    const result = resolveApiError({ code: 9999, message: 'dunno' });
    expect(result.category).toBe(ErrorCategory.UNEXPECTED);
    expect(result.rawMessage).toBe('dunno');
  });
});

// ---------------------------------------------------------------------------
// resolveApiError() — error envelope shape
// ---------------------------------------------------------------------------

describe('resolveApiError() with error envelope shape', () => {
  it('resolves via envelope.error.code', () => {
    const envelope = { ok: false, envelope_version: 1, error: { code: 10, message: 'not found', timestamp: '' } };
    const result = resolveApiError(envelope);
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
    expect(result.rawMessage).toBe('not found');
  });
});

// ---------------------------------------------------------------------------
// resolveApiError() — network errors
// ---------------------------------------------------------------------------

describe('resolveApiError() with network errors', () => {
  it('identifies a fetch error', () => {
    expect(resolveApiError(new Error('Failed to fetch')).category).toBe(ErrorCategory.NETWORK);
  });

  it('identifies a timeout error', () => {
    expect(resolveApiError(new Error('Request timeout')).category).toBe(ErrorCategory.NETWORK);
  });

  it('identifies an ECONNREFUSED error', () => {
    expect(resolveApiError(new Error('connect ECONNREFUSED 127.0.0.1:8000')).category).toBe(ErrorCategory.NETWORK);
  });
});

// ---------------------------------------------------------------------------
// resolveApiError() — non-Error values
// ---------------------------------------------------------------------------

describe('resolveApiError() with non-Error values', () => {
  it('falls through to UNEXPECTED for a generic Error', () => {
    const r = resolveApiError(new Error('generic'));
    expect(r.category).toBe(ErrorCategory.UNEXPECTED);
    expect(r.rawMessage).toBe('generic');
  });

  it('handles a string', () => {
    expect(resolveApiError('oops').category).toBe(ErrorCategory.UNEXPECTED);
  });

  it('handles null', () => {
    expect(resolveApiError(null).category).toBe(ErrorCategory.UNEXPECTED);
  });

  it('handles undefined', () => {
    expect(resolveApiError(undefined).category).toBe(ErrorCategory.UNEXPECTED);
  });
});

// ---------------------------------------------------------------------------
// Spot-check category assignments for representative codes
// ---------------------------------------------------------------------------

describe('resolveApiError() category spot-checks', () => {
  const cases = [
    [1,  'PERMISSION'],
    [11, 'CONFLICT'],
    [12, 'BUSINESS_RULE'],
    [21, 'CONFLICT'],
    [25, 'BUSINESS_RULE'],
    [32, 'BUSINESS_RULE'],
    [43, 'BUSINESS_RULE'],
    [50, 'VALIDATION'],
    [65, 'BUSINESS_RULE'],
  ];

  test.each(cases)('code %i → category %s', (code, catKey) => {
    const result = resolveApiError({ code, message: '' });
    expect(result.category).toBe(ErrorCategory[catKey]);
  });
});
