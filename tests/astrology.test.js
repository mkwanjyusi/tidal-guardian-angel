import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initAstrology, calculateBirth } from '../src/astrology.js';

const dataURL = new URL('../public/data/', import.meta.url);
const readLocal = async (url) => new Uint8Array(await readFile(url));
let timezoneData;

before(async () => {
  timezoneData = JSON.parse(await readFile(new URL('timezones.json', dataURL), 'utf8'));
  await initAstrology(dataURL, { loadFile: readLocal, timezoneData });
});

const sample = (changes = {}) => ({ date: '2000-01-01', time: '12:00', latitude: 51.4779, longitude: 0, timezone: 'UTC', ...changes });
const within = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} (tol=${tolerance})`);

// Immutable golden values produced on 2026-10-29 by the original project's
// pyswisseph 2.10.03 + the same .se1 files + pinned IANA tzdata 2026.6.
// Node tests read only these constants: Python is not needed when running them.
const GOLDEN = [
  { input: sample(), values: [280.36892285969753, 223.32380085303186, 24.26943083065749, 90.4153697107459, 15.486181429841569, 2451545.00000411, 2451535.2300740946], sect: 'day', event: '1999-12-22T17:31:18+00:00' },
  { input: sample({ date: '1988-07-15', latitude: 31.2304, longitude: 121.4737, timezone: 'Asia/Shanghai' }), values: [112.84746887753441, 126.47383203744926, 188.3333695910183, 111.68988694843847, 73.43722830901959, 2447357.6250012554, 2447356.4118280737], sect: 'day', event: '1988-07-13T21:53:01+00:00' },
  { input: sample({ date: '1988-01-15', latitude: 31.2304, longitude: 121.4737, timezone: 'Asia/Shanghai' }), values: [294.2104325010728, 238.8682162973419, 36.01813763705728, 102.90325509535855, 37.48877240785097, 2447175.666670668, 2447164.5696995994], sect: 'day', event: '1988-01-04T01:40:21+00:00' },
  { input: sample({ date: '2021-11-07', time: '01:30', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York', fold: 0 }), values: [225.02177540644195, 257.90876152906816, 152.43451800852873, 222.67015849521354, -63.308384930977404, 2459525.729165238, 2459523.3851453345], sect: 'night', event: '2021-11-04T21:14:36+00:00' },
  { input: sample({ date: '2021-11-07', time: '01:30', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York', fold: 1 }), values: [225.06360093489727, 258.53065724267105, 164.28601775379036, 222.67015849521354, -55.92983394814172, 2459525.7708319053, 2459523.3851453345], sect: 'night', event: '2021-11-04T21:14:36+00:00' },
  { input: sample({ date: '2000-06-21', latitude: 89 }), values: [90.40562653842296, 320.0541870438593, 179.9995346772658, 266.05030791646243, 24.437181768406983, 2451717.0000025737, 2451712.435449657], sect: 'day', event: '2000-06-16T22:27:02+00:00' },
  { input: sample({ date: '2000-12-21', latitude: 89 }), values: [269.9310793674308, 222.2089206654896, 359.9834675226451, 79.63108671038484, -22.43815781455178, 2451900.0000011497, 2451889.8769462015], sect: 'night', event: '2000-12-11T09:02:48+00:00' },
  { input: sample({ date: '1800-01-01', latitude: 0 }), values: [280.9391483527469, 354.7000742579347, 11.846867868527257, 274.9450145325102, 66.96310807015746, 2378497, 2378491.122070345], sect: 'day', event: '1799-12-26T14:55:46+00:00' },
  { input: sample({ date: '2100-12-31', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney' }), values: [279.3870442453142, 279.9755735936757, 356.42547649964206, 279.34328973668755, 73.38019362154506, 2488433.5416666665, 2488433.4987490373], sect: 'day', event: '2100-12-30T23:58:11+00:00' },
  { input: sample({ date: '2001-01-25', time: '00:00', latitude: 0 }), values: [305.0767831130395, 309.9658458238673, 216.6994728188234, 304.6153817753719, -70.76642510747882, 2451934.5000009, 2451934.0464100083], sect: 'night', event: '2001-01-24T13:06:49+00:00' },
  { input: sample({ date: '2001-01-10', time: '00:00', latitude: 0 }), values: [289.8047657667177, 111.92788436286178, 201.19230144232228, 109.6522493897512, -67.94920621961965, 2451919.500001008, 2451919.350281099], sect: 'night', event: '2001-01-09T20:24:24+00:00' },
  { input: sample({ date: '2024-04-09', time: '00:00', latitude: 0 }), values: [19.63193134328775, 22.927264768565003, 286.3490849676326, 19.40044042021908, -82.31011261508777, 2460409.5000012703, 2460409.2644867636], sect: 'night', event: '2024-04-08T18:20:51+00:00' },
  { input: sample({ date: '2024-03-26', time: '00:00', latitude: 0 }), values: [5.821808709824383, 193.52747900057855, 273.6082803608053, 185.12065407437763, -87.2905658321064, 2460395.5000012275, 2460394.7918951744], sect: 'night', event: '2024-03-25T07:00:19+00:00' },
];

for (const [index, golden] of GOLDEN.entries()) {
  test(`WASM vs native golden ${index + 1}: ${golden.input.date}, ${golden.input.time}, ${golden.input.timezone}`, async () => {
    const result = await calculateBirth(golden.input);
    const actual = [result.sun, result.moon, result.ascendant, result.syzygy, result.meta.sun_altitude, result.meta.julian_day_ut, result.meta.syzygy_julian_day_ut];
    actual.forEach((value, key) => within(value, golden.values[key], key < 5 ? 2e-7 : 5e-9, `field ${key}`));
    assert.equal(result.sect, golden.sect);
    within(Date.parse(result.meta.syzygy_utc), Date.parse(golden.event), 1000, 'phase UTC');
    for (const flags of Object.values(result.meta.ephemeris_flags)) assert.equal(flags & 7, 2, 'actual returned source must be Swiss');
    assert.match(result.meta.engine, /2\.10\.03.*Swiss 星历文件/);
  });
}

test('external NASA/GSFC new and full Moon times agree within published minute precision', async () => {
  // https://eclipse.gsfc.nasa.gov/phase/phase2001gmt.html
  for (const [date, reference, target] of [
    ['2001-01-25', '2001-01-24T13:07:00Z', 0],
    ['2001-01-10', '2001-01-09T20:24:00Z', 180],
    ['2024-04-09', '2024-04-08T18:21:00Z', 0],
    ['2024-03-26', '2024-03-25T07:00:00Z', 180],
    ['2025-02-13', '2025-02-12T13:53:00Z', 180],
  ]) {
    const result = await calculateBirth(sample({ date, time: '00:00', latitude: 0 }));
    within(Date.parse(result.meta.syzygy_utc), Date.parse(reference), 60000, reference);
    assert.equal(result.meta.syzygy_phase, target);
  }
});

test('full Moon point is Moon longitude, not the opposite Sun longitude', async () => {
  const result = await calculateBirth(sample({ date: '2001-01-10', time: '00:00', latitude: 0 }));
  assert.equal(result.syzygy, result.meta.syzygy_moon);
  within(((result.syzygy - result.meta.syzygy_sun) % 360 + 360) % 360, 180, 1e-7, 'full Moon opposition');
});

test('phase immediately before birth is selected, and a future phase is not', async () => {
  const earlier = await calculateBirth(sample({ date: '2024-04-08', time: '18:20:49', latitude: 0 }));
  const later = await calculateBirth(sample({ date: '2024-04-08', time: '18:20:54', latitude: 0 }));
  assert.equal(earlier.meta.syzygy_phase, 180);
  assert.equal(later.meta.syzygy_phase, 0);
  assert.ok(later.meta.syzygy_julian_day_ut < later.meta.julian_day_ut);
});

test('phase root remains on the correct side within ten milliseconds', async () => {
  const reference = await calculateBirth(GOLDEN[11].input);
  const eventMillis = Date.parse(reference.meta.birth_utc)
    - (reference.meta.julian_day_ut - reference.meta.syzygy_julian_day_ut) * 86400000;
  const at = async (milliseconds) => {
    const iso = new Date(milliseconds).toISOString();
    return calculateBirth(sample({ date: iso.slice(0, 10), time: iso.slice(11, 23), latitude: 0 }));
  };
  const beforeEvent = await at(eventMillis - 10);
  const afterEvent = await at(eventMillis + 10);
  assert.equal(beforeEvent.meta.syzygy_phase, 180);
  assert.equal(afterEvent.meta.syzygy_phase, 0);
});

test('historical Shanghai summer offset is +9 instead of a hardcoded +8', async () => {
  const summer = await calculateBirth(GOLDEN[1].input);
  const winter = await calculateBirth(GOLDEN[2].input);
  assert.equal(summer.meta.utc_offset, 'UTC+09:00');
  assert.equal(winter.meta.utc_offset, 'UTC+08:00');
  assert.equal(Date.parse(summer.meta.birth_utc), Date.parse('1988-07-15T03:00:00Z'));
});

test('DST gap and overlap are rejected or explicitly resolved', async () => {
  await assert.rejects(calculateBirth(sample({ date: '2021-03-14', time: '02:30', timezone: 'America/New_York' })), { code: 'nonexistent_time' });
  await assert.rejects(calculateBirth(sample({ date: '2021-11-07', time: '01:30', timezone: 'America/New_York' })), (error) => error.code === 'ambiguous_time' && error.choices.length === 2);
  const first = await calculateBirth(GOLDEN[3].input);
  const second = await calculateBirth(GOLDEN[4].input);
  assert.equal(Date.parse(second.meta.birth_utc) - Date.parse(first.meta.birth_utc), 3600000);
});

test('geometric day/night and polar warnings are retained', async () => {
  const summer = await calculateBirth(GOLDEN[5].input);
  const winter = await calculateBirth(GOLDEN[6].input);
  assert.equal(summer.sect, 'day'); assert.equal(winter.sect, 'night');
  assert.ok(summer.warnings.some((warning) => warning.includes('高纬度')));
  const horizon = await calculateBirth(sample({ time: '08:10' }));
  assert.ok(horizon.warnings.some((warning) => warning.includes('地平线')));
});

test('solar longitude retains both sides of the 360/0 degree boundary', async () => {
  const earlier = await calculateBirth(sample({ date: '2024-03-20', time: '03:00' }));
  const later = await calculateBirth(sample({ date: '2024-03-20', time: '03:15' }));
  assert.equal(Math.floor(earlier.sun), 359);
  assert.equal(Math.floor(later.sun), 0);
});

test('invalid numeric types, extreme values, dates, clock and zones are rejected', async () => {
  for (const changes of [
    { latitude: true }, { latitude: NaN }, { latitude: Infinity }, { latitude: 90 },
    { latitude: 10 ** 400 }, { longitude: '12' }, { longitude: 181 },
    { date: '1799-12-31' }, { date: '2101-01-01' }, { date: '2000-02-30' },
    { time: '25:00' }, { time: '12:00+08:00' }, { timezone: '../UTC' },
  ]) await assert.rejects(calculateBirth(sample(changes)), (error) => Boolean(error.code));
});

test('initialization loads only the four explicitly specified local files and is idempotent', async () => {
  const status = await initAstrology(dataURL, { loadFile: () => { throw new Error('must not reload'); }, timezoneData });
  assert.deepEqual(status.files, ['sepl_12.se1', 'semo_12.se1', 'sepl_18.se1', 'semo_18.se1']);
});

test('an incomplete file fails explicitly, and a failed init can be retried', async () => {
  const independent = await import('../src/astrology.js?incomplete-test');
  await assert.rejects(independent.initAstrology(dataURL, { loadFile: async () => new Uint8Array(4), timezoneData }), { code: 'ephemeris_unavailable' });
  await independent.initAstrology(dataURL, { loadFile: readLocal, timezoneData });
  const result = await independent.calculateBirth(sample());
  within(result.sun, GOLDEN[0].values[0], 2e-7, 'recovered initialization');
});

test('a valid file mounted under the wrong year-block name is rejected', async () => {
  const independent = await import('../src/astrology.js?wrong-block-test');
  // Supply valid 1800–2399 data under the 1200–1799 names. The 2000 probe
  // works; the 1799 probe must reject the mismatched file instead of claiming
  // that a successful download alone guarantees usable ephemeris data.
  const wrongBlock = (url, filename) => readLocal(filename.includes('_12')
    ? new URL(`ephe/${filename.replace('_12', '_18')}`, dataURL) : url);
  await assert.rejects(independent.initAstrology(dataURL, { loadFile: wrongBlock, timezoneData }), { code: 'ephemeris_error' });
});
