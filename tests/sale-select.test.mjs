import test from 'node:test';
import assert from 'node:assert/strict';
import { optionMarkup } from '../src/utils.js';

test('keeps selected product option after sale form rerender', () => {
  const products = [
    { id: 'oil-5', name: 'روغن پنج کیلویی' },
    { id: 'fondant', name: 'فوندانت' },
  ];
  const html = optionMarkup(products, 'id', 'name', 'انتخاب کالا', 'oil-5');
  assert.match(html, /<option value="oil-5" selected>روغن پنج کیلویی<\/option>/);
  assert.match(html, /<option value="fondant" >فوندانت<\/option>/);
});

test('escapes option labels and values', () => {
  const html = optionMarkup([{ id: 'x" onfocus="alert(1)', name: '<script>alert(1)</script>' }], 'id', 'name', 'انتخاب', '');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot;'));
});
