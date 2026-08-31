(function() {
      "use strict";

      // ---------- DOM refs ----------
      const countdownEl = document.getElementById('countdownDisplay');
      const nextLabel = document.getElementById('nextEventLabel');
      const clockEl = document.getElementById('digitalClock');
      const masehiEl = document.getElementById('masehiDate');
      const hijriEl = document.getElementById('hijriDate');
      const hijriMonthName = document.getElementById('hijriMonthName');
      const cityNameEl = document.getElementById('cityName');
      const coordsEl = document.getElementById('coordsDisplay');
      const cityDropdown = document.getElementById('cityDropdown');

      const imsakEl = document.getElementById('imsakTime');
      const subuhEl = document.getElementById('subuhTime');
      const dzuhurEl = document.getElementById('dzuhurTime');
      const asharEl = document.getElementById('asharTime');
      const maghribEl = document.getElementById('maghribTime');
      const isyaEl = document.getElementById('isyaTime');

      const testBtn = document.getElementById('testAudioBtn');
      const muteBtn = document.getElementById('muteToggleBtn');
      const audio = document.getElementById('adzanAudio');

      // ---------- state ----------
      let isMuted = false;
      let currentCoords = { lat: -6.2, lng: 106.8 }; // default Jakarta
      let currentCity = 'Jakarta';
      let prayerTimes = {};
      let nextEvent = { name: '--', time: new Date() };
      let countdownInterval = null;
      let clockInterval = null;
      let darkModeObserver = null;

      // ---------- helper: city coords (approx) ----------
      const cityMap = {
        'Jakarta': { lat: -6.2088, lng: 106.8456 },
        'Bandung': { lat: -6.9175, lng: 107.6191 },
        'Surabaya': { lat: -7.2575, lng: 112.7521 },
        'Medan': { lat: 3.5952, lng: 98.6722 },
        'Makassar': { lat: -5.1477, lng: 119.4327 },
        'Yogyakarta': { lat: -7.7956, lng: 110.3695 },
      };

      // ---------- hijri months ----------
      const hijriMonths = [
        'Muharram (المحرّم)','Safar (صفر)','Rabiul Awal (ربيع الأول)',
        'Rabiul Akhir (ربيع الآخر)','Jumadil Awal (جمادى الأول)',
        'Jumadil Akhir (جمادى الآخر)','Rajab (رجب)',
        'Sya\'ban (شعبان)','Ramadhan (رمضان)',
        'Syawal (شوّال)','Dzulqa\'dah (ذو القعدة)',
        'Dzulhijjah (ذو الحجة)'
      ];

      // ---------- fetch prayer times from api.aladhan.com ----------
      async function fetchPrayerTimes(lat, lng, cityName) {
        try {
          const date = new Date();
          const day = String(date.getDate()).padStart(2,'0');
          const month = String(date.getMonth()+1).padStart(2,'0');
          const year = date.getFullYear();
          const url = `https://api.aladhan.com/v1/timings/${day}-${month}-${year}?latitude=${lat}&longitude=${lng}&method=2`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error('API respon gagal');
          const data = await resp.json();
          const timings = data.data.timings;
          // simpan
          prayerTimes = {
            imsak: timings.Imsak || '--:--',
            subuh: timings.Fajr || '--:--',
            dzuhur: timings.Dhuhr || '--:--',
            ashar: timings.Asr || '--:--',
            maghrib: timings.Maghrib || '--:--',
            isya: timings.Isha || '--:--',
          };
          // update UI
          imsakEl.textContent = prayerTimes.imsak;
          subuhEl.textContent = prayerTimes.subuh;
          dzuhurEl.textContent = prayerTimes.dzuhur;
          asharEl.textContent = prayerTimes.ashar;
          maghribEl.textContent = prayerTimes.maghrib;
          isyaEl.textContent = prayerTimes.isya;

          // update hijri & masehi
          const hijri = data.data.date.hijri;
          if (hijri) {
            const dayH = hijri.day;
            const monthH = hijri.month.en;
            const yearH = hijri.year;
            hijriEl.textContent = `${dayH} ${monthH} ${yearH}`;
            const idx = parseInt(hijri.month.number) - 1;
            hijriMonthName.textContent = hijriMonths[idx] || hijri.month.en;
          }
          // update masehi
          const greg = data.data.date.gregorian;
          if (greg) {
            masehiEl.textContent = `${greg.weekday.en}, ${greg.day} ${greg.month.en} ${greg.year}`;
          }

          // hitung next event
          updateNextEvent();
          // update countdown
          startCountdown();
          // dark mode check
          applyDarkModeByTime();
        } catch (e) {
          console.warn('Gagal fetch jadwal shalat, pakai fallback', e);
          // fallback dummy
          prayerTimes = { imsak:'04:20', subuh:'04:35', dzuhur:'12:00', ashar:'15:15', maghrib:'17:58', isya:'19:10' };
          imsakEl.textContent = prayerTimes.imsak;
          subuhEl.textContent = prayerTimes.subuh;
          dzuhurEl.textContent = prayerTimes.dzuhur;
          asharEl.textContent = prayerTimes.ashar;
          maghribEl.textContent = prayerTimes.maghrib;
          isyaEl.textContent = prayerTimes.isya;
          updateNextEvent();
          startCountdown();
        }
      }

      // ---------- update next event (imsak, subuh, maghrib dll) ----------
      function updateNextEvent() {
        if (!prayerTimes.imsak) return;
        const now = new Date();
        const todayStr = now.toDateString();
        const times = [
          { name: 'Imsak', t: prayerTimes.imsak },
          { name: 'Subuh', t: prayerTimes.subuh },
          { name: 'Dzuhur', t: prayerTimes.dzuhur },
          { name: 'Ashar', t: prayerTimes.ashar },
          { name: 'Maghrib', t: prayerTimes.maghrib },
          { name: 'Isya', t: prayerTimes.isya },
        ];
        let next = null;
        for (let item of times) {
          const [h, m] = item.t.split(':').map(Number);
          const d = new Date(now);
          d.setHours(h, m, 0, 0);
          if (d > now) { next = { name: item.name, time: d }; break; }
        }
        if (!next) {
          // ambil subuh besok
          const [h, m] = times[0].t.split(':').map(Number);
          const d = new Date(now);
          d.setDate(d.getDate()+1);
          d.setHours(h, m, 0, 0);
          next = { name: 'Imsak (besok)', time: d };
        }
        nextEvent = next;
        nextLabel.textContent = `${next.name} · ${next.time.toLocaleTimeString('id', {hour:'2-digit',minute:'2-digit'})}`;
        return next;
      }

      // ---------- countdown ----------
      function startCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
          const now = new Date();
          if (!nextEvent.time) return;
          const diff = Math.max(0, Math.floor((nextEvent.time - now) / 1000));
          const hrs = String(Math.floor(diff / 3600)).padStart(2,'0');
          const mins = String(Math.floor((diff % 3600) / 60)).padStart(2,'0');
          const secs = String(diff % 60).padStart(2,'0');
          countdownEl.textContent = `${hrs}:${mins}:${secs}`;
          if (diff <= 0) {
            // play adzan & update next
            if (!isMuted) {
              audio.play().catch(() => {});
            }
            updateNextEvent();
          }
        }, 500);
      }

      // ---------- jam digital ----------
      function updateClock() {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('id', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      }
      if (clockInterval) clearInterval(clockInterval);
      clockInterval = setInterval(updateClock, 1000);
      updateClock();

      // ---------- dark mode by time (maghrib 18:00 - subuh 05:00) ----------
      function applyDarkModeByTime() {
        const now = new Date();
        const hours = now.getHours();
        const isNight = (hours >= 18 || hours < 5);
        const body = document.getElementById('appBody');
        if (isNight) {
          body.classList.add('dark-mode');
          body.classList.remove('bg-[#f8f2ea]');
          body.classList.add('bg-[#1f2a26]', 'text-[#e0ece0]');
        } else {
          body.classList.remove('dark-mode');
          body.classList.remove('bg-[#1f2a26]', 'text-[#e0ece0]');
          body.classList.add('bg-[#f8f2ea]', 'text-[#2d2a24]');
        }
      }

      // ---------- geolocation + dropdown ----------
      function getLocationAndFetch() {
        if (cityDropdown.value === 'auto') {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const { latitude, longitude } = pos.coords;
                currentCoords = { lat: latitude, lng: longitude };
                coordsEl.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                cityNameEl.textContent = '📍 Lokasi Anda';
                fetchPrayerTimes(latitude, longitude, 'Lokasi Anda');
              },
              () => {
                // fallback ke Jakarta
                const def = cityMap['Jakarta'];
                currentCoords = def;
                coordsEl.textContent = `${def.lat}, ${def.lng}`;
                cityNameEl.textContent = 'Jakarta (fallback)';
                fetchPrayerTimes(def.lat, def.lng, 'Jakarta');
              }
            );
          } else {
            const def = cityMap['Jakarta'];
            currentCoords = def;
            coordsEl.textContent = `${def.lat}, ${def.lng}`;
            cityNameEl.textContent = 'Jakarta (default)';
            fetchPrayerTimes(def.lat, def.lng, 'Jakarta');
          }
        } else {
          const city = cityDropdown.value;
          const coords = cityMap[city];
          if (coords) {
            currentCoords = coords;
            coordsEl.textContent = `${coords.lat}, ${coords.lng}`;
            cityNameEl.textContent = city;
            fetchPrayerTimes(coords.lat, coords.lng, city);
          }
        }
      }

      // ---------- event listeners ----------
      cityDropdown.addEventListener('change', getLocationAndFetch);

      testBtn.addEventListener('click', () => {
        if (!isMuted) audio.play().catch(() => {});
      });

      muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        muteBtn.textContent = isMuted ? '🔊 Unmute' : '🔇 Mute';
        audio.muted = isMuted;
      });

      // init
      getLocationAndFetch();

      // Dark mode check setiap 10 menit
      setInterval(applyDarkModeByTime, 600000);
      // juga tiap jam
      setInterval(() => {
        updateNextEvent();
      }, 60000);

      // WA tooltip
      document.querySelector('.wa-group')?.addEventListener('mouseenter', function() {
        this.querySelector('.tooltip-wa').style.visibility = 'visible';
        this.querySelector('.tooltip-wa').style.opacity = '1';
      });
      document.querySelector('.wa-group')?.addEventListener('mouseleave', function() {
        this.querySelector('.tooltip-wa').style.visibility = 'hidden';
        this.querySelector('.tooltip-wa').style.opacity = '0';
      });

      // ---------- FITUR IMSAKIYAH & PUASA ----------
