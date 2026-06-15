import { describe, expect, it } from 'vitest';
import { isSafeRelativeReportPath } from '@vibecheck/shared';
import {
  accessibilitySeverity,
  consoleSeverity,
  failedRequestSeverity,
  httpSeverity,
  isHttpError,
  normaliseConsoleLevel,
} from './classify.js';
import { VIEWPORTS } from './scanner.js';

describe('console classification', () => {
  it('classifies a console error', () => {
    const level = normaliseConsoleLevel('error');
    expect(level).toBe('error');
    expect(consoleSeverity(level)).toBe('error');
  });

  it('classifies a console warning', () => {
    const level = normaliseConsoleLevel('warning');
    expect(level).toBe('warning');
    expect(consoleSeverity(level)).toBe('warning');
  });

  it('treats unknown console types as log/info', () => {
    expect(normaliseConsoleLevel('trace')).toBe('log');
    expect(consoleSeverity('log')).toBe('info');
  });
});

describe('failed request classification', () => {
  it('marks failed requests as error severity', () => {
    expect(failedRequestSeverity()).toBe('error');
  });
});

describe('HTTP error classification', () => {
  it('detects 4xx and 5xx as HTTP errors', () => {
    expect(isHttpError(404)).toBe(true);
    expect(isHttpError(500)).toBe(true);
    expect(isHttpError(200)).toBe(false);
    expect(isHttpError(302)).toBe(false);
  });

  it('escalates 5xx to critical and 4xx to error', () => {
    expect(httpSeverity(404)).toBe('error');
    expect(httpSeverity(503)).toBe('critical');
  });
});

describe('accessibility classification', () => {
  it('maps axe impact to severity', () => {
    expect(accessibilitySeverity('critical')).toBe('critical');
    expect(accessibilitySeverity('serious')).toBe('error');
    expect(accessibilitySeverity('moderate')).toBe('warning');
    expect(accessibilitySeverity('minor')).toBe('info');
    expect(accessibilitySeverity(null)).toBe('info');
  });
});

describe('screenshot file naming', () => {
  it('produces filesystem-safe, relative screenshot paths for every viewport', () => {
    for (const viewport of VIEWPORTS) {
      const fileName = `${viewport.name}.png`;
      expect(fileName).toMatch(/^[a-z]+\.png$/);
      expect(isSafeRelativeReportPath(fileName)).toBe(true);
    }
  });

  it('rejects absolute or escaping screenshot paths', () => {
    expect(isSafeRelativeReportPath('C:/temp/x.png')).toBe(false);
    expect(isSafeRelativeReportPath('/etc/x.png')).toBe(false);
    expect(isSafeRelativeReportPath('../x.png')).toBe(false);
  });
});
