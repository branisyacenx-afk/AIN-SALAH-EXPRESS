import { useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { supabase, isConfigured } from './lib/supabase';

type Role = 'customer' | 'driver' | 'admin';
type Product = { id: number; name: string; category: string; price: number; emoji: string; description: string };
const products: Product[] = [
  { id: 1, name: 'وجبة شاورما', category: 'مطاعم', price: 650, emoji: '🌯', description: 'شاورما دجاج مع البطاطا' },
  { id: 2, name: 'بيتزا مارغريتا', category: 'مطاعم', price: 900, emoji: '🍕', description: 'بيتزا طازجة بالجبن' },
  { id: 3, name: 'قهوة وحلوى', category: 'حلويات', price: 450, emoji: '☕', description: 'قهوة مع قطعة حلوى' },
  { id: 4, name: 'سلة خضر', category: 'مقضيات', price: 700, emoji: '🥬', description: 'خضر موسمية طازجة' },
  { id: 5, name: 'مياه معدنية', category: 'متاجر', price: 100, emoji: '💧', description: 'قارورة مياه 1.5 لتر' },
  { id: 6, name: 'توصيل وثائق', category: 'خدمات', price: 300, emoji: '📄', description: 'استلام وتسليم وثائق داخل المدينة' }
];
const money = (n: number) => `${n.toLocaleString('fr-DZ')} دج`;
function MapClick({ onChoose }: { onChoose: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onChoose(e.latlng.lat, e.latlng.lng); } });
  return null;
}
export default function App() {
  const [role, setRole] = useState<Role>('customer');
  const [category, setCategory] = useState('الكل');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [position, setPosition] = useState<[number, number]>([27.193, 2.46]);
  const [orders, setOrders] = useState<{ id: string; items: string; total: number; status: string; phone: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const categories = ['الكل', 'مطاعم', 'حلويات', 'مقضيات', 'متاجر', 'خدمات'];
  const cartItems = useMemo(() => products.filter(p => cart[p.id]).map(p => ({ ...p, qty: cart[p.id] })), [cart]);
  const total = cartItems.reduce((s, p) => s + p.price * p.qty, 0);
  const visible = category === 'الكل' ? products : products.filter(p => p.category === category);
  const add = (id: number) => setCart(old => ({ ...old, [id]: (old[id] || 0) + 1 }));
  const remove = (id: number) => setCart(old => { const next = { ...old }; if (next[id] <= 1) delete next[id]; else next[id]--; return next; });
  async function placeOrder() {
    if (!phone.trim() || !address.trim() || !cartItems.length) { setNotice('أدخل رقم الهاتف والعنوان وأضف منتجاً واحداً على الأقل.'); return; }
    setBusy(true);
    const itemText = cartItems.map(p => `${p.name} × ${p.qty}`).join('، ');
    const order = { id: `ASE-${Date.now().toString().slice(-6)}`, items: itemText, total, status: 'بانتظار التأكيد', phone };
    if (supabase) {
      const { error } = await supabase.from('orders').insert({ customer_phone: phone, delivery_address: address, notes: note, items: cartItems.map(p => ({ product_id: p.id, name: p.name, quantity: p.qty, unit_price: p.price })), total_amount: total, status: 'pending', latitude: position[0], longitude: position[1] });
      if (error) { setNotice('تعذر حفظ الطلب في قاعدة البيانات. تحقق من إعداد Supabase وسياسات الوصول.'); setBusy(false); return; }
    }
    setOrders(old => [order, ...old]);
    setCart({}); setNote(''); setNotice(supabase ? 'تم إرسال طلبك إلى النظام بنجاح.' : 'تم تسجيل الطلب في هذه الجلسة التجريبية فقط. اربط Supabase لحفظ الطلبات فعلياً.');
    setBusy(false);
  }
  return <div className="app" dir="rtl">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">🚚</span><span><b>عين صالح إكسبريس</b><small>طلبك يوصلك حتى لباب دارك</small></span></a><div className="top-actions"><span className={isConfigured ? 'connection online' : 'connection'}>{isConfigured ? '● متصل بقاعدة البيانات' : '● وضع تجريبي'}</span><button className="cart-pill" onClick={() => document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' })}>🛒 السلة ({cartItems.reduce((s,p)=>s+p.qty,0)})</button></div></header>
    <main>
      <section className="hero"><div className="hero-copy"><span className="eyebrow">خدمة محلية • عين صالح</span><h1>كل ما تحتاجه،<br/><em>يوصلك لعندك.</em></h1><p>اطلب من المتاجر والخدمات المحلية بسهولة، وتابع طلبك خطوة بخطوة.</p><a className="primary-link" href="#shops">اكتشف الخدمات <span>←</span></a></div><div className="hero-art"><div className="sun"></div><div className="delivery-card"><span>🛵</span><b>توصيل داخل عين صالح</b><small>بكل سهولة وأمان</small></div><div className="float-chip chip-one">🥗 منتجات طازجة</div><div className="float-chip chip-two">⚡ طلب سهل وسريع</div></div></section>
      <section className="rolebar"><div><b>مساحة العمل</b><small>اختر الواجهة لاستعراضها</small></div><div className="role-tabs"><button className={role==='customer'?'active':''} onClick={()=>setRole('customer')}>👤 الزبون</button><button className={role==='driver'?'active':''} onClick={()=>setRole('driver')}>🛵 السائق</button><button className={role==='admin'?'active':''} onClick={()=>setRole('admin')}>⚙️ الإدارة</button></div></section>
      {role==='customer' && <><section id="shops" className="section"><div className="section-heading"><div><span className="eyebrow">تسوق محلي</span><h2>اكتشف ما حولك</h2></div><span className="muted">خدمات عين صالح في مكان واحد</span></div><div className="categories">{categories.map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="product-grid">{visible.map(p=><article className="product-card" key={p.id}><div className="product-emoji">{p.emoji}</div><span className="product-category">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><b>{money(p.price)}</b><button onClick={()=>add(p.id)}>＋ أضف</button></div></article>)}</div></section>
      <section className="checkout section" id="checkout"><div className="section-heading"><div><span className="eyebrow">خطوة أخيرة</span><h2>تأكيد الطلب</h2></div><span className="muted">الدفع عند الاستلام تجريبي حالياً</span></div><div className="checkout-grid"><div className="panel"><h3>معلومات التوصيل</h3><label>رقم الهاتف<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="05xxxxxxxx" inputMode="tel"/></label><label>عنوان التوصيل<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="الحي، الشارع، أقرب معلم"/></label><label>ملاحظة للسائق<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="تفاصيل إضافية (اختياري)"/></label><b className="map-label">حدد موقع التسليم على الخريطة</b><div className="map-wrap"><MapContainer center={position} zoom={13} scrollWheelZoom={false}><TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={position}/><MapClick onChoose={(lat,lng)=>setPosition([lat,lng])}/></MapContainer></div><small className="muted">اضغط على الخريطة لتحديد موقعك التقريبي. لا يوجد تتبع GPS مباشر حتى الآن.</small></div><div className="panel order-panel"><h3>ملخص السلة</h3>{cartItems.length===0?<p className="empty">السلة فارغة. أضف منتجات للمتابعة.</p>:cartItems.map(p=><div className="cart-line" key={p.id}><div><b>{p.name}</b><small>{money(p.price)} × {p.qty}</small></div><div className="qty"><button onClick={()=>remove(p.id)}>−</button><b>{p.qty}</b><button onClick={()=>add(p.id)}>＋</button></div></div>)}<div className="total-line"><span>المجموع</span><b>{money(total)}</b></div><button className="submit-order" disabled={busy || !cartItems.length} onClick={placeOrder}>{busy?'جارٍ الإرسال…':'تأكيد الطلب ←'}</button>{notice&&<p className="notice">{notice}</p>}</div></div></section>
      {orders.length>0&&<section className="section"><h2>طلبات هذه الجلسة</h2>{orders.map(o=><div className="order-history" key={o.id}><b>{o.id}</b><span>{o.items}</span><b>{money(o.total)}</b><small>{o.status}</small></div>)}</section>}</>}
      {role==='driver'&&<section className="section dashboard"><span className="eyebrow">بوابة السائق</span><h2>مرحباً بك في فريق التوصيل</h2><p>هذه واجهة أولية. بعد إعداد حسابات السائقين ستظهر هنا الطلبات المسندة إليك وتحديثات حالتها.</p><div className="stat-grid"><div><b>{orders.length}</b><small>طلبات تجريبية في هذه الجلسة</small></div><div><b>GPS</b><small>التتبع المباشر قيد التطوير</small></div></div><p className="notice">لا تعتمد هذه الشاشة لتوزيع الطلبات الحقيقية قبل إعداد تسجيل الدخول وصلاحيات السائق.</p></section>}
      {role==='admin'&&<section className="section dashboard"><span className="eyebrow">لوحة التحكم</span><h2>إدارة عين صالح إكسبريس</h2><p>ملخص أولي للبيئة التجريبية. الإدارة الحقيقية تحتاج حساب مدير محمياً وصلاحيات قاعدة بيانات.</p><div className="stat-grid"><div><b>{orders.length}</b><small>طلبات هذه الجلسة</small></div><div><b>{products.length}</b><small>عناصر كتالوج تجريبي</small></div><div><b>{isConfigured?'متصل':'غير مربوط'}</b><small>حالة Supabase</small></div></div><h3>آخر الطلبات التجريبية</h3>{orders.length?orders.map(o=><div className="order-history" key={o.id}><b>{o.id}</b><span>{o.phone}</span><b>{money(o.total)}</b></div>):<p className="empty">لا توجد طلبات في هذه الجلسة.</p>}</section>}
      <section className="trust-strip"><div>📍<b>محلي في عين صالح</b><small>مصمم لخدمة المدينة</small></div><div>🔒<b>بياناتك بأمان</b><small>نفعّل الحماية قبل الإطلاق</small></div><div>🤝<b>خدمة قريبة منك</b><small>متاجر وخدمات محلية</small></div></section>
    </main><footer><b>عين صالح إكسبريس</b><span>© 2026 — منصة محلية قيد التطوير</span></footer>
  </div>;
}
