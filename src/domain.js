/** Warehouse Lite v0.1 core: Persian/English decimal input, integer stock, Toman. */
export function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[٬,\s]/g, '').replace(/٫/g, '.');
}

export function asInteger(value, label = 'مقدار') {
  const text = normalizeDigits(value);
  if (!/^\d+$/.test(text)) throw new Error(`${label} باید عدد صحیح و غیرمنفی باشد.`);
  const n = Number(text);
  if (!Number.isSafeInteger(n)) throw new Error(`${label} بیش از حد بزرگ است.`);
  return n;
}

export function asPositiveInteger(value, label = 'مقدار') {
  const n = asInteger(value, label);
  if (n < 1) throw new Error(`${label} باید بیشتر از صفر باشد.`);
  return n;
}

export function asDecimalMilli(value, label = 'مقدار') {
  const text = normalizeDigits(value);
  if (!/^(?:\d+)(?:\.\d{1,3})?$/.test(text))
    throw new Error(`${label} باید عدد غیرمنفی با حداکثر سه رقم اعشار باشد.`);
  const [whole, frac = ''] = text.split('.');
  const n = Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
  if (!Number.isSafeInteger(n)) throw new Error(`${label} بیش از حد بزرگ است.`);
  return n;
}

export function parseBaseQuantity(product, unit, value) {
  if (!product || !['piece','gram'].includes(product.kind)) throw new Error('کالای نامعتبر.');
  if (unit === 'pack') {
    const count = asPositiveInteger(value, 'تعداد بسته');
    if (!Number.isSafeInteger(product.packBase) || product.packBase <= 1) throw new Error('برای این کالا بسته تعریف نشده است.');
    const total = count * product.packBase;
    if (!Number.isSafeInteger(total)) throw new Error('مقدار بیش از حد بزرگ است.');
    return { base: total, thousandths: count * 1000 };
  }
  if (product.kind === 'gram' && unit === 'kg') {
    const grams = asDecimalMilli(value, 'مقدار به کیلو');
    if (grams < 1) throw new Error('مقدار باید بزرگ‌تر از صفر باشد.');
    return { base: grams, thousandths: grams };
  }
  if (product.kind === 'piece' && unit === 'piece') {
    const count = asPositiveInteger(value, 'تعداد');
    return { base: count, thousandths: count * 1000 };
  }
  throw new Error('واحد انتخاب‌شده با کالا سازگار نیست.');
}

export function lineTotal(tomanPrice, thousandths) {
  if (!Number.isSafeInteger(tomanPrice) || tomanPrice < 0) throw new Error('قیمت نامعتبر است.');
  if (!Number.isSafeInteger(thousandths) || thousandths < 1) throw new Error('مقدار نامعتبر است.');
  const product = tomanPrice * thousandths;
  if (!Number.isSafeInteger(product)) throw new Error('مبلغ بیش از حد بزرگ است.');
  return Math.round(product / 1000);
}

export function defaultUnitPrice(product, unit) {
  const price = product.salePrice || 0;
  if (unit !== 'pack') return price;
  const multiplier = product.kind === 'gram' ? product.packBase / 1000 : product.packBase;
  return Math.round(price * multiplier);
}

export function customerBalance(customerId, sales, payments) {
  const salesSum = sales.filter(x => x.customerId === customerId && x.status !== 'void').reduce((sum, x) => sum + x.total, 0);
  const paymentsSum = payments.filter(x => x.customerId === customerId && x.status !== 'void').reduce((sum, x) => sum + x.amount, 0);
  return salesSum - paymentsSum;
}

export function validateSaleLines(lines, products) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('حداقل یک قلم کالا لازم است.');
  const productMap = new Map(products.map(p => [p.id,p]));
  const required = new Map();
  let total = 0;
  const normalized = lines.map(line => {
    const product = productMap.get(line.productId);
    if (!product) throw new Error('یک کالای انتخاب‌شده وجود ندارد.');
    const qty = parseBaseQuantity(product,line.unit,line.quantity);
    const unitPrice = asInteger(line.unitPrice, 'قیمت فروش');
    const amount = lineTotal(unitPrice,qty.thousandths);
    total += amount;
    if (!Number.isSafeInteger(total)) throw new Error('مبلغ فاکتور بیش از حد بزرگ است.');
    required.set(product.id, (required.get(product.id)||0) + qty.base);
    return { productId:product.id,productName:product.name,unit:line.unit,quantity:normalizeDigits(line.quantity),quantityBase:qty.base,unitPrice,amount };
  });
  for (const [id,count] of required) {
    const product=productMap.get(id);
    if (!Number.isSafeInteger(count) || count > product.stockBase) throw new Error(`موجودی «${product.name}» کافی نیست.`);
  }
  return { normalized, total, required };
}

export function stockLabel(product, base = product.stockBase) {
  if (product.kind === 'gram') return `${new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(base/1000)} کیلو`;
  return `${new Intl.NumberFormat('fa-IR').format(base)} عدد`;
}

export function money(value) {
  return `${new Intl.NumberFormat('fa-IR').format(value||0)} تومان`;
}

export function isoNow() { return new Date().toISOString(); }

export function makeId() { return crypto.randomUUID(); }
