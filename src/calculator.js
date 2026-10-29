import { calculateName } from './naming.js';
import { calculateBirth, initAstrology } from './astrology.js';
import { initTimezones } from './timezone.js';

export async function calculate(payload, dataBase) {
  if (payload.mode === 'manual') {
    const result = calculateName({ ...payload.positions, sect: payload.sect });
    return { ...result, mode: 'manual', place: '', meta: { zodiac: '回归黄道', engine: '手动输入点位（浏览器计算）' } };
  }
  if (payload.mode !== 'auto') throw new Error('请选择出生资料或手动点位模式。');
  await Promise.all([initAstrology(dataBase), initTimezones(dataBase)]);
  const chart = await calculateBirth(payload);
  const result = calculateName(chart);
  return { ...result, mode: 'auto', place: payload.place || '', meta: chart.meta, warnings: [...result.warnings, ...chart.warnings] };
}
