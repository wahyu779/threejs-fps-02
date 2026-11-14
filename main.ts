// Pelabuhan Senja — program penyerahan (Node 22, stdlib saja).
// Menyalin game/ dan screenshots/ dari sebelah file ini ke /output, lalu menulis
// /output/dossier.json lewat pustaka make.fun yang sudah di-vendor.
// Di luar kontainer grader, MAKEFUN_OUTPUT_DIR menggantikan /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Batas-batas dari gate scorer: teks dossier dibatasi 160 KiB supaya seluruh
// sumber tampil di hadapan juri; sisanya menolak entri yang scorer tolak
// (lebih dari 4 screenshot atau satu di atas 256 KiB; game/ di atas 993 file
// atau 48 MiB — dihitung bersama batas 1000 entri /output itu sendiri).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
