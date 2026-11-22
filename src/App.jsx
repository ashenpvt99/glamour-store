
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import {
  ShoppingBag, Search, ShoppingCart, Store, Package,
  ClipboardList, LogOut, Plus, Minus, X, Truck,
  Mail, Banknote, CreditCard, ImagePlus, Trash2, Edit2,
  AlertTriangle, PackageX, TrendingUp, CalendarDays,
  Clock, CheckCircle
} from 'lucide-react';

const money = n => `Rs. ${Number(n || 0).toLocaleString('en-LK')}`;

function formatOrderDateTime(value) {
  if (!value) return { date: 'Not available', time: 'Not available' };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: 'Not available', time: 'Not available' };
  }

  const options = { timeZone: 'Asia/Colombo' };
  return {
    date: date.toLocaleDateString('en-LK', {
      ...options,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }),
    time: date.toLocaleTimeString('en-LK', {
      ...options,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  };
}

const DELIVERY = { post: 250, courier: 500 };
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LOW_STOCK_LIMIT = 2;

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
    return Math.min(gross, value);
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

function escapeReceiptHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function printOrderReceipt(order) {
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    alert('Please allow pop-ups to print or save the receipt.');
    return;
  }

  const dateTime = formatOrderDateTime(order.created_at);
  const items = (order.order_items || []).map(item => {
    const gross = Number(item.line_total || 0);
    const discount = Math.max(0, Number(item.discount_amount || 0));
    return `
    <tr>
      <td>${escapeReceiptHtml(item.product_name || 'Product')}</td>
      <td class="center">${Number(item.quantity || 0)}</td>
      <td class="right">${money(gross)}${discount > 0 ? `<br><small>Discount: -${money(discount)}</small><br><b>Net: ${money(Math.max(0, gross - discount))}</b>` : ''}</td>
    </tr>
  `;
  }).join('');
  const itemDiscountTotal = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount_amount || 0)), 0);
  const orderNumber = order.order_code || order.id?.slice(0, 8).toUpperCase() || '';
  const deliveryName = order.delivery_method === 'post' ? 'Post Office' : 'Courier';
  const paymentName = order.payment_method === 'cod' ? 'Cash on Delivery' : 'Bank Transfer';

  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Glamour Store Receipt - ${escapeReceiptHtml(orderNumber)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#222;margin:0;padding:32px}
  .receipt{max-width:720px;margin:auto}.brand{text-align:center;border-bottom:2px solid #945c70;padding-bottom:18px}
  h1{color:#945c70;margin:0 0 6px;font-size:30px}.muted{color:#666;font-size:13px}
  .meta{display:flex;justify-content:space-between;gap:20px;margin:22px 0}.meta p{margin:6px 0}
  table{width:100%;border-collapse:collapse;margin:18px 0}th,td{padding:11px 8px;border-bottom:1px solid #ddd;text-align:left}
  th{background:#f7f0f3}.center{text-align:center}.right{text-align:right}
  .totals{margin-left:auto;width:min(100%,300px)}.totalrow{display:flex;justify-content:space-between;padding:7px 0}
  .grand{font-size:19px;font-weight:bold;border-top:2px solid #945c70;margin-top:6px;padding-top:12px}
  .footer{text-align:center;border-top:1px solid #ddd;margin-top:30px;padding-top:18px;color:#666;font-size:13px}
  @media print{body{padding:10mm}.no-print{display:none}}
</style></head><body><main class="receipt">
  <header class="brand"><h1>Glamour Store</h1><div class="muted">Customer Receipt</div></header>
  <section class="meta"><div><p><b>Receipt No:</b> ${escapeReceiptHtml(orderNumber)}</p><p><b>Date:</b> ${escapeReceiptHtml(dateTime.date)}</p><p><b>Time:</b> ${escapeReceiptHtml(dateTime.time)}</p></div>
  <div><p><b>Customer:</b> ${escapeReceiptHtml(order.customer_name)}</p><p><b>Phone:</b> ${escapeReceiptHtml(order.phone)}</p><p><b>Address:</b> ${escapeReceiptHtml(order.address)}</p></div></section>
  <table><thead><tr><th>Product</th><th class="center">Qty</th><th class="right">Amount</th></tr></thead><tbody>${items}</tbody></table>
  <section class="totals">${itemDiscountTotal > 0 ? `<div class="totalrow"><span>Item discounts</span><b>-${money(itemDiscountTotal)}</b></div>` : ''}${Number(order.discount_amount || 0) > 0 ? `<div class="totalrow"><span>Discount (${escapeReceiptHtml(order.discount_name || 'Offer')})</span><b>-${money(order.discount_amount)}</b></div>` : ''}<div class="totalrow"><span>Delivery (${escapeReceiptHtml(deliveryName)})</span><b>${money(order.delivery_fee)}</b></div>
  <div class="totalrow"><span>Payment</span><b>${escapeReceiptHtml(paymentName)}</b></div>
  <div class="totalrow"><span>Payment status</span><b>${escapeReceiptHtml(order.payment_status || 'Pending')}</b></div>
  <div class="totalrow grand"><span>Total</span><span>${money(order.total)}</span></div></section>
  ${order.note ? `<p><b>Note:</b> ${escapeReceiptHtml(order.note)}</p>` : ''}
  <footer class="footer">Thank you for shopping with Glamour Store!</footer>
  <p class="no-print" style="text-align:center;margin-top:24px"><button onclick="window.print()">Print / Save as PDF</button></p>
</main><script>window.onload=()=>window.print();</script></body></html>`);
  printWindow.document.close();
}

function openOrderWhatsApp(order) {
  let phone = String(order.phone || '').replace(/\D/g, '');

  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = `94${phone.slice(1)}`;
  else if (!phone.startsWith('94')) phone = `94${phone}`;

  if (!/^94\d{9}$/.test(phone)) {
    alert('Please check the customer phone number. Use a valid Sri Lankan number.');
    return;
  }

  const orderNumber = order.order_code || order.id?.slice(0, 8).toUpperCase() || '';
  const items = (order.order_items || []).map(item => {
    const gross = Number(item.line_total || 0);
    const discount = Math.max(0, Number(item.discount_amount || 0));
    return `• ${item.product_name} × ${item.quantity} - ${money(Math.max(0, gross - discount))}${discount > 0 ? ` (discount ${money(discount)})` : ''}`;
  }).join('\n');
  const itemDiscountTotal = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount_amount || 0)), 0);
  const deliveryName = order.delivery_method === 'post' ? 'Post Office' : 'Courier';
  const paymentName = order.payment_method === 'cod' ? 'Cash on Delivery' : 'Bank Transfer';

  const message = [
    `Hello ${order.customer_name || 'Customer'}!`,
    '',
    'Thank you for shopping with Glamour Store. Your order has been received successfully.',
    '',
    `Order ID: ${orderNumber}`,
    'Items:',
    items || 'Order items',
    '',
    ...(itemDiscountTotal > 0 ? [`Item discounts: -${money(itemDiscountTotal)}`] : []),
    ...(Number(order.discount_amount || 0) > 0 ? [`Discount: ${order.discount_name || 'Offer'} (-${money(order.discount_amount)})`] : []),
    `Delivery: ${deliveryName} (${money(order.delivery_fee)})`,
    `Payment: ${paymentName}`,
    `Order Total: ${money(order.total)}`,
    `Current Status: ${order.status || 'New'}`,
    '',
    'Thank you! ❤️',
    'Glamour Store'
  ].join('\n');

  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}

export default function App() {
  const [tab, setTab] = useState(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/admin' ? 'dashboard' : path === '/tracking' ? 'tracking' : 'shop';
  });
  const [adminTab, setAdminTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [discountForm, setDiscountForm] = useState({ name: '', product_id: '', discount_type: 'percentage', discount_value: '' });
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [owner, setOwner] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingPhone, setTrackingPhone] = useState('');
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', phone: '', address: '',
    delivery: 'post', payment: 'cod', note: ''
  });

  const [newProduct, setNewProduct] = useState({
    name: '', description: '', price: '', cost_price: '', stock: ''
  });

  const [manualForm, setManualForm] = useState({
    name: '', phone: '', address: '',
    delivery: 'post', payment: 'cod', note: ''
  });

  const [manualProductId, setManualProductId] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualItems, setManualItems] = useState([]);

  const configured = !!supabase;

  function navigateTo(nextTab) {
    const nextPath = nextTab === 'dashboard' ? '/admin' : nextTab === 'tracking' ? '/tracking' : '/';
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setTab(nextTab);
    setNotice('');
    if (nextTab === 'shop') setShowCheckout(false);
  }

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      setTab(path === '/admin' ? 'dashboard' : path === '/tracking' ? 'tracking' : 'shop');
      setNotice('');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const activeDiscount = discounts.find(d => d.active) || null;
  const getDiscountForProduct = productId => activeDiscount && (!activeDiscount.product_id || String(activeDiscount.product_id) === String(productId)) ? activeDiscount : null;
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const discountAmount = cart.reduce((sum, item) => sum + calculateLineDiscount(item), 0);
  const deliveryFee = DELIVERY[form.delivery];
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);

  const manualSubtotal = manualItems.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const manualDiscountAmount = manualItems.reduce((sum, item) => sum + calculateLineDiscount(item), 0);
  const manualDeliveryFee = DELIVERY[manualForm.delivery];
  const manualTotal = Math.max(0, manualSubtotal - manualDiscountAmount + manualDeliveryFee);

  const lowStockProducts = products.filter(
    p => Number(p.stock) > 0 && Number(p.stock) <= LOW_STOCK_LIMIT
  );

  const outOfStockProducts = products.filter(
    p => Number(p.stock) <= 0
  );

  const lowStockCount = lowStockProducts.length;
  const outOfStockCount = outOfStockProducts.length;

  const totalSales = orders
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const todayOrders = orders.filter(o => {
    if (!o.created_at) return false;
    const orderDate = new Date(o.created_at);
    return (
      !Number.isNaN(orderDate.getTime()) &&
      orderDate >= todayStart &&
      orderDate < tomorrowStart
    );
  });

  const pendingOrders = orders.filter(
    o => o.status !== 'Delivered' && o.status !== 'Cancelled'
  );

  const deliveredOrders = orders.filter(
    o => o.status === 'Delivered'
  );

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
  );
  const netSales = Math.max(0, totalProductRevenue - totalDiscounts);
  const totalProductCost = reportItems.reduce(
    (sum, item) => sum + Number(item.unit_cost || 0) * Number(item.quantity || 0), 0
  );
  const actualProfit = netSales - totalProductCost;
  const itemsWithoutCost = reportItems.filter(item => Number(item.unit_cost || 0) <= 0).length;

  function colomboMonthParts(value) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo', year: 'numeric', month: 'short'
    }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value || '';
    return { key: `${get('year')}-${get('month')}`, label: `${get('month')} ${get('year')}` };
  }

  const monthlySales = (() => {
    const totals = new Map();
    const now = new Date();
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const month = colomboMonthParts(date);
      totals.set(month.key, { ...month, revenue: 0, orders: 0 });
    }

    reportOrders.forEach(order => {
      if (!order.created_at) return;
      const month = colomboMonthParts(order.created_at);
      if (!totals.has(month.key)) return;
      const entry = totals.get(month.key);
      const grossOrderSales = (order.order_items || []).reduce(
        (sum, item) => sum + Number(item.line_total || 0), 0
      );
      const itemDiscounts = (order.order_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount_amount || 0)), 0);
      entry.revenue += Math.max(0, grossOrderSales - itemDiscounts - Math.max(0, Number(order.discount_amount || 0)));
      entry.orders += 1;
    });
    return Array.from(totals.values());
  })();

  const bestSellingProducts = (() => {
    const totals = new Map();
    reportItems.forEach(item => {
      const key = item.product_id || item.product_name;
      const current = totals.get(key) || {
        name: item.product_name || 'Product', quantity: 0, revenue: 0
      };
      current.quantity += Number(item.quantity || 0);
      current.revenue += Math.max(0, Number(item.line_total || 0) - Number(item.discount_amount || 0));
      totals.set(key, current);
    });
    return Array.from(totals.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 5);
  })();
  const maxMonthlySales = Math.max(1, ...monthlySales.map(month => month.revenue));

  async function loadDiscounts() {
    if (!supabase) return;
    const { data, error } = await supabase.from('discounts').select('*').order('created_at', { ascending: false });
    if (error) { setNotice(error.message); return; }
    setDiscounts(data || []);
  }

  async function saveDiscount(e) {
    e.preventDefault();
    if (!discountForm.name.trim() || !(Number(discountForm.discount_value) > 0)) { setNotice('Enter a discount name and a value greater than zero.'); return; }
    if (discountForm.discount_type === 'percentage' && Number(discountForm.discount_value) > 100) { setNotice('Percentage discount cannot exceed 100%.'); return; }
    setLoading(true); setNotice('');
    try {
      const payload = { name: discountForm.name.trim(), product_id: discountForm.product_id || null, discount_type: discountForm.discount_type, discount_value: Number(discountForm.discount_value), active: editingDiscount ? !!editingDiscount.active : false };
      const result = editingDiscount
        ? await supabase.from('discounts').update(payload).eq('id', editingDiscount.id)
        : await supabase.from('discounts').insert(payload);
      if (result.error) throw result.error;
      setDiscountForm({ name: '', product_id: '', discount_type: 'percentage', discount_value: '' }); setEditingDiscount(null);
      await loadDiscounts(); setNotice('Discount saved successfully.');
    } catch (err) { setNotice(err.message || 'Could not save discount.'); }
    finally { setLoading(false); }
  }

  async function toggleDiscount(discount) {
    setLoading(true); setNotice('');
    try {
      if (!discount.active) {
        const { error: offError } = await supabase.from('discounts').update({ active: false }).eq('active', true);
        if (offError) throw offError;
      }
      const { error } = await supabase.from('discounts').update({ active: !discount.active }).eq('id', discount.id);
      if (error) throw error;
      await loadDiscounts(); setNotice(discount.active ? 'Discount turned off.' : 'Discount activated.');
    } catch (err) { setNotice(err.message || 'Could not update discount.'); }
    finally { setLoading(false); }
  }

  async function deleteDiscount(id) {
    if (!confirm('Delete this discount?')) return;
    const { error } = await supabase.from('discounts').delete().eq('id', id);
    if (error) setNotice(error.message); else { await loadDiscounts(); setNotice('Discount deleted.'); }
  }

  async function loadProducts() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (error) setNotice(error.message);
    else setProducts(data || []);
  }

  async function loadOrders() {
    if (!supabase || !owner) return;
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });
    if (error) setNotice(error.message);
    else setOrders(data || []);
  }

  useEffect(() => {
    loadProducts();
    loadDiscounts();

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setOwner(data.session?.user || null);
      });

      const { data: listener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          setOwner(session?.user || null);
          if (event === 'PASSWORD_RECOVERY') {
            setRecoveryMode(true);
            setResetMode(false);
            navigateTo('dashboard');
          }
        }
      );

      return () => listener.subscription.unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (owner) { loadOrders(); loadDiscounts(); }
  }, [owner]);

  // Keep the customer offer updated when the admin changes an offer.
  useEffect(() => {
    if (!supabase) return undefined;

    const refreshDiscounts = () => {
      if (document.visibilityState === 'visible') loadDiscounts();
    };

    const interval = window.setInterval(refreshDiscounts, 30000);
    window.addEventListener('focus', refreshDiscounts);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshDiscounts);
    };
  }, []);

  function addToCart(p) {
    if (Number(p.stock) <= 0) {
      setNotice('This product is out of stock.');
      return;
    }

    setCart(old => {
      const found = old.find(x => x.id === p.id);
      if (found) {
        return old.map(x =>
          x.id === p.id
            ? { ...x, qty: Math.min(x.qty + 1, Number(p.stock)) }
            : x
        );
      }

      return [...old, {
        ...p, qty: 1,
        discount_type: getDiscountForProduct(p.id)?.discount_type || null,
        discount_value: Number(getDiscountForProduct(p.id)?.discount_value || 0)
      }];
    });

    setNotice(`${p.name} added to cart`);
  }

  function changeQty(id, delta) {
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
    setCart(old => old.map(item => getDiscountForProduct(item.id) ? { ...item, discount_type: activeDiscount.discount_type, discount_value: Number(activeDiscount.discount_value || 0) } : item));
    setNotice(activeDiscount.product_id ? `"${activeDiscount.name}" applied to its selected product only.` : `"${activeDiscount.name}" applied to all cart items.`);
  }

  function updateManualDiscount(id, field, value) {
    setManualItems(old => old.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function applyActiveDiscountToManualItems() {
    if (!activeDiscount) return;
    setManualItems(old => old.map(item => getDiscountForProduct(item.id) ? { ...item, discount_type: activeDiscount.discount_type, discount_value: Number(activeDiscount.discount_value || 0) } : item));
    setNotice(activeDiscount.product_id ? `"${activeDiscount.name}" applied to its selected product only.` : `"${activeDiscount.name}" applied to all new-order items.`);
  }

  async function saveOrderWithStock(orderDetails, items) {
    const { data, error } = await supabase.rpc(
      'create_order_with_stock',
      { p_order: orderDetails, p_items: items }
    );
    if (error) throw error;
    const order = data?.order;
    if (!order?.id) {
      throw new Error('Order response was not received. Please check your orders.');
    }
    return order;
  }

  async function placeOrder(e) {
    e.preventDefault();
    if (!supabase) {
      return setNotice('Please connect the free database first. See SETUP_GUIDE.txt.');
    }
    if (!cart.length) return;

    setLoading(true);
    setNotice('');

    try {
      const rows = cart.map(p => ({
        product_id: p.id,
        product_name: p.name,
        quantity: p.qty,
        unit_price: Number(p.price),
        line_total: Number(p.price) * p.qty,
        unit_cost: Number(p.cost_price || 0),
        discount_type: p.discount_type || null,
        discount_value: Number(p.discount_value || 0),
        discount_amount: calculateLineDiscount(p)
      }));

      const order = await saveOrderWithStock(
        {
          customer_name: form.name,
          phone: form.phone,
          address: form.address,
          delivery_method: form.delivery,
          delivery_fee: deliveryFee,
          payment_method: form.payment,
          note: form.note,
          subtotal,
          discount_name: null,
          discount_type: null,
          discount_value: 0,
          discount_amount: 0,
          total,
          payment_status: form.payment === 'cod'
            ? 'Pay on delivery'
            : 'Awaiting bank transfer'
        },
        rows
      );

      setCart([]);
      setShowCheckout(false);
      setForm({
        name: '', phone: '', address: '',
        delivery: 'post', payment: 'cod', note: ''
      });
      await loadProducts();
      setNotice(
        `Order placed! Your order number is ${order.id.slice(0, 8).toUpperCase()}. Stock updated successfully.`
      );
    } catch (err) {
      setNotice(err.message || 'Could not place order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function trackCustomerOrder(e) {
    e.preventDefault();
    if (!supabase) {
      setNotice('Supabase is not connected.');
      return;
    }

    const code = trackingCode.trim().toUpperCase();
    const phone = trackingPhone.trim();

    if (!/^[0-9A-F]{8}$/.test(code)) {
      setTrackingOrder(null);
      setNotice('Please enter the 8-character Order ID shown after checkout.');
      return;
    }

    if (phone.replace(/\D/g, '').length < 9) {
      setTrackingOrder(null);
      setNotice('Please enter a valid phone number.');
      return;
    }

    setTrackingLoading(true);
    setTrackingOrder(null);
    setNotice('');

    try {
      const { data, error } = await supabase.rpc('track_customer_order', {
        p_order_code: code,
        p_phone: phone
      });
      if (error) throw error;
      if (!data?.success) {
        setNotice(data?.message || 'Order not found. Please check your details.');
        return;
      }
      setTrackingOrder(data);
    } catch (err) {
      setNotice(err.message || 'Could not track this order. Please try again.');
    } finally {
      setTrackingLoading(false);
    }
  }

  async function signIn(e) {
    e.preventDefault();
    if (!supabase) {
      return setNotice('Connect Supabase first. See SETUP_GUIDE.txt.');
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword
    });
    if (error) {
      setNotice(error.message);
    } else {
      setNotice('Signed in');
      navigateTo('dashboard');
    }
  }

  async function sendPasswordReset(e) {
    e.preventDefault();
    if (!supabase) return setNotice('Supabase is not connected.');
    if (!loginEmail.trim()) return setNotice('Please enter your owner email first.');
    setLoading(true);
    setNotice('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setNotice('Password reset email sent. Please check your inbox and Spam folder.');
      setResetMode(false);
    } catch (err) {
      setNotice(err.message || 'Could not send password reset email.');
    } finally {
      setLoading(false);
    }
  }

  async function saveRecoveredPassword(e) {
    e.preventDefault();
    if (newPassword.length < 6) return setNotice('Password must contain at least 6 characters.');
    if (newPassword !== confirmPassword) return setNotice('Passwords do not match.');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password changed successfully. Please sign in with your new password.');
      await supabase.auth.signOut();
      setOwner(null);
    } catch (err) {
      setNotice(err.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  }

  async function changeOwnerPassword(e) {
    e.preventDefault();
    if (!currentPassword || !newPassword) return setNotice('Please fill in all password fields.');
    if (newPassword.length < 6) return setNotice('New password must contain at least 6 characters.');
    if (newPassword !== confirmPassword) return setNotice('New passwords do not match.');
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: owner.email,
        password: currentPassword
      });
      if (verifyError) throw new Error('Current password is incorrect.');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setNotice('Owner password changed successfully.');
    } catch (err) {
      setNotice(err.message || 'Could not change password.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOwner(null);
    navigateTo('shop');
  }

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedImage(null);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(null);
      e.target.value = '';
      setNotice('Please select a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setSelectedImage(null);
      e.target.value = '';
      setNotice('Image size must be 5 MB or less.');
      return;
    }
    setSelectedImage(file);
    setNotice(`Image selected: ${file.name}`);
  }

  async function uploadProductImage(file) {
    if (!file) return null;
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
      ? extension
      : 'jpg';
    const uniqueName =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `${uniqueName}.${safeExtension}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);
    if (!data?.publicUrl) {
      throw new Error('Could not get the uploaded image URL.');
    }
    return data.publicUrl;
  }

  function resetProductForm() {
    setNewProduct({
      name: '', description: '', price: '', cost_price: '', stock: ''
    });
    setSelectedImage(null);
    setEditingProduct(null);
    const fileInput = document.getElementById('product-image-input');
    if (fileInput) fileInput.value = '';
  }

  function startEditProduct(p) {
    setEditingProduct(p);
    setNewProduct({
      name: p.name || '',
      description: p.description || '',
      price: String(p.price ?? ''),
      cost_price: String(p.cost_price ?? ''),
      stock: String(p.stock ?? '')
    });
    setSelectedImage(null);
    setNotice(`You are now editing "${p.name}".`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function addProduct(e) {
    e.preventDefault();
    if (!supabase) {
      setNotice('Supabase is not connected.');
      return;
    }
    if (!owner) {
      setNotice('Please sign in first.');
      return;
    }
    if (!newProduct.name.trim()) {
      setNotice('Please enter a product name.');
      return;
    }
    if (newProduct.price === '' || !Number.isFinite(Number(newProduct.price)) || Number(newProduct.price) < 0) {
      setNotice('Please enter a valid selling price.');
      return;
    }
    if (newProduct.cost_price === '' || !Number.isFinite(Number(newProduct.cost_price)) || Number(newProduct.cost_price) < 0) {
      setNotice('Please enter a valid product cost price.');
      return;
    }
    if (
      newProduct.stock === '' ||
      Number(newProduct.stock) < 0 ||
      !Number.isInteger(Number(newProduct.stock))
    ) {
      setNotice('Please enter a valid whole-number stock quantity.');
      return;
    }

    setLoading(true);
    setNotice('');
    try {
      let imageUrl = editingProduct?.image_url || null;
      if (selectedImage) {
        setNotice('Uploading product image...');
        imageUrl = await uploadProductImage(selectedImage);
      }

      if (editingProduct) {
        setNotice('Updating product...');
        const { error } = await supabase
          .from('products')
          .update({
            name: newProduct.name.trim(),
            description: newProduct.description,
            price: Number(newProduct.price),
            cost_price: Number(newProduct.cost_price),
            stock: Number(newProduct.stock),
            image_url: imageUrl
          })
          .eq('id', editingProduct.id);
        if (error) throw error;
        resetProductForm();
        await loadProducts();
        setNotice('Product updated successfully!');
      } else {
        setNotice('Saving product...');
        const { error } = await supabase.from('products').insert({
          name: newProduct.name.trim(),
          description: newProduct.description,
          price: Number(newProduct.price),
          cost_price: Number(newProduct.cost_price),
          stock: Number(newProduct.stock),
          image_url: imageUrl,
          active: true
        });
        if (error) throw error;
        resetProductForm();
        await loadProducts();
        setNotice('Product added successfully!');
      }
    } catch (err) {
      setNotice(err.message || 'Could not save product.');
    } finally {
      setLoading(false);
    }
  }

  async function updateOrder(id, status) {
    if (!supabase) return;
    setLoading(true);
    setNotice('');
    try {
      const { data, error } = await supabase.rpc(
        'update_order_status_with_stock',
        { p_order_id: id, p_status: status }
      );
      if (error) throw error;
      if (!data?.success) throw new Error('Could not update order status.');
      await loadOrders();
      if (status === 'Cancelled') {
        await loadProducts();
        setNotice('Order cancelled successfully! Product stock has been restored.');
      } else {
        setNotice(`Order status updated to ${status}.`);
      }
    } catch (err) {
      setNotice(err.message || 'Could not update order.');
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }

  async function updateStock(id, stock) {
    const value = Number(stock);
    if (!Number.isInteger(value) || value < 0) return;
    const { error } = await supabase
      .from('products')
      .update({ stock: value })
      .eq('id', id);
    if (error) setNotice(error.message);
    else {
      await loadProducts();
      setNotice('Stock updated successfully.');
    }
  }

  async function deactivateProduct(id) {
    if (!confirm('Remove this product from the customer shop?')) return;
    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', id);
    if (error) setNotice(error.message);
    else {
      setNotice('Product removed');
      await loadProducts();
    }
  }

  function addManualItem() {
    const selected = products.find(
      p => String(p.id) === String(manualProductId)
    );
    if (!selected) {
      setNotice('Please select a product.');
      return;
    }
    const qty = Number(manualQty);
    if (!qty || qty < 1 || !Number.isInteger(qty)) {
      setNotice('Please enter a valid whole-number quantity.');
      return;
    }
    const existing = manualItems.find(x => x.id === selected.id);
    const alreadyAdded = existing ? existing.qty : 0;
    if (alreadyAdded + qty > Number(selected.stock)) {
      setNotice(`Only ${selected.stock} units available for ${selected.name}.`);
      return;
    }

    if (existing) {
      setManualItems(old =>
        old.map(x => x.id === selected.id ? { ...x, qty: x.qty + qty } : x)
      );
    } else {
      setManualItems(old => [
        ...old,
        {
          id: selected.id,
          name: selected.name,
          price: Number(selected.price),
          cost_price: Number(selected.cost_price || 0),
          stock: Number(selected.stock),
          qty,
          discount_type: getDiscountForProduct(selected.id)?.discount_type || null,
          discount_value: Number(getDiscountForProduct(selected.id)?.discount_value || 0)
        }
      ]);
    }
    setManualProductId('');
    setManualQty(1);
    setNotice('Product added to new order.');
  }

  function removeManualItem(id) {
    setManualItems(old => old.filter(x => x.id !== id));
  }

  async function createManualOrder(e) {
    e.preventDefault();
    if (!supabase) {
      setNotice('Supabase is not connected.');
      return;
    }
    if (manualItems.length === 0) {
      setNotice('Please add at least one product.');
      return;
    }

    setLoading(true);
    setNotice('');
    try {
      const rows = manualItems.map(p => ({
        product_id: p.id,
        product_name: p.name,
        quantity: p.qty,
        unit_price: Number(p.price),
        line_total: Number(p.price) * p.qty,
        unit_cost: Number(p.cost_price || 0),
        discount_type: p.discount_type || null,
        discount_value: Number(p.discount_value || 0),
        discount_amount: calculateLineDiscount(p)
      }));

      const order = await saveOrderWithStock(
        {
          customer_name: manualForm.name,
          phone: manualForm.phone,
          address: manualForm.address,
          delivery_method: manualForm.delivery,
          delivery_fee: manualDeliveryFee,
          payment_method: manualForm.payment,
          note: manualForm.note,
          subtotal: manualSubtotal,
          discount_name: null,
          discount_type: null,
          discount_value: 0,
          discount_amount: 0,
          total: manualTotal,
          payment_status: manualForm.payment === 'cod'
            ? 'Pay on delivery'
            : 'Awaiting bank transfer'
        },
        rows
      );

      setManualForm({
        name: '', phone: '', address: '',
        delivery: 'post', payment: 'cod', note: ''
      });
      setManualItems([]);
      setManualProductId('');
      setManualQty(1);
      await loadProducts();
      await loadOrders();
      setAdminTab('orders');
      setNotice(
        `New order created successfully! Order number: ${order.id.slice(0, 8).toUpperCase()}. Stock updated successfully.`
      );
    } catch (err) {
      setNotice(err.message || 'Could not create order.');
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(
    () => products.filter(p =>
      `${p.name} ${p.description || ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ),
    [products, search]
  );

  const cartCount = cart.reduce((s, x) => s + x.qty, 0);

  function stockBadge(stock) {
    const value = Number(stock);
    if (value <= 0) {
      return (
        <span style={{
          display: 'inline-block', background: '#fee2e2', color: '#b91c1c',
          padding: '4px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800
        }}>
          OUT OF STOCK
        </span>
      );
    }
    if (value <= LOW_STOCK_LIMIT) {
      return (
        <span style={{
          display: 'inline-block', background: '#fef3c7', color: '#92400e',
          padding: '4px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800
        }}>
          LOW STOCK
        </span>
      );
    }
    return (
      <span style={{
        display: 'inline-block', background: '#dcfce7', color: '#166534',
        padding: '4px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 800
      }}>
        IN STOCK
      </span>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={e => {
            e.preventDefault();
            navigateTo('shop');
          }}
        >
          <span className="brandmark">G</span>
          <span>
            <b>GLAMOUR STORE</b>
            <small>SHOP WITH LOVE</small>
          </span>
        </a>

        <nav>
          <button
            className={tab === 'shop' ? 'nav active' : 'nav'}
            onClick={() => navigateTo('shop')}
          >
            <Store size={17} /> Shop
          </button>
          <button className="nav cartnav" onClick={() => setShowCheckout(true)}>
            <ShoppingCart size={17} /> Cart <i>{cartCount}</i>
          </button>
          <button
            className={tab === 'tracking' ? 'nav active' : 'nav'}
            onClick={() => { navigateTo('tracking'); setNotice(''); }}
          >
            <Search size={17} /> Track Order
          </button>
          <button
            className={tab === 'dashboard' ? 'nav active' : 'nav'}
            onClick={() => navigateTo('dashboard')}
          >
            <Package size={17} /> Owner
          </button>
        </nav>
      </header>

      {!configured && (
        <div className="setupbanner">
          Setup needed: connect your free Supabase project using the
          instructions in <b>SETUP_GUIDE.txt</b>. This preview is not yet
          accepting live orders.
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')}><X size={16} /></button>
        </div>
      )}

      {tab === 'shop' && (
        <main>
          <section className="hero">
            <div>
              <span className="eyebrow">WELCOME TO</span>
              <h1>Glamour Store</h1>
              <p>Find something lovely, just for you.</p>
              <a href="#products" className="primary">
                Explore products <ShoppingBag size={16} />
              </a>
            </div>
            <div className="hero-art">
              <span>G</span>
              <small>BEAUTY · STYLE · EVERYDAY</small>
            </div>
          </section>

          {/* CUSTOMER DISCOUNT BANNER */}
          {activeDiscount && (
            <section
              className="discount-banner"
              style={{
                margin: '24px auto',
                padding: 'clamp(18px, 4vw, 28px) 16px',
                width: 'calc(100% - 32px)',
                maxWidth: '1100px',
                boxSizing: 'border-box',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #8f3d62, #d77b9d)',
                color: '#fff',
                textAlign: 'center',
                boxShadow: '0 8px 24px rgba(143, 61, 98, 0.18)',
                overflowWrap: 'anywhere'
              }}
            >
              <div style={{ fontSize: '30px', marginBottom: '8px' }}>🎉</div>
              <h2 style={{
                margin: '0 0 8px',
                fontSize: 'clamp(20px, 4vw, 28px)',
                lineHeight: 1.3
              }}>
                {activeDiscount.name}
              </h2>
              <p style={{
                margin: 0,
                fontSize: 'clamp(18px, 4vw, 24px)',
                fontWeight: 800
              }}>
                {activeDiscount.discount_type === 'percentage'
                  ? `${activeDiscount.discount_value}% OFF`
                  : `${money(activeDiscount.discount_value)} OFF`}
              </p>
              <small style={{
                display: 'block',
                marginTop: '9px',
                color: '#fff',
                fontSize: 'clamp(12px, 2.5vw, 14px)'
              }}>
                {activeDiscount.product_id
                  ? `Special offer on ${products.find(p => String(p.id) === String(activeDiscount.product_id))?.name || 'selected product'}`
                  : 'Special offer on all products'}
              </small>
            </section>
          )}

          <section className="section" id="products">
            <div className="sectionhead">
              <div>
                <span className="eyebrow">OUR COLLECTION</span>
                <h2>Shop our products</h2>
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  placeholder="Search products..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
            </div>

            {visible.length === 0 ? (
              <div className="empty">
                <ShoppingBag size={34} />
                <h3>{configured ? 'New products coming soon' : 'Your products will appear here'}</h3>
                <p>Products can be added and updated anytime from the owner dashboard.</p>
              </div>
            ) : (
              <div className="products">
                {visible.map(p => (
                  <article className="product" key={p.id}>
                    <div className="productimage">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} />
                        : <ImagePlus size={32} />}
                    </div>
                    <div className="productbody">
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div style={{ marginBottom: '8px' }}>
                        {stockBadge(p.stock)}
                      </div>
                      <div className="productfoot">
                        <b>{money(p.price)}</b>
                        <button
                          className="add"
                          disabled={p.stock < 1}
                          onClick={() => addToCart(p)}
                        >
                          {p.stock > 0 ? 'Add to cart' : 'Out of stock'}
                        </button>
                      </div>
                      <small>{p.stock} available</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <footer>Glamour Store · Shop with love</footer>
        </main>
      )}

      {tab === 'tracking' && (
        <main className="section dashboard">
          <div className="loginbox">
            <span className="eyebrow">GLAMOUR STORE</span>
            <h2>Track your order</h2>
            <p>Enter the Order ID and the phone number used when placing your order.</p>

            <form onSubmit={trackCustomerOrder}>
              <label>
                Order ID
                <input
                  required
                  maxLength={8}
                  placeholder="Example: A1B2C3D4"
                  value={trackingCode}
                  onChange={e => setTrackingCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8))}
                />
              </label>
              <label>
                Phone number
                <input
                  required
                  type="tel"
                  placeholder="Enter your order phone number"
                  value={trackingPhone}
                  onChange={e => setTrackingPhone(e.target.value)}
                />
              </label>
              <button className="primary full" disabled={trackingLoading}>
                {trackingLoading ? 'Checking order...' : 'Track order'}
              </button>
            </form>

            {trackingOrder && (
              <div className="panel" style={{ marginTop: '22px', textAlign: 'left' }}>
                <span className="eyebrow">ORDER DETAILS</span>
                <h3>Order #{trackingOrder.order_code}</h3>
                <p>
                  Order date: <b>{formatOrderDateTime(trackingOrder.created_at).date}</b>
                  {' · '}
                  <b>{formatOrderDateTime(trackingOrder.created_at).time}</b>
                </p>
                <div style={{
                  marginTop: '16px', padding: '14px', borderRadius: '10px',
                  background: trackingOrder.status === 'Cancelled' ? '#fee2e2' : '#fdf2f8',
                  color: trackingOrder.status === 'Cancelled' ? '#991b1b' : '#831843'
                }}>
                  <small>Current order status</small>
                  <h2 style={{ margin: '5px 0 0' }}>{trackingOrder.status}</h2>
                </div>
                <div style={{ marginTop: '18px' }}>
                  {['New', 'Accepted', 'Packed', 'Dispatched', 'Delivered'].map((step, index) => {
                    const steps = ['New', 'Accepted', 'Packed', 'Dispatched', 'Delivered'];
                    const currentIndex = steps.indexOf(trackingOrder.status);
                    const completed = trackingOrder.status !== 'Cancelled' && currentIndex >= index;
                    return (
                      <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0', opacity: completed ? 1 : 0.45 }}>
                        <span style={{
                          width: '25px', height: '25px', borderRadius: '50%',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: completed ? '#16a34a' : '#e5e7eb',
                          color: completed ? '#fff' : '#4b5563', fontWeight: 800, flexShrink: 0
                        }}>{completed ? '✓' : index + 1}</span>
                        <b>{step}</b>
                      </div>
                    );
                  })}
                  {trackingOrder.status === 'Cancelled' && (
                    <p style={{ color: '#b91c1c', fontWeight: 700 }}>This order has been cancelled.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {tab === 'dashboard' && (
        <main className="section dashboard">
          {recoveryMode ? (
            <div className="loginbox">
              <span className="eyebrow">PASSWORD RECOVERY</span>
              <h2>Set new password</h2>
              <p>Enter and confirm your new owner password.</p>
              <form onSubmit={saveRecoveredPassword}>
                <label>New password<input type="password" minLength={6} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
                <label>Confirm new password<input type="password" minLength={6} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
                <button className="primary full" disabled={loading}>{loading ? 'Updating...' : 'Update password'}</button>
              </form>
            </div>
          ) : !owner ? (
            <div className="loginbox">
              <span className="eyebrow">OWNER ACCESS</span>
              <h2>{resetMode ? 'Reset password' : 'Welcome back'}</h2>
              <p>{resetMode ? 'Enter your owner email and we will send a reset link.' : 'Sign in to manage products and customer orders.'}</p>
              {resetMode ? (
                <form onSubmit={sendPasswordReset}>
                  <label>Email<input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></label>
                  <button className="primary full" disabled={loading}>{loading ? 'Sending...' : 'Send reset email'}</button>
                  <button type="button" className="secondary full" onClick={() => setResetMode(false)}>Back to sign in</button>
                </form>
              ) : (
                <form onSubmit={signIn}>
                  <label>Email<input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></label>
                  <label>Password<input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></label>
                  <button className="primary full">Sign in</button>
                  <button type="button" className="secondary full" onClick={() => setResetMode(true)} style={{ marginTop: '10px' }}>Forgot password?</button>
                </form>
              )}
              <small>Owner account is created in Supabase during setup.</small>
            </div>
          ) : (
            <>
              <div className="sectionhead">
                <div>
                  <span className="eyebrow">OWNER PANEL</span>
                  <h2>Dashboard</h2>
                  <p>{owner.email}</p>
                </div>
                <button className="secondary" onClick={signOut}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>

              <div className="stats">
                <div>
                  <small><TrendingUp size={14} /> Total Sales</small>
                  <b>{money(totalSales)}</b>
                  <small>Excluding cancelled orders</small>
                </div>
                <div>
                  <small><CalendarDays size={14} /> Today's Orders</small>
                  <b>{todayOrders.length}</b>
                  <small>Orders received today</small>
                </div>
                <div>
                  <small><Clock size={14} /> Pending Orders</small>
                  <b>{pendingOrders.length}</b>
                  <small>Awaiting completion</small>
                </div>
                <div>
                  <small><CheckCircle size={14} /> Delivered Orders</small>
                  <b>{deliveredOrders.length}</b>
                  <small>Successfully delivered</small>
                </div>
              </div>

              <div className="stats">
                <div><small>Products</small><b>{products.length}</b></div>
                <div><small>Orders</small><b>{orders.length}</b></div>
                <div><small>New orders</small><b>{orders.filter(o => o.status === 'New').length}</b></div>
                <div>
                  <small>Low stock</small>
                  <b style={{ color: lowStockCount > 0 ? '#b45309' : 'inherit' }}>{lowStockCount}</b>
                </div>
                <div>
                  <small>Out of stock</small>
                  <b style={{ color: outOfStockCount > 0 ? '#dc2626' : 'inherit' }}>{outOfStockCount}</b>
                </div>
              </div>

              <div
                className="admin-menu"
                style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '25px 0' }}
              >
                <button className={adminTab === 'products' ? 'primary' : 'secondary'} onClick={() => setAdminTab('products')}>
                  <Package size={16} /> Products
                </button>
                <button className={adminTab === 'orders' ? 'primary' : 'secondary'} onClick={() => setAdminTab('orders')}>
                  <ClipboardList size={16} /> Orders
                </button>
                <button className={adminTab === 'neworder' ? 'primary' : 'secondary'} onClick={() => setAdminTab('neworder')}>
                  <Plus size={16} /> New Order
                </button>
                <button className={adminTab === 'settings' ? 'primary' : 'secondary'} onClick={() => setAdminTab('settings')}>
                  Change Password
                </button>
                <button className={adminTab === 'lowstock' ? 'primary' : 'secondary'} onClick={() => setAdminTab('lowstock')}>
                  <AlertTriangle size={16} /> Stock Alerts
                  {lowStockCount + outOfStockCount > 0 && (
                    <span style={{
                      marginLeft: '5px', background: '#dc2626', color: 'white',
                      borderRadius: '20px', padding: '2px 7px', fontSize: '11px'
                    }}>
                      {lowStockCount + outOfStockCount}
                    </span>
                  )}
                </button>
                <button className={adminTab === 'discounts' ? 'primary' : 'secondary'} onClick={() => setAdminTab('discounts')}>
                  <TrendingUp size={16} /> Discounts
                </button>
                <button className={adminTab === 'reports' ? 'primary' : 'secondary'} onClick={() => setAdminTab('reports')}>
                  <TrendingUp size={16} /> Sales & Profit Reports
                </button>
              </div>

              {adminTab === 'settings' && (
                <div className="panel">
                  <h3>Change owner password</h3>
                  <p className="muted">Confirm your current password, then choose a new password.</p>
                  <form className="checkout" onSubmit={changeOwnerPassword}>
                    <input type="password" required placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                    <input type="password" required minLength={6} placeholder="New password (at least 6 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    <input type="password" required minLength={6} placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    <button className="primary full" disabled={loading}>{loading ? 'Updating...' : 'Change password'}</button>
                  </form>
                </div>
              )}

              {adminTab === 'lowstock' && (
                <div className="panel">
                  <h3><AlertTriangle size={18} /> Stock alerts</h3>
                  <p className="muted">Products with 2 or fewer units remaining are shown here.</p>
                  {lowStockProducts.length === 0 && outOfStockProducts.length === 0 ? (
                    <div className="empty">
                      <Package size={32} />
                      <h3>All products are well stocked!</h3>
                      <p>There are no low-stock or out-of-stock products right now.</p>
                    </div>
                  ) : (
                    <>
                      {outOfStockProducts.length > 0 && (
                        <>
                          <h3 style={{ color: '#b91c1c', marginTop: '20px' }}>
                            <PackageX size={18} /> Out of stock
                          </h3>
                          {outOfStockProducts.map(p => (
                            <div className="manage-row" key={p.id}>
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px' }} />
                              ) : <ImagePlus size={25} />}
                              <span style={{ flex: 1 }}><b>{p.name}</b><small>{money(p.price)}</small></span>
                              {stockBadge(p.stock)}
                              <button className="secondary" onClick={() => { setAdminTab('products'); startEditProduct(p); }}>
                                <Edit2 size={16} /> Edit
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {lowStockProducts.length > 0 && (
                        <>
                          <h3 style={{ color: '#92400e', marginTop: '25px' }}>
                            <AlertTriangle size={18} /> Low stock
                          </h3>
                          {lowStockProducts.map(p => (
                            <div className="manage-row" key={p.id}>
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px' }} />
                              ) : <ImagePlus size={25} />}
                              <span style={{ flex: 1 }}><b>{p.name}</b><small>{money(p.price)}</small></span>
                              {stockBadge(p.stock)}
                              <button className="secondary" onClick={() => { setAdminTab('products'); startEditProduct(p); }}>
                                <Edit2 size={16} /> Edit
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {adminTab === 'products' && (
                <>
                  <div className="panel">
                    <h3>
                      {editingProduct ? <Edit2 size={18} /> : <Plus size={18} />}
                      {editingProduct ? ' Edit product' : ' Add a product'}
                    </h3>
                    {editingProduct && <p className="muted">Editing product: <b>{editingProduct.name}</b></p>}

                    <form className="productform" onSubmit={addProduct}>
                      <input required placeholder="Product name" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
                      <input placeholder="Description" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} />
                      <input required type="number" min="0" placeholder="Price (Rs.)" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} />
                      <input required type="number" min="0" step="0.01" placeholder="Cost Price / Purchase Price (Rs.)" value={newProduct.cost_price} onChange={e => setNewProduct({ ...newProduct, cost_price: e.target.value })} />
                      <input required type="number" min="0" step="1" placeholder="Stock quantity" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} />

                      <label style={{
                        display: 'flex', flexDirection: 'column', gap: '8px',
                        padding: '12px', border: '1px dashed #c9a6b5', borderRadius: '10px'
                      }}>
                        <span>
                          <ImagePlus size={18} style={{ verticalAlign: 'middle', marginRight: '7px' }} />
                          {editingProduct ? 'Change product photo (optional)' : 'Product photo'}
                        </span>
                        <input id="product-image-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} />
                        <small>JPG, PNG or WEBP · Maximum 5 MB</small>
                        {editingProduct?.image_url && !selectedImage && <small>You can keep the existing photo without changing it.</small>}
                        {selectedImage && <small style={{ color: 'green' }}>Selected: {selectedImage.name}</small>}
                      </label>

                      <button className="primary" disabled={loading}>
                        {loading ? 'Saving...' : editingProduct ? 'Update product' : 'Save product'}
                      </button>
                      {editingProduct && (
                        <button type="button" className="secondary" onClick={resetProductForm} disabled={loading}>
                          <X size={16} /> Cancel editing
                        </button>
                      )}
                    </form>
                  </div>

                  <div className="panel">
                    <h3><Package size={18} /> Products & stock</h3>
                    {products.length === 0 ? (
                      <p className="muted">No products yet.</p>
                    ) : (
                      products.map(p => (
                        <div className="manage-row" key={p.id} style={{ gap: '12px', alignItems: 'center' }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px' }} />
                          ) : <ImagePlus size={25} />}
                          <span style={{ flex: 1 }}>
                            <b>{p.name}</b>
                            <small>Selling: {money(p.price)} · Cost: {money(p.cost_price)}</small>
                            <div style={{ marginTop: '5px' }}>{stockBadge(p.stock)}</div>
                          </span>
                          <label>
                            Stock
                            <input
                              type="number"
                              min="0"
                              value={p.stock}
                              onChange={e => {
                                const value = e.target.value;
                                setProducts(old => old.map(item => item.id === p.id ? { ...item, stock: value } : item));
                              }}
                              onBlur={e => updateStock(p.id, e.target.value)}
                            />
                          </label>
                          <button className="secondary" type="button" onClick={() => startEditProduct(p)} title="Edit product">
                            <Edit2 size={16} /> Edit
                          </button>
                          <button className="textdanger" onClick={() => deactivateProduct(p.id)}>Remove</button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {adminTab === 'discounts' && (
                <div className="panel">
                  <h3>Discount offers</h3>
                  <p className="muted">Create a percentage or fixed-value offer. Only one offer can be active at a time.</p>
                  <form className="productform" onSubmit={saveDiscount}>
                    <input required placeholder="Discount name" value={discountForm.name} onChange={e => setDiscountForm({ ...discountForm, name: e.target.value })} />
                    <select value={discountForm.product_id} onChange={e => setDiscountForm({ ...discountForm, product_id: e.target.value })}>
                      <option value="">All Products</option>
                      {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    <select value={discountForm.discount_type} onChange={e => setDiscountForm({ ...discountForm, discount_type: e.target.value })}>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed amount (Rs.)</option>
                    </select>
                    <input required type="number" min="0.01" step="0.01" placeholder={discountForm.discount_type === 'percentage' ? 'Discount percentage' : 'Discount amount (Rs.)'} value={discountForm.discount_value} onChange={e => setDiscountForm({ ...discountForm, discount_value: e.target.value })} />
                    <button className="primary" disabled={loading}>{editingDiscount ? 'Update discount' : 'Save discount'}</button>
                    {editingDiscount && (
                      <button type="button" className="secondary" onClick={() => {
                        setEditingDiscount(null);
                        setDiscountForm({ name: '', product_id: '', discount_type: 'percentage', discount_value: '' });
                      }}>
                        Cancel edit
                      </button>
                    )}
                  </form>

                  {discounts.length === 0 ? <p className="muted">No discounts created yet.</p> : discounts.map(d => (
                    <div className="manage-row" key={d.id}>
                      <span style={{ flex: 1 }}>
                        <b>{d.name}</b>
                        <small>
                          {d.product_id ? `Product: ${products.find(p => String(p.id) === String(d.product_id))?.name || 'Selected product'} · ` : 'All Products · '}
                          {d.discount_type === 'percentage' ? `${d.discount_value}% off` : `${money(d.discount_value)} off`}
                        </small>
                      </span>
                      <b style={{ color: d.active ? '#15803d' : '#777' }}>{d.active ? 'ACTIVE' : 'OFF'}</b>
                      <button type="button" className="secondary" disabled={loading} onClick={() => toggleDiscount(d)}>{d.active ? 'Turn off' : 'Activate'}</button>
                      <button type="button" className="secondary" onClick={() => {
                        setEditingDiscount(d);
                        setDiscountForm({
                          name: d.name || '',
                          product_id: d.product_id || '',
                          discount_type: d.discount_type || 'percentage',
                          discount_value: String(d.discount_value ?? '')
                        });
                      }}>Edit</button>
                      <button type="button" className="textdanger" onClick={() => deleteDiscount(d.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}

              {adminTab === 'reports' && (
                <div className="panel">
                  <h3><TrendingUp size={18} /> Sales & Profit Reports</h3>
                  <p className="muted">
                    Reports exclude cancelled orders. Net sales subtract item-level and older order-level discounts. Product cost is deducted to calculate actual profit. Delivery fees are not included.
                  </p>

                  <div className="stats">
                    <div><small>Net Sales (After Discounts)</small><b>{money(netSales)}</b></div>
                    <div><small>Total Discounts</small><b style={{ color: '#15803d' }}>-{money(totalDiscounts)}</b></div>
                    <div><small>Total Product Cost</small><b>{money(totalProductCost)}</b></div>
                    <div><small>Actual Profit</small><b style={{ color: actualProfit >= 0 ? '#15803d' : '#dc2626' }}>{money(actualProfit)}</b></div>
                    <div><small>Included Orders</small><b>{reportOrders.length}</b></div>
                  </div>

                  <p className="muted" style={{ marginTop: '12px' }}>
                    Gross product sales before discounts: <b>{money(totalProductRevenue)}</b>
                  </p>

                  {itemsWithoutCost > 0 && (
                    <div style={{
                      margin: '16px 0', padding: '12px 14px', borderRadius: '10px',
                      background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa'
                    }}>
                      <b>Cost price needs attention</b>
                      <p style={{ margin: '5px 0 0' }}>
                        {itemsWithoutCost} order item(s) have a zero cost price. Actual profit may be overstated until their cost details are corrected. Older orders created before cost tracking usually appear here.
                      </p>
                    </div>
                  )}

                  <h3 style={{ marginTop: '28px' }}><CalendarDays size={18} /> Monthly Net Sales</h3>
                  {monthlySales.map(month => (
                    <div key={month.key} style={{ margin: '14px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                        <b>{month.label}</b>
                        <span>{money(month.revenue)} · {month.orders} order(s)</span>
                      </div>
                      <div style={{ height: '10px', borderRadius: '20px', background: '#f1e8eb', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${(month.revenue / maxMonthlySales) * 100}%`,
                          borderRadius: '20px', background: '#945c70'
                        }} />
                      </div>
                    </div>
                  ))}

                  <h3 style={{ marginTop: '28px' }}><Package size={18} /> Best Selling Products</h3>
                  {bestSellingProducts.length === 0 ? (
                    <p className="muted">No sales data available yet.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '10px 8px', borderBottom: '1px solid #eadde2' }}>Product</th>
                            <th style={{ padding: '10px 8px', borderBottom: '1px solid #eadde2' }}>Units sold</th>
                            <th style={{ padding: '10px 8px', borderBottom: '1px solid #eadde2' }}>Net Product Sales</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bestSellingProducts.map((product, index) => (
                            <tr key={`${product.name}-${index}`}>
                              <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1e8eb' }}>{product.name}</td>
                              <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1e8eb' }}>{product.quantity}</td>
                              <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1e8eb' }}>{money(product.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {adminTab === 'orders' && (
                <div className="panel">
                  <h3><ClipboardList size={18} /> Customer orders</h3>
                  {orders.length === 0 ? (
                    <p className="muted">No orders yet.</p>
                  ) : (
                    orders.map(o => (
                      <div className="order" key={o.id}>
                        <div className="orderhead">
                          <b>#{o.id.slice(0, 8).toUpperCase()} · {o.customer_name}</b>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button type="button" className="secondary" onClick={() => openOrderWhatsApp(o)}>WhatsApp Customer</button>
                            <button type="button" className="secondary" onClick={() => printOrderReceipt(o)}>Print / Save PDF</button>
                            <select value={o.status} disabled={loading || o.status === 'Cancelled'} onChange={e => updateOrder(o.id, e.target.value)}>
                              <option>New</option>
                              <option>Accepted</option>
                              <option>Packed</option>
                              <option>Dispatched</option>
                              <option>Delivered</option>
                              <option>Cancelled</option>
                            </select>
                          </div>
                        </div>

                        {(() => {
                          const orderDateTime = formatOrderDateTime(o.created_at);
                          return (
                            <p style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span><CalendarDays size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Date: <b>{orderDateTime.date}</b></span>
                              <span><Clock size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Time: <b>{orderDateTime.time}</b></span>
                            </p>
                          );
                        })()}

                        <p>{o.phone} · {o.address}</p>
                        <p>
                          Delivery: <b>{o.delivery_method === 'post' ? 'Post Office' : 'Courier'}</b>
                          {' '}({money(o.delivery_fee)}) · Payment:
                          {' '}<b>{o.payment_method === 'cod' ? 'COD' : 'Bank Transfer'}</b>
                        </p>
                        {Number(o.discount_amount || 0) > 0 && <p>Discount: <b>{o.discount_name || 'Offer'} (-{money(o.discount_amount)})</b></p>}
                        <p>Total: <b>{money(o.total)}</b> · {o.payment_status}</p>

                        {(o.order_items || []).map(i => {
                          const itemDiscount = Math.max(0, Number(i.discount_amount || 0));
                          return (
                            <small key={i.id}>
                              {i.product_name} × {i.quantity} — {money(Math.max(0, Number(i.line_total || 0) - itemDiscount))}
                              {itemDiscount > 0 ? ` (discount -${money(itemDiscount)})` : ''}
                              <br />
                            </small>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}

              {adminTab === 'neworder' && (
                <div className="panel">
                  <h3><Plus size={18} /> Create a new customer order</h3>
                  <form className="checkout" onSubmit={createManualOrder}>
                    <h3>Customer details</h3>
                    <input required placeholder="Customer full name" value={manualForm.name} onChange={e => setManualForm({ ...manualForm, name: e.target.value })} />
                    <input required placeholder="Customer phone number" value={manualForm.phone} onChange={e => setManualForm({ ...manualForm, phone: e.target.value })} />
                    <textarea required placeholder="Customer delivery address" value={manualForm.address} onChange={e => setManualForm({ ...manualForm, address: e.target.value })} />

                    <h3>Select products</h3>
                    {products.length === 0 ? (
                      <p className="muted">No active products available. Please add products first.</p>
                    ) : (
                      <>
                        <select value={manualProductId} onChange={e => setManualProductId(e.target.value)}>
                          <option value="">-- Select a product --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id} disabled={Number(p.stock) < 1}>
                              {p.name} - {money(p.price)} ({p.stock} available)
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="number" min="1" step="1" value={manualQty} onChange={e => setManualQty(e.target.value)} style={{ maxWidth: '120px' }} />
                          <button type="button" className="secondary" onClick={addManualItem}>
                            <Plus size={16} /> Add product
                          </button>
                        </div>
                      </>
                    )}

                    {manualItems.length > 0 && (
                      <div className="cartitems">
                        <h3>Order items</h3>
                        {activeDiscount && (
                          <button type="button" className="secondary" onClick={applyActiveDiscountToManualItems}>
                            Apply "{activeDiscount.name}" to {activeDiscount.product_id ? 'selected product' : 'all items'}
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
                                  <select aria-label={`${p.name} discount type`} value={p.discount_type || ''} onChange={e => updateManualDiscount(p.id, 'discount_type', e.target.value || null)}>
                                    <option value="">No discount</option>
                                    <option value="percentage">Percentage (%)</option>
                                    <option value="fixed">Fixed per item (Rs.)</option>
                                  </select>
                                  <input aria-label={`${p.name} discount value`} type="number" min="0" step="0.01" placeholder="Discount value" value={p.discount_value ?? ''} disabled={!p.discount_type} onChange={e => updateManualDiscount(p.id, 'discount_value', e.target.value)} style={{ width: '125px' }} />
                                </div>
                                {itemDiscount > 0 && <small style={{ color: '#15803d' }}>Discount: -{money(itemDiscount)} · Net: {money(gross - itemDiscount)}</small>}
                              </span>
                              <b>{money(Math.max(0, gross - itemDiscount))}</b>
                              <button type="button" className="textdanger" onClick={() => removeManualItem(p.id)} title="Remove product"><Trash2 size={16} /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <h3>Delivery method</h3>
                    <div className="choices">
                      <label>
                        <input type="radio" name="manualDelivery" checked={manualForm.delivery === 'post'} onChange={() => setManualForm({ ...manualForm, delivery: 'post' })} />
                        <Mail />
                        <span>Post Office<small>Rs. 250</small></span>
                      </label>
                      <label>
                        <input type="radio" name="manualDelivery" checked={manualForm.delivery === 'courier'} onChange={() => setManualForm({ ...manualForm, delivery: 'courier' })} />
                        <Truck />
                        <span>Courier<small>Rs. 500</small></span>
                      </label>
                    </div>

                    <h3>Payment method</h3>
                    <div className="choices">
                      <label>
                        <input type="radio" name="manualPayment" checked={manualForm.payment === 'cod'} onChange={() => setManualForm({ ...manualForm, payment: 'cod' })} />
                        <Banknote />
                        <span>Cash on Delivery<small>Pay when it arrives</small></span>
                      </label>
                      <label>
                        <input type="radio" name="manualPayment" checked={manualForm.payment === 'bank'} onChange={() => setManualForm({ ...manualForm, payment: 'bank' })} />
                        <CreditCard />
                        <span>Bank Transfer<small>Transfer and share proof with the shop</small></span>
                      </label>
                    </div>

                    <h3>Additional note</h3>
                    <textarea placeholder="Optional note" value={manualForm.note} onChange={e => setManualForm({ ...manualForm, note: e.target.value })} />

                    <div className="totals">
                      <span>Items</span><b>{money(manualSubtotal)}</b>
                      {manualDiscountAmount > 0 && <><span>Item discounts</span><b style={{ color: '#15803d' }}>-{money(manualDiscountAmount)}</b></>}
                      <span>{manualForm.delivery === 'post' ? 'Post Office' : 'Courier'}</span>
                      <b>{money(manualDeliveryFee)}</b>
                      <strong>Total</strong><strong>{money(manualTotal)}</strong>
                    </div>
                    <button className="primary full" disabled={loading || manualItems.length === 0}>
                      {loading ? 'Creating order...' : 'Create Order'}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {showCheckout && (
        <div className="modalback" onClick={() => setShowCheckout(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalhead">
              <h2>Your cart</h2>
              <button onClick={() => setShowCheckout(false)}><X /></button>
            </div>

            {cart.length === 0 ? (
              <div className="empty">
                <ShoppingCart size={32} />
                <p>Your cart is empty.</p>
              </div>
            ) : (
              <>
                <div className="cartitems">
                  {activeDiscount && (
                    <button type="button" className="secondary" onClick={applyActiveDiscountToCart}>
                      Apply "{activeDiscount.name}" to {activeDiscount.product_id ? 'selected product' : 'all items'}
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
                            <select aria-label={`${p.name} discount type`} value={p.discount_type || ''} onChange={e => updateCartDiscount(p.id, 'discount_type', e.target.value || null)}>
                              <option value="">No discount</option>
                              <option value="percentage">Percentage (%)</option>
                              <option value="fixed">Fixed per item (Rs.)</option>
                            </select>
                            <input aria-label={`${p.name} discount value`} type="number" min="0" step="0.01" placeholder="Discount value" value={p.discount_value ?? ''} disabled={!p.discount_type} onChange={e => updateCartDiscount(p.id, 'discount_value', e.target.value)} style={{ width: '125px' }} />
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
                  })}
                </div>

                <form className="checkout" onSubmit={placeOrder}>
                  <h3>Delivery method</h3>
                  <div className="choices">
                    <label>
                      <input type="radio" name="delivery" checked={form.delivery === 'post'} onChange={() => setForm({ ...form, delivery: 'post' })} />
                      <Mail />
                      <span>Post Office<small>Rs. 250</small></span>
                    </label>
                    <label>
                      <input type="radio" name="delivery" checked={form.delivery === 'courier'} onChange={() => setForm({ ...form, delivery: 'courier' })} />
                      <Truck />
                      <span>Courier<small>Rs. 500</small></span>
                    </label>
                  </div>

                  <h3>Payment method</h3>
                  <div className="choices">
                    <label>
                      <input type="radio" name="payment" checked={form.payment === 'cod'} onChange={() => setForm({ ...form, payment: 'cod' })} />
                      <Banknote />
                      <span>Cash on Delivery<small>Pay when it arrives</small></span>
                    </label>
                    <label>
                      <input type="radio" name="payment" checked={form.payment === 'bank'} onChange={() => setForm({ ...form, payment: 'bank' })} />
                      <CreditCard />
                      <span>Bank Transfer<small>Transfer and share proof with the shop</small></span>
                    </label>
                  </div>

                  <h3>Your details</h3>
                  <input required placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  <input required placeholder="Phone number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  <textarea required placeholder="Delivery address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  <textarea placeholder="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />

                  <div className="totals">
                    <span>Items</span><b>{money(subtotal)}</b>
                    {discountAmount > 0 && <><span>Item discounts</span><b style={{ color: '#15803d' }}>-{money(discountAmount)}</b></>}
                    <span>{form.delivery === 'post' ? 'Post Office' : 'Courier'}</span>
                    <b>{money(deliveryFee)}</b>
                    <strong>Total</strong><strong>{money(total)}</strong>
                  </div>

                  <button className="primary full" disabled={loading}>
                    {loading ? 'Placing order...' : 'Place order'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
