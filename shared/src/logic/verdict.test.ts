import { describe, expect, it } from 'vitest';
import { verdictToWords } from './verdict';

describe('verdictToWords', () => {
  it('maps codes to plain words', () => {
    expect(verdictToWords('OK')).toBe('Accepted');
    expect(verdictToWords('TIME_LIMIT_EXCEEDED')).toBe('Time limit exceeded');
    expect(verdictToWords(undefined)).toBe('In queue');
  });
  it('adds the failing test number', () => {
    expect(verdictToWords('WRONG_ANSWER', 2)).toBe('Wrong answer on test 3');
    expect(verdictToWords('COMPILATION_ERROR', 0)).toBe('Compilation error');
  });
  it('humanizes unknown codes', () => {
    expect(verdictToWords('SOMETHING_NEW')).toBe('Something new');
  });
});
