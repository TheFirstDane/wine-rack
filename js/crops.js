// Erzeugt fehlende Zuschnitt-Bilder im Hintergrund.
// Nach der Migration auf Datenmodell 2 (und nach dem Import alter Backups) haben vorhandene Weine
// ein Foto, aber noch kein `crop`. Hier entsteht der mittige Ausschnitt (Parameter wie gespeichert).
// Bis dahin zeigt das Regal das Foto per CSS ebenfalls mittig zugeschnitten.

import { getAllWines, getWine, saveWine } from './db.js';
import { renderCrop } from './image.js';
import { DEFAULT_CROP_PARAMS } from './constants.js';

// Liefert die Anzahl der erzeugten Zuschnitte.
export async function ensureCrops() {
  let created = 0;
  const wines = await getAllWines();
  for (const w of wines) {
    if (!w.photo || w.crop) continue;
    try {
      const { blob, params } = await renderCrop(w.photo, w.cropParams || DEFAULT_CROP_PARAMS);
      // Frisch lesen: nur schreiben, wenn der Wein inzwischen nicht geändert wurde
      const current = await getWine(w.id);
      if (!current || current.crop || !current.photo) continue;
      await saveWine({ ...current, crop: blob, cropParams: params });
      created++;
    } catch (err) {
      console.warn(`Zuschnitt für „${w.name}“ nicht erzeugt:`, err); // Foto bleibt unverändert
    }
  }
  return created;
}
