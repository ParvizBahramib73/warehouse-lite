/** Browser-agnostic formatting used by all IRR entry controls. */
export function englishDigits(value) {
  return String(value ?? '').replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}
export function formatRialInput(value) {
  const digits = englishDigits(value).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function digitsBeforeCaret(value, position) {
  return englishDigits(String(value).slice(0, position)).replace(/[^0-9]/g, '').length;
}
export function caretForDigitCount(formatted, digitCount) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++;
    if (seen === digitCount) return i + 1;
  }
  return formatted.length;
}
