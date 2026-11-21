// Kişi kartı: WhatsApp bot CRM panelindeki bilgi kartının aynısı, iki yönlü senkron.
// Bot sohbette bilgi topladıkça alanlar dolar; uygulamada düzeltilen alan panele de yazılır.
// Sağlık ve gelir alanları bilinçli olarak hiç taşınmaz.
import { esc } from '../ui.js';
import { STAGES } from '../kazanim/model.js';

export const OPTS = {
  medeni_durum: { bilinmiyor: 'Bilinmiyor', bekar: 'Bekâr', evli: 'Evli', bosanmis: 'Boşanmış', dul: 'Dul' },
  cocuk_sayisi: { bilinmiyor: 'Bilinmiyor', 0: 'Yok', 1: '1', 2: '2', '3+': '3 ve üzeri' },
  liste_turu: { sicak: 'Sıcak', ilik: 'Ilık', soguk: 'Soğuk' },
  kanal: { whatsapp: 'WhatsApp', instagram_dm: 'Instagram DM', facebook: 'Facebook', yuz_yuze: 'Yüz yüze', referans: 'Referans', diger: 'Diğer' },
  stage: Object.fromEntries(STAGES.map(s => [s.id, s.label]))
};

export const FIELDS = [
  { k: 'ad_soyad', label: 'Ad soyad', type: 'text', max: 120 },
  { k: 'yas', label: 'Yaş', type: 'number' },
  { k: 'sehir', label: 'Şehir', type: 'text', max: 60 },
  { k: 'meslek', label: 'Meslek', type: 'text', max: 120 },
  { k: 'medeni_durum', label: 'Medeni durum', type: 'select' },
  { k: 'cocuk_sayisi', label: 'Çocuk', type: 'select' },
  { k: 'ilgi_alanlari', label: 'İlgi alanları', type: 'textarea', max: 500, wide: true },
  { k: 'instagram', label: 'Instagram', type: 'text', max: 80 },
  { k: 'facebook', label: 'Facebook', type: 'text', max: 120 },
  { k: 'diger_sosyal', label: 'Diğer sosyal', type: 'text', max: 200 },
  { k: 'liste_turu', label: 'Liste türü', type: 'select' },
  { k: 'stage', label: 'Aşama', type: 'select' },
  { k: 'kanal', label: 'Kanal', type: 'select' },
  { k: 'ozel_not', label: 'Özel not', type: 'textarea', max: 1000, wide: true }
];
// Doluluk hesabında sayılan alanlar (sosyal ağlardan biri yeter)
const CORE = ['ad_soyad', 'yas', 'sehir', 'meslek', 'medeni_durum', 'cocuk_sayisi', 'ilgi_alanlari'];
const UNKNOWN = v => v === null || v === undefined || v === '' || v === 'bilinmiyor';

const ASAMA_TO_STAGE = { temas_yok: 'liste', ilk_temas: 'temas', bilgi_verildi: 'temas', gorusme_planlandi: 'davet',
  gorusme_yapildi: 'sunum', musteri: 'musteri', ekip_arkadasi: 'is_ortagi', ilgilenmiyor: 'pasif' };

// Aday kaydından kart: bot CRM'e bağlıysa oradaki kart (aynası), değilse uygulamadaki alanlar
export function cardFromProspect(p) {
  const crm = p.extra?.crm;
  const linked = !!(crm?.id && !crm.protected);
  const local = p.extra?.kart || {};
  const k = linked ? (crm.kart || {}) : {};
  const card = {
    ad_soyad: k.ad_soyad || p.full_name || '',
    yas: k.yas ?? local.yas ?? null,
    sehir: k.sehir || crm?.sehir || local.sehir || '',
    meslek: k.meslek || p.occupation || '',
    medeni_durum: k.medeni_durum || local.medeni_durum || 'bilinmiyor',
    cocuk_sayisi: k.cocuk_sayisi || local.cocuk_sayisi || 'bilinmiyor',
    ilgi_alanlari: k.ilgi_alanlari || p.interests || '',
    instagram: k.instagram || p.instagram || '',
    facebook: k.facebook || local.facebook || '',
    diger_sosyal: k.diger_sosyal || local.diger_sosyal || '',
    liste_turu: k.liste_turu || p.temperature || 'ilik',
    stage: p.stage || ASAMA_TO_STAGE[k.asama] || 'liste',
    kanal: k.kanal || local.kanal || '',
    ozel_not: k.ozel_not || local.ozel_not || ''
  };
  return { card, linked, bot: new Set(linked ? (k.bot_doldurdu || []).map(f => (f === 'asama' ? 'stage' : f)) : []),
    tags: linked ? (crm.tags || []) : (p.tags || []), syncedAt: linked ? crm.synced_at : null };
}

