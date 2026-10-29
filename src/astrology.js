/** Swiss Ephemeris 2.10.03, entirely in the browser. No birth data is sent out. */
import { createSwissEph, Body, Flag, Calendar } from '@kuntay/swisseph';
import { resolveLocal, formatInZone, initTimezones, getTimezoneVersion } from './timezone.js';

const FILES = Object.freeze(['sepl_12.se1', 'semo_12.se1', 'sepl_18.se1', 'semo_18.se1']);
const FLAGS = Flag.SwissEphemeris | Flag.Speed;
const PHASE_TOLERANCE = 1e-8;
let initialization = null;
let engine = null;
let runtime = null;

export class CalculationError extends Error {
  constructor(message, code = 'invalid_input', choices = []) {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
    this.choices = choices;
  }
}

const normalize = (angle) => {
  const remainder = angle % 360;
  return remainder < 0 ? remainder + 360 : remainder;
};

function number(value, label, lower, upper, inclusive = true) {
  const inside = inclusive ? value >= lower && value <= upper : value > lower && value < upper;
  if (typeof value !== 'number' || !Number.isFinite(value) || !inside) {
    throw new CalculationError(`${label}必须是 ${lower} 至 ${upper} 之间的有效数字。`);
  }
  return value;
}

function dataBaseURL(baseURL) {
  const base = new URL(String(baseURL || './data/'), globalThis.document?.baseURI || import.meta.url);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  if (globalThis.location?.origin && base.origin !== globalThis.location.origin) {
    throw new CalculationError('星历文件必须从本站加载。', 'ephemeris_unavailable');
  }
  return base;
}

