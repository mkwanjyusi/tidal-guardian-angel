'use strict';

import { initPlaces, searchPlaces as searchCityRecords, getTimezones } from './places.js';
import { initTimezones } from './timezone.js';
import { calculate as calculateChart } from './calculator.js';

const dataBase = new URL('./data/', document.baseURI).href;

const $ = id => document.getElementById(id);
const signs = ['白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座','摩羯座','水瓶座','双鱼座'];
const pointNames = {sun:'太阳',moon:'月亮',ascendant:'上升',fortune:'福点',syzygy:'朔望'};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode = 'auto', currentResult = null, dirty = false, busy = false, exporting = false;
let places = [], placeIndex = -1, selectedPlace = null, placeTimer, searchVersion = 0, toastTimer;
let placesReady = false;

function syncResultActions() {
  for (const id of ['save-image','print-result','copy-result']) {
    $(id).disabled = !currentResult || dirty || busy || (id === 'save-image' && exporting);
  }
}

for (const key of ['sun','moon','ascendant','syzygy']) {
  const row = document.createElement('div');
  row.className = 'point-row';
  row.innerHTML = `<span class="point-label">${pointNames[key]}</span><select id="${key}-sign" aria-label="${pointNames[key]}星座">${signs.map((sign, i) => `<option value="${i}">${sign}</option>`).join('')}</select><label class="dms-field"><input id="${key}-degree" aria-label="${pointNames[key]}度" type="number" min="0" max="29" step="1" inputmode="numeric" required placeholder="0"><span class="unit-label" aria-hidden="true">度</span></label><label class="dms-field"><input id="${key}-minute" aria-label="${pointNames[key]}分" type="number" min="0" max="59" step="1" inputmode="numeric" value="0" required><span class="unit-label" aria-hidden="true">分</span></label><label class="dms-field"><input id="${key}-second" aria-label="${pointNames[key]}秒" type="number" min="0" max="59.999999999999" step="any" inputmode="decimal" value="0" required><span class="unit-label" aria-hidden="true">秒</span></label>`;
  $('point-inputs').append(row);
}

function clearError() {
  $('form-error').hidden = true;
  document.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
}
function showError(message, field) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    const details = field.closest('details');
    if (details) details.open = true;
    field.focus();
  } else $('form-error').focus();
}
function markDirty() {
  if (currentResult && currentResult.mode === mode) {
    dirty = true;
    $('stale-notice').hidden = false;
    syncResultActions();
  }
}
function setMode(value, focus = false) {
  if (busy) return;
  mode = value;
  for (const type of ['auto','manual']) {
    const active = type === mode;
    $(`tab-${type}`).classList.toggle('active', active);
    $(`tab-${type}`).setAttribute('aria-selected', String(active));
    $(`tab-${type}`).tabIndex = active ? 0 : -1;
    $(`${type}-form`).hidden = !active;
  }
  clearError();
  closePlaces();
  if (focus) $(`tab-${mode}`).focus();
}
for (const type of ['auto','manual']) {
  $(`tab-${type}`).addEventListener('click', () => setMode(type));
  $(`tab-${type}`).addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      setMode(event.key === 'Home' ? 'auto' : event.key === 'End' ? 'manual' : mode === 'auto' ? 'manual' : 'auto', true);
    }
  });
  $(`${type}-form`).addEventListener('input', () => { clearError(); markDirty(); });
  $(`${type}-form`).addEventListener('change', () => { clearError(); markDirty(); });
}

