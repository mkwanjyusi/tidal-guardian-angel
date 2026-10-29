import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initPlacesData, searchPlaces, getTimezones } from '../src/places.js';

before(async () => initPlacesData(JSON.parse(await readFile(new URL('../public/data/places.json', import.meta.url)))));

test('34,006 city centres preserve Chinese, traditional, English and pinyin searches', async () => {
  for (const [query, name, zone] of [
    ['北京', '北京', 'Asia/Shanghai'], ['Beijing', '北京', 'Asia/Shanghai'],
    ['上海市', '上海', 'Asia/Shanghai'], ['成都', '成都', 'Asia/Shanghai'],
    ['chengdu', '成都', 'Asia/Shanghai'], ['重慶', '重庆', 'Asia/Shanghai'],
    ['苏州', '苏州', 'Asia/Shanghai'], ['香港', '香港', 'Asia/Hong_Kong'],
    ['臺北', '台北', 'Asia/Taipei'], ['伦敦', '伦敦', 'Europe/London'],
    ['New York', '纽约', 'America/New_York'], ['紐約', '纽约', 'America/New_York'],
    ["Xi'an", '西安', 'Asia/Shanghai'], ['中国 北京', '北京', 'Asia/Shanghai'],
    ['London UK', '伦敦', 'Europe/London'],
  ]) {
    const rows = await searchPlaces(query);
    assert.ok(rows.length > 0, query);
    assert.equal(rows[0].name, name, query);
    assert.equal(rows[0].timezone, zone, query);
    assert.match(rows[0].label, /城市中心/);
  }
});

test('same-name cities are labelled by state and have independent coordinates', async () => {
  const rows = (await searchPlaces('Springfield', 20)).filter((row) => row.name === 'Springfield' && row.country === '美国');
  assert.ok(rows.length > 1);
  assert.ok(new Set(rows.map((row) => row.admin)).size > 1);
  assert.equal(new Set(rows.map((row) => row.label)).size, rows.length);
});

test('common cities, fixed zones, result limits, and returned schema', async () => {
  const rows = await searchPlaces('');
  const zones = await getTimezones();
  assert.equal(zones.length, 597);
  assert.ok(zones.includes('UTC'));
  assert.equal(rows.length, 12);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['id', 'name', 'country', 'admin', 'latitude', 'longitude', 'timezone', 'label'].sort());
    assert.ok(zones.includes(row.timezone));
    assert.ok(Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180);
  }
  assert.ok((await searchPlaces('York', 2)).length <= 2);
  assert.deepEqual(await searchPlaces('thisdoesnotexistqzx'), []);
});

test('callers cannot mutate the city and zone caches', async () => {
  const rows = await searchPlaces('北京');
  rows[0].name = 'changed';
  const zones = await getTimezones();
  zones.length = 0;
  assert.equal((await searchPlaces('北京'))[0].name, '北京');
  assert.ok((await getTimezones()).includes('Asia/Shanghai'));
});

test('search rejects malformed input and invalid result counts', async () => {
  for (const [query, limit] of [[null, 12], ['x'.repeat(101), 12], ['北京', true], ['北京', 0], ['北京', 51]]) {
    await assert.rejects(searchPlaces(query, limit));
  }
});
