import { customerBalance } from './domain.js';

export function buildCustomerStatement(customerId, sales = [], payments = []) {
  const entries = [
    ...sales.filter(item => item.customerId === customerId).map(item => ({
      id: item.id,
      type: 'sale',
      createdAt: item.createdAt,
      amount: item.total,
      status: item.status || 'active',
      reference: item.invoiceNo || '',
      detail: (item.lines || []).map(line => line.productName).filter(Boolean).join('، ')
    })),
    ...payments.filter(item => item.customerId === customerId).map(item => ({
      id: item.id,
      type: 'payment',
      createdAt: item.createdAt,
      amount: item.amount,
      status: item.status || 'active',
      reference: item.method === 'cash' ? 'نقدی' : 'انتقال بانکی',
      detail: item.note || ''
    }))
  ].sort((a, b) => {
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return diff || (a.type === 'sale' ? -1 : 1);
  });

  let runningBalance = 0;
  return entries.map(entry => {
    if (entry.status !== 'void') {
      runningBalance += entry.type === 'sale' ? entry.amount : -entry.amount;
    }
    return { ...entry, balanceAfter: runningBalance };
  });
}

export function getCustomerFollowups(customers = [], sales = [], payments = [], now = Date.now()) {
  const latestSales = new Map();
  for (const sale of sales) {
    if (sale.status === 'void') continue;
    const previous = latestSales.get(sale.customerId);
    if (!previous || Date.parse(sale.createdAt) > Date.parse(previous.createdAt)) {
      latestSales.set(sale.customerId, sale);
    }
  }

  return customers
    .filter(customer => customer.active !== false)
    .map(customer => {
      const lastSale = latestSales.get(customer.id) || null;
      const elapsed = lastSale ? Math.max(0, now - Date.parse(lastSale.createdAt)) : null;
      const daysSinceSale = elapsed === null ? null : Math.floor(elapsed / 86400000);
      const balance = customerBalance(customer.id, sales, payments);
      const reason = balance > 0 && daysSinceSale >= 7
        ? 'پیگیری خرید و مانده حساب'
        : balance > 0
          ? 'پیگیری مانده حساب'
          : 'پیگیری پس از خرید';
      return { ...customer, lastSale, daysSinceSale, balance, reason };
    })
    .filter(customer => customer.balance > 0 || customer.daysSinceSale >= 7)
    .sort((a, b) => {
      if ((a.balance > 0) !== (b.balance > 0)) return a.balance > 0 ? -1 : 1;
      return (b.daysSinceSale ?? -1) - (a.daysSinceSale ?? -1);
    });
}
