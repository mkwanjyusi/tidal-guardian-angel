import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initTimezones, resolveLocal, formatInZone, getTimezoneVersion } from '../src/timezone.js';

let data;
before(async () => {
  data = JSON.parse(await readFile(new URL('../public/data/timezones.json', import.meta.url)));
  await initTimezones(data);
});

// Expected values obtained independently from Python ZoneInfo.from_file reading
// the packaged tzdata 2026.6 TZif release, never the host operating-system tzdb.
const references = [
  ['1800-01-01', '00:00:00', 'Asia/Shanghai', '1800-01-01T00:00:00+08:05:43', '1799-12-31T15:54:17Z', 29143],
  ['1900-01-01', '12:00:00', 'America/New_York', '1900-01-01T12:00:00-05:00', '1900-01-01T17:00:00Z', -18000],
  ['1847-12-01', '12:00:00', 'Europe/London', '1847-12-01T12:00:00+00:00', '1847-12-01T12:00:00Z', 0],
  ['1937-06-30', '23:59:59', 'Europe/Amsterdam', '1937-06-30T23:59:59+01:00', '1937-06-30T22:59:59Z', 3600],
  ['1988-06-01', '12:00:00', 'Asia/Shanghai', '1988-06-01T12:00:00+09:00', '1988-06-01T03:00:00Z', 32400],
  ['1988-12-01', '12:00:00', 'Asia/Shanghai', '1988-12-01T12:00:00+08:00', '1988-12-01T04:00:00Z', 28800],
  ['2019-05-05', '12:00:00', 'Africa/Casablanca', '2019-05-05T12:00:00+00:00', '2019-05-05T12:00:00Z', 0],
  ['2019-06-09', '12:00:00', 'Africa/Casablanca', '2019-06-09T12:00:00+01:00', '2019-06-09T11:00:00Z', 3600],
  ['2099-07-01', '12:00:00', 'America/New_York', '2099-07-01T12:00:00-04:00', '2099-07-01T16:00:00Z', -14400],
  ['2099-12-01', '12:00:00', 'America/New_York', '2099-12-01T12:00:00-05:00', '2099-12-01T17:00:00Z', -18000],
  ['2099-01-01', '12:00:00', 'Australia/Sydney', '2099-01-01T12:00:00+11:00', '2099-01-01T01:00:00Z', 39600],
  ['2099-07-01', '12:00:00', 'Australia/Sydney', '2099-07-01T12:00:00+10:00', '2099-07-01T02:00:00Z', 36000],
  ['1800-01-01', '00:00:00', 'Pacific/Kiritimati', '1800-01-01T00:00:00-10:29:20', '1800-01-01T10:29:20Z', -37760],
  ['2100-12-31', '23:59:59', 'Pacific/Kiritimati', '2100-12-31T23:59:59+14:00', '2100-12-31T09:59:59Z', 50400],
];

test('fixed tzdata release handles historical seconds, China DST, Ramadan, and 2099 recurrence', () => {
  assert.equal(getTimezoneVersion(), '2026.6 (IANA 2026f)');
  for (const [date, time, zone, local, utc, offset] of references) {
    const result = resolveLocal(date, time, zone);
    assert.equal(result.localISO, local, `${zone} ${date}`);
    assert.equal(result.utcMillis, Date.parse(utc), `${zone} ${date}`);
    assert.equal(result.offsetSeconds, offset);
    assert.equal(formatInZone(result.utcMillis, zone), local);
  }
});

test('fall-back hour requires an explicit choice and returns both UTC candidates', () => {
  let error;
  try { resolveLocal('2020-11-01', '01:30', 'America/New_York'); } catch (caught) { error = caught; }
  assert.equal(error?.code, 'ambiguous_time');
  assert.equal(error.choices.length, 2);
  assert.deepEqual(error.choices.map((choice) => choice.utc_offset), ['-04:00', '-05:00']);
  assert.equal(resolveLocal('2020-11-01', '01:30', 'America/New_York', 0).utcISO, '2020-11-01T05:30:00.000Z');
  assert.equal(resolveLocal('2020-11-01', '01:30', 'America/New_York', 1).utcISO, '2020-11-01T06:30:00.000Z');
});

