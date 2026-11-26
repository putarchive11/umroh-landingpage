// Halaman /terima-kasih/: memeriksa status pesanan ke server sampai lunas, lalu menampilkan kode aktivasi.
import { API_BASE } from '../config';
import { dataProduk, lacak, lacakWhatsApp, pageViewServer } from './jejak';

const K_PESANAN = 'kum_pesanan'; // disimpan halaman utama sebelum pindah ke halaman pembayaran
const K_KEMBALI = 'kum_kembali'; // dipindahkan dari alamat oleh skrip di <head>
const TIGA_HARI = 3 * 24 * 3600 * 1000;

type Kunci = { id: string; t: string };
type Keadaan = 'memeriksa' | 'menunggu' | 'lunas' | 'gagal' | 'email' | 'galat';

function bacaJson(penyimpanan: Storage, k: string): any {
  try { return JSON.parse(penyimpanan.getItem(k) || 'null'); } catch { return null; }
}

/** Pesanan mana yang sedang dilihat: dari alamat kembali Midtrans, atau dari ingatan browser ini. */
function cariPesanan(): { kunci: Kunci | null; idSaja: string } {
  const kembali = bacaJson(sessionStorage, K_KEMBALI);
  const ingatan = bacaJson(localStorage, K_PESANAN);
  const ingatanSegar = ingatan?.id && ingatan?.t && Date.now() - Number(ingatan.waktu || 0) < TIGA_HARI;
  if (kembali?.id && kembali?.t) return { kunci: { id: kembali.id, t: kembali.t }, idSaja: kembali.id };
  if (ingatanSegar && (!kembali?.id || kembali.id === ingatan.id)) return { kunci: { id: ingatan.id, t: ingatan.t }, idSaja: ingatan.id };
  return { kunci: null, idSaja: kembali?.id || '' };
}

