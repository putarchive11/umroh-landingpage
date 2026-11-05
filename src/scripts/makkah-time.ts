// Waktu Makkah dan jadwal shalat, dihitung di browser tanpa layanan luar.
// Metode Umm al-Qura: Subuh 18.5°, Isya = Maghrib + 90 menit (120 menit saat Ramadhan),
// Asar mazhab Syafi'i (bayangan 1×). Koordinat Masjidil Haram, zona waktu UTC+3 (tanpa DST).

const LAT = 21.4225;
const LNG = 39.8262;
const TZ = 3;

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

/** Jadwal shalat (jam desimal, waktu Makkah) untuk satu tanggal Makkah. */
export function prayerTimes(y: number, m: number, d: number, ramadan = false) {
  const jd = julian(y, m, d) - LNG / (15 * 24);
  const at = (t: number) => sun(jd + t);
  const noon = (t: number) => fix(12 - at(t).eqt, 24);
  const angleTime = (angle: number, t: number, ccw: boolean) => {
    const { decl } = at(t);
    const T = deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(LAT))) /
      (Math.cos(rad(decl)) * Math.cos(rad(LAT))))) / 15;
    return noon(t) + (ccw ? -T : T);
  };
  const asrAngle = (t: number) => -deg(Math.atan(1 / (1 + Math.tan(Math.abs(rad(LAT - at(t).decl))))));
  const shift = TZ - LNG / 15;
  const fajr = angleTime(18.5, 5 / 24, true) + shift;
  const dhuhr = noon(12 / 24) + shift;
  const asr = angleTime(asrAngle(13 / 24), 13 / 24, false) + shift;
  const maghrib = angleTime(0.833, 18 / 24, false) + shift;
  const isha = maghrib + (ramadan ? 2 : 1.5);
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

/** Waktu Makkah sekarang beserta shalat berikutnya. */
export function makkahNow(now = new Date()) {
  const mk = new Date(now.getTime() + TZ * 3600 * 1000); // dibaca dengan getter UTC
  const y = mk.getUTCFullYear(), m = mk.getUTCMonth() + 1, d = mk.getUTCDate();
  const hours = mk.getUTCHours() + mk.getUTCMinutes() / 60 + mk.getUTCSeconds() / 3600;
  const ramadan = isRamadan(now);
  let next = prayerTimes(y, m, d, ramadan).find((p) => p.t > hours);
  let wait: number;
  if (next) {
    wait = next.t - hours;
  } else {
    const tm = new Date(Date.UTC(y, m - 1, d + 1));
    next = prayerTimes(tm.getUTCFullYear(), tm.getUTCMonth() + 1, tm.getUTCDate(), ramadan)[0];
    wait = 24 - hours + next.t;
  }
  const mins = Math.max(0, Math.round(wait * 60));
  const jam = Math.floor(mins / 60), menit = mins % 60;
  const lagi = jam ? (menit ? `${jam} jam ${menit} menit lagi` : `${jam} jam lagi`) : `${menit} menit lagi`;
  return { clock: `${pad(mk.getUTCHours())}.${pad(mk.getUTCMinutes())}`, next: next.name, nextAt: hhmm(next.t), lagi };
}

export function startMakkahClock() {
  document.querySelectorAll<HTMLElement>('[data-makkah-clock]').forEach((el) => {
    const clock = el.querySelector('[data-mk-clock]');
    const next = el.querySelector('[data-mk-next]');
    const tick = () => {
      const s = makkahNow();
      if (clock) clock.textContent = s.clock;
      if (next) next.textContent = `${s.next} ${s.nextAt} · ${s.lagi}`;
    };
    tick();
    setInterval(tick, 20000);
  });
}
