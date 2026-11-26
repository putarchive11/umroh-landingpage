// Checkout otomatis di halaman utama.
//
// Alurnya: tombol beli → formulir (nama, email, WhatsApp) → server membuat pesanan →
// pembeli diarahkan ke halaman pembayaran Midtrans → kembali ke /terima-kasih/ untuk melihat kode aktivasi.
//
// Halaman bertanya dulu ke server (/api/toko) apakah checkout otomatis sudah siap. Selama belum siap
// (kunci Midtrans belum dipasang, atau server tidak bisa dihubungi), tombol beli tetap membuka
// pembayaran QRIS manual seperti sebelumnya — jadi penjualan tidak pernah terputus.
import { API_BASE } from '../config';
import { alamatHalaman, dataProduk, lacak, lacakWhatsApp, pageViewServer, paramMeta } from './jejak';

const K_TOKO = 'kum_toko'; // ingatan singkat: checkout otomatis aktif atau tidak
const K_PESANAN = 'kum_pesanan'; // pesanan terakhir, dibaca halaman /terima-kasih/
const K_UJI = 'kum_uji'; // kunci uji sandbox (hanya pemilik toko)

type Toko = { checkout: boolean };

const simpan = (penyimpanan: Storage, k: string, v: string) => { try { penyimpanan.setItem(k, v); } catch { /* mode privat */ } };
const baca = (penyimpanan: Storage, k: string) => { try { return penyimpanan.getItem(k) || ''; } catch { return ''; } };

/** ?uji=KUNCI di alamat membuka checkout sandbox untuk pemilik toko. Kunci diingat selama tab terbuka. */
function kunciUji(): string {
  const dariAlamat = new URLSearchParams(location.search).get('uji');
  if (dariAlamat) simpan(sessionStorage, K_UJI, dariAlamat);
  return dariAlamat || baca(sessionStorage, K_UJI);
}

async function ambilJson(url: string, opsi: RequestInit, batasMs: number): Promise<{ status: number; data: any }> {
  const pemutus = new AbortController();
  const pewaktu = setTimeout(() => pemutus.abort(), batasMs);
  try {
    const r = await fetch(url, { ...opsi, signal: pemutus.signal });
    let data: any = {};
    try { data = await r.json(); } catch { /* bukan JSON */ }
    return { status: r.status, data };
  } finally {
    clearTimeout(pewaktu);
  }
}

async function muatToko(): Promise<Toko> {
  try {
    const { data } = await ambilJson(API_BASE + '/api/toko', {}, 5000);
    const aktif = Boolean(data.checkout) || (Boolean(data.sandbox) && Boolean(kunciUji()));
    return { checkout: aktif };
  } catch {
    return { checkout: false };
  }
}

function terapkan(t: Toko): void {
  document.documentElement.classList.toggle('checkout-otomatis', t.checkout);
  // Kunci uji tidak ikut diingat: pengunjung biasa tidak boleh melihat mode sandbox.
  if (!kunciUji()) simpan(localStorage, K_TOKO, JSON.stringify({ aktif: t.checkout, t: Date.now() }));
}

function bukaDialog(d: HTMLDialogElement): void {
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
  document.documentElement.classList.add('qris-lock');
}

function tutupDialog(d: HTMLDialogElement): void {
  if (typeof d.close === 'function') d.close();
  else d.removeAttribute('open');
  document.documentElement.classList.remove('qris-lock');
}