const puasaModeSelect = document.getElementById('puasaMode');
const puasaStatus = document.getElementById('puasaStatus');
const puasaMessage = document.getElementById('puasaMessage');
const imsakAudio = document.getElementById('imsakAudio');
const bukaAudio = document.getElementById('bukaAudio');
let imsakTriggered = false;  // flag agar alarm tidak berulang
let bukaTriggered = false;

// Fungsi untuk cek apakah hari ini Senin (1) atau Kamis (5)
function isSeninKamis() {
  const day = new Date().getDay();
  return (day === 1 || day === 5);
}

// Fungsi untuk cek apakah bulan Hijriah = Ramadhan
// (kita ambil dari data hijri yang sudah ada di prayerTimes)
function isRamadhan() {
  // Ambil nama bulan dari elemen hijriMonthName (sudah ada)
  const monthName = document.getElementById('hijriMonthName').textContent;
  return monthName.includes('Ramadhan');
}


// Fungsi untuk memperbarui status puasa
function updatePuasaStatus() {
  const mode = puasaModeSelect.value;
  let status = 'Tidak aktif';
  let message = '';

  if (mode === 'senin-kamis') {
    if (isSeninKamis()) {
      status = '✅ Hari ini Senin/Kamis - Puasa Sunnah';
      message = 'Alarm imsak dan buka akan aktif.';
    } else {
      status = '⏳ Hari ini bukan Senin/Kamis';
      message = 'Tidak ada alarm puasa.';
    }
  } else if (mode === 'ramadhan') {
    if (isRamadhan()) {
      status = '✅ Bulan Ramadhan - Puasa Wajib';
      message = 'Alarm imsak dan buka akan aktif.';
    } else {
      status = '⏳ Saat ini bukan Ramadhan';
      message = 'Tidak ada alarm puasa.';
    }
  }

  puasaStatus.textContent = 'Status: ' + status;
  // Cek apakah elemen puasaMessage ada sebelum diisi
  if (puasaMessage) {
    puasaMessage.textContent = message;
  }
  return (mode !== 'none' && (status.includes('✅')));
}


