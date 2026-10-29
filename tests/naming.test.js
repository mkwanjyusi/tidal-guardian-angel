import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateName } from '../src/naming.js';

const base = { sun: 10.2, moon: 20.4, ascendant: 30.7, syzygy: 50.8, sect: 'day' };
const dms = (sign, degree, minute = 0, second = 0) => ({ sign, degree, minute, second });
const lesson = {
  sun: dms(9, 9, 57), moon: dms(2, 0, 54), ascendant: dms(5, 24, 35),
  syzygy: dms(8, 28, 12), sect: 'night',
};

test('course example: exact DMS, Hebrew logical order, suffix and every record', () => {
  const result = calculateName(lesson);
  assert.equal(result.name.hebrew, 'פעשלהאל');
  assert.equal(result.name.transliteration, 'Pe · Ayin · Shin · Lamed · He · el');
  assert.equal(result.name.reading, 'Pe · Ayin · Shin · Lamed · He · el（字母名辅助拼读）');
  assert.deepEqual(result.order, ['moon', 'sun', 'ascendant', 'fortune', 'syzygy']);
  assert.deepEqual(result.points.map(p => p.key), ['sun', 'moon', 'ascendant', 'fortune', 'syzygy']);
  assert.deepEqual(result.points.map(p => p.degree_index), [279, 60, 174, 33, 268]);
  assert.deepEqual(result.points.map(p => p.letter.value), [70, 80, 300, 30, 5]);
  assert.equal(result.points[3].formatted, '金牛座 3°38′00″');
  assert.equal(result.fortune.longitude, 33 + 38 / 60);
  assert.equal(result.fortune.formula, '福点 =（上升＋太阳−月亮）mod 360°');
  assert.deepEqual(result.name.letters.map(p => p.latin), ['Pe', 'Ayin', 'Shin', 'Lamed', 'He', 'Aleph', 'Lamed']);
  assert.equal(result.method, '五生命点取字法');
  assert.equal(result.sect, 'night');
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('day changes both Fortune formula and the first two root letters', () => {
  const result = calculateName({ ...lesson, sect: 'day' });
  assert.deepEqual(result.order, ['sun', 'moon', 'ascendant', 'fortune', 'syzygy']);
  assert.equal(result.points[3].formatted, '水瓶座 15°32′00″');
  assert.equal(result.points[3].degree_index, 315);
  assert.equal(result.fortune.formula, '福点 =（上升＋月亮−太阳）mod 360°');
});

test('full 22-letter cycle agrees with the original course table', () => {
  const expected = [...'אבגדהוזחטיכלמנסעפצקרשת'];
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400];
  for (let index = 0; index < 360; index += 1) {
    const point = calculateName({ ...base, sun: index }).points[0];
    assert.equal(point.degree_index, index);
    assert.equal(point.letter.hebrew, expected[index % 22]);
    assert.equal(point.letter.value, values[index % 22]);
  }
});

test('all five repeated root letters and both suffix letters remain present', () => {
  const result = calculateName({ sun: 0, moon: 0, ascendant: 0, syzygy: 0, sect: 'day' });
  assert.equal(result.name.hebrew, 'אאאאאאל');
  assert.equal(result.name.letters.length, 7);
});

test('DMS strings retain exact fractions at an integer Fortune boundary', () => {
  const result = calculateName({
    sun: dms('0', '0', '0', '0.1'),
    moon: dms('0', '0', '0', '0.3'),
    ascendant: dms('0', '0', '59', '59.8'),
    syzygy: dms('1', '20', '0', '0'), sect: 'day',
  });
  assert.equal(result.fortune.longitude, 1);
  assert.equal(result.points[3].degree_index, 1);
  assert.equal(result.points[3].formatted, '白羊座 1°00′00″');
});

test('decimal Number arithmetic is performed exactly instead of through binary addition', () => {
  const result = calculateName({ ...base, sun: 0.1, moon: 0.3, ascendant: 0.8 });
  assert.equal(result.fortune.longitude, 1);
  assert.equal(result.points[3].degree_index, 1);
});

test('integer lookup uses half-open intervals, without epsilon or rounding', () => {
  for (const [sun, degree] of [
    [0, 0], [0.9999999999999999, 0], [1, 1], [29.999999999999996, 29],
    [30, 30], [30.000000000000004, 30], [359.99999999999994, 359],
    [dms(0, 0, 59, '59.999999999999'), 0],
  ]) {
    assert.equal(calculateName({ ...base, sun }).points[0].degree_index, degree);
  }
});

test('DMS seconds support scientific notation up to twelve decimal places', () => {
  const decimal = calculateName({ ...base, sun: dms(0, 0, 0, '0.000000000001') });
  const scientific = calculateName({ ...base, sun: dms('0e0', '0.0', '+0', '1e-12') });
  assert.deepEqual(scientific, decimal);
  const upper = calculateName({ ...base, sun: dms(11, 29, 59, '59.999999999999') });
  assert.equal(upper.points[0].degree_index, 359);
  assert.equal(upper.points[0].formatted, '双鱼座 29°59′59.99″');
});

test('a negative Fortune wraps to the last interval of the circle', () => {
  const result = calculateName({ ...base, sun: 10.1, moon: 0.09999999999999999, ascendant: 10 });
  // The numeric output rounds to 360, as Python float(Fraction) also does;
  // the exact lookup and formatted value correctly remain in degree 359.
  assert.equal(result.points[3].degree_index, 359);
  assert.equal(result.points[3].formatted, '双鱼座 29°59′59.99″');
  assert.equal(result.fortune.longitude, 360);
});

test('formatting truncates 0.01 arcseconds and never carries into the next degree', () => {
  assert.equal(calculateName({ ...base, sun: 29.99999999 }).points[0].formatted, '白羊座 29°59′59.99″');
  assert.equal(calculateName({ ...base, sun: dms(0, 0, 1) }).points[0].formatted, '白羊座 0°01′00″');
  assert.equal(calculateName({ ...base, sun: dms(0, 0, 0, '1.2') }).points[0].formatted, '白羊座 0°00′01.2″');
});

test('Fortune boundary warning catches the display-DMS reentry change', () => {
  const original = calculateName({ sun: 10.1234503, moon: 20.234569, ascendant: 30.8888815, syzygy: 50.4321, sect: 'day' });
  const reentered = calculateName({
    sun: dms(0, 10, 7, '24.42'), moon: dms(0, 20, 14, '4.44'),
    ascendant: dms(1, 0, 53, '19.97'), syzygy: dms(1, 20, 25, '55.56'), sect: 'day',
  });
  assert.equal(original.points[3].degree_index, 41);
  assert.equal(reentered.points[3].degree_index, 40);
  assert.notEqual(original.name.hebrew, reentered.name.hebrew);
  assert.ok(original.warnings.some(message => message.startsWith('福点距整度不足 1 角秒')));
});

test('boundary warnings include exact degrees but exclude exactly one arcsecond', () => {
  const exact = calculateName({ ...base, sun: 10 });
  const oneSecond = calculateName({ ...base, sun: dms(0, 10, 0, '1') });
  const underSecond = calculateName({ ...base, sun: dms(0, 10, 0, '.999999999999') });
  assert.ok(exact.warnings.some(message => message.startsWith('太阳距整度不足 1 角秒')));
  assert.ok(!oneSecond.warnings.some(message => message.includes('距整度不足')));
  assert.ok(underSecond.warnings.some(message => message.startsWith('太阳距整度不足 1 角秒')));
});

test('tiny finite numbers survive exact conversion back to Number', () => {
  const result = calculateName({ ...base, sun: Number.MIN_VALUE });
  assert.equal(result.points[0].longitude, Number.MIN_VALUE);
  assert.equal(result.points[0].degree_index, 0);
});

test('invalid Number coordinates are rejected for every point', () => {
  for (const key of ['sun', 'moon', 'ascendant', 'syzygy']) {
    for (const value of [true, false, '30', null, undefined, NaN, Infinity, -Infinity, -1, 360, 1e100, 1n, [], new Date()]) {
      assert.throws(() => calculateName({ ...base, [key]: value }), { name: /TypeError|RangeError/ });
    }
  }
});

test('incomplete, out-of-range and fractional integer DMS fields are rejected', () => {
  for (const value of [
    {}, { sign: 0, degree: 0, minute: 0 }, dms(-1, 0), dms(12, 0), dms(0, 30),
    dms(0, -1), dms(0, 0, 60), dms(0, 0, 0, 60), dms(0, 0, 0, -0.1),
    dms(0.5, 0), dms(0, '0.1'), dms(0, 0, '0.1'), dms(true, 0), dms(0, 0, 0, false),
    dms(0, 0, 0, NaN), dms(0, 0, 0, Infinity), dms(0, 0, 0, 'NaN'),
    dms(0, 0, 0, 'Infinity'), dms(0, 0, 0, ''), dms(0, 0, 0, ' '),
    dms(0, 0, 0, '1/2'), dms(0, 0, 0, '0x10'), dms(0, 0, 0, '1_0'),
  ]) assert.throws(() => calculateName({ ...base, sun: value }));
});

test('excessive DMS precision and exponent attacks are rejected before allocation', () => {
  for (const second of ['1e-13', '0.0000000000001', '0.0000000000000', '1e-1000000000', '1e1000000000', '1e9999999999999999999999999', '0'.repeat(81)]) {
    assert.throws(() => calculateName({ ...base, sun: dms(0, 0, 0, second) }));
  }
});

test('sect and the top-level input require the documented types', () => {
  for (const sect of [null, undefined, true, '', 'DAY', '昼', [], {}]) {
    assert.throws(() => calculateName({ ...base, sect }));
  }
  for (const input of [null, undefined, [], 0, '']) assert.throws(() => calculateName(input));
});

test('returned records do not share mutable letter metadata', () => {
  const result = calculateName(base);
  result.name.letters[0].hebrew = 'X';
  result.points[0].letter.value = -1;
  const next = calculateName(base);
  assert.equal(next.points[0].letter.value, 20);
  assert.equal(next.name.letters[0].hebrew, 'כ');
  assert.notEqual(result.points[0].letter.hebrew, 'X');
});

// Golden values independently generated once from 06/naming.py. No Python or
// external files are needed when this browser module's tests run.
test('numeric golden cases match the original Python implementation', () => {
  const cases = [
    { input: { sun: 279.95, moon: 60.9, ascendant: 174.58333333333334, syzygy: 268.2, sect: 'night' }, indexes: [279, 60, 174, 33, 268], hebrew: 'פעשלהאל', fortune: 33.63333333333334 },
    { input: { sun: 279.95, moon: 60.9, ascendant: 174.58333333333334, syzygy: 268.2, sect: 'day' }, indexes: [279, 60, 174, 315, 268], hebrew: 'עפשחהאל', fortune: 315.53333333333336 },
    { input: { sun: 10.1234503, moon: 20.234569, ascendant: 30.8888815, syzygy: 50.4321, sect: 'day' }, indexes: [10, 20, 30, 41, 50], hebrew: 'כשטרזאל', fortune: 41.0000002 },
  ];
  for (const { input, indexes, hebrew, fortune } of cases) {
    const result = calculateName(input);
    assert.deepEqual(result.points.map(point => point.degree_index), indexes);
    assert.equal(result.name.hebrew, hebrew);
    assert.equal(result.fortune.longitude, fortune);
  }
});
