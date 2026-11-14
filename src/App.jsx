
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
const DELIVERY = { post: 250, courier: 500 };
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LOW_STOCK_LIMIT = 2;

export default function App() {
  const [tab, setTab] = useState('shop');
  const [adminTab, setAdminTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [owner, setOwner] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);

  const [form, setForm] = useState({
    name: '', phone: '', address: '',
    delivery: 'post', payment: 'cod', note: ''
  });

  const [newProduct, setNewProduct] = useState({
    name: '', description: '', price: '', stock: ''
  });

  const [manualForm, setManualForm] = useState({
    name: '', phone: '', address: '',
    delivery: 'post', payment: 'cod', note: ''
  });

  const [manualProductId, setManualProductId] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualItems, setManualItems] = useState([]);

  const configured = !!supabase;

  const subtotal = cart.reduce(
    (s, item) => s + Number(item.price) * item.qty, 0
  );
  const deliveryFee = DELIVERY[form.delivery];
  const total = subtotal + deliveryFee;

  const manualSubtotal = manualItems.reduce(
    (s, item) => s + Number(item.price) * item.qty, 0
  );
  const manualDeliveryFee = DELIVERY[manualForm.delivery];
  const manualTotal = manualSubtotal + manualDeliveryFee;

  const lowStockProducts = products.filter(
    p => Number(p.stock) > 0 && Number(p.stock) <= LOW_STOCK_LIMIT
  );

  const outOfStockProducts = products.filter(
    p => Number(p.stock) <= 0
  );

  const lowStockCount = lowStockProducts.length;
  const outOfStockCount = outOfStockProducts.length;

  // Dashboard summary calculations
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

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setOwner(data.session?.user || null);
      });

      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, session) => setOwner(session?.user || null)
      );

      return () => listener.subscription.unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (owner) loadOrders();
  }, [owner]);

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

      return [...old, { ...p, qty: 1 }];
    });

    setNotice(`${p.name} added to cart`);
  }

  function changeQty(id, delta) {
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
        line_total: Number(p.price) * p.qty
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
      setTab('dashboard');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOwner(null);
    setTab('shop');
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
      name: '', description: '', price: '', stock: ''
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

    if (newProduct.price === '' || Number(newProduct.price) < 0) {
      setNotice('Please enter a valid product price.');
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
          stock: Number(selected.stock),
          qty
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
        line_total: Number(p.price) * p.qty
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
          display: 'inline-block',
          background: '#fee2e2',
          color: '#b91c1c',
          padding: '4px 9px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 800
        }}>
          OUT OF STOCK
        </span>
      );
    }

    if (value <= LOW_STOCK_LIMIT) {
      return (
        <span style={{
          display: 'inline-block',
          background: '#fef3c7',
          color: '#92400e',
          padding: '4px 9px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 800
        }}>
          LOW STOCK
        </span>
      );
    }

    return (
      <span style={{
        display: 'inline-block',
        background: '#dcfce7',
        color: '#166534',
        padding: '4px 9px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 800
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
            setTab('shop');
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
            onClick={() => setTab('shop')}
          >
            <Store size={17} /> Shop
          </button>

          <button className="nav cartnav" onClick={() => setShowCheckout(true)}>
            <ShoppingCart size={17} /> Cart <i>{cartCount}</i>
          </button>

          <button
            className={tab === 'dashboard' ? 'nav active' : 'nav'}
            onClick={() => setTab('dashboard')}
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

      {tab === 'dashboard' && (
        <main className="section dashboard">
          {!owner ? (
            <div className="loginbox">
              <span className="eyebrow">OWNER ACCESS</span>
              <h2>Welcome back</h2>
              <p>Sign in to manage products and customer orders.</p>
              <form onSubmit={signIn}>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                  />
                </label>
                <button className="primary full">Sign in</button>
              </form>
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

              {/* New Dashboard Summary Cards */}
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

              {/* Existing Store Statistics */}
              <div className="stats">
                <div>
                  <small>Products</small>
                  <b>{products.length}</b>
                </div>
                <div>
                  <small>Orders</small>
                  <b>{orders.length}</b>
                </div>
                <div>
                  <small>New orders</small>
                  <b>{orders.filter(o => o.status === 'New').length}</b>
                </div>
                <div>
                  <small>Low stock</small>
                  <b style={{ color: lowStockCount > 0 ? '#b45309' : 'inherit' }}>
                    {lowStockCount}
                  </b>
                </div>
                <div>
                  <small>Out of stock</small>
                  <b style={{ color: outOfStockCount > 0 ? '#dc2626' : 'inherit' }}>
                    {outOfStockCount}
                  </b>
                </div>
              </div>

              <div
                className="admin-menu"
                style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '25px 0' }}
              >
                <button
                  className={adminTab === 'products' ? 'primary' : 'secondary'}
                  onClick={() => setAdminTab('products')}
                >
                  <Package size={16} /> Products
                </button>
                <button
                  className={adminTab === 'orders' ? 'primary' : 'secondary'}
                  onClick={() => setAdminTab('orders')}
                >
                  <ClipboardList size={16} /> Orders
                </button>
                <button
                  className={adminTab === 'neworder' ? 'primary' : 'secondary'}
                  onClick={() => setAdminTab('neworder')}
                >
                  <Plus size={16} /> New Order
                </button>
                <button
                  className={adminTab === 'lowstock' ? 'primary' : 'secondary'}
                  onClick={() => setAdminTab('lowstock')}
                >
                  <AlertTriangle size={16} /> Stock Alerts
                  {lowStockCount + outOfStockCount > 0 && (
                    <span style={{
                      marginLeft: '5px',
                      background: '#dc2626',
                      color: 'white',
                      borderRadius: '20px',
                      padding: '2px 7px',
                      fontSize: '11px'
                    }}>
                      {lowStockCount + outOfStockCount}
                    </span>
                  )}
                </button>
              </div>

              {adminTab === 'lowstock' && (
                <div className="panel">
                  <h3><AlertTriangle size={18} /> Stock alerts</h3>
                  <p className="muted">
                    Products with 2 or fewer units remaining are shown here.
                  </p>

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
                                <img
                                  src={p.image_url}
                                  alt={p.name}
                                  style={{
                                    width: '55px',
                                    height: '55px',
                                    objectFit: 'cover',
                                    borderRadius: '8px'
                                  }}
                                />
                              ) : <ImagePlus size={25} />}
                              <span style={{ flex: 1 }}>
                                <b>{p.name}</b>
                                <small>{money(p.price)}</small>
                              </span>
                              {stockBadge(p.stock)}
                              <button
                                className="secondary"
                                onClick={() => {
                                  setAdminTab('products');
                                  startEditProduct(p);
                                }}
                              >
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
                                <img
                                  src={p.image_url}
                                  alt={p.name}
                                  style={{
                                    width: '55px',
                                    height: '55px',
                                    objectFit: 'cover',
                                    borderRadius: '8px'
                                  }}
                                />
                              ) : <ImagePlus size={25} />}
                              <span style={{ flex: 1 }}>
                                <b>{p.name}</b>
                                <small>{money(p.price)}</small>
                              </span>
                              {stockBadge(p.stock)}
                              <button
                                className="secondary"
                                onClick={() => {
                                  setAdminTab('products');
                                  startEditProduct(p);
                                }}
                              >
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

                    {editingProduct && (
                      <p className="muted">
                        Editing product: <b>{editingProduct.name}</b>
                      </p>
                    )}

                    <form className="productform" onSubmit={addProduct}>
                      <input
                        required
                        placeholder="Product name"
                        value={newProduct.name}
                        onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                      />

                      <input
                        placeholder="Description"
                        value={newProduct.description}
                        onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                      />

                      <input
                        required
                        type="number"
                        min="0"
                        placeholder="Price (Rs.)"
                        value={newProduct.price}
                        onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                      />

                      <input
                        required
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Stock quantity"
                        value={newProduct.stock}
                        onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })}
                      />

                      <label
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          padding: '12px',
                          border: '1px dashed #c9a6b5',
                          borderRadius: '10px'
                        }}
                      >
                        <span>
                          <ImagePlus size={18} style={{ verticalAlign: 'middle', marginRight: '7px' }} />
                          {editingProduct ? 'Change product photo (optional)' : 'Product photo'}
                        </span>

                        <input
                          id="product-image-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleImageSelect}
                        />

                        <small>JPG, PNG or WEBP · Maximum 5 MB</small>

                        {editingProduct?.image_url && !selectedImage && (
                          <small>You can keep the existing photo without changing it.</small>
                        )}

                        {selectedImage && (
                          <small style={{ color: 'green' }}>
                            Selected: {selectedImage.name}
                          </small>
                        )}
                      </label>

                      <button className="primary" disabled={loading}>
                        {loading
                          ? 'Saving...'
                          : editingProduct ? 'Update product' : 'Save product'}
                      </button>

                      {editingProduct && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={resetProductForm}
                          disabled={loading}
                        >
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
                        <div
                          className="manage-row"
                          key={p.id}
                          style={{ gap: '12px', alignItems: 'center' }}
                        >
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              style={{
                                width: '55px',
                                height: '55px',
                                objectFit: 'cover',
                                borderRadius: '8px'
                              }}
                            />
                          ) : (
                            <ImagePlus size={25} />
                          )}

                          <span style={{ flex: 1 }}>
                            <b>{p.name}</b>
                            <small>{money(p.price)}</small>
                            <div style={{ marginTop: '5px' }}>
                              {stockBadge(p.stock)}
                            </div>
                          </span>

                          <label>
                            Stock
                            <input
                              type="number"
                              min="0"
                              value={p.stock}
                              onChange={e => {
                                const value = e.target.value;
                                setProducts(old =>
                                  old.map(item =>
                                    item.id === p.id ? { ...item, stock: value } : item
                                  )
                                );
                              }}
                              onBlur={e => updateStock(p.id, e.target.value)}
                            />
                          </label>

                          <button
                            className="secondary"
                            type="button"
                            onClick={() => startEditProduct(p)}
                            title="Edit product"
                          >
                            <Edit2 size={16} /> Edit
                          </button>

                          <button
                            className="textdanger"
                            onClick={() => deactivateProduct(p.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
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
                          <select
                            value={o.status}
                            disabled={loading || o.status === 'Cancelled'}
                            onChange={e => updateOrder(o.id, e.target.value)}
                          >
                            <option>New</option>
                            <option>Accepted</option>
                            <option>Packed</option>
                            <option>Dispatched</option>
                            <option>Delivered</option>
                            <option>Cancelled</option>
                          </select>
                        </div>

                        <p>{o.phone} · {o.address}</p>
                        <p>
                          Delivery: <b>{o.delivery_method === 'post' ? 'Post Office' : 'Courier'}</b>
                          {' '}({money(o.delivery_fee)}) · Payment:
                          {' '}<b>{o.payment_method === 'cod' ? 'COD' : 'Bank Transfer'}</b>
                        </p>
                        <p>Total: <b>{money(o.total)}</b> · {o.payment_status}</p>

                        {(o.order_items || []).map(i => (
                          <small key={i.id}>
                            {i.product_name} × {i.quantity} — {money(i.line_total)}
                            <br />
                          </small>
                        ))}
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

                    <input
                      required
                      placeholder="Customer full name"
                      value={manualForm.name}
                      onChange={e => setManualForm({ ...manualForm, name: e.target.value })}
                    />
                    <input
                      required
                      placeholder="Customer phone number"
                      value={manualForm.phone}
                      onChange={e => setManualForm({ ...manualForm, phone: e.target.value })}
                    />
                    <textarea
                      required
                      placeholder="Customer delivery address"
                      value={manualForm.address}
                      onChange={e => setManualForm({ ...manualForm, address: e.target.value })}
                    />

                    <h3>Select products</h3>

                    {products.length === 0 ? (
                      <p className="muted">No active products available. Please add products first.</p>
                    ) : (
                      <>
                        <select
                          value={manualProductId}
                          onChange={e => setManualProductId(e.target.value)}
                        >
                          <option value="">-- Select a product --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id} disabled={Number(p.stock) < 1}>
                              {p.name} - {money(p.price)} ({p.stock} available)
                            </option>
                          ))}
                        </select>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={manualQty}
                            onChange={e => setManualQty(e.target.value)}
                            style={{ maxWidth: '120px' }}
                          />
                          <button type="button" className="secondary" onClick={addManualItem}>
                            <Plus size={16} /> Add product
                          </button>
                        </div>
                      </>
                    )}

                    {manualItems.length > 0 && (
                      <div className="cartitems">
                        <h3>Order items</h3>
                        {manualItems.map(p => (
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
                        ))}
                      </div>
                    )}

                    <h3>Delivery method</h3>
                    <div className="choices">
                      <label>
                        <input
                          type="radio"
                          name="manualDelivery"
                          checked={manualForm.delivery === 'post'}
                          onChange={() => setManualForm({ ...manualForm, delivery: 'post' })}
                        />
                        <Mail />
                        <span>Post Office<small>Rs. 250</small></span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="manualDelivery"
                          checked={manualForm.delivery === 'courier'}
                          onChange={() => setManualForm({ ...manualForm, delivery: 'courier' })}
                        />
                        <Truck />
                        <span>Courier<small>Rs. 500</small></span>
                      </label>
                    </div>

                    <h3>Payment method</h3>
                    <div className="choices">
                      <label>
                        <input
                          type="radio"
                          name="manualPayment"
                          checked={manualForm.payment === 'cod'}
                          onChange={() => setManualForm({ ...manualForm, payment: 'cod' })}
                        />
                        <Banknote />
                        <span>Cash on Delivery<small>Pay when it arrives</small></span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="manualPayment"
                          checked={manualForm.payment === 'bank'}
                          onChange={() => setManualForm({ ...manualForm, payment: 'bank' })}
                        />
                        <CreditCard />
                        <span>Bank Transfer<small>Transfer and share proof with the shop</small></span>
                      </label>
                    </div>

                    <h3>Additional note</h3>
                    <textarea
                      placeholder="Optional note"
                      value={manualForm.note}
                      onChange={e => setManualForm({ ...manualForm, note: e.target.value })}
                    />

                    <div className="totals">
                      <span>Items</span><b>{money(manualSubtotal)}</b>
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
                  {cart.map(p => (
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
                  ))}
                </div>

                <form className="checkout" onSubmit={placeOrder}>
                  <h3>Delivery method</h3>
                  <div className="choices">
                    <label>
                      <input
                        type="radio"
                        name="delivery"
                        checked={form.delivery === 'post'}
                        onChange={() => setForm({ ...form, delivery: 'post' })}
                      />
                      <Mail />
                      <span>Post Office<small>Rs. 250</small></span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="delivery"
                        checked={form.delivery === 'courier'}
                        onChange={() => setForm({ ...form, delivery: 'courier' })}
                      />
                      <Truck />
                      <span>Courier<small>Rs. 500</small></span>
                    </label>
                  </div>

                  <h3>Payment method</h3>
                  <div className="choices">
                    <label>
                      <input
                        type="radio"
                        name="payment"
                        checked={form.payment === 'cod'}
                        onChange={() => setForm({ ...form, payment: 'cod' })}
                      />
                      <Banknote />
                      <span>Cash on Delivery<small>Pay when it arrives</small></span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="payment"
                        checked={form.payment === 'bank'}
                        onChange={() => setForm({ ...form, payment: 'bank' })}
                      />
                      <CreditCard />
                      <span>Bank Transfer<small>Transfer and share proof with the shop</small></span>
                    </label>
                  </div>

                  <h3>Your details</h3>
                  <input
                    required
                    placeholder="Full name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                  <input
                    required
                    placeholder="Phone number"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                  />
                  <textarea
                    required
                    placeholder="Delivery address"
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                  />
                  <textarea
                    placeholder="Note (optional)"
                    value={form.note}
                    onChange={e => setForm({ ...form, note: e.target.value })}
                  />

                  <div className="totals">
                    <span>Items</span><b>{money(subtotal)}</b>
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
