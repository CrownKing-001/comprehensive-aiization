// 周次文本 ↔ 数组的互转。移植自桌面版 src/views/CalendarScan.tsx。
// 用于识别结果确认表：用户可以把「1-16」手改成「1-8,10-16」。

/** 把周次数组转成可编辑的紧凑文本：连续段写成 a-b，其余逗号分隔 */
function weeksToText(weeks) {
  if (!weeks || !weeks.length) return '';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(',');
}

/** 解析用户手改过的周次文本，支持 "1-16" / "1,3,5" / "1-16,18" */
function parseWeeksText(text) {
  const t = String(text || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!t.trim()) return null;
  const out = new Set();
  for (const seg of t.split(/[,，、\s]+/).filter(Boolean)) {
    const m = seg.match(/^(\d{1,2})\s*[-–~至]\s*(\d{1,2})$/);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      for (let w = Math.min(a, b); w <= Math.max(a, b); w++) if (w >= 1 && w <= 30) out.add(w);
      continue;
    }
    const n = Number(seg);
    if (Number.isInteger(n) && n >= 1 && n <= 30) out.add(n);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

/** 周次数组 → 人类可读（如「1-16周」「单周」「第4周」） */
function weeksLabelText(weeks) {
  if (!weeks || !weeks.length) return '每周';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  if (sorted.length === 1) return `第${sorted[0]}周`;
  const isArith = sorted.every((w, i) => (i === 0 ? true : w - sorted[i - 1] === sorted[1] - sorted[0]));
  if (isArith && sorted.length > 2) {
    const step = sorted[1] - sorted[0];
    if (step === 1) return `${sorted[0]}-${sorted[sorted.length - 1]}周`;
    if (step === 2) return sorted[0] % 2 === 1 ? '单周' : '双周';
  }
  return weeksToText(sorted) + '周';
}

module.exports = { weeksToText, parseWeeksText, weeksLabelText };
