import test from 'node:test';
import assert from 'node:assert/strict';
import { dateDigits, formatDateInput, isCompleteDate } from '../core/dateInput.ts';

test('dates accept full-width digits and existing Japanese or ISO dates', () => {
  for (const value of ['２０２７１００３', '20271003', '2027年10月3日', '2027-10-03']) {
    assert.equal(dateDigits(value), '20271003');
    assert.equal(formatDateInput(value), '2027年10月3日');
  }
  assert.equal(dateDigits('abc２０２７x１００３'), '20271003');
});

test('missing and impossible dates stay invalid; leap years are checked', () => {
  for (const value of ['2027年10月日', '20270229', '20271301', '20270431', '00000101']) assert.equal(isCompleteDate(value), false);
  assert.equal(formatDateInput('２０２８０２２９'), '2028年2月29日');
});