// Canlı kart (edge'den gelen) → kart alanları
export function mergeLive(base, live, stage) {
  if (!live) return base;
  const card = { ...base.card };
  for (const f of FIELDS) if (f.k !== 'stage' && f.k in live) card[f.k] = live[f.k] ?? (f.type === 'select' ? 'bilinmiyor' : '');
  card.stage = stage || card.stage;
  return { ...base, card, bot: new Set((live.bot_doldurdu || []).map(f => (f === 'asama' ? 'stage' : f))), tags: live.tags || base.tags, syncedAt: new Date().toISOString() };
}

export function completeness(card) {
  const n = CORE.filter(k => !UNKNOWN(card[k])).length + (card.instagram || card.facebook || card.diger_sosyal ? 1 : 0);
  return Math.round((n / (CORE.length + 1)) * 100);
}

export function display(k, v) {
  if (UNKNOWN(v)) return '';
  if (OPTS[k]) return OPTS[k][v] || v;
  return String(v);
}

// Değişen alanlar (kaydetmeye gidecek olanlar)
export function diffCard(before, after) {
  const out = {};
  for (const f of FIELDS) {
    const a = before[f.k] ?? '', b = after[f.k] ?? '';
    if (String(a) !== String(b)) out[f.k] = b === '' ? null : b;
  }
  return out;
}

export function kartHTML(state) {
  const { card, linked, bot, tags, syncedAt } = state;
  const pct = completeness(card);
  const missing = FIELDS.filter(f => CORE.includes(f.k) && UNKNOWN(card[f.k])).map(f => f.label);
  return `<section class="kart" aria-label="Kişi kartı">
    <div class="kart-head">
      <h3><i class="ti ti-id-badge-2" aria-hidden="true"></i> Kişi kartı</h3>
      <span class="badge ${linked ? 'ok' : ''}">${linked ? '<i class="ti ti-refresh" aria-hidden="true"></i> Bot panel ile senkron' : 'Yalnızca uygulamada'}</span>
      <button class="btn btn-ghost sm" type="button" data-kart="edit"><i class="ti ti-pencil" aria-hidden="true"></i> Düzenle</button>
    </div>
    <div class="kart-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Kart doluluğu"><span style="width:${pct}%"></span></div>
    <p class="small muted">Kart %${pct} dolu${missing.length ? ` · Eksik: ${esc(missing.join(', '))}` : ''}</p>
    <dl class="kart-grid">${FIELDS.map(f => {
      const v = display(f.k, card[f.k]);
      return `<div class="${f.wide ? 'wide' : ''}"><dt>${esc(f.label)}${bot.has(f.k) ? ' <span class="bot-tag" title="Bot sohbette doldurdu">Bot</span>' : ''}</dt>
        <dd class="${v ? '' : 'muted'}">${v ? esc(v) : '—'}</dd></div>`;
    }).join('')}</dl>
    ${tags?.length ? `<div class="chips">${tags.map(t => `<span class="badge">${esc(t)}</span>`).join('')}</div>` : ''}
    ${linked && syncedAt ? `<p class="small muted">Panelden son alındı: ${esc(new Date(syncedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</p>` : ''}
  </section>`;
}

function inputHTML(f, v) {
  const id = `kf-${f.k}`;
  if (f.type === 'select') {
    const opts = OPTS[f.k];
    const empty = f.k === 'kanal' ? '<option value="">—</option>' : '';
    return `<select id="${id}" name="${f.k}">${empty}${Object.entries(opts).map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  if (f.type === 'textarea') return `<textarea id="${id}" name="${f.k}" rows="2" maxlength="${f.max}">${esc(v || '')}</textarea>`;
  if (f.type === 'number') return `<input id="${id}" name="${f.k}" type="number" min="1" max="120" inputmode="numeric" value="${esc(v ?? '')}">`;
  return `<input id="${id}" name="${f.k}" maxlength="${f.max}" value="${esc(v || '')}">`;
}

export function kartFormHTML(state) {
  return `<form class="kart" data-kart-form novalidate>
    <div class="kart-head"><h3><i class="ti ti-id-badge-2" aria-hidden="true"></i> Kişi kartını düzenle</h3></div>
    <div class="kart-form">${FIELDS.map(f => `<div class="field ${f.wide ? 'wide' : ''}"><label for="kf-${f.k}">${esc(f.label)}</label>${inputHTML(f, state.card[f.k])}</div>`).join('')}</div>
    ${state.linked ? '<p class="small muted">Kaydettiğinde bot panelindeki kart da güncellenir; düzelttiğin alanlar artık "Bot" olarak işaretlenmez.</p>' : ''}
    <p class="error" data-kart-error role="alert"></p>
    <div class="quick"><button class="btn btn-primary" type="submit">Kaydet</button><button class="btn btn-ghost" type="button" data-kart="cancel">Vazgeç</button></div>
  </form>`;
}