test('a half-hour rollback and a whole skipped calendar day are handled', () => {
  assert.throws(() => resolveLocal('2020-04-05', '01:45', 'Australia/Lord_Howe'), { code: 'ambiguous_time' });
  const first = resolveLocal('2020-04-05', '01:45', 'Australia/Lord_Howe', 0);
  const second = resolveLocal('2020-04-05', '01:45', 'Australia/Lord_Howe', 1);
  assert.equal(second.utcMillis - first.utcMillis, 30 * 60000);
  assert.throws(() => resolveLocal('2011-12-30', '12:00', 'Pacific/Apia'), { code: 'nonexistent_time' });
});

test('spring-forward nonexistent clock time is rejected at the exact boundary', () => {
  assert.throws(() => resolveLocal('2020-03-08', '02:30', 'America/New_York'), { code: 'nonexistent_time' });
  const before = resolveLocal('2020-03-08', '01:59:59.999', 'America/New_York');
  const after = resolveLocal('2020-03-08', '03:00:00', 'America/New_York');
  assert.equal(after.utcMillis - before.utcMillis, 1);
  assert.equal(before.utcOffset, '-05:00');
  assert.equal(after.utcOffset, '-04:00');
});

test('valid leap dates and fractional seconds retain millisecond precision', () => {
  const result = resolveLocal('2000-02-29', '12:34:56.123', 'UTC');
  assert.equal(result.localISO, '2000-02-29T12:34:56.123+00:00');
  assert.equal(result.utcISO, '2000-02-29T12:34:56.123Z');
  assert.equal(formatInZone(result.utcMillis, 'UTC'), result.localISO);
});

test('invalid dates, clock times, folds, zones and nonnumeric timestamps are rejected', () => {
  for (const [date, time] of [['1900-02-29', '12:00'], ['2100-02-29', '12:00'],
    ['2000-04-31', '12:00'], ['2000-01-01', '24:00'], ['2000-01-01', '12:60'],
    ['2000-01-01', '12:00:60'], ['2000-01-01', '12:00:00.1234'],
    ['1799-01-01', '12:00'], ['2101-01-01', '12:00'], ['2000-1-01', '12:00']]) {
    assert.throws(() => resolveLocal(date, time, 'Asia/Shanghai'), `${date} ${time}`);
  }
  assert.throws(() => resolveLocal('2000-01-01', '12:00', 'Not/AZone'), { code: 'invalid_timezone' });
  assert.throws(() => resolveLocal('2000-01-01', '12:00', 'UTC', true));
  assert.throws(() => formatInZone(NaN, 'UTC'));
  assert.throws(() => formatInZone(true, 'UTC'));
});

test('the exact transition instant belongs to the new offset for every exported transition', () => {
  // Every table is checked, including unusual historical transitions, rather than
  // relying only on a small selection of modern, one-hour daylight-saving rules.
  const namesByTable = new Map(Object.entries(data.zones).map(([zone, index]) => [index, zone]));
  let checked = 0;
  for (const [tableIndex, zone] of namesByTable) {
    const table = data.tables[tableIndex];
    for (let index = 1; index < table.length; index += 2) {
      const transition = table[index] * 1000;
      const previous = table[index - 1];
      const current = table[index + 1];
      const parseSuffix = (text) => {
        const match = /([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
        return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] || 0));
      };
      assert.equal(parseSuffix(formatInZone(transition - 1, zone)), previous, `${zone} before ${transition}`);
      assert.equal(parseSuffix(formatInZone(transition, zone)), current, `${zone} at ${transition}`);
      checked += 1;
    }
  }
  assert.ok(checked > 20000);
});
