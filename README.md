# MI-beszélgetések – a Segítő modulja (v0.1.0)

Az MI-csevegésekben folytatott beszélgetések mentése **a saját gépen**: keresés, export, változatok.
A [Segítő](https://github.com/LordAthis/Brave_extension) része, de **önálló bővítményként is** telepíthető (ez a mappa önmagában is
egy teljes bővítmény).

## Mit tud

- **Automatikus mentés** a megnyitott beszélgetésekről – oldalanként kikapcsolható (a panel „Beállítások” lapján):
  ChatGPT, Grok, Google AI-mód (Gemini). A Gemini-alkalmazás (gemini.google.com) és a Claude a következő változatban
  (a Claude-nál az automatikus mentés alapból ki van kapcsolva).
- **Keresés** a mentett beszélgetésekben: szöveg, oldal, dátum (tól–ig), kódnyelv, „csak kóddal”.
- **Export**: Markdown, JSON, HTML, TXT, DOCX (Word), PDF (a böngésző nyomtatásával). Egyenként, vagy egy ZIP-ben:
  `segito-aik/ChatGPT/…`, `segito-aik/Grok/…`, `segito-aik/Gemini/…`, `segito-aik/Claude/…` + `tartalom.md` jegyzék.
  Minden kimenet sötét (a PDF és a Word is).
- **Változatok**: ha egy korábbi rész megváltozik (szerkesztett kérdés, újragenerált válasz), új változat keletkezik, a régi
  megmarad; két változat soronként összevethető.

## Adatok

- Saját adatbázis (`segito-aik`), saját beállítások – **csak ezen a gépen**, semmit nem küld sehová.
- A Segítőn belül is teljesen külön van: nem kerül a gépek közötti szinkronba, a Segítő mentéseibe, és a Segítő többi része sem olvassa.

## Telepítés önállóan (Brave / Chrome)

1. Csomagold ki ezt a mappát egy állandó helyre (pl. `C:\Bovitmenyek\segito-aik`).
2. `brave://extensions` (vagy `chrome://extensions`) → jobb fent **Fejlesztői mód** be → **Kicsomagolt bővítmény betöltése** → a mappa.
3. Az ikonra kattintva nyílik a panel. Frissítéskor ugyanabba a mappába másold az új fájlokat, és a bővítménynél nyomd meg a ↻ gombot.

Ha valakinél a Segítő is és ez az önálló modul is telepítve van, csak az önálló modul ment (a Segítőben futó példány visszalép).
