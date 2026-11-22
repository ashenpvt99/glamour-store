const fs = require('fs');
const file = 'src/App.jsx';
let code = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const first = code.indexOf(oldText);
  if (first < 0) throw new Error(`Could not find section: ${label}. No changes were saved.`);
  if (code.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Section is not unique: ${label}. No changes were saved.`);
  }
  code = code.slice(0, first) + newText + code.slice(first + oldText.length);
}

replaceOnce(
"const LOW_STOCK_LIMIT = 2;\n",
`const LOW_STOCK_LIMIT = 2;

function calculateLineDiscount(item) {
  const price = Number(item.price ?? item.unit_price ?? 0);
  const qty = Number(item.qty ?? item.quantity ?? 0);
  const gross = Math.max(0, price * qty);
  const value = Math.max(0, Number(item.discount_value || 0));
  if (!gross || !value) return 0;
  if (item.discount_type === 'percentage') {
    return Math.min(gross, gross * Math.min(value, 100) / 100);
  }
  if (item.discount_type === 'fixed') {
    return Math.min(gross, Math.min(price, value) * qty);
  }
  return 0;
}

function applyDiscountToItems(items, discount) {
  if (!discount) return items;
  return items.map(item => ({
    ...item,
    discount_type: discount.discount_type,
    discount_value: Number(discount.discount_value || 0)
  }));
}
`, 'discount calculation helper'
);

replaceOnce(
"  const items = (order.order_items || []).map(item => `\n    <tr>\n      <td>${escapeReceiptHtml(item.product_name || 'Product')}</td>\n      <td class=\"center\">${Number(item.quantity || 0)}</td>\n      <td class=\"right\">${money(item.line_total)}</td>\n    </tr>\n  `).join('');",
`  const items = (order.order_items || []).map(item => {
    const gross = Number(item.line_total || 0);
    const discount = Math.max(0, Number(item.discount_amount || 0));
    return \`
    <tr>
      <td>\${escapeReceiptHtml(item.product_name || 'Product')}</td>
      <td class="center">\${Number(item.quantity || 0)}</td>
      <td class="right">\${money(gross)}\${discount > 0 ? \`<br><small>Discount: -\${money(discount)}</small><br><b>Net: \${money(Math.max(0, gross - discount))}</b>\` : ''}</td>
    </tr>
  \`;
  }).join('');
  const itemDiscountTotal = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount_amount || 0)), 0);`,
  'receipt item rows'
);

replaceOnce(
"  <section class=\"totals\">${Number(order.discount_amount || 0) > 0 ? `<div class=\"totalrow\"><span>Discount (${escapeReceiptHtml(order.discount_name || 'Offer')})</span><b>-${money(order.discount_amount)}</b></div>` : ''}<div class=\"totalrow\"><span>Delivery",
"  <section class=\"totals\">${itemDiscountTotal > 0 ? `<div class=\"totalrow\"><span>Item discounts</span><b>-${money(itemDiscountTotal)}</b></div>` : ''}${Number(order.discount_amount || 0) > 0 ? `<div class=\"totalrow\"><span>Discount (${escapeReceiptHtml(order.discount_name || 'Offer')})</span><b>-${money(order.discount_amount)}</b></div>` : ''}<div class=\"totalrow\"><span>Delivery",
  'receipt discount total'
);

replaceOnce(
"  const items = (order.order_items || []).map(item =>\n    `• ${item.product_name} × ${item.quantity} - ${money(item.line_total)}`\n  ).join('\\n');",
`  const items = (order.order_items || []).map(item => {
    const gross = Number(item.line_total || 0);
    const discount = Math.max(0, Number(item.discount_amount || 0));
    return \`• \${item.product_name} × \${item.quantity} - \${money(Math.max(0, gross - discount))}\${discount > 0 ? \` (discount \${money(discount)})\` : ''}\`;
  }).join('\\n');
  const itemDiscountTotal = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount_amount || 0)), 0);`,
  'WhatsApp item rows'
);

replaceOnce(
"    ...(Number(order.discount_amount || 0) > 0 ? [`Discount: ${order.discount_name || 'Offer'} (-${money(order.discount_amount)})`] : []),",
"    ...(itemDiscountTotal > 0 ? [`Item discounts: -${money(itemDiscountTotal)}`] : []),\n    ...(Number(order.discount_amount || 0) > 0 ? [`Discount: ${order.discount_name || 'Offer'} (-${money(order.discount_amount)})`] : []),",
  'WhatsApp discount summary'
);