export function initTerimaKasih(): void {
  pageViewServer();
  lacakWhatsApp();

  const kartu = document.querySelector<HTMLElement>('#tk');
  if (!kartu) return;
  const el = <T extends HTMLElement>(nama: string) => kartu.querySelector<T>(`[data-tk="${nama}"]`);
  const atur = (k: Keadaan) => { kartu.dataset.keadaan = k; };

  const { kunci, idSaja } = cariPesanan();

  // Nomor pesanan ikut terisi di pesan WhatsApp bantuan.
  const nomor = el('nomor');
  const wa = el<HTMLAnchorElement>('wa');
  if (idSaja && /^[\w.~-]{6,50}$/.test(idSaja)) {
    if (nomor) nomor.textContent = 'Nomor pesanan: ' + idSaja;
    if (wa && kartu.dataset.wa) wa.href = kartu.dataset.wa + encodeURIComponent(idSaja);
  }

  // Tiba tanpa token (mis. kembali di browser lain): kode tetap sampai lewat email.
  if (!kunci) return atur('email');
  try { localStorage.setItem(K_PESANAN, JSON.stringify({ ...kunci, waktu: Date.now() })); } catch { /* mode privat */ }

  const mulai = Date.now();
  let pewaktu: ReturnType<typeof setTimeout> | undefined;
  let berjalan = false;
  let selesai = false;

  const tampilLunas = (d: any) => {
    selesai = true;
    const kode = String(d.kode || '');
    const keluaran = el('kode');
    if (keluaran) keluaran.textContent = kode;
    const buka = el<HTMLAnchorElement>('buka');
    if (buka && d.urlAplikasi) buka.href = `${d.urlAplikasi}/?kode=${encodeURIComponent(kode)}`;
    const maks = el('maks');
    if (maks && d.maks) maks.textContent = String(d.maks);
    const catatan = el('email');
    if (catatan) {
      catatan.textContent = d.emailTerkirim
        ? `Kode ini juga sudah dikirim ke ${d.email}. Bila belum terlihat, periksa folder spam atau promosi.`
        : d.emailAktif
          ? `Kode ini sedang dikirim ke ${d.email}. Untuk berjaga-jaga, salin atau tangkap layar kode di atas.`
          : 'Mohon salin atau tangkap layar kode di atas dan simpan baik-baik.';
    }
    atur('lunas');

    // Purchase dicatat sekali saja per pesanan; pasangan servernya dikirim saat pembayaran terverifikasi.
    const tanda = 'kum_beli_' + d.id;
    let sudah = false;
    try { sudah = localStorage.getItem(tanda) === '1'; } catch { /* mode privat */ }
    if (!sudah && d.lacak !== false) {
      lacak('Purchase', { ...dataProduk(), value: d.harga, num_items: 1, order_id: d.id }, { id: 'beli-' + d.id, server: false });
      try { localStorage.setItem(tanda, '1'); } catch { /* mode privat */ }
    }
  };

  const jadwalkan = () => {
    if (selesai || document.hidden) return;
    const umur = Date.now() - mulai;
    if (umur > 15 * 60 * 1000) return; // setelah 15 menit berhenti sendiri; tombol "cek lagi" tetap bisa dipakai
    pewaktu = setTimeout(periksa, umur < 2 * 60 * 1000 ? 3000 : 8000);
  };

  async function periksa(): Promise<void> {
    if (berjalan || selesai) return;
    berjalan = true;
    clearTimeout(pewaktu);
    const pemutus = new AbortController();
    const batas = setTimeout(() => pemutus.abort(), 20000);
    try {
      const r = await fetch(API_BASE + '/api/pesanan', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // tanpa preflight CORS
        body: JSON.stringify(kunci),
        signal: pemutus.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) { selesai = true; atur('email'); }
      else if (!r.ok || !d.ok) { if (kartu!.dataset.keadaan === 'memeriksa') atur('galat'); }
      else if (d.status === 'lunas') tampilLunas(d);
      else if (d.status === 'menunggu') {
        const bayar = el<HTMLAnchorElement>('bayar');
        if (bayar && typeof d.urlBayar === 'string' && d.urlBayar.startsWith('https://')) bayar.href = d.urlBayar;
        atur('menunggu');
      } else {
        selesai = true;
        if (d.status === 'refund') {
          const judul = el('judul-gagal');
          const isi = el('isi-gagal');
          if (judul) judul.textContent = 'Dana pesanan ini sudah dikembalikan';
          if (isi) isi.textContent = 'Kode aktivasi untuk pesanan ini sudah tidak aktif. Hubungi admin bila ini tidak sesuai.';
        } else if (d.status === 'kedaluwarsa') {
          const isi = el('isi-gagal');
          if (isi) isi.textContent = 'Batas waktu pembayaran pesanan ini sudah lewat dan tidak ada dana yang kami terima. Anda bisa membuat pesanan baru kapan saja.';
        }
        atur('gagal');
      }
    } catch {
      if (kartu!.dataset.keadaan === 'memeriksa') atur('galat');
    } finally {
      clearTimeout(batas);
      berjalan = false;
      jadwalkan();
    }
  }

  kartu.querySelectorAll('[data-tk="cek"]').forEach((b) => b.addEventListener('click', () => {
    if (kartu.dataset.keadaan === 'galat') atur('memeriksa');
    void periksa();
  }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void periksa(); });

  el('salin')?.addEventListener('click', async (e) => {
    const tombol = e.currentTarget as HTMLElement;
    const kode = el('kode')?.textContent || '';
    try {
      await navigator.clipboard.writeText(kode);
    } catch {
      const pilih = document.createRange();
      const sasaran = el('kode');
      if (sasaran) { pilih.selectNodeContents(sasaran); getSelection()?.removeAllRanges(); getSelection()?.addRange(pilih); }
      try { document.execCommand('copy'); } catch { /* biarkan pembeli menyalin manual */ }
    }
    const label = tombol.querySelector('span');
    if (label) { label.textContent = 'Tersalin'; setTimeout(() => { label.textContent = 'Salin'; }, 2000); }
  });

  void periksa();
}
