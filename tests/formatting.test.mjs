import test from 'node:test';
import assert from 'node:assert/strict';
import {formatGroupedInteger} from '../src/utils.js';

test('formats large Toman values in Persian digits with three-digit separators',()=>{
 assert.equal(formatGroupedInteger('3000000'),'۳٬۰۰۰٬۰۰۰');
 assert.equal(formatGroupedInteger('125000'),'۱۲۵٬۰۰۰');
 assert.equal(formatGroupedInteger('0'),'۰');
});

test('accepts Persian, Arabic and already grouped digits without double separators',()=>{
 assert.equal(formatGroupedInteger('۳۰۰۰۰۰۰'),'۳٬۰۰۰٬۰۰۰');
 assert.equal(formatGroupedInteger('٣٬٠٠٠٬٠٠٠'),'۳٬۰۰۰٬۰۰۰');
 assert.equal(formatGroupedInteger('۳٬۰۰۰٬۰۰۰'),'۳٬۰۰۰٬۰۰۰');
});

test('keeps empty fields empty and removes non-digit formatting noise',()=>{
 assert.equal(formatGroupedInteger(''),'');
 assert.equal(formatGroupedInteger(' 1,234,567 تومان '),'۱٬۲۳۴٬۵۶۷');
});
