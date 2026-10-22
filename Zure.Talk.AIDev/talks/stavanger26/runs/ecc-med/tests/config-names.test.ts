import { afterEach, describe, expect, test } from 'vitest';
import { configFromEnv } from '../src/config.js';
import { generateName } from '../src/names.js';

const VARS = ['COUNTDOWN_MS', 'ZONE_INTERVAL_MS', 'RESULT_MS', 'RECONNECT_MS'];

describe('configFromEnv', () => {
  afterEach(() => { for (const v of VARS) delete process.env[v]; });

  test('uses the product defaults when unset', () => {
    expect(configFromEnv()).toEqual({ countdownMs: 5000, zoneIntervalMs: 15000, resultMs: 5000, reconnectMs: 10000 });
  });

  test('reads the referee speed-up variables', () => {
    Object.assign(process.env, { COUNTDOWN_MS: '100', ZONE_INTERVAL_MS: '200', RESULT_MS: '300', RECONNECT_MS: '400' });
    expect(configFromEnv()).toEqual({ countdownMs: 100, zoneIntervalMs: 200, resultMs: 300, reconnectMs: 400 });
  });

  test('falls back to defaults for invalid values', () => {
    Object.assign(process.env, { COUNTDOWN_MS: 'soon', RESULT_MS: '-5' });
    expect(configFromEnv()).toMatchObject({ countdownMs: 5000, resultMs: 5000 });
  });
});

describe('generateName', () => {
  test('gives an "Adjective Animal" name not already taken', () => {
    expect(generateName(new Set(), () => 0)).toBe('Brave Otter');
  });

  test('stays unique when every random pick collides', () => {
    const taken = new Set(['Brave Otter', 'Brave Otter 2']);
    expect(generateName(taken, () => 0)).toBe('Brave Otter 3');
  });
});