async function fetchFile(url) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
  if (!response.ok) throw new Error(`星历文件读取失败：${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function makeRuntime(swe) {
  const raw = swe.raw;
  // All C calls below are synchronous. One WASM instance is used serially on
  // the browser's JS thread; no global settings are changed per calculation.
  const scratch = raw._malloc(1024);
  if (!scratch) throw new Error('无法分配星历计算内存。');
  const position = scratch;
  const error = scratch + 64;
  const integers = scratch + 320;
  const seconds = scratch + 344;
  const julian = scratch + 352;
  const geo = scratch + 384;
  const horizontalInput = scratch + 416;
  const horizontalOutput = scratch + 448;
  const calc = raw.cwrap('swe_calc_ut', 'number', Array(5).fill('number'));
  const utcToJD = raw.cwrap('swe_utc_to_jd', 'number', Array(9).fill('number'));
  const jdToUTC = raw.cwrap('swe_jdut1_to_utc', null, Array(8).fill('number'));
  const azalt = raw.cwrap('swe_azalt', null, Array(7).fill('number'));
  const doubles = (pointer, count) => Array.from({ length: count }, (_, index) => raw.getValue(pointer + index * 8, 'double'));
  const write = (pointer, values) => values.forEach((value, index) => raw.setValue(pointer + index * 8, value, 'double'));

  return {
    dispose() { raw._free(scratch); },
    position(jd, body) {
      raw.setValue(error, 0, 'i8');
      const flags = calc(jd, body, FLAGS, position, error);
      if (flags < 0) {
        throw new CalculationError('星历计算失败，请重新加载本页的星历文件。', 'ephemeris_error');
      }
      // Swiss can silently fall back to Moshier: inspect the *returned* source
      // bits on every birth and every phase-search evaluation, not just init.
      if ((flags & 7) !== Flag.SwissEphemeris) {
        throw new CalculationError('所需的 Swiss 星历文件未正确加载，暂时无法全自动计算。请重新加载，或使用手动输入。', 'ephemeris_unavailable');
      }
      const values = doubles(position, 6);
      if (!values.every(Number.isFinite)) throw new CalculationError('星历返回了无效位置。', 'ephemeris_error');
      return { values, flags };
    },
    utcToJD(utcMillis) {
      const date = new Date(utcMillis);
      raw.setValue(error, 0, 'i8');
      const code = utcToJD(date.getUTCFullYear(), date.getUTCMonth() + 1,
        date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(),
        date.getUTCSeconds() + date.getUTCMilliseconds() / 1000,
        Calendar.Gregorian, julian, error);
      if (code < 0) throw new CalculationError('UTC 转换失败，请检查出生时间。', 'ephemeris_error');
      return raw.getValue(julian + 8, 'double'); // UT1; first double is TT
    },
    jdToUTCMillis(jd) {
      jdToUTC(jd, Calendar.Gregorian, integers, integers + 4, integers + 8,
        integers + 12, integers + 16, seconds);
      const fields = Array.from({ length: 5 }, (_, index) => raw.getValue(integers + index * 4, 'i32'));
      return Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4])
        + raw.getValue(seconds, 'double') * 1000;
    },
    altitude(jd, latitude, longitude, sun) {
      write(geo, [longitude, latitude, 0]);
      write(horizontalInput, sun.slice(0, 3));
      // SE_ECL2HOR=0; second output is true altitude. Refraction (third
      // output), temperature, pressure and the solar upper limb are unused.
      azalt(jd, 0, geo, 0, 15, horizontalInput, horizontalOutput);
      return raw.getValue(horizontalOutput + 8, 'double');
    },
  };
}

/**
 * baseURL points to this site's data/ directory (including a project subpath).
 * Optional loadFile(url, filename) and timezoneData enable file-based Node
 * verification without changing the browser's same-origin loading path.
 */
export async function initAstrology(baseURL, options = {}) {
  if (initialization) return initialization;
  const attempt = (async () => {
    let candidate;
    let candidateRuntime;
    try {
      const base = dataBaseURL(baseURL);
      const loader = options.loadFile || fetchFile;
      const [, loaded] = await Promise.all([
        initTimezones(options.timezoneData || base.href),
        Promise.all(FILES.map(async (filename) => {
          const content = await loader(new URL(`ephe/${filename}`, base), filename);
          const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
          if (bytes.byteLength < 1024) throw new Error(`星历文件不完整：${filename}`);
          return [filename, bytes];
        })),
      ]);
      candidate = await createSwissEph({ files: Object.fromEntries(loaded) });
      candidateRuntime = makeRuntime(candidate);
      // Cover both 600-year blocks, including a prenatal event in late 1799.
      for (const jd of [2451545, 2378491]) {
        candidateRuntime.position(jd, Body.Sun);
        candidateRuntime.position(jd, Body.Moon);
      }
      engine = candidate;
      runtime = candidateRuntime;
      return { engine: `Swiss Ephemeris ${engine.version} WebAssembly`, files: [...FILES], timezone_data: getTimezoneVersion() };
    } catch (error) {
      candidateRuntime?.dispose();
      candidate?.dispose();
      if (error instanceof CalculationError) throw error;
      throw new CalculationError('星历或时区文件尚未加载成功，请重新加载本页；手动输入仍可使用。', 'ephemeris_unavailable');
    }
  })();
  initialization = attempt;
  try { return await attempt; }
  catch (error) {
    if (initialization === attempt) initialization = null;
    throw error;
  }
}

function positions(jd) {
  return [runtime.position(jd, Body.Sun), runtime.position(jd, Body.Moon)];
}

function phase(jd) {
  const [sun, moon] = positions(jd);
  return normalize(moon.values[0] - sun.values[0]);
}

function residual(jd, target) {
  return normalize(phase(jd) - target + 180) - 180;
}

function previousSyzygy(jd) {
  const angle = phase(jd);
  const nearest = Math.round(angle / 180) * 180;
  if (Math.abs(angle - nearest) <= PHASE_TOLERANCE) return [jd, normalize(nearest)];
  const target = Math.floor(angle / 180) * 180;
  let high = jd;
  let low = high;
  let bracketed = false;
  for (let index = 0; index < 44; index++) {
    low -= 0.5;
    if (residual(low, target) <= 0) { bracketed = true; break; }
  }
  if (!bracketed) throw new CalculationError('未能定位出生前朔望，请检查输入或重新加载星历。', 'ephemeris_error');
  for (let index = 0; index < 64; index++) {
    const middle = (low + high) / 2;
    if (middle === low || middle === high) break;
    if (residual(middle, target) < 0) low = middle;
    else high = middle;
  }
  return [Math.min((low + high) / 2, jd), normalize(target)];
}

const utcISO = (milliseconds) => new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', '+00:00');

export async function calculateBirth(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CalculationError('请填写出生资料。');
  const latitude = number(payload.latitude, '纬度', -90, 90, false);
  const longitude = number(payload.longitude, '经度', -180, 180);
  if (!initialization) throw new CalculationError('星历尚未就绪，请先等待文件加载完成。', 'ephemeris_unavailable');
  await initialization;
  // resolveLocal performs strict date/time/zone and DST overlap/gap validation.
  const local = resolveLocal(payload.date, payload.time, payload.timezone, payload.fold ?? null);
  const warnings = [];
  try {
    const jd = runtime.utcToJD(local.utcMillis);
    const [sun, moon] = positions(jd);
    const houses = engine.houses(jd, latitude, longitude, 'E');
    const ascendant = normalize(houses.ascendant);
    const altitude = runtime.altitude(jd, latitude, longitude, sun.values);
    const [eventJD, target] = previousSyzygy(jd);
    const [eventSun, eventMoon] = positions(eventJD);
    const eventMillis = runtime.jdToUTCMillis(eventJD);
    if (!Number.isFinite(altitude) || !Number.isFinite(ascendant)) throw new Error('invalid axis');
    if (Math.abs(altitude) < 1) warnings.push('太阳接近地平线，出生时间的小幅变化可能改变昼夜判定与名号顺序。');
    if (Math.abs(latitude) >= 66) warnings.push('出生地位于高纬度地区，请特别核对准确时间和坐标；此处使用几何上升点。');
    if (Number(payload.date.slice(0, 4)) < 1900) warnings.push('1900 年以前的民用时间记录可能采用地方平时；请核对所选时区与史料。');
    return {
      sun: normalize(sun.values[0]), moon: normalize(moon.values[0]), ascendant,
      syzygy: normalize(eventMoon.values[0]), sect: altitude >= 0 ? 'day' : 'night',
      meta: {
        birth_local: local.localISO, birth_utc: local.utcISO,
        timezone: payload.timezone, timezone_data: `tzdata ${getTimezoneVersion()}`,
        utc_offset: `UTC${local.utcOffset.replace(/^-/, '−')}`, fold: local.fold,
        latitude, longitude, sun_altitude: altitude,
        sect_rule: '太阳中心的几何高度 ≥ 0° 为昼生；不计大气折射与太阳半径。',
        syzygy_type: target === 0 ? '新月（朔）' : '满月（望）', syzygy_phase: target,
        syzygy_local: formatInZone(Math.floor(eventMillis / 1000) * 1000, payload.timezone),
        syzygy_utc: utcISO(eventMillis),
        syzygy_sun: normalize(eventSun.values[0]), syzygy_moon: normalize(eventMoon.values[0]),
        engine: `Swiss Ephemeris ${engine.version} WebAssembly（Swiss 星历文件）`,
        ephemeris_flags: { sun: sun.flags, moon: moon.flags, syzygy_sun: eventSun.flags, syzygy_moon: eventMoon.flags },
        zodiac: '回归黄道，地心视位置', julian_day_ut: jd, syzygy_julian_day_ut: eventJD,
      },
      warnings,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw new CalculationError('星历计算失败，请核对出生资料或重新加载星历文件。', 'ephemeris_error');
  }
}
