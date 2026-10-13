# AI Helper – MI-beszélgetések (v0.1.3)

Böngésző-kiegészítő (Brave / Chrome, Manifest V3): az MI-csevegésekben folytatott beszélgetések mentése **a saját gépen** –
keresés, export, változatok. Önálló alkalmazásnak készült; emellett egy másik projekt moduljaként is működik.

## Mit tud

- **Automatikus mentés** a megnyitott beszélgetésekről – oldalanként kikapcsolható (a panel „Beállítások” lapján):
  ChatGPT, Grok, Gemini (gemini.google.com), Google AI-mód, Perplexity, Claude (claude.ai). A Claude-nál az automatikus
  mentés alapból ki van kapcsolva (kézzel: a panel „Nyitottak mentése” gombja).
- **Keresés** a mentett beszélgetésekben: szöveg, oldal, dátum (tól–ig), kódnyelv, „csak kóddal”.
- **Export**: Markdown, JSON, HTML, TXT, DOCX (Word), PDF (a böngésző nyomtatásával). Egyenként, vagy egy ZIP-ben:
  `segito-aik/ChatGPT/…`, `segito-aik/Grok/…`, `segito-aik/Gemini/…`, `segito-aik/Perplexity/…`, `segito-aik/Claude/…`
  + `tartalom.md` jegyzék. Minden kimenet sötét (a PDF és a Word is).
- **Változatok**: ha egy korábbi rész megváltozik (szerkesztett kérdés, újragenerált válasz), új változat keletkezik, a régi
  megmarad; két változat soronként összevethető.
- **Korábbi beszélgetések bejárása**: az oldalsávban és a projekt- / könyvtároldalakon lévő korábbi beszélgetéseket magától is
  megnyitja és végigolvassa – lassan (alapból 5 percenként egyet), háttérlapon, ami a végén bezárul. Oldalanként kapcsolható,
  a Beállítások lapon napló mutatja, mit járt be. Csak ott dolgozik, ahol a böngészőben be vagy jelentkezve.
- **Tördelés-javítás**: ha a modell egy kódot tartalmazó Markdown-fájlt ad (```markdown, benne ```powershell), és a megjelenítő
  ettől szétszedi (a fájl egy része szövegként, a szöveges válasz kódblokkban – főleg a Gemininél), a modul felismeri, a fájlt
  egyben mutatja (Kód másolása, Letöltés .md, Előnézet), és az export is a javítottat viszi. Az eredeti megmarad, visszaváltható.
- Hosszú beszélgetésnél, ahol az oldal csak a végét tartja meg, a mentések összefésülődnek – a korábbi részek nem vesznek el.

## Adatok

- Saját adatbázis (`segito-aik`), saját beállítások – **csak ezen a gépen**, semmit nem küld sehová, semmit nem kér le.
- A beszélgetések szövegét csak a már megnyitott oldalból olvassa ki; bejelentkezést, jelszót, kulcsot nem kér.

## Telepítés (Brave / Chrome)

1. Töltsd le a repót (Code → Download ZIP), és csomagold ki egy állandó helyre (pl. `C:\Bovitmenyek\AI_Helper`).
2. `brave://extensions` (vagy `chrome://extensions`) → jobb fent **Fejlesztői mód** be → **Kicsomagolt bővítmény betöltése** → a mappa.
3. Az ikonra kattintva nyílik a panel. Frissítéskor ugyanabba a mappába másold az új fájlokat, és a bővítménynél nyomd meg a ↻ gombot.

## Verziók

| Verzió | Tartalom |
|---|---|
| 0.1.3 | A korábbi beszélgetések lassú, automatikus bejárása (oldalsáv, projektek, könyvtár) – háttérlapon, napló |
| 0.1.2 | Tördelés-javítás (szétesett Markdown-fájl, kódblokkba került szöveg, kiszakadt kódsorok); Kód másolása / Letöltés .md / Előnézet a kódblokkokon; bezárható dobozok |
| 0.1.1 | Gemini-alkalmazás (gemini.google.com), Claude és Perplexity; pontosabb kódnyelv-felismerés |
| 0.1.0 | ChatGPT, Grok, Google AI-mód; keresés, export, változatok |