replaceOnce(
`  const subtotal = cart.reduce(
    (s, item) => s + Number(item.price) * item.qty, 0
  );
  const activeDiscount = discounts.find(d => d.active) || null;
  function calculateDiscount(amount) {
    if (!activeDiscount || Number(amount) <= 0) return 0;
    const value = Number(activeDiscount.discount_value || 0);
    if (activeDiscount.discount_type === 'percentage') return Math.min(Number(amount), Number(amount) * value / 100);
    return Math.min(Number(amount), value);
  }
  const discountAmount = calculateDiscount(subtotal);
  const deliveryFee = DELIVERY[form.delivery];
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);

  const manualSubtotal = manualItems.reduce(
    (s, item) => s + Number(item.price) * item.qty, 0
  );
  const manualDiscountAmount = calculateDiscount(manualSubtotal);
  const manualDeliveryFee = DELIVERY[manualForm.delivery];
  const manualTotal = Math.max(0, manualSubtotal - manualDiscountAmount + manualDeliveryFee);`,
`  const activeDiscount = discounts.find(d => d.active) || null;
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const discountAmount = cart.reduce((sum, item) => sum + calculateLineDiscount(item), 0);
  const deliveryFee = DELIVERY[form.delivery];
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);

  const manualSubtotal = manualItems.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const manualDiscountAmount = manualItems.reduce((sum, item) => sum + calculateLineDiscount(item), 0);
  const manualDeliveryFee = DELIVERY[manualForm.delivery];
  const manualTotal = Math.max(0, manualSubtotal - manualDiscountAmount + manualDeliveryFee);`,
  'cart and manual totals'
);

replaceOnce(
`  // Sales and profit report calculations. Cancelled orders are excluded.
  // Item line totals are gross product sales; discounts are subtracted once
  // at order level. Delivery fees are excluded from product sales and profit.
  const reportOrders = orders.filter(o => o.status !== 'Cancelled');
  const reportItems = reportOrders.flatMap(o => o.order_items || []);
  const totalProductRevenue = reportItems.reduce(
    (sum, item) => sum + Number(item.line_total || 0), 0
  );
  const totalDiscounts = reportOrders.reduce(
    (sum, order) => sum + Math.max(0, Number(order.discount_amount || 0)), 0
  );`,
`  // Reports include both new item-level discounts and legacy order-level discounts.
  const reportOrders = orders.filter(o => o.status !== 'Cancelled');
  const reportItems = reportOrders.flatMap(o => o.order_items || []);
  const totalProductRevenue = reportItems.reduce(
    (sum, item) => sum + Number(item.line_total || 0), 0
  );
  const totalDiscounts = reportOrders.reduce(
    (sum, order) => sum
      + Math.max(0, Number(order.discount_amount || 0))
      + (order.order_items || []).reduce((itemSum, item) => itemSum + Math.max(0, Number(item.discount_amount || 0)), 0),
    0
  );`,
  'reports discount totals'
);

replaceOnce(
"      entry.revenue += Math.max(0, grossOrderSales - Math.max(0, Number(order.discount_amount || 0)));",
"      const itemDiscounts = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount_amount || 0)), 0);\n      entry.revenue += Math.max(0, grossOrderSales - itemDiscounts - Math.max(0, Number(order.discount_amount || 0)));",
  'monthly net sales'
);

replaceOnce(
"      current.revenue += Number(item.line_total || 0);",
"      current.revenue += Math.max(0, Number(item.line_total || 0) - Number(item.discount_amount || 0));",
  'best seller net revenue'
);

replaceOnce(
`      return [...old, { ...p, qty: 1 }];`,
`      return [...old, {
        ...p, qty: 1,
        discount_type: activeDiscount?.discount_type || null,
        discount_value: Number(activeDiscount?.discount_value || 0)
      }];`,
  'new cart item discount default'
);

replaceOnce(
`  function changeQty(id, delta) {
    setCart(old =>
      old.map(x =>
        x.id === id
          ? {
              ...x,
              qty: Math.max(1, Math.min(Number(x.stock), x.qty + delta))
            }
          : x
      )
    );
  }`,
`  function changeQty(id, delta) {
    setCart(old =>
      old.map(x =>
        x.id === id
          ? { ...x, qty: Math.max(1, Math.min(Number(x.stock), x.qty + delta)) }
          : x
      )
    );
  }

  function updateCartDiscount(id, field, value) {
    setCart(old => old.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function applyActiveDiscountToCart() {
    if (!activeDiscount) return;
    setCart(old => applyDiscountToItems(old, activeDiscount));
    setNotice(\`"\${activeDiscount.name}" applied to all cart items.\`);
  }

  function updateManualDiscount(id, field, value) {
    setManualItems(old => old.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function applyActiveDiscountToManualItems() {
    if (!activeDiscount) return;
    setManualItems(old => applyDiscountToItems(old, activeDiscount));
    setNotice(\`"\${activeDiscount.name}" applied to all new-order items.\`);
  }`,
  'discount edit and apply-all functions'
);

