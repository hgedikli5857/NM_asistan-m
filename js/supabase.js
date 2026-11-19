// Tek bir Supabase istemcisi; diğer dosyalar buradan içe aktarır.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Oturumdaki kullanıcının profilini ve ekibini (organizasyon) birlikte getirir.
export async function loadContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships, error }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('memberships').select('role, status, org:organizations(id, name, plan)').eq('user_id', user.id)
  ]);
  if (error) throw error;

  // Şimdilik ilk aktif ekip seçilir; çok ekipli seçim Faz 4'te eklenecek.
  const active = (memberships || []).find(m => m.status !== 'left') || null;
  return { user, profile, membership: active, org: active?.org || null };
}
