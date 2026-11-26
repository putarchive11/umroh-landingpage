// Pelacakan iklan Meta: setiap event dikirim ke Pixel (browser) dan ke Conversions API (server)
// dengan eventID yang sama, sehingga Meta menghitungnya satu kali.
// Bila PIXEL_ID kosong, semua fungsi di sini tidak melakukan apa-apa.
import { API_BASE, HARGA, ID_PRODUK, NAMA_PRODUK, PIXEL_ID } from '../config';

declare global {
  interface Window {
    fbq?: (...a: unknown[]) => void;
    __kumPvId?: string;
  }
}

const SEMBILAN_PULUH_HARI = 90 * 24 * 3600;

function bacaCookie(nama: string): string {
  const m = document.cookie.match(new RegExp('(?:^|; )' + nama + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function tulisCookie(nama: string, nilai: string): void {
  document.cookie = `${nama}=${encodeURIComponent(nilai)}; max-age=${SEMBILAN_PULUH_HARI}; path=/; SameSite=Lax; Secure`;
}

const acak = () => Math.random().toString(36).slice(2, 10);

/** ID unik per event, dipakai bersama oleh Pixel dan server. */
export const idEvent = (awalan: string) => `${awalan}.${Date.now()}.${acak()}`;

/**
 * Nilai _fbp (ID browser) dan _fbc (ID klik iklan) untuk dikirim ke server.
 * Bila Pixel diblokir sehingga cookie tidak dibuat, nilainya disusun sendiri mengikuti format Meta.
 */
export function paramMeta(): { fbp: string; fbc: string } {
  if (!PIXEL_ID) return { fbp: '', fbc: '' };
  let fbc = bacaCookie('_fbc');
  const fbclid = new URLSearchParams(location.search).get('fbclid');
  if (fbclid && !fbc.endsWith('.' + fbclid)) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
    tulisCookie('_fbc', fbc);
  }
  let fbp = bacaCookie('_fbp');
  if (!fbp) {
    fbp = `fb.1.${Date.now()}.${Math.floor(1e9 + Math.random() * 9e9)}`;
    tulisCookie('_fbp', fbp);
  }
  return { fbp, fbc };
}

/** Alamat halaman tanpa query string (query bisa berisi token pesanan atau data lain yang tidak perlu ikut). */
export const alamatHalaman = () => location.origin + location.pathname;

function keServer(nama: string, id: string): void {
  if (!PIXEL_ID) return;
  const isi = JSON.stringify({ event: nama, id, url: alamatHalaman(), ...paramMeta() });
  const tujuan = API_BASE + '/api/jejak';
  try {
    // text/plain = "simple request": tidak butuh preflight CORS dan tetap terkirim saat pindah halaman.
    if (navigator.sendBeacon && navigator.sendBeacon(tujuan, new Blob([isi], { type: 'text/plain' }))) return;
    void fetch(tujuan, { method: 'POST', body: isi, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(() => {});
  } catch { /* pelacakan tidak boleh mengganggu halaman */ }
}

export const dataProduk = () => ({ currency: 'IDR', value: HARGA, content_type: 'product', content_ids: [ID_PRODUK], content_name: NAMA_PRODUK });

/**
 * Mencatat event. `server: false` untuk event yang pasangan servernya dikirim dari tempat lain
 * (AddPaymentInfo dan Purchase dikirim server dari data pembayaran asli).
 */
export function lacak(nama: string, data: Record<string, unknown> = {}, opsi: { id?: string; server?: boolean } = {}): string {
  const id = opsi.id || idEvent(nama.toLowerCase());
  if (!PIXEL_ID) return id;
  try { window.fbq?.('track', nama, data, { eventID: id }); } catch { /* abaikan */ }
  if (opsi.server !== false) keServer(nama, id);
  return id;
}

/** PageView sisi server, berpasangan dengan PageView Pixel di <head>. Menunggu sebentar agar cookie _fbp sempat dibuat. */
export function pageViewServer(): void {
  if (!PIXEL_ID) return;
  const id = window.__kumPvId || idEvent('pv');
  let sisa = 8;
  const coba = () => {
    if (bacaCookie('_fbp') || --sisa <= 0) keServer('PageView', id);
    else setTimeout(coba, 250);
  };
  setTimeout(coba, 250);
}

/** Klik tautan WhatsApp mana pun dicatat sebagai Contact. */
export function lacakWhatsApp(): void {
  if (!PIXEL_ID) return;
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href*="wa.me/"]');
    if (a) lacak('Contact');
  });
}