// Panggil saat mode berubah
puasaModeSelect.addEventListener('change', () => {
  updatePuasaStatus();
  // Reset flag agar alarm bisa berbunyi lagi setelah ganti mode
  imsakTriggered = false;
  bukaTriggered = false;
});

// Fungsi untuk memainkan alarm imsak
function playImsakAlarm() {
  if (!puasaModeSelect.value || puasaModeSelect.value === 'none') return;
  if (imsakTriggered) return;
  imsakTriggered = true;
  // Mainkan suara
  imsakAudio.play().catch(() => {});
  // Tampilkan notifikasi browser
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🌙 Waktu Imsak!', {
      body: 'Segera hentikan makan dan minum. Waktu Subuh akan tiba.',
      icon: 'https://cdn-icons-png.flaticon.com/512/3183/3183468.png'
    });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
  // Tampilkan alert jika notifikasi tidak didukung
  if (!('Notification' in window)) {
    alert('🌙 Waktu Imsak! Segera hentikan makan dan minum.');
  }
}

function playBukaAlarm() {
  if (!puasaModeSelect.value || puasaModeSelect.value === 'none') return;
  if (bukaTriggered) return;
  bukaTriggered = true;
  bukaAudio.play().catch(() => {});
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🍲 Waktu Berbuka Puasa!', {
      body: 'Selamat berbuka puasa, semoga berkah.',
      icon: 'https://cdn-icons-png.flaticon.com/512/3176/3176366.png'
    });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
  if (!('Notification' in window)) {
    alert('🍲 Waktu Berbuka Puasa! Selamat berbuka.');
  }
}

