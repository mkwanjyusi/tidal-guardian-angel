/** Fixed tzdata transitions; no dependence on the browser's operating-system zone. */
let database = null;
let loading = null;
let zoneTables = new Map();

function fail(message, code = 'invalid_input', details = {}) {
  const error = new Error(message);
  error.name = 'ValueError';
  error.code = code;
  Object.assign(error, details);
  return error;
}

function loaded() {
  if (!database) throw fail('时区数据尚未载入，请稍后重试。', 'not_initialized');
  return database;
}

export function initTimezonesData(data) {
  if (!data || data.format !== 1 || typeof data.version !== 'string'
      || typeof data.iana !== 'string' || !Number.isSafeInteger(data.start)
      || !Number.isSafeInteger(data.end) || data.end <= data.start
      || !data.zones || typeof data.zones !== 'object' || !Array.isArray(data.tables)) {
    throw fail('时区数据格式不正确，请重新载入页面。', 'invalid_data');
  }
  const tables = data.tables.map((table) => {
    if (!Array.isArray(table) || !table.length || table.length % 2 !== 1) {
      throw fail('时区转换表不完整。', 'invalid_data');
    }
    let previous = data.start;
    for (let index = 0; index < table.length; index += 1) {
      const value = table[index];
      if (!Number.isSafeInteger(value)) throw fail('时区转换表包含无效数值。', 'invalid_data');
      if (index % 2 === 0 && Math.abs(value) > 86400) {
        throw fail('时区偏移超出范围。', 'invalid_data');
      }
      if (index % 2 === 1) {
        if (value <= previous || value >= data.end) {
          throw fail('时区转换时刻顺序不正确。', 'invalid_data');
        }
        previous = value;
      }
    }
    return { raw: table.slice(), offsets: [...new Set(table.filter((_, index) => index % 2 === 0))] };
  });
  const zones = new Map();
  for (const [name, index] of Object.entries(data.zones)) {
    if (!Number.isInteger(index) || index < 0 || index >= tables.length) {
      throw fail('时区索引无效。', 'invalid_data');
    }
    zones.set(name, tables[index]);
  }
  database = { version: data.version, iana: data.iana, start: data.start, end: data.end };
  zoneTables = zones;
  return getTimezoneVersion();
}

export async function initTimezones(baseURL) {
  if (baseURL && typeof baseURL === 'object' && Array.isArray(baseURL.tables)) {
    return initTimezonesData(baseURL);
  }
  if (database) return getTimezoneVersion();
  if (!loading) {
    loading = (async () => {
      const location = `${String(baseURL).replace(/\/?$/, '/')}timezones.json`;
      const response = await fetch(location);
      if (!response.ok) throw fail('时区数据载入失败，请刷新页面重试。', 'load_error');
      return initTimezonesData(await response.json());
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

export function getTimezoneVersion() {
  const data = loaded();
  return `${data.version} (IANA ${data.iana})`;
}

function tableFor(timezone) {
  loaded();
  if (typeof timezone !== 'string' || !zoneTables.has(timezone)) {
    throw fail('请选择有效的 IANA 时区，例如 Asia/Shanghai。', 'invalid_timezone');
  }
  return zoneTables.get(timezone);
}

function offsetAt(utcMillis, table) {
  const data = loaded();
  const seconds = utcMillis / 1000;
  if (!Number.isFinite(seconds) || seconds < data.start || seconds >= data.end) {
    throw fail('此时刻超出本地时区数据库的覆盖范围。', 'out_of_range');
  }
  const raw = table.raw;
  let low = 0;
  let high = (raw.length - 1) / 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (raw[middle * 2 - 1] <= seconds) low = middle;
    else high = middle - 1;
  }
  return raw[low * 2];
}

function pad(value, length = 2) { return String(value).padStart(length, '0'); }

function offsetString(seconds) {
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const remainder = absolute % 60;
  return `${seconds < 0 ? '-' : '+'}${pad(hours)}:${pad(minutes)}${remainder ? `:${pad(remainder)}` : ''}`;
}

function wallISO(milliseconds) {
  const date = new Date(milliseconds);
  const fraction = date.getUTCMilliseconds();
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    + (fraction ? `.${pad(fraction, 3)}` : '');
}

export function formatInZone(utcMillis, timezone) {
  if (typeof utcMillis !== 'number' || !Number.isFinite(utcMillis)) {
    throw fail('待转换的 UTC 时刻无效。');
  }
  const offset = offsetAt(utcMillis, tableFor(timezone));
  return wallISO(utcMillis + offset * 1000) + offsetString(offset);
}

function parseWall(date, time) {
  if (typeof date !== 'string' || typeof time !== 'string') {
    throw fail('请填写公历出生日期和当地钟表时间。');
  }
  const matchDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const matchTime = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(time);
  if (!matchDate || !matchTime) throw fail('日期用 YYYY-MM-DD，时间用 HH:mm 或 HH:mm:ss。');
  const year = Number(matchDate[1]);
  const month = Number(matchDate[2]);
  const day = Number(matchDate[3]);
  const hour = Number(matchTime[1]);
  const minute = Number(matchTime[2]);
  const second = Number(matchTime[3] || 0);
  const millisecond = Number((matchTime[4] || '').padEnd(3, '0'));
  if (year < 1800 || year > 2100) throw fail('出生年份支持 1800 至 2100 年。', 'out_of_range');
  if (month < 1 || month > 12 || day < 1 || day > 31
      || hour > 23 || minute > 59 || second > 59) throw fail('出生日期或时间不正确，请检查后重试。');
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const actual = new Date(wall);
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1
      || actual.getUTCDate() !== day) throw fail('这个公历日期不存在，请检查月份和日期。');
  return wall;
}

export function resolveLocal(date, time, timezone, fold = null) {
  const table = tableFor(timezone);
  if (fold !== null && fold !== undefined && fold !== 0 && fold !== 1) {
    throw fail('重复时刻请选择第一次或第二次。');
  }
  const wall = parseWall(date, time);
  const candidates = table.offsets.map((offset) => ({ utcMillis: wall - offset * 1000, offset }))
    .filter(({ utcMillis, offset }) => offsetAt(utcMillis, table) === offset)
    .sort((left, right) => left.utcMillis - right.utcMillis);
  if (!candidates.length) {
    throw fail('这个当地时间因夏令时或时区跳变而不存在，请核对出生记录。', 'nonexistent_time');
  }
  const choices = candidates.map((candidate, index) => ({
    fold: index,
    label: `${index === 0 ? '第一次' : '第二次'}（UTC${offsetString(candidate.offset)}）`,
    utc_offset: offsetString(candidate.offset),
    utc: new Date(candidate.utcMillis).toISOString(),
  }));
  if (candidates.length > 1 && (fold === null || fold === undefined)) {
    throw fail('这个当地时间出现过两次，请选择出生记录对应的第一次或第二次。',
      'ambiguous_time', { choices });
  }
  const selectedFold = candidates.length > 1 ? fold : 0;
  const selected = candidates[selectedFold];
  return {
    localISO: wallISO(wall) + offsetString(selected.offset),
    utcISO: new Date(selected.utcMillis).toISOString(),
    utcMillis: selected.utcMillis,
    offsetSeconds: selected.offset,
    utcOffset: offsetString(selected.offset),
    fold: selectedFold,
    timezone,
  };
}