function closePlaces() {
  $('place-list').hidden = true;
  $('place-search').setAttribute('aria-expanded','false');
  $('place-search').removeAttribute('aria-activedescendant');
  placeIndex = -1;
}
function highlightPlace(index) {
  if (!places.length) return;
  placeIndex = (index + places.length) % places.length;
  document.querySelectorAll('.place-option').forEach((el, i) => el.setAttribute('aria-selected', String(i === placeIndex)));
  const target = $(`place-option-${placeIndex}`);
  $('place-search').setAttribute('aria-activedescendant', target.id);
  target.scrollIntoView({block:'nearest'});
}
function selectPlace(index) {
  const place = places[index];
  if (!place) return;
  selectedPlace = place;
  $('place-search').value = place.label;
  $('latitude').value = place.latitude;
  $('longitude').value = place.longitude;
  $('timezone').value = place.timezone;
  $('place-hint').textContent = `已选择 ${place.name}；使用城市中心坐标，可在下方调整。`;
  $('time-fold').value = '';
  $('fold-panel').hidden = true;
  closePlaces(); clearError(); markDirty();
}
async function searchPlaces(query) {
  const version = ++searchVersion;
  try {
    if (!placesReady) $('place-hint').textContent = '正在载入城市资料，首次打开可能需要片刻…';
    await initPlaces(dataBase);
    placesReady = true;
    const data = { places: await searchCityRecords(query) };
    if (version !== searchVersion || document.activeElement !== $('place-search')) return;
    places = data.places;
    $('place-hint').textContent = '请选择匹配的城市；未收录的地点可在下方填写坐标与时区。';
    placeIndex = -1;
    $('place-list').innerHTML = places.length ? places.map((place,i) => `<li id="place-option-${i}" class="place-option" role="option" aria-selected="false" data-index="${i}"><strong>${escapeHTML(place.name)}</strong><span>${escapeHTML(place.label)} · ${escapeHTML(place.timezone)}</span></li>`).join('') : '<li class="place-empty" role="presentation">没有找到这个地点。可尝试附近城市，或在下方填写经纬度与时区。</li>';
    $('place-list').hidden = false;
    $('place-search').setAttribute('aria-expanded','true');
    $('place-search').removeAttribute('aria-activedescendant');
  } catch {
    if (version === searchVersion) $('place-hint').textContent = '城市数据未能加载，请刷新重试，或在下方填写经纬度与时区。';
  }
}
$('place-search').addEventListener('input', () => {
  selectedPlace = null;
  $('latitude').value = ''; $('longitude').value = ''; $('timezone').value = '';
  $('place-hint').textContent = '请选择搜索结果；未收录的地点可在下方填写坐标与时区。';
  $('fold-panel').hidden = true; $('time-fold').value = '';
  searchVersion++;
  closePlaces();
  clearTimeout(placeTimer);
  const query = $('place-search').value;
  placeTimer = setTimeout(() => searchPlaces(query), 180);
});
$('place-search').addEventListener('focus', () => { if (!selectedPlace) searchPlaces($('place-search').value); });
$('place-list').addEventListener('mousedown', event => event.preventDefault());
$('place-list').addEventListener('click', event => {
  const option = event.target.closest('[data-index]');
  if (option) selectPlace(Number(option.dataset.index));
});
$('place-search').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if ($('place-list').hidden) searchPlaces($('place-search').value);
    else highlightPlace(placeIndex + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter' && !$('place-list').hidden) {
    event.preventDefault();
    if (placeIndex >= 0) selectPlace(placeIndex);
  } else if (event.key === 'Escape') closePlaces();
});
document.addEventListener('click', event => { if (!event.target.closest('.place-field')) closePlaces(); });
$('place-search').addEventListener('blur', () => setTimeout(closePlaces, 100));
for (const id of ['birth-date','birth-time','timezone']) $(id).addEventListener('input', () => {
  $('time-fold').value = ''; $('fold-panel').hidden = true;
});

function fillPoint(key, sign, degree, minute, second = 0) {
  for (const [part,value] of Object.entries({sign,degree,minute,second})) $(`${key}-${part}`).value = value;
}
$('manual-example').addEventListener('click', () => {
  fillPoint('sun',9,9,57); fillPoint('moon',2,0,54); fillPoint('ascendant',5,24,35); fillPoint('syzygy',8,28,12);
  document.querySelector('input[name="sect"][value="night"]').checked = true;
  clearError(); markDirty();
  toast('已填入课堂示例，点击“计算名号”查看结果。');
});
$('auto-example').addEventListener('click', async () => {
  $('birth-date').value = '2000-01-01'; $('birth-time').value = '12:00:00';
  $('place-search').value = '北京';
  try {
    await initPlaces(dataBase);
    const data = { places: await searchCityRecords('北京') };
    places = data.places;
    if (!places.length) throw new Error();
    selectPlace(0);
    toast('已填入北京示例资料，点击“计算名号”查看结果。');
  } catch { showError('示例地点未能载入，请刷新网页后重试。'); }
});

