// Rozetler: kullanıcının verilerinden hesaplanır (ayrı tabloya gerek yok)
// stats: { prospects, contacts, presentations, invites, wins, reviews, streak, lessons, tasks, totalLessons, totalTasks }
export const BADGES = [
  { id: 'ilk_aday', icon: 'ti-user-plus', title: 'İlk adım', desc: 'Listeye ilk adayını ekledin.', test: s => s.prospects >= 1 },
  { id: 'liste_20', icon: 'ti-list-check', title: 'Sıcak liste 20', desc: '20 aday ekledin.', test: s => s.prospects >= 20 },
  { id: 'liste_100', icon: 'ti-users-group', title: 'Sıcak liste 100', desc: '100 aday ekledin.', test: s => s.prospects >= 100 },
  { id: 'temas_10', icon: 'ti-message-circle', title: 'Sohbet başlatan', desc: '10 temas kaydettin.', test: s => s.contacts >= 10 },
  { id: 'temas_100', icon: 'ti-messages', title: 'İletişim ustası', desc: '100 temas kaydettin.', test: s => s.contacts >= 100 },
  { id: 'davet_10', icon: 'ti-mail-forward', title: 'Davetçi', desc: '10 adayı davet aşamasına taşıdın.', test: s => s.invites >= 10 },
  { id: 'ilk_sunum', icon: 'ti-presentation', title: 'İlk sunum', desc: 'İlk sunumunu kaydettin.', test: s => s.presentations >= 1 },
  { id: 'sunum_10', icon: 'ti-presentation-analytics', title: 'Sunum ustası', desc: '10 sunum kaydettin.', test: s => s.presentations >= 10 },
  { id: 'ilk_kazanim', icon: 'ti-trophy', title: 'İlk kazanım', desc: 'İlk müşteri ya da iş ortağın oldu.', test: s => s.wins >= 1 },
  { id: 'seri_7', icon: 'ti-flame', title: '7 gün seri', desc: '7 gün art arda aktif oldun.', test: s => s.streak >= 7 },
  { id: 'seri_30', icon: 'ti-bolt', title: '30 gün seri', desc: '30 gün art arda aktif oldun.', test: s => s.streak >= 30 },
  { id: 'hesap_4', icon: 'ti-calendar-check', title: 'Hesap veren', desc: '4 haftalık değerlendirme yaptın.', test: s => s.reviews >= 4 },
  { id: 'ilk_14', icon: 'ti-rocket', title: 'Sağlam başlangıç', desc: '"İlk 14 gün" listesini bitirdin.', test: s => s.totalTasks > 0 && s.tasks >= s.totalTasks },
  { id: 'temel_mezun', icon: 'ti-school', title: 'Temel mezunu', desc: 'Temel seviye derslerini bitirdin.', test: s => s.temelDone },
  { id: 'akademi_mezun', icon: 'ti-certificate', title: 'Akademi mezunu', desc: 'Tüm dersleri bitirdin.', test: s => s.totalLessons > 0 && s.lessons >= s.totalLessons }
];

export function earnedBadges(stats) {
  return BADGES.map(b => ({ ...b, earned: !!b.test(stats) }));
}

// 90 günlük programda kaçıncı gündesin (katılım tarihinden)
export function programDay(joinedAt, now = new Date()) {
  const start = new Date(joinedAt); start.setHours(0, 0, 0, 0);
  const d = Math.floor((now - start) / 864e5) + 1;
  return Math.max(1, d);
}
