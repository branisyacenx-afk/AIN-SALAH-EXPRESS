import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from './lib/supabase';
import { Activity, AlertTriangle, BadgeCheck, BarChart3, CalendarDays, CheckCircle2, Clock3, Gauge, RefreshCw, Shield, ShieldCheck, Star, Store, Truck, Users, UserPlus, XCircle } from 'lucide-react';

type Mode = 'permissions-admin' | 'reports-admin' | 'quality-admin' | 'performance-admin' | 'finance-admin';
type Period = 'day' | 'week' | 'month';
type Row = Record<string, any>;
type Staff = { user_id: string; role_key: string; permissions: Record<string, boolean>; is_active: boolean; created_at: string };
type Profile = { id: string; full_name: string; phone: string | null };

const permissionLabels: Record<string, string> = {
  'dashboard.view': 'الرئيسية ومؤشرات التشغيل',
  'orders.view': 'عرض الطلبات',
  'orders.manage': 'تحديث الطلبات وإسناد السائق',
  'reports.view': 'التقارير اليومية والأسبوعية والشهرية',
  'quality.view': 'مركز جودة الخدمة والتقييمات',
  'performance.view': 'أداء السائقين والمتاجر',
  'stores.view': 'عرض المتاجر والشركاء',
  'stores.manage': 'إدارة المتاجر والشركاء',
  'drivers.view': 'عرض السائقين ومواقعهم',
  'drivers.manage': 'إدارة السائقين وطلبات الانضمام',
  'catalog.manage': 'إدارة المنتجات والتصنيفات',
  'settings.manage': 'إعدادات المنصة والتسعير والمناطق',
  'finance.view': 'عرض المدفوعات والسجلات المالية'
};

const rolePresets: Record<string, { label: string; description: string; permissions: Record<string, boolean> }> = {
  operations_manager: { label: 'مدير العمليات', description: 'متابعة الطلبات والجودة والأداء دون صلاحيات مالية أو إدارة المستخدمين', permissions: { 'dashboard.view': true, 'orders.view': true, 'orders.manage': true, 'reports.view': true, 'quality.view': true, 'performance.view': true, 'stores.view': true, 'drivers.view': true } },
  dispatch_manager: { label: 'مسؤول التوصيل', description: 'متابعة الطلبات والسائقين والإسناد', permissions: { 'dashboard.view': true, 'orders.view': true, 'orders.manage': true, 'drivers.view': true, 'drivers.manage': true, 'performance.view': true } },
  quality_auditor: { label: 'مراقب الجودة', description: 'قراءة التقييمات ومؤشرات الجودة والتقارير دون تعديل العمليات', permissions: { 'dashboard.view': true, 'reports.view': true, 'quality.view': true, 'performance.view': true } },
  partner_manager: { label: 'مسؤول الشركاء', description: 'إدارة المتاجر والكتالوج ومتابعة أداء الشركاء', permissions: { 'dashboard.view': true, 'stores.view': true, 'stores.manage': true, 'catalog.manage': true, 'performance.view': true } },
  order_observer: { label: 'مراقب الطلبات', description: 'قراءة الطلبات ومؤشرات الجودة دون تعديلها', permissions: { 'dashboard.view': true, 'orders.view': true, 'quality.view': true } },
  finance_viewer: { label: 'مراقب مالي', description: 'قراءة التقارير والمدفوعات والسجلات المالية فقط', permissions: { 'dashboard.view': true, 'reports.view': true, 'finance.view': true } },
  catalog_manager: { label: 'مسؤول الكتالوج', description: 'إدارة المنتجات والتصنيفات', permissions: { 'dashboard.view': true, 'stores.view': true, 'catalog.manage': true } },
  custom: { label: 'صلاحيات مخصصة', description: 'حدد الصلاحيات يدوياً حسب مسؤولية الموظف', permissions: {} }
};

