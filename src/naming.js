/**
 * Browser-only port of the course's five-point naming rule.
 *
 * Coordinates are tropical longitudes in [0, 360). A coordinate may be a
 * finite Number or a manual { sign, degree, minute, second } DMS record.
 * DMS fields accept decimal/scientific strings or finite numbers; sign is the
 * zero-based zodiac index. All lookup, Fortune and boundary operations retain
 * exact BigInt rational values. Display precision never affects the lookup.
 */

const LETTER_ROWS = [
  ['א', 'Aleph', 1], ['ב', 'Beth', 2], ['ג', 'Gimel', 3],
  ['ד', 'Daleth', 4], ['ה', 'He', 5], ['ו', 'Waw', 6],
  ['ז', 'Zayin', 7], ['ח', 'Heth', 8], ['ט', 'Teth', 9],
  ['י', 'Yod', 10], ['כ', 'Kaph', 20], ['ל', 'Lamed', 30],
  ['מ', 'Mem', 40], ['נ', 'Nun', 50], ['ס', 'Samekh', 60],
  ['ע', 'Ayin', 70], ['פ', 'Pe', 80], ['צ', 'Sadhe', 90],
  ['ק', 'Qoph', 100], ['ר', 'Resh', 200], ['ש', 'Shin', 300],
  ['ת', 'Tav', 400],
];

const SIGNS = [
  '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
  '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座',
];

const POINT_LABELS = [
  ['sun', '太阳'], ['moon', '月亮'], ['ascendant', '上升点'],
  ['fortune', '福点'], ['syzygy', '出生前朔望点'],
];

function gcd(a, b) {
  a = a < 0n ? -a : a;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(n, d = 1n) {
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return { n: 0n, d: 1n };
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
}

function add(a, b) {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}

function subtract(a, b) {
  return rational(a.n * b.d - b.n * a.d, a.d * b.d);
}

function multiply(a, n, d = 1n) {
  return rational(a.n * n, a.d * d);
}

function moduloCircle(value) {
  const cycle = 360n * value.d;
  return rational(((value.n % cycle) + cycle) % cycle, value.d);
}

/** Parse bounded decimal text before allocating a power-of-ten denominator. */
function decimal(value, label, maximumDecimalPlaces = null) {
  if ((typeof value !== 'string' && typeof value !== 'number')
      || (typeof value === 'number' && !Number.isFinite(value))) {
    throw new TypeError(`${label}请填写有限的有效数字。`);
  }
  const text = String(value).trim();
  if (!text || text.length > 80) throw new TypeError(`${label}请填写有效数字。`);
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new TypeError(`${label}请填写有效数字。`);
  const fractional = match[3] ?? match[4] ?? '';
  const exponent = Number(match[5] ?? 0);
  const scale = fractional.length - exponent;
  // Number inputs need at most 324 negative decimal places. Manual second
  // strings are limited to 12 before BigInt exponentiation takes place.
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 400
      || Math.abs(scale) > 400) {
    throw new RangeError(`${label}的指数或精度超出允许范围。`);
  }
  if (maximumDecimalPlaces !== null && scale > maximumDecimalPlaces) {
    throw new RangeError(`${label}最多填写 ${maximumDecimalPlaces} 位小数。`);
  }
  const digits = `${match[2] ?? '0'}${fractional}`;
  let n = BigInt(digits);
  if (match[1] === '-') n = -n;
  return scale >= 0
    ? rational(n, 10n ** BigInt(scale))
    : rational(n * 10n ** BigInt(-scale));
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function coordinate(value, label) {
  let result;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`${label}必须是有限数值`);
    if (value < 0 || value >= 360) {
      throw new RangeError(`${label}必须在 0°（含）到 360°（不含）之间`);
    }
    result = decimal(value, label);
  } else if (isPlainRecord(value)) {
    const parts = [];
    for (const [part, limit] of [['sign', 12], ['degree', 30], ['minute', 60], ['second', 60]]) {
      if (!Object.hasOwn(value, part)) throw new TypeError(`${label}请填写完整的星座、度、分、秒。`);
      const number = decimal(value[part], `${label}的${part}`, part === 'second' ? 12 : null);
      if (number.n < 0n || number.n >= BigInt(limit) * number.d
          || (part !== 'second' && number.d !== 1n)) {
        throw new RangeError(`${label}的星座与度分必须为范围内整数；秒须小于60。`);
      }
      parts.push(number);
    }
    const [sign, degree, minute, second] = parts;
    result = add(add(multiply(sign, 30n), degree), add(multiply(minute, 1n, 60n), multiply(second, 1n, 3600n)));
  } else {
    throw new TypeError(`${label}必须是有限数值或完整的度分秒对象`);
  }
  return result;
}

