// Foto verkleinern: längste Seite max. 1600 px, JPEG mit ca. 80 % Qualität.
// Das Ergebnis ist ein Blob, der direkt im Wein-Eintrag in IndexedDB liegt.

import { normalizeCrop } from './logic.js';
import { CROP_SIZE } from './constants.js';

const MAX_SIDE = 1600;
const QUALITY = 0.8;
const CROP_QUALITY = 0.85;

// Lädt ein Bild und beachtet die EXIF-Ausrichtung (iPhone-Fotos erscheinen nicht gedreht).
async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return loadViaImgTag(file); // <img> richtet sich in aktuellen Browsern selbst nach EXIF
  }
}

export async function resizeImage(file) {
  const bitmap = await loadBitmap(file);
  const w = bitmap.width || bitmap.naturalWidth;
  const hgt = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verkleinert werden.'))), 'image/jpeg', QUALITY);
  });
}

function loadViaImgTag(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht gelesen werden.')); };
    img.src = url;
  });
}

// Schneidet aus dem (verkleinerten) Foto das quadratische Stück laut params aus: ca. 400 x 400 px, JPEG.
// Das Bild bleibt quadratisch, die Rundung macht später das CSS. Liefert { blob, params } mit
// bereinigten Parametern (Ausschnitt innerhalb des Bildes).
export async function renderCrop(photoBlob, params, size = CROP_SIZE) {
  const bitmap = await loadBitmap(photoBlob);
  const w = bitmap.width || bitmap.naturalWidth;
  const hgt = bitmap.height || bitmap.naturalHeight;
  const n = normalizeCrop(w, hgt, params);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, n.sx, n.sy, n.side, n.side, 0, 0, size, size);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Der Bildausschnitt konnte nicht erzeugt werden.'))), 'image/jpeg', CROP_QUALITY);
  });
  return { blob, params: { cx: n.cx, cy: n.cy, zoom: n.zoom } };
}
