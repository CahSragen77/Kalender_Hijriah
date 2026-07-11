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

    })();
