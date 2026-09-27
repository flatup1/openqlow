import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EVENT_ID, isValidEventId, normalizeEventId } from '../core/eventId.ts';
import { eventLivePath, extractSheetId, validateNewEvent } from '../core/eventConfig.ts';

test('event ids are predictable and reject unsafe values', () => {
  assert.equal(normalizeEventId(' Narita-Kick-2027 '), 'narita-kick-2027');
  assert.equal(normalizeEventId('../other-event'), DEFAULT_EVENT_ID);
  assert.equal(normalizeEventId('a'), DEFAULT_EVENT_ID);
  assert.equal(isValidEventId('flatup-cup'), true);
  assert.equal(isValidEventId('日本語大会'), false);
});

test('sheet id accepts a Google URL or a bare id only', () => {
  const id = '1gnGEOha-M9a1G23aHMVmskcqSLHN-i5mcxGL9gUi_Uk';
  assert.equal(extractSheetId('https://docs.google.com/spreadsheets/d/' + id + '/edit?usp=sharing'), id);
  assert.equal(extractSheetId(id), id);
  assert.equal(extractSheetId('https://example.com/private'), '');
});

test('new event validation and links keep events separated', () => {
  const id = 'abcdefghijklmnopqrstuvwx';
  assert.deepEqual(validateNewEvent('narita-kick-2027', id), []);
  assert.equal(eventLivePath('narita-kick-2027'), '../live/?event=narita-kick-2027');
  assert.equal(validateNewEvent('bad id', 'short').length, 2);
});
