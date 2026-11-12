import { validDate } from './daily-status.js';

export function mealTiming(value) {
  const result = {};
  if (typeof value?.date === 'string' && validDate(value.date)) result.date = value.date;
  if (typeof value?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) result.time = value.time;
  if (['早餐', '午餐', '晚餐', '加餐'].includes(value?.kind)) result.kind = value.kind;
  return result;
}

export function kindAt(time) {
  const hour = Number(time.slice(0, 2));
  return hour < 10 ? '早餐' : hour < 14 ? '午餐' : hour < 17 ? '加餐' : hour < 21 ? '晚餐' : '加餐';
}

// Read only the original capture timestamp and its offset; malformed EXIF is optional.
export function photoMealTiming(exif) {
  if (!Buffer.isBuffer(exif)) return undefined;
  try {
    const tiff = exif.subarray(exif.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0);
    const order = tiff.toString('ascii', 0, 2);
    if (!['II', 'MM'].includes(order)) return undefined;
    const u16 = offset => order === 'II' ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
    const u32 = offset => order === 'II' ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
    if (u16(2) !== 42) return undefined;
    const entries = offset => {
      const count = u16(offset);
      if (offset + 2 + count * 12 > tiff.length) throw Error('invalid EXIF');
      return Array.from({ length: count }, (_, i) => offset + 2 + i * 12);
    };
    const pointer = entries(u32(4)).find(offset => u16(offset) === 0x8769 && u16(offset + 2) === 4 && u32(offset + 4) === 1);
    if (pointer === undefined) return undefined;
    const tags = entries(u32(pointer + 8));
    const ascii = tag => {
      const entry = tags.find(offset => u16(offset) === tag && u16(offset + 2) === 2);
      if (entry === undefined) return '';
      const length = u32(entry + 4), start = length <= 4 ? entry + 8 : u32(entry + 8);
      if (length > 40 || start + length > tiff.length) return '';
      return tiff.toString('ascii', start, start + length).replace(/\0.*$/, '');
    };
    const match = /^(\d{4}):(\d{2}):(\d{2}) ([0-2]\d):([0-5]\d):([0-5]\d)$/.exec(ascii(0x9003));
    if (!match) return undefined;
    let date = `${match[1]}-${match[2]}-${match[3]}`, time = `${match[4]}:${match[5]}`;
    if (!mealTiming({ date, time }).date || !mealTiming({ time }).time) return undefined;
    const offset = ascii(0x9011);
    if (offset) {
      if (!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(offset)) return undefined;
      const instant = new Date(`${date}T${time}:${match[6]}${offset}`);
      const local = new Date(instant.getTime() + 8 * 3600_000).toISOString();
      date = local.slice(0, 10); time = local.slice(11, 16);
    }
    // Without an offset, keep the camera's local wall time.
    return { date, time, kind: kindAt(time) };
  } catch { return undefined; }
}

export const mealTimingInstructions = `【用餐时间和类型】JSON可包含date（YYYY-MM-DD）、time（HH:mm）、kind（早餐/午餐/晚餐/加餐）。用户对这餐明确说明的日期、时间、餐次优先于照片拍摄时间，最新纠正优先；今天/昨天按当前上海日期解析。未明确提供的字段省略，不凭食物、包装生产日期或历史记忆猜测。照片拍摄时间是参考，只有属于同一天同一餐的照片才合并使用。用户只改份量时保留草稿已有时间和餐次；只说早餐等餐次时仅更新kind，不编造具体时间。若明确修改时间但未指定餐次，根据时间推断kind：10点前早餐、10至14点前午餐、14至17点前加餐、17至21点前晚餐、21点后加餐。用户明确说的餐次不受时段限制。`;
