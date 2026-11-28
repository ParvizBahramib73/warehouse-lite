/** Jalali calendar UI helpers. Persist ISO Gregorian dates; render/input Solar Hijri dates. */
const persianCalendar = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});
const months = Object.freeze(['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']);
const dayMs = 86400000;
const startCache = new Map();

export const jalaliMonthNames = months;
export const toPersianDigits = value => String(value).replace(/[0-9]/g, c => '۰۱۲۳۴۵۶۷۸۹'[Number(c)]);
export const toEnglishDigits = value => String(value ?? '')
  .replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
  .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));

function isoDayNumber(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('فرمت تاریخ معتبر نیست.');
  const [year,month,day] = iso.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  if (new Date(time).toISOString().slice(0, 10) !== iso) throw new Error('تاریخ میلادی معتبر نیست.');
  return Math.floor(time / dayMs);
}
function partsForDay(dayNumber) {
  const fields = persianCalendar.formatToParts(new Date(dayNumber * dayMs + 12 * 3600000));
  const parts = Object.fromEntries(fields.map(x => [x.type, Number(x.value)]));
  return {year: parts.year,month: parts.month,day: parts.day};
}
export function jalaliParts(iso) {
  return partsForDay(isoDayNumber(iso));
}
function yearStart(year) {
  if (!Number.isInteger(year) || year < 1200 || year > 1600) throw new Error('سال شمسی خارج از محدوده مجاز است.');
  if (!startCache.has(year)) {
    const beginning = Math.floor(Date.UTC(year + 621, 2, 17) / dayMs);
    let found = null;
    for (let delta = 0; delta <= 8; delta++) {
      const parts = partsForDay(beginning + delta);
      if (parts.year === year && parts.month === 1 && parts.day === 1) {
        found = beginning + delta; break;
      }
    }
    if (found === null) throw new Error('آغاز سال شمسی قابل محاسبه نیست.');
    startCache.set(year, found);
  }
  return startCache.get(year);
}
export function jalaliMonthDays(year,month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('ماه شمسی معتبر نیست.');
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return yearStart(year + 1) - yearStart(year) - 336;
}
export function jalaliToIso(year,month,day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) throw new Error('تاریخ شمسی معتبر نیست.');
  if (day < 1 || day > jalaliMonthDays(year,month)) throw new Error('روز انتخاب‌شده در تقویم شمسی معتبر نیست.');
  const daysBeforeMonth = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const result = new Date((yearStart(year) + daysBeforeMonth + day - 1) * dayMs).toISOString().slice(0, 10);
  const verify = jalaliParts(result);
  if (verify.year !== year || verify.month !== month || verify.day !== day) throw new Error('تبدیل تاریخ شمسی درست انجام نشد.');
  return result;
}
export function parseJalaliDate(input) {
  const text = toEnglishDigits(input).trim();
  if (!text) return '';
  const m = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(text);
  if (!m) throw new Error('تاریخ را به شکل ۱۴۰۵/۰۹/۰۷ وارد کنید.');
  const [year,month,day] = m.slice(1).map(Number);
  return jalaliToIso(year,month,day);
}
export function formatJalaliDate(iso) {
  if (!iso) return '';
  const {year,month,day} = jalaliParts(iso);
  return toPersianDigits(`${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`);
}
export function jalaliWeekdayIndex(iso) {
  const dayNumber = isoDayNumber(iso);
  return (new Date(dayNumber * dayMs).getUTCDay() + 1) % 7; // Saturday = 0
}