const formatMoney = (value: number) => new Intl.NumberFormat('fr-DZ').format(Math.round(value || 0)) + ' دج';
const formatDate = (value: string) => new Date(value).toLocaleDateString('ar-DZ', { day: '2-digit', month: 'short' });
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function periodBounds(period: Period) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'month') start.setDate(1);
  const end = new Date(start);
  if (period === 'day') end.setDate(end.getDate() + 1);
  if (period === 'week') end.setDate(end.getDate() + 7);
  if (period === 'month') end.setMonth(end.getMonth() + 1);
  return { start, end };
}

async function readAll(table: string, columns: string): Promise<Row[]> {
  if (!supabase) return [];
  const rows: Row[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export default function AdminGovernance({ view, currentUserId }: { view: Mode; currentUserId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('day');
  const [orders, setOrders] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [stores, setStores] = useState<Row[]>([]);
  const [drivers, setDrivers] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [settlements, setSettlements] = useState<Row[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState('operations_manager');
  const [draftPermissions, setDraftPermissions] = useState<Record<string, boolean>>(rolePresets.operations_manager.permissions);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!supabase) { setError('قاعدة البيانات غير متصلة.'); return; }
    setBusy(true); setError('');
    try {
      if (view === 'permissions-admin') {
        const [p, s] = await Promise.all([
          supabase.from('profiles').select('id,full_name,phone').order('full_name'),
          supabase.from('admin_staff').select('user_id,role_key,permissions,is_active,created_at').order('created_at', { ascending: false })
        ]);
        if (p.error) throw p.error;
        if (s.error) throw s.error;
        setProfiles((p.data || []) as Profile[]);
        setStaff((s.data || []) as Staff[]);
      } else {
        const [o, r, st, dp, prof, tk, fl, py, sr] = await Promise.all([
          readAll('admin_governance_orders', 'id,order_number,status,total_amount,subtotal_dzd,created_at,delivered_at,accepted_at,driver_id,store_id'),
          readAll('reviews', 'id,order_id,rating,comment,driver_id,store_id,created_at'),
          view === 'performance-admin' ? readAll('admin_performance_stores', 'id,name,is_active') : Promise.resolve([]),
          view === 'performance-admin' ? readAll('admin_performance_driver_directory', 'user_id,full_name,vehicle_type,is_approved,is_online,is_suspended,created_at') : Promise.resolve([]),
          Promise.resolve([]),
          view === 'quality-admin' ? readAll('admin_support_ticket_metrics', 'id,status,priority,created_at,updated_at') : Promise.resolve([]),
          view === 'finance-admin' ? readAll('financial_ledger', 'id,entity_type,entry_type,direction,amount_dzd,status,reference,created_at') : Promise.resolve([]),
          view === 'finance-admin' ? readAll('payments', 'id,order_id,method,status,amount_dzd,provider,created_at') : Promise.resolve([]),
          view === 'finance-admin' ? readAll('settlement_requests', 'id,entity_type,status,amount_dzd,requested_at') : Promise.resolve([])
        ]);
        setOrders(o); setReviews(r); setStores(st); setDrivers(dp); setProfiles(dp.map(d => ({ id: d.user_id, full_name: d.full_name || 'سائق', phone: null })) as Profile[]); setTickets(tk); setLedger(fl); setPayments(py); setSettlements(sr);
      }
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات مركز الإدارة. تحقق من صلاحيات الحساب والاتصال.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, [view, period]);

  const availableProfiles = useMemo(() => profiles.filter(p => p.id !== currentUserId && (!staff.some(s => s.user_id === p.id) || p.id === editingUserId)), [profiles, staff, currentUserId, editingUserId]);
  const periodData = useMemo(() => {
    const { start, end } = periodBounds(period);
    return orders.filter(o => {
      const date = new Date(o.created_at);
      return date >= start && date < end;
    });
  }, [orders, period]);
  const delivered = periodData.filter(o => o.status === 'delivered');
  const cancelled = periodData.filter(o => o.status === 'cancelled');
  const sales = delivered.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const completionRate = periodData.length ? delivered.length / periodData.length * 100 : 0;
  const cancelRate = periodData.length ? cancelled.length / periodData.length * 100 : 0;
  const deliveryMinutes = delivered.filter(o => o.delivered_at && o.created_at).map(o => (new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()) / 60000).filter(n => n >= 0 && n < 1440);
  const { start: qualityStart, end: qualityEnd } = periodBounds(period);
  const periodReviews = reviews.filter(r => new Date(r.created_at) >= qualityStart && new Date(r.created_at) < qualityEnd);
  const avgRating = average(periodReviews.map(r => Number(r.rating)).filter(n => n >= 1 && n <= 5));
  const lowRatings = periodReviews.filter(r => Number(r.rating) <= 2);
  const openTickets = tickets.filter(t => !['closed', 'resolved'].includes(String(t.status).toLowerCase()));

  const chart = useMemo(() => {
    const { start, end } = periodBounds(period);
    const slots: { label: string; count: number; delivered: number }[] = [];
    if (period === 'day') {
      for (let h = 0; h < 24; h++) {
        const d = new Date(start); d.setHours(h);
        slots.push({ label: String(h).padStart(2, '0'), count: 0, delivered: 0 });
      }
      periodData.forEach(o => { const h = new Date(o.created_at).getHours(); if (slots[h]) { slots[h].count++; if (o.status === 'delivered') slots[h].delivered++; } });
    } else {
      const cursor = new Date(start);
      while (cursor < end && slots.length < 32) {
        const key = cursor.toISOString().slice(0, 10);
        slots.push({ label: String(cursor.getDate()), count: 0, delivered: 0 });
        cursor.setDate(cursor.getDate() + 1);
        void key;
      }
      periodData.forEach(o => {
        const day = new Date(o.created_at).getDate();
        const slot = slots.find(s => Number(s.label) === day);
        if (slot) { slot.count++; if (o.status === 'delivered') slot.delivered++; }
      });
    }
    return slots;
  }, [periodData, period]);
  const chartMax = Math.max(1, ...chart.map(s => s.count));

  const driverPerformance = useMemo(() => drivers.map(d => {
    const assigned = orders.filter(o => o.driver_id === d.user_id);
    const done = assigned.filter(o => o.status === 'delivered');
    const ratings = reviews.filter(r => r.driver_id === d.user_id).map(r => Number(r.rating));
    const profile = profiles.find(p => p.id === d.user_id);
    return { ...d, user_id: String(d.user_id || ''), vehicle_type: String(d.vehicle_type || ''), is_suspended: Boolean(d.is_suspended), is_approved: Boolean(d.is_approved), is_online: Boolean(d.is_online), name: profile?.full_name || 'سائق', phone: profile?.phone || '', assigned: assigned.length, done: done.length, rating: average(ratings), ratingCount: ratings.length, completion: assigned.length ? done.length / assigned.length * 100 : 0 };
  }).sort((a, b) => b.done - a.done), [drivers, orders, reviews, profiles]);

  const storePerformance = useMemo(() => stores.map(st => {
    const related = orders.filter(o => o.store_id === st.id);
    const done = related.filter(o => o.status === 'delivered');
    const ratings = reviews.filter(r => r.store_id === st.id).map(r => Number(r.rating));
    return { ...st, id: String(st.id || ''), name: String(st.name || 'متجر'), is_active: Boolean(st.is_active), totalOrders: related.length, done: done.length, cancelled: related.filter(o => o.status === 'cancelled').length, sales: done.reduce((sum, o) => sum + Number(o.subtotal_dzd || 0), 0), rating: average(ratings), ratingCount: ratings.length };
  }).sort((a, b) => b.sales - a.sales), [stores, orders, reviews]);

  async function addStaff(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !selectedUser) return;
    if (!Object.values(draftPermissions).some(Boolean)) { setError('اختر صلاحية واحدة على الأقل قبل حفظ الموظف.'); return; }
    setSaving(true); setNotice(''); setError('');
    const { error: saveError } = await supabase.from('admin_staff').upsert({
      user_id: selectedUser, role_key: roleKey, permissions: draftPermissions, is_active: true, created_by: currentUserId, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (saveError) setError('تعذر حفظ الموظف: ' + saveError.message);
    else { setNotice('تم حفظ صلاحيات الموظف. ستُطبّق الصلاحيات عند تحديث الجلسة أو إعادة تسجيل الدخول.'); setSelectedUser(''); setEditingUserId(null); await load(); }
    setSaving(false);
  }

  function editStaffMember(member: Staff) {
    setSelectedUser(member.user_id);
    setEditingUserId(member.user_id);
    setRoleKey(rolePresets[member.role_key] ? member.role_key : 'custom');
    setDraftPermissions({ ...(member.permissions || {}) });
    setNotice('تعديل صلاحيات الموظف المحدد. احفظ التغييرات لاعتمادها.');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function setStaffActive(userId: string, active: boolean) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from('admin_staff').update({ is_active: active, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (updateError) setError(updateError.message);
    else { setNotice(active ? 'تم تفعيل حساب الموظف.' : 'تم إيقاف صلاحيات الموظف.'); await load(); }
  }

  async function removeStaff(userId: string) {
    if (!supabase || !window.confirm('حذف صلاحيات هذا الموظف من لوحة الإدارة؟ لن يتم حذف حسابه الشخصي.')) return;
    const { error: deleteError } = await supabase.from('admin_staff').delete().eq('user_id', userId);
    if (deleteError) setError(deleteError.message);
    else { setNotice('تم حذف صلاحيات الإدارة مع الإبقاء على حساب المستخدم.'); await load(); }
  }

  function chooseRole(key: string) {
    setRoleKey(key);
    setDraftPermissions({ ...rolePresets[key].permissions });
  }

  const periodLabel = period === 'day' ? 'اليوم' : period === 'week' ? 'هذا الأسبوع' : 'هذا الشهر';
  const title = view === 'permissions-admin' ? 'إدارة الصلاحيات وفريق الإدارة' : view === 'reports-admin' ? 'التقارير الزمنية' : view === 'quality-admin' ? 'مركز جودة الخدمة' : view === 'finance-admin' ? 'مركز المتابعة المالية' : 'أداء السائقين والمتاجر';

  return <section className="admin-workspace governance-workspace" dir="rtl">
    <div className="admin-welcome">
      <div><span className="eyebrow">AIN SALAH EXPRESS · GOVERNANCE & INTELLIGENCE</span><h1>{title}</h1><p>{view === 'permissions-admin' ? 'إنشاء أدوار تشغيلية بصلاحيات محددة دون مشاركة حساب المدير الرئيسي.' : 'مؤشرات مستخرجة من الطلبات والتقييمات المسجلة فعلياً في قاعدة البيانات.'}</p></div>
      <button className="admin-refresh" type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/> تحديث البيانات</button>
    </div>
    {error && <div className="governance-alert"><AlertTriangle size={17}/>{error}</div>}
    {notice && <div className="governance-notice"><CheckCircle2 size={17}/>{notice}</div>}
    {busy && <div className="governance-loading">جارٍ تحديث بيانات المركز…</div>}

    {view === 'permissions-admin' && <>
      <div className="governance-section-head"><div><span className="eyebrow">TEAM ACCESS CONTROL</span><h2>إضافة موظف وتحديد صلاحياته</h2><p>يمكن إسناد الصلاحيات إلى حساب موجود مسبقاً في المنصة. لا يتم إنشاء حساب أو تغيير كلمة مروره من هنا.</p></div><span className="governance-count"><Users size={15}/>{staff.length} موظف إداري</span></div>
      <form className="governance-panel" onSubmit={addStaff}>
        <div className="governance-form-grid">
          <label>حساب المستخدم<select required value={selectedUser} onChange={e => setSelectedUser(e.target.value)}><option value="">اختر مستخدماً مسجلاً</option>{availableProfiles.map(p => <option value={p.id} key={p.id}>{p.full_name || 'مستخدم'}{p.phone ? ' · ' + p.phone : ''}</option>)}</select></label>
          <label>الدور الوظيفي<select value={roleKey} onChange={e => chooseRole(e.target.value)}>{Object.entries(rolePresets).map(([key, role]) => <option key={key} value={key}>{role.label}</option>)}</select></label>
        </div>
        <p className="governance-role-description">{rolePresets[roleKey].description}</p>
        <div className="governance-permission-grid">{Object.entries(permissionLabels).map(([key, label]) => <label key={key} className="governance-permission"><input type="checkbox" checked={Boolean(draftPermissions[key])} onChange={e => { setRoleKey('custom'); setDraftPermissions(p => ({ ...p, [key]: e.target.checked })); }}/><span>{label}</span></label>)}</div>
        <div className="governance-form-actions"><button className="primary" type="submit" disabled={saving || !selectedUser}><UserPlus size={16}/>{saving ? 'جارٍ الحفظ…' : editingUserId ? 'تحديث صلاحيات الموظف' : 'حفظ الموظف والصلاحيات'}</button>{editingUserId && <button type="button" className="governance-cancel-edit" onClick={() => { setEditingUserId(null); setSelectedUser(''); setRoleKey('operations_manager'); setDraftPermissions({ ...rolePresets.operations_manager.permissions }); }}>إلغاء التعديل</button>}</div>
      </form>
      <div className="governance-section-head"><div><span className="eyebrow">ACTIVE ADMIN STAFF</span><h2>الفريق والصلاحيات الحالية</h2></div></div>
      <div className="governance-staff-list">{staff.map(s => {
        const p = profiles.find(x => x.id === s.user_id);
        const activeCount = Object.values(s.permissions || {}).filter(Boolean).length;
        return <article className="governance-staff-card" key={s.user_id}>
          <div className="governance-staff-identity"><div className="governance-avatar"><Shield size={20}/></div><div><b>{p?.full_name || 'مستخدم إداري'}</b><small>{p?.phone || s.user_id.slice(0, 8)} · {rolePresets[s.role_key]?.label || 'دور مخصص'}</small></div></div>
          <div className="governance-staff-meta"><span>{activeCount} صلاحية</span><span className={s.is_active ? 'status-active' : 'status-paused'}>{s.is_active ? 'مفعّل' : 'موقوف'}</span></div>
          <div className="governance-staff-actions"><button type="button" onClick={() => editStaffMember(s)}>تعديل الصلاحيات</button><button type="button" onClick={() => void setStaffActive(s.user_id, !s.is_active)}>{s.is_active ? 'إيقاف الصلاحيات' : 'إعادة التفعيل'}</button><button type="button" className="danger-link" onClick={() => void removeStaff(s.user_id)}>حذف الصلاحيات</button></div>
        </article>;
      })}{!staff.length && <div className="governance-empty">لا يوجد موظفون إداريون إضافيون. حساب المدير الرئيسي يبقى مستقلاً ولا يظهر ضمن هذه القائمة.</div>}</div>
    </>}

    {view === 'reports-admin' && <>
      <div className="governance-period-switch" role="group" aria-label="الفترة الزمنية">
        {(['day', 'week', 'month'] as Period[]).map(p => <button type="button" key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p === 'day' ? 'يومي' : p === 'week' ? 'أسبوعي' : 'شهري'}</button>)}
        <span><CalendarDays size={15}/>{periodLabel}</span>
      </div>
      <div className="admin-kpis governance-kpis">
        <article><span>الطلبات المستلمة</span><b>{periodData.length}</b><small>{periodLabel}</small></article>
        <article><span>الطلبات المكتملة</span><b>{delivered.length}</b><small>{completionRate.toFixed(1)}% من الطلبات</small></article>
        <article><span>الطلبات الملغاة</span><b>{cancelled.length}</b><small>{cancelRate.toFixed(1)}% من الطلبات</small></article>
        <article><span>قيمة الطلبات المسلّمة</span><b>{formatMoney(sales)}</b><small>ليست ربحاً صافياً</small></article>
        <article><span>متوسط قيمة الطلب</span><b>{formatMoney(delivered.length ? sales / delivered.length : 0)}</b><small>للطلبات المكتملة</small></article>
      </div>
      <article className="governance-panel"><div className="governance-section-head"><div><span className="eyebrow">ORDER VOLUME</span><h2>حركة الطلبات خلال {periodLabel}</h2></div><span className="governance-count">{periodData.length} طلب</span></div>
        <div className={'governance-chart ' + (period === 'day' ? 'hourly' : 'daily')}>{chart.map((slot, i) => <div className="governance-chart-col" key={i} title={slot.label + ': ' + slot.count + ' طلب'}><div className="governance-chart-bars"><i style={{ height: (slot.count / chartMax * 100) + '%' }}/><b style={{ height: (slot.delivered / chartMax * 100) + '%' }}/></div><small>{period === 'day' && i % 3 !== 0 ? '' : slot.label}</small></div>)}</div>
        <div className="governance-chart-legend"><span><i/>كل الطلبات</span><span><i/>المكتملة</span></div>
      </article>
      <article className="governance-panel"><div className="governance-section-head"><div><span className="eyebrow">STATUS BREAKDOWN</span><h2>تفصيل الحالات</h2></div></div>
        {Object.entries({ pending: 'بانتظار المتجر', accepted: 'مقبول', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز', assigned: 'تم تعيين السائق', picked_up: 'استلمه السائق', on_the_way: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغى' }).map(([key, label]) => { const count = periodData.filter(o => o.status === key).length; return count ? <div className="governance-breakdown-row" key={key}><span>{label}</span><b>{count}</b><i><em style={{ width: (count / Math.max(1, periodData.length) * 100) + '%' }}/></i></div> : null; })}
        {!periodData.length && <div className="governance-empty">لا توجد طلبات مسجلة خلال هذه الفترة بعد. ستبدأ التقارير بالامتلاء مع أول طلب حقيقي.</div>}
      </article>
    </>}

    {view === 'quality-admin' && <>
      <div className="governance-period-switch" role="group" aria-label="فترة مؤشرات الجودة">{(['day', 'week', 'month'] as Period[]).map(p => <button type="button" key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p === 'day' ? 'اليوم' : p === 'week' ? 'هذا الأسبوع' : 'هذا الشهر'}</button>)}<span><CalendarDays size={15}/>{periodLabel}</span></div>
      <div className="admin-kpis governance-kpis">
        <article><span>نسبة إتمام الطلبات</span><b>{completionRate.toFixed(1)}%</b><small>ضمن {periodLabel}</small></article>
        <article><span>نسبة الإلغاء</span><b>{cancelRate.toFixed(1)}%</b><small>ضمن {periodLabel}</small></article>
        <article><span>متوسط التوصيل</span><b>{deliveryMinutes.length ? Math.round(average(deliveryMinutes)) + ' د' : '—'}</b><small>من إنشاء الطلب حتى التسليم</small></article>
        <article><span>متوسط التقييم</span><b>{reviews.length ? avgRating.toFixed(1) + '/5' : '—'}</b><small>{periodReviews.length} تقييم خلال {periodLabel}</small></article>
        <article><span>تقييمات منخفضة</span><b>{lowRatings.length}</b><small>نجمتان أو أقل</small></article>
        <article><span>تذاكر دعم مفتوحة</span><b>{openTickets.length}</b><small>حسب حالات التذاكر</small></article>
      </div>
      <div className="governance-two-col">
        <article className="governance-panel"><div className="governance-section-head"><div><span className="eyebrow">CUSTOMER VOICE</span><h2>آخر تقييمات العملاء</h2></div><span className="governance-count"><Star size={14}/>{periodReviews.length}</span></div>
          {[...periodReviews].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0,12).map(r => <div className="governance-review" key={r.id}><div><b>{'★'.repeat(Math.max(0, Math.min(5, Number(r.rating))))}{'☆'.repeat(5-Math.max(0, Math.min(5, Number(r.rating))))}</b><small>{formatDate(r.created_at)}</small></div><p>{r.comment || 'بدون تعليق نصي'}</p><span>طلب #{String(r.order_id || '').slice(0, 8)}</span></div>)}
          {!reviews.length && <div className="governance-empty">لا توجد تقييمات خلال هذه الفترة. ستظهر آراء العملاء بعد تسليم الطلبات وتقييمها.</div>}
        </article>
        <article className="governance-panel"><div className="governance-section-head"><div><span className="eyebrow">SERVICE ALERTS</span><h2>مؤشرات تحتاج انتباهاً</h2></div></div>
          <div className="governance-alert-line"><AlertTriangle size={17}/><span>التقييمات المنخفضة (نجمتان أو أقل)</span><b>{lowRatings.length}</b></div>
          <div className="governance-alert-line"><Clock3 size={17}/><span>طلبات لم تكتمل ضمن الفترة</span><b>{periodData.filter(o => !['delivered', 'cancelled'].includes(o.status)).length}</b></div>
          <div className="governance-alert-line"><XCircle size={17}/><span>الطلبات الملغاة</span><b>{cancelled.length}</b></div>
          <div className="governance-alert-line"><CheckCircle2 size={17}/><span>الطلبات المسلّمة</span><b>{delivered.length}</b></div>
          <p className="governance-footnote">هذه المؤشرات للتنبيه والمراجعة وليست إثباتاً تلقائياً لوجود مخالفة. لا تتوفر حالياً بيانات معيارية لوعد زمني موحد للتوصيل.</p>
        </article>
      </div>
    </>}

    {view === 'finance-admin' && <>
      <div className="admin-kpis governance-kpis">
        <article><span>حركات السجل المالي</span><b>{ledger.length}</b><small>كل السجلات المتاحة</small></article>
        <article><span>مجموع الحركات المدينة</span><b>{formatMoney(ledger.filter(x => x.direction === 'debit').reduce((sum,x) => sum + Number(x.amount_dzd || 0),0))}</b><small>حسب اتجاه السجل</small></article>
        <article><span>مجموع الحركات الدائنة</span><b>{formatMoney(ledger.filter(x => x.direction === 'credit').reduce((sum,x) => sum + Number(x.amount_dzd || 0),0))}</b><small>حسب اتجاه السجل</small></article>
        <article><span>سجلات المدفوعات</span><b>{payments.length}</b><small>لا تعني أن الدفع الإلكتروني مفعل</small></article>
        <article><span>طلبات التسوية</span><b>{settlements.length}</b><small>كل الحالات المسجلة</small></article>
      </div>
      <div className="governance-two-col">
        <article className="governance-panel"><div className="governance-section-head"><div><span className="eyebrow">FINANCIAL LEDGER</span><h2>آخر الحركات المالية</h2></div></div>
          <div className="governance-table-wrap"><table className="governance-table"><thead><tr><th>النوع</th><th>الاتجاه</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>{[...ledger].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,30).map(x=><tr key={x.id}><td>{x.entry_type || x.entity_type}</td><td>{x.direction === 'credit' ? 'دائن' : x.direction === 'debit' ? 'مدين' : x.direction}</td><td>{formatMoney(Number(x.amount_dzd || 0))}</td><td>{x.status}</td><td>{formatDate(x.created_at)}</td></tr>)}</tbody></table></div>
          {!ledger.length && <div className="governance-empty">لا توجد حركات مالية مسجلة حالياً.</div>}
        </article>
        <article className="governance-panel"><div className="governance-section-head"><div><span className="eyebrow">PAYMENT & SETTLEMENT STATUS</span><h2>المدفوعات والتسويات</h2></div></div>
          <div className="governance-alert-line"><BadgeCheck size={17}/><span>مدفوعات ناجحة</span><b>{payments.filter(x => ['paid','succeeded','completed'].includes(String(x.status).toLowerCase())).length}</b></div>
          <div className="governance-alert-line"><Clock3 size={17}/><span>مدفوعات قيد المتابعة</span><b>{payments.filter(x => !['paid','succeeded','completed','failed','cancelled','refunded'].includes(String(x.status).toLowerCase())).length}</b></div>
          <div className="governance-alert-line"><AlertTriangle size={17}/><span>تسويات بانتظار المعالجة</span><b>{settlements.filter(x => !['paid','completed','rejected','cancelled'].includes(String(x.status).toLowerCase())).length}</b></div>
          <p className="governance-footnote">هذه الشاشة للقراءة والمراجعة فقط. لا تنفذ دفعاً أو تحويلاً مالياً ولا تستنتج ربحاً صافياً من الحركات وحدها.</p>
        </article>
      </div>
    </>}
    {view === 'performance-admin' && <>
      <div className="governance-section-head"><div><span className="eyebrow">DELIVERY PARTNER SCORECARD</span><h2>أداء السائقين</h2><p>الإنجازات والتقييمات المسجلة لكل سائق. لا تُحتسب ساعات العمل أو المسافات غير المسجلة.</p></div><span className="governance-count"><Truck size={15}/>{drivers.length} سائق</span></div>
      <div className="governance-performance-list">{driverPerformance.map(d => <article className="governance-performance-card" key={d.user_id}><div className="governance-performance-title"><div className="governance-avatar"><Truck size={19}/></div><div><b>{d.name}</b><small>{d.phone || d.vehicle_type || 'سائق توصيل'}</small></div><span className={d.is_suspended || !d.is_approved ? 'status-paused' : d.is_online ? 'status-active' : 'status-idle'}>{d.is_suspended ? 'موقوف' : !d.is_approved ? 'غير معتمد' : d.is_online ? 'متصل' : 'غير متصل'}</span></div><div className="governance-performance-stats"><span><b>{d.done}</b><small>طلبات مكتملة</small></span><span><b>{d.assigned}</b><small>طلبات مسندة</small></span><span><b>{d.ratingCount ? d.rating.toFixed(1) + '/5' : '—'}</b><small>التقييم · {d.ratingCount}</small></span><span><b>{d.completion.toFixed(0)}%</b><small>إتمام المسند</small></span></div></article>)}{!drivers.length && <div className="governance-empty">لا يوجد سائقون مسجلون حالياً. سيظهر الأداء بعد تسجيل السائقين وبدء الطلبات.</div>}</div>
      <div className="governance-section-head"><div><span className="eyebrow">MERCHANT SCORECARD</span><h2>أداء المتاجر والشركاء</h2><p>حجم الطلبات والتسليمات وقيمة المبيعات والتقييمات.</p></div><span className="governance-count"><Store size={15}/>{stores.length} متجر</span></div>
      <div className="governance-performance-list">{storePerformance.map(s => <article className="governance-performance-card" key={s.id}><div className="governance-performance-title"><div className="governance-avatar"><Store size={19}/></div><div><b>{s.name}</b><small>{s.is_active ? 'نشط' : 'غير نشط'}</small></div><span className={s.is_active ? 'status-active' : 'status-paused'}>{s.is_active ? 'نشط' : 'متوقف'}</span></div><div className="governance-performance-stats"><span><b>{s.totalOrders}</b><small>كل الطلبات</small></span><span><b>{s.done}</b><small>مكتملة</small></span><span><b>{s.cancelled}</b><small>ملغاة</small></span><span><b>{formatMoney(s.sales)}</b><small>قيمة المنتجات المسلّمة</small></span><span><b>{s.ratingCount ? s.rating.toFixed(1) + '/5' : '—'}</b><small>التقييم · {s.ratingCount}</small></span></div></article>)}{!stores.length && <div className="governance-empty">لا توجد متاجر مسجلة حالياً. ستظهر مؤشرات الشركاء بعد إعادة تفعيل المتاجر.</div>}</div>
    </>}
  </section>;
}