// Uji alarm
document.getElementById('testImsakAlarm').addEventListener('click', () => {
  playImsakAlarm();
});
document.getElementById('testBukaAlarm').addEventListener('click', () => {
  playBukaAlarm();
});

// Integrasikan dengan countdown: cek setiap detik apakah waktu imsak atau maghrib tercapai
// Kita modifikasi fungsi startCountdown yang sudah ada agar mengecek juga
// Karena kita tidak mau mengubah fungsi asli, kita tambahkan interval terpisah untuk pengecekan alarm
setInterval(() => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  // Ambil waktu imsak dan maghrib dari data prayerTimes (sudah ada)
  if (prayerTimes.imsak && prayerTimes.maghrib) {
    const [imsakH, imsakM] = prayerTimes.imsak.split(':').map(Number);
    const [maghribH, maghribM] = prayerTimes.maghrib.split(':').map(Number);

    // Cek apakah mode aktif dan kondisi puasa terpenuhi
    const mode = puasaModeSelect.value;
    let isPuasaToday = false;
    if (mode === 'senin-kamis') isPuasaToday = isSeninKamis();
    else if (mode === 'ramadhan') isPuasaToday = isRamadhan();

    if (mode !== 'none' && isPuasaToday) {
      // Alarm imsak: tepat pada jam:menit:detik 0
      if (hours === imsakH && minutes === imsakM && seconds === 0) {
        playImsakAlarm();
      }
      // Alarm buka: tepat pada jam:menit:detik 0
      if (hours === maghribH && minutes === maghribM && seconds === 0) {
        playBukaAlarm();
      }
    } else {
      // Jika mode tidak aktif, reset flag agar alarm bisa aktif lagi nanti
      imsakTriggered = false;
      bukaTriggered = false;
    }
  }
}, 1000); // cek tiap detik

// Panggil update status saat pertama kali
updatePuasaStatus();

// Minta izin notifikasi di awal
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ---------- DOA & NASIHAT ----------
const doaTabBtn = document.getElementById('doaTabBtn');
const nasihatTabBtn = document.getElementById('nasihatTabBtn');
const doaContent = document.getElementById('doaContent');
const nasihatContent = document.getElementById('nasihatContent');
const nasihatText = document.getElementById('nasihatText');
const nasihatSumber = document.getElementById('nasihatSumber');
const nasihatRefreshBtn = document.getElementById('nasihatRefreshBtn');

