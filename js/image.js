// Foto verkleinern: längste Seite max. 1600 px, JPEG mit ca. 80 % Qualität.
// Das Ergebnis ist ein Blob, der direkt im Wein-Eintrag in IndexedDB liegt.

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export async function resizeImage(file) {
  // imageOrientation: 'from-image' dreht iPhone-Fotos richtig herum
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadViaImgTag(file);
  }
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
