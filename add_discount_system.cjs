const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.jsx');

if (!fs.existsSync(appPath)) {
  console.error('ERROR: src/App.jsx was not found. Open the Glamour_Store_Starter project folder first.');
  process.exit(1);
}

let code = fs.readFileSync(appPath, 'utf8');
const original = code;

function replaceOnce(search, replacement, label) {
  const first = code.indexOf(search);
  if (first === -1) throw new Error(`Could not find the section: ${label}`);
  if (code.indexOf(search, first + search.length) !== -1) {
    throw new Error(`Found more than one matching section: ${label}`);
  }
  code = code.slice(0, first) + replacement + code.slice(first + search.length);
}

try {
  // Add discount state next to existing product/cart state.
  replaceOnce(
    "  const [products, setProducts] = useState([]);\n",
    "  const [products, setProducts] = useState([]);\n" +
    "  const [discounts, setDiscounts] = useState([]);\n" +
    "  const [editingDiscount, setEditingDiscount] = useState(null);\n" +
    "  const [discountForm, setDiscountForm] = useState({ name: '', discount_type: 'percentage', discount_value: '' });\n",
    'discount state'
  );

  // Add discount calculations after cart and manual subtotals.
  replaceOnce(
    "  const deliveryFee = DELIVERY[form.delivery];\n  const total = subtotal + deliveryFee;\n",
    "  const activeDiscount = discounts.find(d => d.active) || null;\n" +
    "  function calculateDiscount(amount) {\n" +
    "    if (!activeDiscount || Number(amount) <= 0) return 0;\n" +
    "    const value = Number(activeDiscount.discount_value || 0);\n" +
    "    if (activeDiscount.discount_type === 'percentage') return Math.min(Number(amount), Number(amount) * value / 100);\n" +
    "    return Math.min(Number(amount), value);\n" +
    "  }\n" +
    "  const discountAmount = calculateDiscount(subtotal);\n" +
    "  const deliveryFee = DELIVERY[form.delivery];\n" +
    "  const total = Math.max(0, subtotal - discountAmount + deliveryFee);\n",
    'customer discount calculation'
  );

  replaceOnce(
    "  const manualDeliveryFee = DELIVERY[manualForm.delivery];\n  const manualTotal = manualSubtotal + manualDeliveryFee;\n",
    "  const manualDiscountAmount = calculateDiscount(manualSubtotal);\n" +
    "  const manualDeliveryFee = DELIVERY[manualForm.delivery];\n" +
    "  const manualTotal = Math.max(0, manualSubtotal - manualDiscountAmount + manualDeliveryFee);\n",
    'manual discount calculation'
  );

  // Add discount loader and management actions before loadProducts.
  replaceOnce(
    "  async function loadProducts() {\n",
    "  async function loadDiscounts() {\n" +
    "    if (!supabase) return;\n" +
    "    const { data, error } = await supabase.from('discounts').select('*').order('created_at', { ascending: false });\n" +
    "    if (error) { setNotice(error.message); return; }\n" +
    "    setDiscounts(data || []);\n" +
    "  }\n\n" +
    "  async function saveDiscount(e) {\n" +
    "    e.preventDefault();\n" +
    "    if (!discountForm.name.trim() || !(Number(discountForm.discount_value) > 0)) { setNotice('Enter a discount name and a value greater than zero.'); return; }\n" +
    "    setLoading(true); setNotice('');\n" +
    "    try {\n" +
    "      const payload = { name: discountForm.name.trim(), discount_type: discountForm.discount_type, discount_value: Number(discountForm.discount_value), active: editingDiscount ? !!editingDiscount.active : false };\n" +
    "      const result = editingDiscount\n" +
    "        ? await supabase.from('discounts').update(payload).eq('id', editingDiscount.id)\n" +
    "        : await supabase.from('discounts').insert(payload);\n" +
    "      if (result.error) throw result.error;\n" +
    "      setDiscountForm({ name: '', discount_type: 'percentage', discount_value: '' }); setEditingDiscount(null);\n" +
    "      await loadDiscounts(); setNotice('Discount saved successfully.');\n" +
    "    } catch (err) { setNotice(err.message || 'Could not save discount.'); }\n" +
    "    finally { setLoading(false); }\n" +
    "  }\n\n" +
    "  async function toggleDiscount(discount) {\n" +
    "    setLoading(true); setNotice('');\n" +
    "    try {\n" +
    "      if (!discount.active) {\n" +
    "        const { error: offError } = await supabase.from('discounts').update({ active: false }).eq('active', true);\n" +
    "        if (offError) throw offError;\n" +
    "      }\n" +
    "      const { error } = await supabase.from('discounts').update({ active: !discount.active }).eq('id', discount.id);\n" +
    "      if (error) throw error;\n" +
    "      await loadDiscounts(); setNotice(discount.active ? 'Discount turned off.' : 'Discount activated.');\n" +
    "    } catch (err) { setNotice(err.message || 'Could not update discount.'); }\n" +
    "    finally { setLoading(false); }\n" +
    "  }\n\n" +
    "  async function deleteDiscount(id) {\n" +
    "    if (!confirm('Delete this discount?')) return;\n" +
    "    const { error } = await supabase.from('discounts').delete().eq('id', id);\n" +
    "    if (error) setNotice(error.message); else { await loadDiscounts(); setNotice('Discount deleted.'); }\n" +
    "  }\n\n" +
    "  async function loadProducts() {\n",
    'discount functions'
  );

  // Load offers on startup and after owner changes.
  replaceOnce(
    "  useEffect(() => {\n    loadProducts();\n",
    "  useEffect(() => {\n    loadProducts();\n    loadDiscounts();\n",
    'initial discount load'
  );

  replaceOnce(
    "  useEffect(() => {\n    if (owner) loadOrders();\n  }, [owner]);\n",
    "  useEffect(() => {\n    if (owner) { loadOrders(); loadDiscounts(); }\n  }, [owner]);\n",
    'owner discount load'
  );

  // Include discount fields in customer order payload.
  replaceOnce(
    "          subtotal,\n          total,\n          payment_status: form.payment === 'cod'\n",
    "          subtotal,\n          discount_name: discountAmount > 0 ? activeDiscount?.name : null,\n          discount_type: discountAmount > 0 ? activeDiscount?.discount_type : null,\n          discount_value: discountAmount > 0 ? Number(activeDiscount?.discount_value || 0) : 0,\n          discount_amount: discountAmount,\n          total,\n          payment_status: form.payment === 'cod'\n",
    'customer order discount fields'
  );

  // Include discount fields in manual order payload.
  replaceOnce(
    "          subtotal: manualSubtotal,\n          total: manualTotal,\n          payment_status: manualForm.payment === 'cod'\n",
    "          subtotal: manualSubtotal,\n          discount_name: manualDiscountAmount > 0 ? activeDiscount?.name : null,\n          discount_type: manualDiscountAmount > 0 ? activeDiscount?.discount_type : null,\n          discount_value: manualDiscountAmount > 0 ? Number(activeDiscount?.discount_value || 0) : 0,\n          discount_amount: manualDiscountAmount,\n          total: manualTotal,\n          payment_status: manualForm.payment === 'cod'\n",
    'manual order discount fields'
  );

  // Add discount tab button.
  replaceOnce(
    "                <button\n                  className={adminTab === 'reports' ? 'primary' : 'secondary'}\n",
    "                <button\n                  className={adminTab === 'discounts' ? 'primary' : 'secondary'}\n                  onClick={() => setAdminTab('discounts')}\n                >\n                  <TrendingUp size={16} /> Discounts\n                </button>\n                <button\n                  className={adminTab === 'reports' ? 'primary' : 'secondary'}\n",
    'discount admin tab'
  );

  // Add discount management panel before reports.
  replaceOnce(
    "              {adminTab === 'reports' && (\n",
    "              {adminTab === 'discounts' && (\n" +
    "                <div className=\"panel\">\n" +
    "                  <h3>Discount offers</h3>\n" +
    "                  <p className=\"muted\">Create a percentage or fixed-value offer. Only one offer can be active at a time.</p>\n" +
    "                  <form className=\"productform\" onSubmit={saveDiscount}>\n" +
    "                    <input required placeholder=\"Discount name\" value={discountForm.name} onChange={e => setDiscountForm({ ...discountForm, name: e.target.value })} />\n" +
    "                    <select value={discountForm.discount_type} onChange={e => setDiscountForm({ ...discountForm, discount_type: e.target.value })}>\n" +
    "                      <option value=\"percentage\">Percentage (%)</option><option value=\"fixed\">Fixed amount (Rs.)</option>\n" +
    "                    </select>\n" +
    "                    <input required type=\"number\" min=\"0.01\" step=\"0.01\" placeholder={discountForm.discount_type === 'percentage' ? 'Discount percentage' : 'Discount amount (Rs.)'} value={discountForm.discount_value} onChange={e => setDiscountForm({ ...discountForm, discount_value: e.target.value })} />\n" +
    "                    <button className=\"primary\" disabled={loading}>{editingDiscount ? 'Update discount' : 'Save discount'}</button>\n" +
    "                    {editingDiscount && <button type=\"button\" className=\"secondary\" onClick={() => { setEditingDiscount(null); setDiscountForm({ name: '', discount_type: 'percentage', discount_value: '' }); }}>Cancel edit</button>}\n" +
    "                  </form>\n" +
    "                  {discounts.length === 0 ? <p className=\"muted\">No discounts created yet.</p> : discounts.map(d => (\n" +
    "                    <div className=\"manage-row\" key={d.id}>\n" +
    "                      <span style={{ flex: 1 }}><b>{d.name}</b><small>{d.discount_type === 'percentage' ? `${d.discount_value}% off` : `${money(d.discount_value)} off`}</small></span>\n" +
    "                      <b style={{ color: d.active ? '#15803d' : '#777' }}>{d.active ? 'ACTIVE' : 'OFF'}</b>\n" +
    "                      <button type=\"button\" className=\"secondary\" disabled={loading} onClick={() => toggleDiscount(d)}>{d.active ? 'Turn off' : 'Activate'}</button>\n" +
    "                      <button type=\"button\" className=\"secondary\" onClick={() => { setEditingDiscount(d); setDiscountForm({ name: d.name || '', discount_type: d.discount_type || 'percentage', discount_value: String(d.discount_value ?? '') }); }}>Edit</button>\n" +
    "                      <button type=\"button\" className=\"textdanger\" onClick={() => deleteDiscount(d.id)}>Delete</button>\n" +
    "                    </div>\n" +
    "                  ))}\n" +
    "                </div>\n" +
    "              )}\n\n" +
    "              {adminTab === 'reports' && (\n",
    'discount admin panel'
  );

  // Show discount in admin order list.
  replaceOnce(
    "                        <p>Total: <b>{money(o.total)}</b> · {o.payment_status}</p>\n",
    "                        {Number(o.discount_amount || 0) > 0 && <p>Discount: <b>{o.discount_name || 'Offer'} (-{money(o.discount_amount)})</b></p>}\n" +
    "                        <p>Total: <b>{money(o.total)}</b> · {o.payment_status}</p>\n",
    'order list discount display'
  );

  // Show discount in manual order totals.
  replaceOnce(
    "                      <span>{manualForm.delivery === 'post' ? 'Post Office' : 'Courier'}</span>\n                      <b>{money(manualDeliveryFee)}</b>\n",
    "                      <span>Items</span><b>{money(manualSubtotal)}</b>\n" +
    "                      {manualDiscountAmount > 0 && <><span>{activeDiscount?.name || 'Discount'}</span><b style={{ color: '#15803d' }}>-{money(manualDiscountAmount)}</b></>}\n" +
    "                      <span>{manualForm.delivery === 'post' ? 'Post Office' : 'Courier'}</span>\n                      <b>{money(manualDeliveryFee)}</b>\n",
    'manual totals discount display'
  );

  // Show discount in customer checkout totals.
  replaceOnce(
    "                    <span>{form.delivery === 'post' ? 'Post Office' : 'Courier'}</span>\n                    <b>{money(deliveryFee)}</b>\n",
    "                    {discountAmount > 0 && <><span>{activeDiscount?.name || 'Discount'}</span><b style={{ color: '#15803d' }}>-{money(discountAmount)}</b></>}\n" +
    "                    <span>{form.delivery === 'post' ? 'Post Office' : 'Courier'}</span>\n                    <b>{money(deliveryFee)}</b>\n",
    'checkout totals discount display'
  );

  // Add discount line to receipt and WhatsApp.
  replaceOnce(
    "  <section class=\"totals\"><div class=\"totalrow\"><span>Delivery (${escapeReceiptHtml(deliveryName)})</span><b>${money(order.delivery_fee)}</b></div>\n",
    "  <section class=\"totals\">${Number(order.discount_amount || 0) > 0 ? `<div class=\"totalrow\"><span>Discount (${escapeReceiptHtml(order.discount_name || 'Offer')})</span><b>-${money(order.discount_amount)}</b></div>` : ''}<div class=\"totalrow\"><span>Delivery (${escapeReceiptHtml(deliveryName)})</span><b>${money(order.delivery_fee)}</b></div>\n",
    'receipt discount line'
  );

  replaceOnce(
    "    `Delivery: ${deliveryName} (${money(order.delivery_fee)})`,\n",
    "    ...(Number(order.discount_amount || 0) > 0 ? [`Discount: ${order.discount_name || 'Offer'} (-${money(order.discount_amount)})`] : []),\n" +
    "    `Delivery: ${deliveryName} (${money(order.delivery_fee)})`,\n",
    'WhatsApp discount line'
  );

  if (code === original) throw new Error('No changes were made.');
  const backupPath = appPath + '.before-discounts.bak';
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(appPath, code, 'utf8');

  console.log('SUCCESS: Discount system added to src/App.jsx');
  console.log(`Backup saved as: ${path.basename(backupPath)}`);
  console.log('Next run: npm run build');
} catch (error) {
  console.error('UPDATE STOPPED: ' + error.message);
  console.error('Your App.jsx was NOT changed. Send this error message to ChatGPT.');
  process.exit(1);
}