function fieldError(message, field) { showError(message, field); return null; }
function readAuto() {
  if (!$('birth-date').value || !$('birth-date').checkValidity()) return fieldError('请填写有效公历日期，范围为 1800—2100 年。', $('birth-date'));
  if (!$('birth-time').value || !$('birth-time').checkValidity()) return fieldError('请填写准确的出生时间。', $('birth-time'));
  for (const [id,label] of [['latitude','纬度'],['longitude','经度']]) {
    if ($(id).value === '' || !$(id).checkValidity() || !Number.isFinite(Number($(id).value))) return fieldError(`请搜索并选择出生地点，或手动填写有效${label}。`, $(id));
  }
  if (!$('timezone').value.trim()) return fieldError('请选择出生地时区，例如 Asia/Shanghai。', $('timezone'));
  if (!$('fold-panel').hidden && $('time-fold').value === '') return fieldError('请确认重复时刻的第一次或第二次。', $('time-fold'));
  const coordChanged = selectedPlace && (Number($('latitude').value) !== selectedPlace.latitude || Number($('longitude').value) !== selectedPlace.longitude);
  return {mode:'auto',date:$('birth-date').value,time:$('birth-time').value,latitude:Number($('latitude').value),longitude:Number($('longitude').value),timezone:$('timezone').value.trim(),fold:$('time-fold').value === '' ? null : Number($('time-fold').value),place:($('place-search').value.trim() || '手动坐标') + (coordChanged ? '（已调整坐标）' : '')};
}
function readManual() {
  const positions = {};
  for (const key of ['sun','moon','ascendant','syzygy']) {
    positions[key] = {};
    for (const part of ['sign','degree','minute','second']) {
      const input = $(`${key}-${part}`);
      if (input.value === '' || !input.checkValidity() || !Number.isFinite(Number(input.value))) return fieldError(`请检查${pointNames[key]}的星座、度、分、秒：度须小于30，分秒须小于60。`, input);
      positions[key][part] = input.value;
    }
  }
  return {mode:'manual',positions,sect:document.querySelector('input[name="sect"]:checked').value};
}
function setBusy(value) {
  busy = value;
  syncResultActions();
  $('auto-submit').disabled = value; $('manual-submit').disabled = value;
  $('auto-submit').querySelector('span').textContent = value ? '正在计算…' : '计算名号';
  $('manual-submit').querySelector('span').textContent = value ? '正在计算…' : '计算名号';
  $('busy-status').textContent = value ? '正在核对星盘点位与取字顺序…' : '';
  document.querySelector('.result-panel').setAttribute('aria-busy',String(value));
}
async function calculate(event) {
  event.preventDefault(); if (busy) return;
  clearError(); closePlaces();
  const payload = mode === 'auto' ? readAuto() : readManual();
  if (!payload) return;
  const inputSnapshot = JSON.stringify(payload);
  setBusy(true);
  try {
    const data = await calculateChart(payload, dataBase);
    currentResult = data;
    renderResult(data);
    // Data may have changed while a request was in flight.
    const latest = mode === 'auto' ? readAuto() : readManual();
    if (!latest || JSON.stringify(latest) !== inputSnapshot) markDirty();
    if (window.innerWidth <= 800) document.querySelector('.result-panel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
  } catch (error) {
    if (error.code === 'ambiguous_time') {
      $('fold-panel').hidden = false;
      $('time-fold').innerHTML = '<option value="">请选择对应的那一次</option>' + error.choices.map(choice => `<option value="${choice.fold}">${escapeHTML(choice.label)}</option>`).join('');
      $('fold-hint').textContent = '这两个时刻具有不同的 UTC 时间。请根据出生记录确认，再重新计算。';
      showError(error.message, $('time-fold'));
    } else showError(error.message || '计算未能完成，请检查输入或刷新网页重试。');
  }
  finally { setBusy(false); }
}
$('auto-form').addEventListener('submit', calculate);
$('manual-form').addEventListener('submit', calculate);

function timeText(value) { return String(value || '').replace('T',' ').replace('+00:00',' UTC'); }
function angleText(value) { return Number(value).toFixed(6).replace(/0+$/,'').replace(/\.$/,'') + '°'; }
function renderResult(data) {
  dirty = false;
  $('empty-state').hidden = true; $('result').hidden = false; $('stale-notice').hidden = true;
  syncResultActions();
  $('result-context').textContent = data.mode === 'auto' ? `${data.place || '出生星盘'} · ${timeText(data.meta.birth_local)}` : '手动星盘点位 · 课堂核算';
  $('sect-badge').textContent = data.sect === 'day' ? '昼生' : '夜生';
  $('hebrew-name').textContent = data.name.hebrew;
  $('latin-name').textContent = data.name.transliteration;
  $('reading-name').textContent = '五个字母 ＋ el 后缀';
  $('letter-strip').innerHTML = data.name.letters.map((letter,index) => `<div class="letter-cell ${index > 4 ? 'suffix' : ''}"><span class="letter-hebrew" lang="he" dir="rtl">${escapeHTML(letter.hebrew)}</span><span class="letter-latin">${escapeHTML(letter.latin)}</span><span class="letter-value">${letter.value}</span><span class="letter-caption">${index < 5 ? escapeHTML(pointNames[data.order[index]]) : '后缀'}</span></div>`).join('');
  const warnings = [...new Set(data.warnings || [])].filter(w => !w.includes('完整 22 字母固定赋音表'));
  $('result-warnings').hidden = !warnings.length;
  $('result-warnings').innerHTML = warnings.map(w => `<p>${escapeHTML(w)}</p>`).join('');
  $('points-table').innerHTML = data.points.map(point => `<tr><td>${escapeHTML(pointNames[point.key])}</td><td>${escapeHTML(point.formatted)}</td><td>${point.degree_index}°</td><td><bdi class="hebrew-inline" lang="he" dir="rtl">${escapeHTML(point.letter.hebrew)}</bdi><span class="latin-inline">${escapeHTML(point.letter.latin)}</span></td><td>${point.letter.value}</td></tr>`).join('');
  const lookup = Object.fromEntries(data.points.map(point => [point.key,point]));
  const operands = data.sect === 'day' ? ['ascendant','moon','sun'] : ['ascendant','sun','moon'];
  $('fortune-formula').textContent = `${data.fortune.formula}；（${angleText(lookup[operands[0]].longitude)} ＋ ${angleText(lookup[operands[1]].longitude)} − ${angleText(lookup[operands[2]].longitude)}）归入 0—360°，得 ${angleText(data.fortune.longitude)}。`;
  $('order-note').textContent = `取字顺序：${data.order.map(key => pointNames[key]).join('、')}，再加 el。`;
  const meta = data.meta;
  const entries = data.mode === 'auto' ? [
    ['当地出生时间',timeText(meta.birth_local)],['出生时 UTC',timeText(meta.birth_utc)],['历史时区',`${meta.timezone} / ${meta.utc_offset}`],['时区数据',meta.timezone_data],['出生地坐标',`${meta.latitude}°, ${meta.longitude}°（纬度，经度）`],['太阳几何高度',`${Number(meta.sun_altitude).toFixed(4)}°`],['昼夜口径',meta.sect_rule],['出生前朔望',meta.syzygy_type],['朔望当地时间',timeText(meta.syzygy_local)],['朔望 UTC',timeText(meta.syzygy_utc)],['朔望月亮黄经',angleText(meta.syzygy_moon)],['朔望太阳黄经',angleText(meta.syzygy_sun)],['黄道口径',meta.zodiac],['计算引擎',meta.engine]
  ] : [['输入口径','手动输入回归黄道位置'],['昼夜判定',data.sect === 'day' ? '手动选择昼生' : '手动选择夜生'],['朔望点','使用所填月亮位置，未自动追溯事件时刻。'],['计算精度','度分秒按原始十进制数精确计算；查字前不作四舍五入。']];
  $('chart-meta').innerHTML = entries.filter(([,value]) => value !== undefined).map(([label,value]) => `<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd>`).join('');
}

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function recordText(data) {
  return ['潮汐纪年社出品','守护天使名号计算记录','五生命点取字法',data.mode === 'auto' ? `${data.place}\n当地时间：${timeText(data.meta.birth_local)}\nUTC：${timeText(data.meta.birth_utc)}\n时区：${data.meta.timezone} ${data.meta.utc_offset}` : '手动输入星盘点位',`昼夜：${data.sect === 'day' ? '昼生' : '夜生'}`,`名号：${data.name.hebrew}`,`字母名辅助拼读：${data.name.transliteration}`,'',...data.points.map(point => `${point.label}：${point.formatted}；累计 ${point.degree_index}°；${point.letter.hebrew} ${point.letter.latin}；数值 ${point.letter.value}`),'',data.fortune.formula,`取字顺序：${data.order.map(key => pointNames[key]).join('、')}，再加 el。`,...(data.mode === 'auto' ? [`朔望：${data.meta.syzygy_type}，${timeText(data.meta.syzygy_utc)}`,`星历：${data.meta.engine}`,`时区数据：${data.meta.timezone_data}`] : []),'','拼读按字母名列出，连读方式可依课堂指导调整。',...(data.warnings || [])].join('\n');
}
$('copy-result').addEventListener('click', async () => {
  if (!currentResult || dirty) return;
  const text = recordText(currentResult);
  try {
    await navigator.clipboard.writeText(text);
    toast('计算记录已复制。');
  } catch {
    const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select();
    const copied = document.execCommand('copy'); area.remove();
    toast(copied ? '计算记录已复制。' : '复制未完成，请使用打印或保存结果图。');
  }
});
$('print-result').addEventListener('click', () => {
  if (!currentResult || dirty) return;
  const wasOpen = $('meta-details').open;
  $('meta-details').open = true;
  window.print();
  $('meta-details').open = wasOpen;
});
let watermarkPromise;
function loadBrandWatermark() {
  if (!watermarkPromise) {
    watermarkPromise = new Promise((resolve,reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => { watermarkPromise = null; reject(new Error('watermark_unavailable')); };
      picture.src = new URL('./assets/tidal-watermark.png', document.baseURI).href;
    });
  }
  return watermarkPromise;
}
$('save-image').addEventListener('click', async () => {
  if (!currentResult || dirty || busy || exporting) return;
  const data = currentResult;
  exporting = true;
  syncResultActions();
  try {
    const watermark = await loadBrandWatermark();
    if (dirty || currentResult !== data) { toast('资料已修改，请重新计算后保存。'); return; }
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 3200;
    const ctx = canvas.getContext('2d');
    const ink = '#3B3345', muted = '#73677B', accent = '#745A7D';
    ctx.fillStyle = '#F2EEF5'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#FFFCFF'; ctx.fillRect(50,50,1340,canvas.height-100);
    const text = (value,x,y,size=24,color=ink,font='-apple-system, "PingFang SC", sans-serif') => { ctx.fillStyle=color; ctx.font=`${size}px ${font}`; ctx.fillText(String(value),x,y); };
    const line = y => { ctx.strokeStyle='#DCD3E1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(115,y);ctx.lineTo(1325,y);ctx.stroke(); };
    const wrapped = (value,x,y,width,size=24,color=muted) => { let row='',lineY=y;for(const char of String(value)){ctx.font=`${size}px -apple-system, "PingFang SC", sans-serif`;if(ctx.measureText(row+char).width>width){text(row,x,lineY,size,color);row=char;lineY+=size*1.6;}else row+=char;}if(row)text(row,x,lineY,size,color);return lineY+size*1.6; };
    text('潮汐纪年社出品',115,104,21,accent);
    text('守护天使名号计算记录',115,164,37,ink,'"Songti SC", serif');
    text(`五生命点取字法 / ${data.sect === 'day' ? '昼生' : '夜生'}`,115,216,23,muted);
    line(252);
    ctx.textAlign='center';ctx.direction='rtl';text(data.name.hebrew,720,390,100,'#5D4568','"Arial Hebrew", Arial, sans-serif');ctx.direction='ltr';
    text(data.name.transliteration,720,463,30,ink,'Georgia, serif');
    text('字母格从左至右列出取字顺序；整名从右至左读',720,515,21,muted);ctx.textAlign='left';
    const cellW=157, startX=115;
    data.name.letters.forEach((letter,i) => { const x=startX+i*176;ctx.fillStyle=i<5?'#F8F3FA':'#EDF1EB';ctx.fillRect(x,560,cellW,180);ctx.textAlign='center';text(letter.hebrew,x+cellW/2,623,43,ink,'"Arial Hebrew", Arial, sans-serif');text(letter.latin,x+cellW/2,670,21,muted);text(letter.value,x+cellW/2,704,20,accent);text(i<5?pointNames[data.order[i]]:'后缀',x+cellW/2,730,17,muted);ctx.textAlign='left'; });
    text('五生命点取字记录',115,805,29);line(835);
    const columns=[115,350,810,1040,1230];['点位','黄道位置','累计整数度','字母','数值'].forEach((v,i)=>text(v,columns[i],880,21,muted));
    data.points.forEach((point,i)=>{const y=940+i*64;text(pointNames[point.key],columns[0],y,24);text(point.formatted,columns[1],y,24);text(`${point.degree_index}°`,columns[2],y,24);text(`${point.letter.hebrew} ${point.letter.latin}`,columns[3],y,21);text(point.letter.value,columns[4],y,24);});
    line(1240);
    let y=wrapped(data.fortune.formula,115,1290,1200,24);
    y=wrapped(`取字顺序：${data.order.map(key=>pointNames[key]).join('、')}，再加 el。`,115,y+8,1200,24);
    if(data.mode==='auto'){
      y=wrapped(`${data.place} / ${timeText(data.meta.birth_local)} / ${data.meta.utc_offset}`,115,y+18,1200,22);
      y=wrapped(`${data.meta.timezone} / ${data.meta.timezone_data}`,115,y+5,1200,22);
      y=wrapped(`${data.meta.syzygy_type}：${timeText(data.meta.syzygy_utc)}`,115,y+5,1200,22);
      y=wrapped(data.meta.engine,115,y+5,1200,22);
    }
    const essentialWarnings=(data.warnings||[]).filter(w=>!w.includes('完整 22 字母固定赋音表'));
    if(essentialWarnings.length)y=wrapped(essentialWarnings.join(' '),115,y+12,1200,20,'#735A31');
    const stampWidth=410, stampHeight=stampWidth*watermark.naturalHeight/watermark.naturalWidth;
    const stampTop=y+30, finalHeight=Math.ceil(stampTop+stampHeight+90);
    if(finalHeight>canvas.height){toast('记录较长，请使用打印／存为 PDF 保存完整说明。');return;}
    ctx.save();ctx.globalAlpha=0.16;ctx.drawImage(watermark,1325-stampWidth,stampTop,stampWidth,stampHeight);ctx.restore();
    const output=document.createElement('canvas');output.width=canvas.width;output.height=finalHeight;
    const outputCtx=output.getContext('2d');outputCtx.drawImage(canvas,0,0);
    outputCtx.fillStyle='#F2EEF5';outputCtx.fillRect(0,finalHeight-50,output.width,50);
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
    if(!blob){toast('图片未能生成，请使用打印保存。');return;}
    if(dirty||currentResult!==data){toast('资料已修改，请重新计算后保存。');return;}
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`潮汐纪年社_守护天使名号_${data.mode==='auto'?data.meta.birth_local.slice(0,10):'手动核算'}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('带水印的结果图已生成，请在下载文件中查看。');
  } catch { toast('水印未能载入，请刷新页面后重新保存。'); }
  finally { exporting=false; syncResultActions(); }
});

function connectDialog(buttonId,dialogId,closeId) {
  const button=$(buttonId), dialog=$(dialogId);
  button.addEventListener('click',()=>dialog.showModal());
  $(closeId).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>button.focus({preventScroll:true}));
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
}
connectDialog('help-button','help-dialog','close-help');
connectDialog('contact-button','contact-dialog','close-contact');
$('place-hint').textContent = '正在载入城市资料，首次打开可能需要片刻…';
Promise.all([initPlaces(dataBase), initTimezones(dataBase)])
  .then(async () => {
    placesReady = true;
    if (!selectedPlace && !$('place-search').value) $('place-hint').textContent = '中文、英文均可搜索，请选择匹配的城市。';
    const zones = await getTimezones();
    $('timezone-options').innerHTML = zones.map(zone=>`<option value="${escapeHTML(zone)}"></option>`).join('');
  })
  .catch(() => { $('place-hint').textContent = '城市或历史时区数据未能载入，请刷新网页后重试。手动点位模式仍可使用。'; });
