/** Offline city-centre lookup. All aliases are exported from the validated Python source. */
let database = null;
let loading = null;
let records = [];
let byId = new Map();
let exact = new Map();
const cache = new Map();

function fail(message) { const error = new Error(message); error.name = 'ValueError'; return error; }

function normalise(value) {
  return value.normalize('NFKD').toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function initPlacesData(data) {
  if (!data || data.format !== 1 || !Array.isArray(data.places)
      || !Array.isArray(data.timezones) || !Array.isArray(data.common)) {
    throw fail('城市数据格式不正确，请重新载入页面。');
  }
  const zones = new Set(data.timezones);
  const prepared = [];
  const index = new Map();
  const ids = new Map();
  for (const row of data.places) {
    if (!Array.isArray(row) || row.length !== 11) throw fail('城市数据记录不完整。');
    const [id, name, country, admin, latitude, longitude, timezone, label, primary, population, aliases] = row;
    if ([id, name, country, admin, timezone, label, primary].some((item) => typeof item !== 'string')
        || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !zones.has(timezone)
        || !Number.isFinite(population) || population < 0 || !Array.isArray(aliases)
        || aliases.some((alias) => typeof alias !== 'string') || ids.has(id)) {
      throw fail('城市数据含无效的坐标、时区或别名。');
    }
    const record = { data: { id, name, country, admin, latitude, longitude, timezone, label },
      primary, population, aliases };
    prepared.push(record);
    ids.set(id, record);
    for (const alias of aliases) {
      if (!index.has(alias)) index.set(alias, []);
      index.get(alias).push(record);
    }
  }
  records = prepared;
  byId = ids;
  exact = index;
  database = { version: data.version, common: data.common.slice(), timezones: data.timezones.slice() };
  cache.clear();
  return records.length;
}

export async function initPlaces(baseURL) {
  if (baseURL && typeof baseURL === 'object' && Array.isArray(baseURL.places)) {
    return initPlacesData(baseURL);
  }
  if (database) return records.length;
  if (!loading) {
    loading = (async () => {
      const location = `${String(baseURL).replace(/\/?$/, '/')}places.json`;
      const response = await fetch(location);
      if (!response.ok) throw fail('城市数据载入失败，请刷新页面重试。');
      return initPlacesData(await response.json());
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

function loaded() { if (!database) throw fail('城市数据尚未载入，请稍后重试。'); }

export async function getTimezones() { loaded(); return database.timezones.slice(); }

export async function searchPlaces(query, limit = 12) {
  loaded();
  if (typeof query !== 'string') throw fail('出生地点请输入城市名称。');
  if (query.length > 100) throw fail('城市名称过长，请缩短到 100 个字符以内。');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw fail('地点结果数量须为 1 至 50 的整数。');
  const value = normalise(query);
  const cacheKey = `${value}:${limit}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey).map((data) => ({ ...data }));
  let results;
  if (!value) results = database.common.map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
  else {
    const ranking = new Map((exact.get(value) || []).map((record) => [record, 0]));
    for (const record of records) {
      if (ranking.has(record)) continue;
      if (record.primary.startsWith(value)) ranking.set(record, 1);
      else if (record.aliases.some((alias) => alias.startsWith(value))) ranking.set(record, 2);
      else if (value.length >= 2 && record.primary.includes(value)) ranking.set(record, 3);
      else if (value.length >= 2 && record.aliases.some((alias) => alias.includes(value))) ranking.set(record, 4);
    }
    results = [...ranking.keys()].sort((left, right) => ranking.get(left) - ranking.get(right)
      || right.population - left.population || Number(left.data.id) - Number(right.data.id)).slice(0, limit);
  }
  const data = results.map((record) => ({ ...record.data }));
  if (cache.size >= 256) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, data);
  return data.map((item) => ({ ...item }));
}