export function initToko(): void {
  const toko = muatToko();
  void toko.then(terapkan);

  pageViewServer();
  lacakWhatsApp();

  // ViewContent: bagian paket benar-benar terlihat di layar.
  const paket = document.querySelector('#paket');
  if (paket && 'IntersectionObserver' in window) {
    const pengamat = new IntersectionObserver((entri) => {
      if (entri.some((e) => e.isIntersecting)) {
        pengamat.disconnect();
        lacak('ViewContent', dataProduk());
      }
    }, { threshold: 0.25 });
    pengamat.observe(paket);
  }

  const modalBeli = document.querySelector<HTMLDialogElement>('#beli-modal');
  const modalQris = document.querySelector<HTMLDialogElement>('#qris-modal');
  const form = document.querySelector<HTMLFormElement>('#beli-form');
  if (!modalBeli || !form) return;

  const galat = form.querySelector<HTMLElement>('[data-beli-galat]')!;
  const tombol = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const manual = modalBeli.querySelector<HTMLElement>('[data-beli-manual]')!;
  const label = tombol.querySelector('span');
  const LABEL_AWAL = label?.textContent || 'Lanjut ke pembayaran';
  const sibuk = (ya: boolean) => {
    tombol.disabled = ya;
    tombol.classList.toggle('is-sibuk', ya);
    if (label) label.textContent = ya ? 'Membuka halaman pembayaran…' : LABEL_AWAL;
  };

  const bukaManual = () => {
    if (modalBeli.open) tutupDialog(modalBeli);
    if (modalQris) bukaDialog(modalQris);
  };

  // Tombol beli: checkout otomatis bila siap, selain itu QRIS manual.
  document.querySelectorAll<HTMLElement>('[data-beli]').forEach((el) => el.addEventListener('click', async () => {
    const tunggu = new Promise<Toko>((selesai) => setTimeout(() => selesai({ checkout: document.documentElement.classList.contains('checkout-otomatis') }), 2500));
    const t = await Promise.race([toko, tunggu]);
    lacak('InitiateCheckout', { ...dataProduk(), num_items: 1 });
    if (!t.checkout) return bukaManual();
    galat.hidden = true;
    manual.hidden = true;
    bukaDialog(modalBeli);
    form.querySelector<HTMLInputElement>('input[name="nama"]')?.focus();
  }));

  modalBeli.querySelectorAll('[data-beli-tutup]').forEach((b) => b.addEventListener('click', () => tutupDialog(modalBeli)));
  modalBeli.addEventListener('click', (e) => { if (e.target === modalBeli) tutupDialog(modalBeli); });
  modalBeli.addEventListener('close', () => document.documentElement.classList.remove('qris-lock'));
  manual.querySelector('button')?.addEventListener('click', bukaManual);

  const tampilGalat = (pesan: string, tawarkanManual = false) => {
    galat.textContent = pesan;
    galat.hidden = false;
    manual.hidden = !tawarkanManual;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (tombol.disabled) return;
    const isi = new FormData(form);
    const nama = String(isi.get('nama') || '').trim();
    const email = String(isi.get('email') || '').trim();
    const wa = String(isi.get('wa') || '').trim();
    if (nama.length < 2) return tampilGalat('Mohon isi nama Anda.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return tampilGalat('Alamat email belum benar. Kode aktivasi dikirim ke email ini.');

    sibuk(true);
    galat.hidden = true;
    manual.hidden = true;
    try {
      const { status, data } = await ambilJson(API_BASE + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // tanpa preflight CORS
        body: JSON.stringify({ nama, email, wa, situs: isi.get('situs') || '', uji: kunciUji(), url: alamatHalaman(), ...paramMeta() }),
      }, 25000);

      if (status === 200 && data.ok && data.url) {
        simpan(localStorage, K_PESANAN, JSON.stringify({ id: data.id, t: data.t, waktu: Date.now() }));
        if (data.lacak !== false) lacak('AddPaymentInfo', dataProduk(), { id: data.idEvent, server: false });
        // Jeda singkat supaya event Pixel sempat terkirim sebelum pindah ke halaman pembayaran.
        setTimeout(() => { location.href = data.url; }, 350);
        return;
      }
      // Salah isian → pembeli bisa memperbaiki. Gangguan server/gateway → tawarkan pembayaran manual.
      const bisaDiperbaiki = status === 400 || status === 429 || String(data.alasan || '').startsWith('kunci_uji');
      tampilGalat(data.pesan || 'Pembayaran otomatis sedang terkendala.', !bisaDiperbaiki);
    } catch {
      tampilGalat('Koneksi terputus. Periksa internet Anda lalu coba lagi.', true);
    }
    sibuk(false);
  });

  // Kembali dari halaman pembayaran lewat tombol "back": tombol tidak boleh tetap terkunci.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) sibuk(false);
  });
}
