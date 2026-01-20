import { describe, it, expect } from 'vitest';
import { validatePasswordComplexity } from './password';

describe('validatePasswordComplexity', () => {
  it('accepts complex passwords', () => {
    expect(validatePasswordComplexity('Abcdef1!')).toBe(true);
    expect(validatePasswordComplexity('XyZ12345@')).toBe(true);
  });
  it('rejects too short', () => {
    expect(validatePasswordComplexity('Ab1!')).toBe(false);
  });
  it('rejects missing uppercase', () => {
    expect(validatePasswordComplexity('abcdef1!')).toBe(false);
  });
  it('rejects missing lowercase', () => {
    expect(validatePasswordComplexity('ABCDEF1!')).toBe(false);
  });
  it('rejects missing digit', () => {
    expect(validatePasswordComplexity('Abcdefg!')).toBe(false);
  });
  it('rejects missing special', () => {
    expect(validatePasswordComplexity('Abcdef12')).toBe(false);
  });
});
