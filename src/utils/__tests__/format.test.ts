import { describe, it, expect } from 'vitest';
import { fmt, fmtClipboard } from '../format';

describe('fmt', () => {
  it('formats amounts with comma as decimal separator and two fraction digits', () => {
    const formatted = fmt(1234.56);
    expect(formatted).toContain(',');
    expect(formatted).not.toContain('.');
    expect(formatted.replace(/\s|\u00A0|\u202F/g, '')).toBe('1234,56');
  });

  it('formats whole numbers with ,00', () => {
    const formatted = fmt(500);
    expect(formatted).toContain(',00');
    expect(formatted.replace(/\s|\u00A0|\u202F/g, '')).toBe('500,00');
  });

  it('formats zero correctly', () => {
    expect(fmt(0)).toBe('0,00');
  });

  it('rounds numbers to two decimal places', () => {
    expect(fmt(10.556)).toBe('10,56');
    expect(fmt(10.554)).toBe('10,55');
  });
});

describe('fmtClipboard', () => {
  it('formats amounts with comma as decimal separator and strictly without spaces', () => {
    expect(fmtClipboard(1234.56)).toBe('1234,56');
    expect(fmtClipboard(1234567.89)).toBe('1234567,89');
    expect(fmtClipboard(0)).toBe('0,00');
    expect(fmtClipboard(500)).toBe('500,00');
    expect(fmtClipboard(10.556)).toBe('10,56');
    expect(fmtClipboard(1234567.89)).not.toMatch(/\s|\u00A0|\u202F/);
  });
});
