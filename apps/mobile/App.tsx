import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './src/lib/supabase';

type Store = { id: string; name: string; category: string; description?: string; address?: string; logo_url?: string | null };
type Product = { id: number; store_id: string | null; name: string; description?: string; category: string; price_dzd: number; image_url?: string | null; is_available: boolean };
type Order = { id: string; order_number?: number; customer_phone: string; delivery_address: string; items: any[]; total_amount: number; status: string; driver_id: string | null; created_at: string };

const C = { ink: '#142b27', green: '#087f5b', mint: '#e8f5ef', gold: '#e5a72c', bg: '#f5f7f5', white: '#fff', muted: '#718078', line: '#e5ebe7', red: '#b42318' };
const money = (n: number) => new Intl.NumberFormat('fr-DZ').format(n) + ' دج';
const statusLabel: Record<string,string> = { pending:'طلب جديد', confirmed:'تم التأكيد', preparing:'قيد التحضير', ready:'جاهز للاستلام', assigned:'تم تعيين سائق', picked_up:'تم الاستلام', on_the_way:'في الطريق إليك', delivered:'تم التسليم', cancelled:'ملغى' };

function PrimaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[s.primary, disabled && { opacity: .5 }]}><Text style={s.primaryText}>{title}</Text></Pressable>;
}
function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor="#94a39a" {...props} style={[s.field, props.style]} />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [address, setAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [tab, setTab] = useState<'browse'|'cart'|'orders'>('browse');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const role = String(session?.user.app_metadata?.role || 'customer');
  const isDriver = role === 'driver';
  const isStaff = role === 'admin' || role === 'merchant';
  const uid = session?.user.id;
  const cartItems = useMemo(() => products.filter(p => cart[p.id]).map(p => ({ ...p, quantity: cart[p.id] })), [products, cart]);
  const subtotal = cartItems.reduce((sum, p) => sum + p.price_dzd * p.quantity, 0);

  useEffect(() => {
    if (!supabase) { setBooting(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const loadCustomer = useCallback(async () => {
    if (!supabase) return;
    const [a,b] = await Promise.all([
      supabase.from('stores').select('id,name,category,description,address,logo_url').eq('is_active', true).order('name'),
      supabase.from('products').select('id,store_id,name,description,category,price_dzd,image_url,is_available').eq('is_available', true).order('name')
    ]);
    if (a.error) Alert.alert('تعذر تحميل المتاجر', a.error.message);
    else setStores((a.data || []) as Store[]);
    if (b.error) Alert.alert('تعذر تحميل المنتجات', b.error.message);
    else setProducts((b.data || []) as Product[]);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!supabase || !uid) return;
    const query = supabase.from('orders').select('id,order_number,customer_phone,delivery_address,items,total_amount,status,driver_id,created_at').order('created_at', { ascending: false }).limit(50);
    const { data, error } = isDriver ? await query.eq('driver_id', uid) : await query.eq('customer_id', uid);
    if (error) Alert.alert('تعذر تحميل الطلبات', error.message);
    else setOrders((data || []) as Order[]);
  }, [uid, isDriver]);

  useEffect(() => {
    if (!session || isStaff) return;
    if (isDriver) loadOrders(); else { loadCustomer(); loadOrders(); }
    const channel = supabase?.channel('mobile-live-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadCustomer())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => loadCustomer())
      .subscribe();
    return () => { if (channel) supabase?.removeChannel(channel); };
  }, [session, isStaff, isDriver, uid, loadCustomer, loadOrders]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let active = true;
    async function begin() {
      if (!tracking || !isDriver || !uid || !supabase) return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { Alert.alert('إذن الموقع مطلوب', 'اسمح للتطبيق باستخدام الموقع أثناء العمل حتى يتمكن الزبون من متابعة السائق.'); setTracking(false); return; }
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 10 }, async position => {
        if (!active) return;
        const { latitude, longitude } = position.coords;
        const { error } = await supabase!.from('driver_locations').upsert({
          driver_id: uid, latitude, longitude, is_available: true, updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id' });
        if (error) console.warn('Driver GPS update failed', error.message);
      });
    }
    begin();
    return () => { active = false; subscription?.remove(); };
  }, [tracking, isDriver, uid]);

  async function authenticate() {
    if (!supabase) return;
    setBusy(true);
    const result = signUp
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim(), phone: phone.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) Alert.alert('تعذر تسجيل الدخول', result.error.message);
    else if (signUp && !result.data.session) Alert.alert('تأكيد البريد', 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيده ثم سجل الدخول.');
  }

  async function placeOrder() {
    if (!supabase || !uid) return;
    if (cartItems.length === 0) return Alert.alert('السلة فارغة', 'أضف منتجات قبل إرسال الطلب.');
    if (address.trim().length < 5 || deliveryPhone.trim().length < 8) return Alert.alert('بيانات التوصيل', 'أدخل عنوان التوصيل ورقم هاتف صحيحاً.');
    setBusy(true);
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: p.coords.latitude, longitude: p.coords.longitude };
      }
    } catch {}
    const { data, error } = await supabase.rpc('place_order', {
      p_customer_phone: deliveryPhone.trim(),
      p_delivery_address: address.trim(),
      p_latitude: coords?.latitude ?? null,
      p_longitude: coords?.longitude ?? null,
      p_notes: notes.trim(),
      p_items: cartItems.map(p => ({ product_id: p.id, quantity: p.quantity }))
    });
    setBusy(false);
    if (error) return Alert.alert('لم يتم إرسال الطلب', error.message);
    setCart({});
    setNotes('');
    setTab('orders');
    await loadOrders();
    Alert.alert('تم استلام طلبك', 'رقم الطلب: ' + String(data).slice(0, 8));
  }

  async function updateOrder(order: Order, nextStatus: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc('update_assigned_order_status', { p_order_id: order.id, p_new_status: nextStatus });
    setBusy(false);
    if (error) Alert.alert('تعذر تحديث الطلب', error.message);
    else loadOrders();
  }

  async function refresh() {
    setRefreshing(true);
    if (isDriver) await loadOrders(); else { await loadCustomer(); await loadOrders(); }
    setRefreshing(false);
  }

  if (booting) return <View style={s.center}><ActivityIndicator size="large" color={C.green}/><Text style={s.muted}>جارٍ تجهيز عين صالح إكسبريس...</Text></View>;
  if (!isSupabaseConfigured || !supabase) return <SafeAreaView style={s.page}><View style={s.brand}><Text style={s.brandMark}>ASE</Text><Text style={s.brandTitle}>عين صالح إكسبريس</Text></View><Text style={s.notice}>يلزم ربط التطبيق بإعدادات Supabase نفسها المستخدمة في الموقع.</Text></SafeAreaView>;

  if (!session) return <SafeAreaView style={s.page}><StatusBar barStyle="dark-content"/><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.authWrap}>
    <View style={s.brand}><Text style={s.brandMark}>ASE</Text><Text style={s.brandTitle}>عين صالح إكسبريس</Text><Text style={s.muted}>خدمات مدينتك، أقرب إليك</Text></View>
    <View style={s.panel}><Text style={s.heading}>{signUp ? 'إنشاء حساب زبون' : 'مرحباً بعودتك'}</Text><Text style={s.muted}>سجل الدخول بنفس حسابك في منصة عين صالح إكسبريس</Text>
      {signUp && <><Field placeholder="الاسم الكامل" value={fullName} onChangeText={setFullName}/><Field placeholder="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/></>}
      <Field placeholder="البريد الإلكتروني" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>
      <Field placeholder="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry/>
      <PrimaryButton title={busy ? 'يرجى الانتظار...' : signUp ? 'إنشاء الحساب' : 'تسجيل الدخول'} onPress={authenticate} disabled={busy}/>
      <Pressable onPress={() => setSignUp(v => !v)} style={s.link}><Text style={s.linkText}>{signUp ? 'لديك حساب؟ تسجيل الدخول' : 'مستخدم جديد؟ إنشاء حساب زبون'}</Text></Pressable>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;

  if (isStaff) return <SafeAreaView style={s.page}><View style={s.brand}><Text style={s.brandTitle}>هذا التطبيق للزبائن والسائقين فقط</Text><Text style={s.muted}>لوحة الإدارة والمتاجر متاحة عبر الموقع على الكمبيوتر والآيباد.</Text><PrimaryButton title="تسجيل الخروج" onPress={() => supabase?.auth.signOut()}/></View></SafeAreaView>;

  if (isDriver) return <SafeAreaView style={s.page}><StatusBar barStyle="dark-content"/><View style={s.header}><View><Text style={s.kicker}>AIN SALAH EXPRESS</Text><Text style={s.heading}>مساحة السائق</Text></View><Pressable onPress={() => supabase?.auth.signOut()}><Text style={s.linkText}>خروج</Text></Pressable></View>
    <View style={s.driverBanner}><Text style={s.driverTitle}>جاهز للتوصيل؟</Text><Text style={s.driverCopy}>فعّل مشاركة الموقع أثناء العمل ليتمكن الزبون من متابعة رحلتك.</Text><PrimaryButton title={tracking ? 'إيقاف مشاركة الموقع' : 'بدء مشاركة الموقع'} onPress={() => setTracking(v => !v)}/></View>
    <Text style={s.sectionTitle}>طلباتي المسندة</Text><FlatList data={orders} keyExtractor={o => o.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={s.list} ListEmptyComponent={<Text style={s.empty}>لا توجد طلبات مسندة إليك حالياً.</Text>} renderItem={({item}) => <View style={s.orderCard}><View style={s.row}><Text style={s.orderNo}>طلب #{item.order_number || item.id.slice(0,8)}</Text><Text style={s.pill}>{statusLabel[item.status] || item.status}</Text></View><Text style={s.body}>{item.delivery_address}</Text><Text style={s.body}>هاتف الزبون: {item.customer_phone}</Text><Text style={s.price}>{money(item.total_amount)}</Text>
      {item.status === 'assigned' && <PrimaryButton title="استلام الطلب" onPress={() => updateOrder(item,'picked_up')} disabled={busy}/>}
      {item.status === 'picked_up' && <PrimaryButton title="انطلاق نحو الزبون" onPress={() => updateOrder(item,'on_the_way')} disabled={busy}/>}
      {item.status === 'on_the_way' && <PrimaryButton title="تأكيد التسليم" onPress={() => updateOrder(item,'delivered')} disabled={busy}/>}
    </View>}/></SafeAreaView>;

  const shownProducts = products.filter(p => !selectedStore || p.store_id === selectedStore);
  return <SafeAreaView style={s.page}><StatusBar barStyle="dark-content"/><View style={s.header}><View><Text style={s.kicker}>AIN SALAH EXPRESS</Text><Text style={s.heading}>أهلاً بك 👋</Text></View><Pressable onPress={() => supabase?.auth.signOut()}><Text style={s.linkText}>خروج</Text></Pressable></View>
    <View style={s.hero}><Text style={s.heroTitle}>وش تحب نوصلك اليوم؟</Text><Text style={s.heroSub}>متاجر وخدمات محلية في عين صالح</Text></View>
    <View style={s.tabs}>{(['browse','cart','orders'] as const).map((v) => <Pressable key={v} onPress={() => setTab(v)} style={[s.tab, tab===v && s.tabActive]}><Text style={[s.tabText,tab===v&&s.tabTextActive]}>{v==='browse'?'اكتشف':v==='cart'?'السلة ('+cartItems.length+')':'طلباتي'}</Text></Pressable>)}</View>
    {tab==='browse' && <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={s.list}>
      <Text style={s.sectionTitle}>المتاجر</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storeRow}><Pressable onPress={() => setSelectedStore(null)} style={[s.storeChip,!selectedStore&&s.storeChipActive]}><Text style={[s.storeChipText,!selectedStore&&s.storeChipTextActive]}>الكل</Text></Pressable>{stores.map(st => <Pressable key={st.id} onPress={() => setSelectedStore(st.id===selectedStore?null:st.id)} style={[s.storeChip,selectedStore===st.id&&s.storeChipActive]}><Text style={[s.storeChipText,selectedStore===st.id&&s.storeChipTextActive]}>{st.name}</Text></Pressable>)}</ScrollView>
      <Text style={s.sectionTitle}>المنتجات</Text>{shownProducts.map(p => <View key={p.id} style={s.productCard}><View style={s.productInfo}><Text style={s.productName}>{p.name}</Text><Text style={s.muted}>{p.description || p.category}</Text><Text style={s.price}>{money(p.price_dzd)}</Text></View><View style={s.qty}><Pressable onPress={() => setCart(old => ({...old,[p.id]:Math.max(0,(old[p.id]||0)-1)}))}><Text style={s.qtyButton}>−</Text></Pressable><Text style={s.qtyValue}>{cart[p.id]||0}</Text><Pressable onPress={() => setCart(old => ({...old,[p.id]:(old[p.id]||0)+1}))}><Text style={s.qtyButton}>+</Text></Pressable></View></View>)}
      {shownProducts.length===0 && <Text style={s.empty}>لا توجد منتجات معروضة حالياً.</Text>}
    </ScrollView>}
    {tab==='cart' && <ScrollView contentContainerStyle={s.list}><Text style={s.sectionTitle}>سلة مشترياتك</Text>{cartItems.map(p=><View key={p.id} style={s.productCard}><View style={s.productInfo}><Text style={s.productName}>{p.name} × {p.quantity}</Text><Text style={s.price}>{money(p.price_dzd*p.quantity)}</Text></View></View>)}<Text style={s.total}>المجموع: {money(subtotal)}</Text><Field placeholder="عنوان التوصيل بالتفصيل" value={address} onChangeText={setAddress}/><Field placeholder="رقم هاتف الاستلام" value={deliveryPhone} onChangeText={setDeliveryPhone} keyboardType="phone-pad"/><Field placeholder="ملاحظات للسائق أو المتجر (اختياري)" value={notes} onChangeText={setNotes}/><Text style={s.muted}>تُحسب رسوم التوصيل وفق إعدادات المنصة عند تأكيد الطلب.</Text><PrimaryButton title={busy?'جارٍ إرسال الطلب...':'تأكيد وإرسال الطلب'} onPress={placeOrder} disabled={busy||cartItems.length===0}/></ScrollView>}
    {tab==='orders' && <FlatList data={orders} keyExtractor={o=>o.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={s.list} ListEmptyComponent={<Text style={s.empty}>لا توجد طلبات بعد. ابدأ باختيار منتجاتك.</Text>} renderItem={({item})=><View style={s.orderCard}><View style={s.row}><Text style={s.orderNo}>طلب #{item.order_number||item.id.slice(0,8)}</Text><Text style={s.pill}>{statusLabel[item.status]||item.status}</Text></View><Text style={s.body}>{item.delivery_address}</Text><Text style={s.price}>{money(item.total_amount)}</Text><Text style={s.muted}>{new Date(item.created_at).toLocaleString('ar-DZ')}</Text></View>}/>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page:{flex:1,backgroundColor:C.bg},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:C.bg},authWrap:{flex:1,justifyContent:'center',padding:22},brand:{alignItems:'center',marginBottom:26},brandMark:{backgroundColor:C.green,color:C.white,fontSize:22,fontWeight:'900',paddingHorizontal:18,paddingVertical:10,borderRadius:16,overflow:'hidden'},brandTitle:{fontSize:25,fontWeight:'900',color:C.ink,marginTop:12},muted:{fontSize:13,color:C.muted,lineHeight:21},notice:{margin:24,textAlign:'center',color:C.ink},panel:{backgroundColor:C.white,borderRadius:24,padding:20,gap:13,borderWidth:1,borderColor:C.line},heading:{fontSize:23,fontWeight:'900',color:C.ink},field:{backgroundColor:'#f7faf8',borderWidth:1,borderColor:C.line,borderRadius:13,paddingHorizontal:14,paddingVertical:13,fontSize:15,color:C.ink,textAlign:'right'},primary:{backgroundColor:C.green,padding:15,borderRadius:14,alignItems:'center',marginTop:6},primaryText:{color:C.white,fontSize:15,fontWeight:'800'},link:{alignItems:'center',padding:8},linkText:{color:C.green,fontWeight:'800'},header:{paddingHorizontal:18,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{fontSize:10,color:C.green,fontWeight:'900',letterSpacing:1},hero:{marginHorizontal:16,backgroundColor:C.ink,borderRadius:22,padding:20,marginBottom:14},heroTitle:{fontSize:22,fontWeight:'900',color:C.white,textAlign:'right'},heroSub:{color:'#d5e6dd',marginTop:7,textAlign:'right'},tabs:{flexDirection:'row',marginHorizontal:14,backgroundColor:'#e9efeb',borderRadius:14,padding:4,marginBottom:8},tab:{flex:1,padding:11,alignItems:'center',borderRadius:11},tabActive:{backgroundColor:C.white},tabText:{color:C.muted,fontWeight:'700'},tabTextActive:{color:C.green},list:{padding:16,paddingBottom:40},sectionTitle:{fontSize:18,fontWeight:'900',color:C.ink,textAlign:'right',marginTop:8,marginBottom:12},storeRow:{gap:8,paddingBottom:12},storeChip:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,paddingHorizontal:15,paddingVertical:11,borderRadius:30},storeChipActive:{backgroundColor:C.green,borderColor:C.green},storeChipText:{color:C.ink,fontWeight:'700'},storeChipTextActive:{color:C.white},productCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:17,padding:14,marginBottom:10,flexDirection:'row',alignItems:'center',gap:12},productInfo:{flex:1,alignItems:'flex-end',gap:4},productName:{fontSize:15,fontWeight:'800',color:C.ink},price:{color:C.green,fontSize:15,fontWeight:'900',marginTop:4},qty:{flexDirection:'row',alignItems:'center',gap:12},qtyButton:{fontSize:24,fontWeight:'900',color:C.green},qtyValue:{fontWeight:'800',color:C.ink},total:{fontSize:18,fontWeight:'900',color:C.ink,textAlign:'right',marginVertical:14},empty:{color:C.muted,textAlign:'center',padding:30,lineHeight:24},orderCard:{backgroundColor:C.white,borderRadius:17,borderWidth:1,borderColor:C.line,padding:15,marginBottom:12,gap:8},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},orderNo:{fontWeight:'900',color:C.ink},pill:{backgroundColor:C.mint,color:C.green,paddingHorizontal:10,paddingVertical:6,borderRadius:20,fontSize:11,fontWeight:'800',overflow:'hidden'},body:{color:C.ink,textAlign:'right'},driverBanner:{margin:16,padding:18,borderRadius:20,backgroundColor:C.ink,gap:9},driverTitle:{fontSize:21,fontWeight:'900',color:C.white,textAlign:'right'},driverCopy:{color:'#d5e6dd',textAlign:'right',lineHeight:22}
});
