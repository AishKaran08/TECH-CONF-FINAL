import { describe, expect, it } from 'vitest';
import { APP_NAME } from './constants';

describe('constants', () => {
  it('keeps the app name in one place', () => {
    expect(APP_NAME).toBe('Runway');
  });
});
