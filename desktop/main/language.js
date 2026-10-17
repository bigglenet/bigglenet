// The desktop app's own words (the menu bar, the tray, right-click menus) in the language the
// Biggle browser uses. The browser says which when it starts and when it's changed (app:language);
// until then, the last one it said, or English.
import { app, ipcMain } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TR = {
  'Open Bigglenet': 'Bigglenet’i aç',
  'Quit Bigglenet': 'Bigglenet’ten çık',
  'Check for Updates…': 'Güncellemeleri Denetle…',
  File: 'Dosya',
  'New Tab': 'Yeni Sekme',
  'New Window': 'Yeni Pencere',
  'New Private Tab': 'Yeni Gizli Sekme',
  'Print…': 'Yazdır…',
  'Take a Screenshot': 'Ekran Görüntüsü Al',
  'Close Tab': 'Sekmeyi Kapat',
  View: 'Görüntü',
  'Find…': 'Bul…',
  'Find Next': 'Sonrakini Bul',
  'Find Previous': 'Öncekini Bul',
  'Actual Size': 'Gerçek Boyut',
  'Zoom In': 'Yakınlaştır',
  'Zoom Out': 'Uzaklaştır',
  'Command Palette…': 'Komut Paleti…',
  'Search Tabs…': 'Sekmelerde Ara…',
  'Reader Mode': 'Okuma Modu',
  'Game Mode': 'Oyun Modu',
  Downloads: 'İndirilenler',
  History: 'Geçmiş',
  'Show All History': 'Tüm Geçmişi Göster',
  'Reopen Closed Tab': 'Kapatılan Sekmeyi Yeniden Aç',
  Bookmarks: 'Yer İmleri',
  'Bookmark This Page…': 'Bu Sayfayı Yer İmlerine Ekle…',
  'Show All Bookmarks': 'Tüm Yer İmlerini Göster',
  'Show or Hide the Bookmarks Bar': 'Yer İmleri Çubuğunu Göster ya da Gizle',
  Window: 'Pencere',
  'Open Link in Your Browser': 'Bağlantıyı Tarayıcında Aç',
  'Copy Link Address': 'Bağlantı Adresini Kopyala',
  'Download Linked File': 'Bağlantılı Dosyayı İndir',
  'Copy Image': 'Resmi Kopyala',
  'Copy Image Address': 'Resim Adresini Kopyala',
  'Save Image': 'Resmi Kaydet',
  'There’s no update to download.': 'İndirilecek güncelleme yok.',
  'That update lists a file it shouldn’t.': 'Bu güncellemede olmaması gereken bir dosya var.',
  "A file in the update doesn't match. Not using it.": 'Güncellemedeki bir dosya eşleşmiyor. Kullanılmayacak.',
  'The update server answered {status}.': 'Güncelleme sunucusu şu cevabı verdi: {status}.',
  'The download failed ({status}).': 'İndirme başarısız oldu ({status}).',
  "The update's signature doesn't match. Not installing it.": 'Güncellemenin imzası eşleşmiyor. Yüklenmeyecek.',
  "The update didn't contain the app.": 'Güncellemenin içinde uygulama yoktu.',
  "That isn't a web address.": 'Bu bir web adresi değil.',
};

const file = () => join(app.getPath('userData'), 'language.json');
let lang = null;

function current() {
  if (lang) return lang;
  try {
    lang = JSON.parse(readFileSync(file(), 'utf8')).lang === 'tr' ? 'tr' : 'en';
  } catch {
    lang = 'en';
  }
  return lang;
}

/** `text` in the app's language, with {name} filled from `params`. */
export function t(text, params) {
  const out = (current() === 'tr' && TR[text]) || text;
  return params ? out.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : out;
}

/** `onChange` runs when the browser switches language, to remake menus. */
export function setupLanguage(onChange) {
  ipcMain.handle('app:language', (_event, value) => {
    const next = value === 'tr' ? 'tr' : 'en';
    if (next === current()) return;
    lang = next;
    try {
      writeFileSync(file(), JSON.stringify({ lang }));
    } catch {}
    onChange();
  });
}
