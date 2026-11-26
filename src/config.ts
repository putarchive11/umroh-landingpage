// ─────────────────────────────────────────────────────────────
// Pengaturan checkout otomatis & pelacakan iklan — ubah di sini saja,
// atau lewat Environment Variables di Vercel (awalan PUBLIC_).
// ─────────────────────────────────────────────────────────────

/** Alamat aplikasi (repo App-Umroh-Sendiri). API checkout, status pesanan, dan CAPI ada di sana. */
export const API_BASE: string = (import.meta.env.PUBLIC_API_BASE || 'https://app-umroh-sendiri.vercel.app').replace(/\/+$/, '');

/**
 * ID Meta Pixel (angka, bukan rahasia). Kosong = Pixel dan pelacakan tidak dimuat sama sekali.
 * Isi lewat env PUBLIC_META_PIXEL_ID di Vercel, lalu deploy ulang.
 */
export const PIXEL_ID: string = String(import.meta.env.PUBLIC_META_PIXEL_ID || '').replace(/\D/g, '');

export const ID_PRODUK = 'paket-ebook-toolkit';
export const NAMA_PRODUK = 'Paket Ebook + Digital Toolkit Umroh Mandiri';
export const HARGA = 125000;

export const WA_ADMIN = '6287777995846';
export const EMAIL_ADMIN = 'umrohsendri@gmail.com';
