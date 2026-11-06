// Jam dan jadwal shalat Makkah serta Indonesia, dihitung di browser tanpa layanan luar.
// Makkah — metode Umm al-Qura: Subuh 18.5°, Isya = Maghrib + 90 menit (120 menit saat Ramadhan).
// Indonesia — metode Kemenag RI: Subuh 20°, Isya 18°, ihtiyat +2 menit (Zuhur +3 menit).
// Asar mazhab Syafi'i (bayangan 1×) untuk keduanya.

export interface Lokasi {
  kota: string;
  zona: string;   // label zona, mis. "WIB"
  lat: number;
  lng: number;
  tz: number;     // selisih jam dari UTC
  subuh: number;  // sudut Subuh (derajat)
  isya: number;   // sudut Isya (derajat), atau 0 bila memakai interval
  isyaMenit?: number; // Isya = Maghrib + menit (Umm al-Qura)
  ihtiyat?: number;   // menit pengaman Kemenag
}

export const MAKKAH: Lokasi = { kota: 'Makkah', zona: 'AST', lat: 21.4225, lng: 39.8262, tz: 3, subuh: 18.5, isya: 0, isyaMenit: 90 };
const KEMENAG = { subuh: 20, isya: 18, ihtiyat: 2 };
const JAKARTA: Lokasi = { kota: 'Jakarta', zona: 'WIB', lat: -6.2, lng: 106.8167, tz: 7, ...KEMENAG };
const MAKASSAR: Lokasi = { kota: 'Makassar', zona: 'WITA', lat: -5.1477, lng: 119.4327, tz: 8, ...KEMENAG };
const JAYAPURA: Lokasi = { kota: 'Jayapura', zona: 'WIT', lat: -2.5337, lng: 140.7181, tz: 9, ...KEMENAG };

/** Kota Indonesia sesuai zona waktu perangkat pengunjung; bawaan Jakarta (WIB). */
export function lokasiIndonesia(): Lokasi {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/Makassar|Ujung_Pandang|Bali|Denpasar/.test(tz)) return MAKASSAR;
    if (/Jayapura/.test(tz)) return JAYAPURA;
  } catch { /* abaikan */ }
  return JAKARTA;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => { const r = a - b * Math.floor(a / b); return r < 0 ? r + b : r; };

function julian(y: number, m: number, d: number) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sun(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - RA };
}

/** Jadwal shalat (jam desimal, waktu setempat) untuk satu tanggal setempat. */
export function prayerTimes(loc: Lokasi, y: number, m: number, d: number, ramadan = false) {
  const { lat, lng, tz } = loc;
  const jd = julian(y, m, d) - lng / (15 * 24);
  const at = (t: number) => sun(jd + t);
  const noon = (t: number) => fix(12 - at(t).eqt, 24);
  const angleTime = (angle: number, t: number, ccw: boolean) => {
    const { decl } = at(t);
    const T = deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) /
      (Math.cos(rad(decl)) * Math.cos(rad(lat))))) / 15;
    return noon(t) + (ccw ? -T : T);
  };
  const asrAngle = (t: number) => -deg(Math.atan(1 / (1 + Math.tan(Math.abs(rad(lat - at(t).decl))))));
  const shift = tz - lng / 15;
  const ih = (loc.ihtiyat ?? 0) / 60;
  const fajr = angleTime(loc.subuh, 5 / 24, true) + shift + ih;
  const dhuhr = noon(12 / 24) + shift + (loc.ihtiyat ? 3 / 60 : 0);
  const asr = angleTime(asrAngle(13 / 24), 13 / 24, false) + shift + ih;
  const maghrib = angleTime(0.833, 18 / 24, false) + shift + ih;
  const isha = loc.isyaMenit
    ? maghrib + (ramadan ? 120 : loc.isyaMenit) / 60
    : angleTime(loc.isya, 18 / 24, false) + shift + ih;
  return [
    { name: 'Subuh', t: fajr },
    { name: 'Zuhur', t: dhuhr },
    { name: 'Asar', t: asr },
    { name: 'Maghrib', t: maghrib },
    { name: 'Isya', t: isha },
  ];
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (h: number) => { const total = Math.round(h * 60); return `${pad(Math.floor(total / 60) % 24)}.${pad(total % 60)}`; };

function isRamadan(date: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', timeZone: 'Asia/Riyadh' }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'month')?.value) === 9;
  } catch { return false; }
}

/** Jam setempat sekarang beserta shalat berikutnya. */
export function waktuSekarang(loc: Lokasi, now = new Date()) {
  const lt = new Date(now.getTime() + loc.tz * 3600 * 1000); // dibaca dengan getter UTC
  const y = lt.getUTCFullYear(), m = lt.getUTCMonth() + 1, d = lt.getUTCDate();
  const hours = lt.getUTCHours() + lt.getUTCMinutes() / 60 + lt.getUTCSeconds() / 3600;
  const ramadan = loc.isyaMenit ? isRamadan(now) : false;
  let next = prayerTimes(loc, y, m, d, ramadan).find((p) => p.t > hours);
  let wait: number;
  if (next) {
    wait = next.t - hours;
  } else {
    const tm = new Date(Date.UTC(y, m - 1, d + 1));
    next = prayerTimes(loc, tm.getUTCFullYear(), tm.getUTCMonth() + 1, tm.getUTCDate(), ramadan)[0];
    wait = 24 - hours + next.t;
  }
  const mins = Math.max(0, Math.round(wait * 60));
  const jam = Math.floor(mins / 60), menit = mins % 60;
  const sempit = typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches;
  const lagi = sempit
    ? (jam ? `${jam}j ${menit}m lagi` : `${menit} mnt lagi`)
    : (jam ? (menit ? `${jam} jam ${menit} menit lagi` : `${jam} jam lagi`) : `${menit} menit lagi`);
  return { clock: `${pad(lt.getUTCHours())}.${pad(lt.getUTCMinutes())}`, next: next.name, nextAt: hhmm(next.t), lagi };
}

/** Kompatibel dengan pemakaian lama. */
export const makkahNow = (now = new Date()) => waktuSekarang(MAKKAH, now);

function pasang(el: HTMLElement, loc: Lokasi) {
  const clock = el.querySelector('[data-mk-clock]');
  const next = el.querySelector('[data-mk-next]');
  const label = el.querySelector('[data-mk-city]');
  if (label) label.textContent = `${loc.kota} ${loc.zona}`;
  const tick = () => {
    const s = waktuSekarang(loc);
    if (clock) clock.textContent = s.clock;
    if (next) next.textContent = `${s.next} ${s.nextAt} · ${s.lagi}`;
  };
  tick();
  setInterval(tick, 20000);
}

export function startMakkahClock() {
  document.querySelectorAll<HTMLElement>('[data-makkah-clock]').forEach((el) => pasang(el, MAKKAH));
  document.querySelectorAll<HTMLElement>('[data-local-clock]').forEach((el) => pasang(el, lokasiIndonesia()));
}