/** Convert a nonnegative rational to binary64 with round-to-nearest, ties-even. */
function toNumber(value) {
  if (value.n === 0n) return 0;
  let exponent = value.n.toString(2).length - value.d.toString(2).length;
  if (exponent >= 0) {
    if (value.n < (value.d << BigInt(exponent))) exponent -= 1;
  } else if ((value.n << BigInt(-exponent)) < value.d) exponent -= 1;
  const scale = exponent < -1022 ? 1074 : 52 - exponent;
  const numerator = scale >= 0 ? value.n << BigInt(scale) : value.n;
  const denominator = scale >= 0 ? value.d : value.d << BigInt(-scale);
  let significand = numerator / denominator;
  const remainder = numerator % denominator;
  const twiceRemainder = 2n * remainder;
  if (twiceRemainder > denominator
      || (twiceRemainder === denominator && significand % 2n === 1n)) significand += 1n;
  return Number(significand) * (exponent < -1022 ? Number.MIN_VALUE : 2 ** (exponent - 52));
}

function letter(degreeIndex) {
  const [hebrew, latin, value] = LETTER_ROWS[degreeIndex % 22];
  return { hebrew, latin, reading: latin, value };
}

function formatted(longitude) {
  const degree = Number(longitude.n / longitude.d);
  const centiseconds = longitude.n * 360000n / longitude.d;
  const minute = Number((centiseconds / 6000n) % 60n);
  const secondCentis = Number(centiseconds % 6000n);
  let second = String(Math.floor(secondCentis / 100)).padStart(2, '0');
  const hundredths = secondCentis % 100;
  if (hundredths) second += `.${String(hundredths).padStart(2, '0').replace(/0+$/, '')}`;
  return `${SIGNS[Math.floor(degree / 30)]} ${degree % 30}°${String(minute).padStart(2, '0')}′${second}″`;
}

/**
 * Use the Moon's longitude at the latest new/full moon at or before birth for
 * syzygy. Keep the Hebrew string in logical order and display with dir="rtl".
 * The seven name.letters entries include fixed Aleph-Lamed (אל / el).
 */
export function calculateName(input) {
  if (!isPlainRecord(input)) throw new TypeError('请提供完整的五点计算资料。');
  const { sun, moon, ascendant, syzygy, sect } = input;
  if (sect !== 'day' && sect !== 'night') {
    throw new RangeError("sect 必须是 'day'（昼生）或 'night'（夜生）");
  }
  const coordinates = {
    sun: coordinate(sun, '太阳位置'),
    moon: coordinate(moon, '月亮位置'),
    ascendant: coordinate(ascendant, '上升位置'),
    syzygy: coordinate(syzygy, '出生前朔望位置'),
  };
  const fortune = sect === 'day'
    ? moduloCircle(subtract(add(coordinates.ascendant, coordinates.moon), coordinates.sun))
    : moduloCircle(subtract(add(coordinates.ascendant, coordinates.sun), coordinates.moon));
  coordinates.fortune = fortune;
  const order = sect === 'day'
    ? ['sun', 'moon', 'ascendant', 'fortune', 'syzygy']
    : ['moon', 'sun', 'ascendant', 'fortune', 'syzygy'];
  const formula = sect === 'day'
    ? '福点 =（上升＋月亮−太阳）mod 360°'
    : '福点 =（上升＋太阳−月亮）mod 360°';
  const points = POINT_LABELS.map(([key, label]) => {
    const longitude = coordinates[key];
    const degreeIndex = Number(longitude.n / longitude.d);
    return {
      key, label, longitude: toNumber(longitude), formatted: formatted(longitude),
      degree_index: degreeIndex, letter: letter(degreeIndex),
    };
  });
  const pointsByKey = Object.fromEntries(points.map(point => [point.key, point]));
  const rootLetters = order.map(key => ({ ...pointsByKey[key].letter }));
  const letters = [...rootLetters, letter(0), letter(11)];
  const letterNames = rootLetters.map(item => item.latin).join(' · ');
  const warnings = [
    '当前读音展示为字母名称的辅助拼读。课程资料未提供可唯一采用的完整 22 字母固定赋音表。',
  ];
  const nearBoundary = points.filter(point => {
    const { n, d } = coordinates[point.key];
    const remainder = n % d;
    const distanceNumerator = remainder < d - remainder ? remainder : d - remainder;
    return distanceNumerator * 3600n < d;
  }).map(point => point.label);
  if (nearBoundary.length) {
    warnings.push(`${nearBoundary.join('、')}距整度不足 1 角秒，输入精度或时间、坐标的细微变化可能改变取字；显示的度分秒不宜直接替代原始点位。`);
  }
  return {
    name: {
      hebrew: letters.map(item => item.hebrew).join(''),
      transliteration: `${letterNames} · el`,
      reading: `${letterNames} · el（字母名辅助拼读）`,
      letters,
    },
    points, order,
    fortune: { longitude: toNumber(fortune), formula },
    sect,
    method: '五生命点取字法',
    warnings,
  };
}
