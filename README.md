# Pelabuhan Senja — tactical FPS tiga lawan tiga (three.js)

Game FPS taktis berbasis ronde di halaman pelabuhan tua saat senja. Kamu
memimpin tim **Penjaga** (kamu + 2 bot sekutu) melawan 3 bot **Penyusup** yang
mencoba menanam bom di situs A atau B. Menang 5 ronde lebih dulu (maks 9
ronde). Semua nama, peta, dan suara asli — terinspirasi Counter-Strike, bukan
salinan.

## Cara main

```sh
node serve.ts
# buka http://localhost:8080
```

Klik untuk main (pointer lock). Tidak ada build, tidak ada aset jaringan —
semua suara disintesis WebAudio, semua geometri dibuat dari kode.

## Kontrol

| Tombol | Fungsi |
| --- | --- |
| W A S D + mouse | Gerak dan lihat |
| Klik kiri | Tembak (tahan untuk otomatis) |
| R | Isi ulang magasin |
| B | Toko (hanya di fase beli, 12 detik awal ronde) |
| 1–4 | Ganti senjata yang sudah dimiliki |
| G | Lempar granat |
| E (tahan) | Jinakkan bom yang sudah ditanam |
| Shift | Jalan pelan (tembakan lebih akurat) |
| Ctrl | Jongkok |
| Space | Lompat |

## Aturan

- **Ronde:** fase beli 12 detik, lalu 100 detik. Ronde berakhir kalau satu tim
  habis, bom meledak, bom dijinakkan, atau waktu habis (tanpa bom = Penjaga
  menang).
- **Bom:** dibawa satu Penyusup. Kalau pembawa gugur, bom jatuh dan Penyusup
  lain mengambilnya. Menanam butuh 3 detik di situs; sumbu 40 detik;
  menjinakkan butuh 5 detik menahan E di dekat bom.
- **Ekonomi:** mulai $800. Bunuh +$300, menang ronde +$325, kalah +$190.
  Toko: pistol Kestrel P9 (gratis), senapan Badak AR-7 ($2700), SMG Tawon
  SMG-9 ($1500), sniper Elang LR-50 ($4750), Granat Petir ($300).
- **Senjata:** headshot memberi damage berkali lipat; penyebaran membesar saat
  bergerak dan saat menembak terus-menerus — berhenti sejenak supaya akurat.
- **Bot:** berjalan lewat graf waypoint, menjaga situs, berpatroli, bereaksi
  pada yang mereka lihat (garis pandang + jarak) dan dengar (tembakan dalam
  radius 26 m), dan menembak balik dengan akurasi yang turun dengan jarak dan
  kecepatan target.

## Struktur kode

Semua di `game/src/`, satu modul satu tugas, simulasi fixed-step 60 Hz
terpisah dari render:

- `main.js` — loop, tembakan pemain, ronde, granat, mode shot/test
- `map.js` — peta Pelabuhan Senja, waypoint, situs bom
- `bots.js` — model dan AI bot (jalan, jaga, sergap, dengar, tembak)
- `player.js` / `mover.js` — gerak pemain dan tabrakan AABB
- `weapons.js` — empat senjata + view model
- `bomb.js` — keadaan bom (bawa/jatuh/tanam/jinakkan/meledak)
- `economy.js` / `rounds.js` — uang + toko, dan mesin ronde
- `hud.js` / `input.js` / `audio.js` / `palette.js` / `rng.js` — HUD DOM,
  keyboard/mouse, suara WebAudio, palet senja, RNG ber-seed

## Screenshot deterministik

`?shot=start|play|plant|end&seed=N` membekukan satu frame untuk tangkapan
layar; `?test=bots|round|bomb|buy|reload|grenade&t=N` menjalankan simulasi
sinkron dan menulis JSON ke `#test-status`.

## Lisensi

MIT — lihat `LICENSE`.
