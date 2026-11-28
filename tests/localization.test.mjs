import test from 'node:test';
import assert from 'node:assert/strict';
import {formatJalaliDate,parseJalaliDate,jalaliParts,jalaliToIso,jalaliMonthDays,jalaliWeekdayIndex} from '../src/jalali.js';
import {formatRialInput,digitsBeforeCaret,caretForDigitCount} from '../src/rial-input.js';
import {money,asInteger} from '../src/domain.js';

test('Solar Hijri calendar conversion survives Nowruz and leap day', () => {
  assert.equal(formatJalaliDate('2026-03-21'), '۱۴۰۵/۰۱/۰۱');
  assert.equal(parseJalaliDate('۱۴۰۵/۰۱/۰۱'), '2026-03-21');
  assert.equal(parseJalaliDate('1405/1/1'), '2026-03-21');
  assert.equal(jalaliToIso(1403,12,30), '2025-03-20');
  assert.equal(jalaliMonthDays(1403,12), 30);
  assert.equal(jalaliMonthDays(1404,12), 29);
  assert.throws(() => parseJalaliDate('۱۴۰۴/۱۲/۳۰'));
  assert.throws(() => parseJalaliDate('۱۴۰۵/۰۲/۳۲'));
  assert.throws(() => parseJalaliDate('۱۴۰۵/۱۳/۰۱'));
  assert.throws(() => parseJalaliDate('1405-4-00'));
  assert.equal(jalaliWeekdayIndex('2026-03-21'),0);
  assert.deepEqual(jalaliParts('2026-11-28'),{year:1405,month:9,day:7});
});

test('Jalali date converter round-trips each Persian month across years', () => {
  for (const year of [1399,1400,1403,1404,1405,1406,1410]) {
    for (let month=1; month<=12; month++) {
      for (const day of [1,15,jalaliMonthDays(year,month)]) {
        const iso=jalaliToIso(year,month,day);
        assert.equal(parseJalaliDate(formatJalaliDate(iso)),iso);
      }
    }
  }
});

test('IRR display and entry use Latin digits and grouping commas without losing value', () => {
  assert.equal(money(15000000),'15,000,000 ریال');
  assert.equal(money(0),'0 ریال');
  assert.equal(formatRialInput('۱۵۰۰۰۰۰۰'),'15,000,000');
  assert.equal(formatRialInput('١٥٬٠٠٠٬٠٠٠'),'15,000,000');
  assert.equal(formatRialInput('0001500000'),'1,500,000');
  assert.equal(formatRialInput(''), '');
  assert.equal(asInteger(formatRialInput('۱۵۰۰۰۰۰۰')) , 15000000);
  const previous='12,345';const cursor=4;
  assert.equal(digitsBeforeCaret(previous,cursor),3);
  assert.equal(caretForDigitCount(formatRialInput(previous),3),4);
});