replaceOnce(
`      const rows = cart.map(p => ({
        product_id: p.id,
        product_name: p.name,
        quantity: p.qty,
        unit_price: Number(p.price),
        line_total: Number(p.price) * p.qty,
        unit_cost: Number(p.cost_price || 0)
      }));`,
`      const rows = cart.map(p => ({
        product_id: p.id,
        product_name: p.name,
        quantity: p.qty,
        unit_price: Number(p.price),
        line_total: Number(p.price) * p.qty,
        unit_cost: Number(p.cost_price || 0),
        discount_type: p.discount_type || null,
        discount_value: Number(p.discount_value || 0),
        discount_amount: calculateLineDiscount(p)
      }));`,
  'customer order item payload'
);

replaceOnce(
`          discount_name: discountAmount > 0 ? activeDiscount?.name : null,
          discount_type: discountAmount > 0 ? activeDiscount?.discount_type : null,
          discount_value: discountAmount > 0 ? Number(activeDiscount?.discount_value || 0) : 0,
          discount_amount: discountAmount,`,
`          discount_name: null,
          discount_type: null,
          discount_value: 0,
          discount_amount: 0,`,
  'customer order prevent double discount'
);

replaceOnce(
`          cost_price: Number(selected.cost_price || 0),
          stock: Number(selected.stock),
          qty
        }`,
`          cost_price: Number(selected.cost_price || 0),
          stock: Number(selected.stock),
          qty,
          discount_type: activeDiscount?.discount_type || null,
          discount_value: Number(activeDiscount?.discount_value || 0)
        }`,
  'new manual item discount default'
);

replaceOnce(
`      const rows = manualItems.map(p => ({
        product_id: p.id,
        product_name: p.name,
        quantity: p.qty,
        unit_price: Number(p.price),
        line_total: Number(p.price) * p.qty,
        unit_cost: Number(p.cost_price || 0)
      }));`,
`      const rows = manualItems.map(p => ({
        product_id: p.id,
        product_name: p.name,
        quantity: p.qty,
        unit_price: Number(p.price),
        line_total: Number(p.price) * p.qty,
        unit_cost: Number(p.cost_price || 0),
        discount_type: p.discount_type || null,
        discount_value: Number(p.discount_value || 0),
        discount_amount: calculateLineDiscount(p)
      }));`,
  'manual order item payload'
);

replaceOnce(
`          discount_name: manualDiscountAmount > 0 ? activeDiscount?.name : null,
          discount_type: manualDiscountAmount > 0 ? activeDiscount?.discount_type : null,
          discount_value: manualDiscountAmount > 0 ? Number(activeDiscount?.discount_value || 0) : 0,
          discount_amount: manualDiscountAmount,`,
`          discount_name: null,
          discount_type: null,
          discount_value: 0,
          discount_amount: 0,`,
  'manual order prevent double discount'
);

replaceOnce(
`                        {manualItems.map(p => (
                          <div className="cartitem" key={p.id}>
                            <span>
                              <b>{p.name}</b>
                              <small>{money(p.price)} × {p.qty}</small>
                            </span>
                            <b>{money(p.price * p.qty)}</b>
                            <button
                              type="button"
                              className="textdanger"
                              onClick={() => removeManualItem(p.id)}
                              title="Remove product"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}`,
`                        {activeDiscount && (
                          <button type="button" className="secondary" onClick={applyActiveDiscountToManualItems}>
                            Apply "{activeDiscount.name}" to all items
                          </button>
                        )}
                        {manualItems.map(p => {
                          const gross = Number(p.price) * p.qty;
                          const itemDiscount = calculateLineDiscount(p);
                          return (
                            <div className="cartitem" key={p.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                              <span style={{ flex: '1 1 150px' }}>
                                <b>{p.name}</b>
                                <small>{money(p.price)} × {p.qty}</small>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                  <select aria-label={\`\${p.name} discount type\`} value={p.discount_type || ''} onChange={e => updateManualDiscount(p.id, 'discount_type', e.target.value || null)}>
                                    <option value="">No discount</option>
                                    <option value="percentage">Percentage (%)</option>
                                    <option value="fixed">Fixed per unit (Rs.)</option>
                                  </select>
                                  <input aria-label={\`\${p.name} discount value\`} type="number" min="0" step="0.01" placeholder="Discount value" value={p.discount_value ?? ''} disabled={!p.discount_type} onChange={e => updateManualDiscount(p.id, 'discount_value', e.target.value)} style={{ width: '125px' }} />
                                </div>
                                {itemDiscount > 0 && <small style={{ color: '#15803d' }}>Discount: -{money(itemDiscount)} · Net: {money(gross - itemDiscount)}</small>}
                              </span>
                              <b>{money(Math.max(0, gross - itemDiscount))}</b>
                              <button type="button" className="textdanger" onClick={() => removeManualItem(p.id)} title="Remove product"><Trash2 size={16} /></button>
                            </div>
                          );
                        })}`,
  'manual order item discount controls'
);