// Kumpulan nasihat (Al-Qur'an + tokoh dunia)
const nasihatList = [
  { 
    text: "Dan carilah pada apa yang telah dianugerahkan Allah kepadamu (kebahagiaan) negeri akhirat, dan janganlah kamu melupakan bagianmu dari (kenikmatan) duniawi.",
    source: "Q.S. Al-Qashash 28:77"
  },
  {
    text: "Sesungguhnya bersama kesulitan ada kemudahan. Maka apabila engkau telah selesai (dari sesuatu urusan), tetaplah bekerja keras (untuk urusan yang lain).",
    source: "Q.S. Al-Insyirah 94:6-7"
  },
  {
    text: "Dan bersabarlah, sesungguhnya Allah beserta orang-orang yang sabar.",
    source: "Q.S. Al-Anfal 8:46"
  },
  {
    text: "Kebaikan bukanlah dengan banyaknya harta, tetapi kebaikan adalah dengan banyaknya amal dan kebijaksanaan.",
    source: "— Imam Ali bin Abi Thalib"
  },
  {
    text: "Puasa adalah perisai dari api neraka, seperti perisai kalian dalam peperangan.",
    source: "— HR. Ahmad (Hadits)"
  },
  {
    text: "Siapa yang tidak bersyukur kepada manusia, dia tidak bersyukur kepada Allah.",
    source: "— HR. Tirmidzi"
  },
  {
    text: "Kebahagiaan sejati adalah ketika Anda berbuat baik kepada orang lain tanpa mengharapkan imbalan.",
    source: "— Dalai Lama"
  },
  {
    text: "Lebih baik menjadi cahaya bagi orang lain daripada hanya mengutuk kegelapan.",
    source: "— Eleanor Roosevelt"
  },
  {
    text: "Jangan menilai orang dari kekayaannya, tapi dari kebaikan hatinya.",
    source: "— Confucius"
  },
  {
    text: "Kebaikan adalah bahasa yang dapat didengar oleh orang tuli dan dilihat oleh orang buta.",
    source: "— Mark Twain"
  }
];

let currentNasihatIndex = 0;

function tampilkanNasihat(index) {
  const n = nasihatList[index % nasihatList.length];
  nasihatText.textContent = n.text;
  nasihatSumber.textContent = '— ' + n.source;
}

function nasihatAcak() {
  const random = Math.floor(Math.random() * nasihatList.length);
  currentNasihatIndex = random;
  tampilkanNasihat(random);
}

// Tab switching
doaTabBtn.addEventListener('click', () => {
  doaContent.classList.remove('hidden');
  nasihatContent.classList.add('hidden');
  doaTabBtn.classList.add('active-tab');
  nasihatTabBtn.classList.remove('active-tab');
});

nasihatTabBtn.addEventListener('click', () => {
  nasihatContent.classList.remove('hidden');
  doaContent.classList.add('hidden');
  nasihatTabBtn.classList.add('active-tab');
  doaTabBtn.classList.remove('active-tab');
  // Tampilkan nasihat pertama kali jika belum ada
  if (nasihatText.textContent === '') {
    nasihatAcak();
  }
});

nasihatRefreshBtn.addEventListener('click', nasihatAcak);

// Tampilkan nasihat acak saat pertama kali halaman dimuat (jika tab nasihat aktif)
window.addEventListener('load', () => {
  // Default tab Doa, jadi nasihat belum tampil. Tapi kita siapkan data.
  nasihatAcak();
});

// ---- Tambahkan juga notifikasi untuk doa berbuka di integrasi alarm (opsional) ----
// Bisa ditambahkan di dalam fungsi playBukaAlarm() untuk menampilkan doa berbuka saat alarm
// Misalnya, tambahkan di playBukaAlarm():
/*
  // Tampilkan doa berbuka di notifikasi
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🍲 Waktu Berbuka Puasa!', {
      body: 'Doa berbuka: "Allāhumma laka ṣumtu wa bi rizqika afṭartu"',
      icon: 'https://cdn-icons-png.flaticon.com/512/3176/3176366.png'
    });
  }
*/
    })();
