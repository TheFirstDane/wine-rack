// Hinweise oben in Regal und Weinliste.

import { h } from '../ui.js';
import { getMeta, countWines } from '../db.js';
import { backupStatus } from '../backup.js';

// Liefert einen Hinweis, wenn das letzte Backup älter als 30 Tage ist (oder fehlt), sonst null.
export async function backupNotice() {
  const [last, count] = await Promise.all([getMeta('lastBackup'), countWines()]);
  const status = backupStatus(last, { hasWines: count > 0 });
  if (!status.due) return null;
  const text = status.never
    ? 'Du hast noch kein Backup gemacht.'
    : `Dein letztes Backup ist ${status.days} Tage alt.`;
  return h('div', { class: 'notice', role: 'alert' },
    h('span', {}, text),
    h('a', { class: 'btn small primary', href: '#/einstellungen' }, 'Jetzt sichern'));
}