replaceOnce(
`                    {cart.map(p => (
                    <div className="cartitem" key={p.id}>
                      <span>
                        <b>{p.name}</b>
                        <small>{money(p.price)} each</small>
                      </span>
                      <div className="qty">
                        <button onClick={() => changeQty(p.id, -1)}><Minus size={14} /></button>
                        {p.qty}
                        <button onClick={() => changeQty(p.id, 1)}><Plus size={14} /></button>
                      </div>
                      <b>{money(p.price * p.qty)}</b>
                    </div>
                  ))}`,
`                    {activeDiscount && (
                      <button type="button" className="secondary" onClick={applyActiveDiscountToCart}>
                        Apply "{activeDiscount.name}" to all items
                      </button>
                    )}
                    {cart.map(p => {
                      const gross = Number(p.price) * p.qty;
                      const itemDiscount = calculateLineDiscount(p);
                      return (
                        <div className="cartitem" key={p.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <span style={{ flex: '1 1 150px' }}>
                            <b>{p.name}</b>
                            <small>{money(p.price)} each</small>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                              <select aria-label={\`\${p.name} discount type\`} value={p.discount_type || ''} onChange={e => updateCartDiscount(p.id, 'discount_type', e.target.value || null)}>
                                <option value="">No discount</option>
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed per unit (Rs.)</option>
                              </select>
                              <input aria-label={\`\${p.name} discount value\`} type="number" min="0" step="0.01" placeholder="Discount value" value={p.discount_value ?? ''} disabled={!p.discount_type} onChange={e => updateCartDiscount(p.id, 'discount_value', e.target.value)} style={{ width: '125px' }} />
                            </div>
                            {itemDiscount > 0 && <small style={{ color: '#15803d' }}>Discount: -{money(itemDiscount)} · Net: {money(gross - itemDiscount)}</small>}
                          </span>
                          <div className="qty">
                            <button onClick={() => changeQty(p.id, -1)}><Minus size={14} /></button>
                            {p.qty}
                            <button onClick={() => changeQty(p.id, 1)}><Plus size={14} /></button>
                          </div>
                          <b>{money(Math.max(0, gross - itemDiscount))}</b>
                        </div>
                      );
                    })}`,
  'customer cart discount controls'
);

replaceOnce(
`                        {(o.order_items || []).map(i => (
                          <small key={i.id}>
                            {i.product_name} × {i.quantity} — {money(i.line_total)}
                            <br />
                          </small>
                        ))}`,
`                        {(o.order_items || []).map(i => {
                          const itemDiscount = Math.max(0, Number(i.discount_amount || 0));
                          return (
                            <small key={i.id}>
                              {i.product_name} × {i.quantity} — {money(Math.max(0, Number(i.line_total || 0) - itemDiscount))}
                              {itemDiscount > 0 ? \` (discount -\${money(itemDiscount)})\` : ''}
                              <br />
                            </small>
                          );
                        })}`,
  'admin order item display'
);

replaceOnce(
`                    <th style={{ padding: '10px 8px', borderBottom: '1px solid #eadde2' }}>Gross Product Sales</th>`,
`                    <th style={{ padding: '10px 8px', borderBottom: '1px solid #eadde2' }}>Net Product Sales</th>`,
  'best sellers heading'
);

replaceOnce(
`                    Reports exclude cancelled orders. Net sales are product sales after discounts. Product cost is deducted to calculate actual profit. Delivery fees are not included.`,
`                    Reports exclude cancelled orders. Net sales subtract item-level and older order-level discounts. Product cost is deducted to calculate actual profit. Delivery fees are not included.`,
  'report explanation'
);

fs.writeFileSync(file, code, 'utf8');
console.log('SUCCESS: src/App.jsx updated with per-item discounts and Apply to All.');
console.log('Fixed discounts are applied per unit. Existing stock/order logic is preserved.');
