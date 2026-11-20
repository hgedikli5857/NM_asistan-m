// Tek bir Supabase istemcisi; diğer dosyalar buradan içe aktarır.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const ACTIVE_ORG_KEY = 'nmd_active_org';

// Oturumdaki kullanıcının profilini, tüm ekiplerini ve aktif ekibini getirir.
export async function loadContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships, error }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('memberships')
      .select('role, status, sponsor_user_id, joined_at, org:organizations(id, name, plan, owner_id, created_at)')
      .eq('user_id', user.id)
  ]);
  if (error) throw error;

  const list = (memberships || []).filter(m => m.status !== 'left' && m.org);
  const saved = localStorage.getItem(ACTIVE_ORG_KEY);
  // Kayıtlı seçim yoksa: kendi kurduğun ekip
  const active = list.find(m => m.org.id === saved) || list.find(m => m.role === 'owner') || list[0] || null;
  return { user, profile, memberships: list, membership: active, org: active?.org || null };
}

export function setActiveOrg(orgId) {
  localStorage.setItem(ACTIVE_ORG_KEY, orgId);
}

export const isLead = ctx => ['owner', 'leader'].includes(ctx?.membership?.role);

// Supabase bir istekte en fazla 1000 satır döndürür; büyük listeleri sayfa sayfa çek.
// make: her çağrıda yeni sorgu kuran fonksiyon. id ile ikincil sıralama sayfalar arası kaymayı önler.
export async function fetchAll(make, { page = 1000, max = 50000 } = {}) {
  let all = [];
  for (let from = 0; from < max; from += page) {
    const { data, error } = await make().order('id').range(from, from + page - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < page) break;
  }
  return { data: all, error: null };
}
