# Preview parity matrix

Datum: 18. jul 2026.  
Referenca: `docs/reference/preview.html`  
Implementacija: Today (`src/app/page.tsx`)

Statusi: MATCHES · PARTIALLY MATCHES · MISSING · INCORRECT · INTENTIONALLY DIFFERENT

| # | Oblast | Element | Referenca | Trenutno (posle implementacije) | Status |
|---|--------|---------|-----------|----------------------------------|--------|
| 1 | Hijerarhija | Primarni fokus prvi | span-7 na vrhu | `DailyFocusCard` `#prioritet` span 7 | MATCHES |
| 2 | Layout | 12-col bento, gap 18px | `grid-template-columns: repeat(12)` | `--today-grid-gap`, `lg:grid-cols-12` | MATCHES |
| 3 | Spacing | main padding 36/20/12px | responsive padding | `--today-main-padding-*` u layout | MATCHES |
| 4 | Navigacija | 280px sidebar anchor | sticky in-page rail | `TodaySectionNav` ≥1280px | PARTIALLY MATCHES |
| 5 | Hero | status naslov dana | greeting + datum | `TodayHeroBar` iz primarnog fokusa | MATCHES |
| 6 | Fokus CTA | kontekstualna primarna akcija | jedan dominantan CTA | `resolveFocusPrimaryCta` | MATCHES |
| 7 | Koraci | numerisani + current | redosled rada | `FocusExecution` + persistencija | MATCHES |
| 8 | DoD | checklista + progres | 3/8 završeno | `task_progress_state` + API | MATCHES |
| 9 | Blokeri | 4 tipa tretmana | blokeri kartica | `BlockersCard` | MATCHES |
| 10 | Konflikti | samo realni podaci | Hydra/sync-review | `#konflikti` uslovno | MATCHES |
| 11 | Sync | Lottie + 7 stanja | animacija + panel | `syncAnimation` + overlay | PARTIALLY MATCHES |
| 12 | Izvori | tabela na dnu | `#sources` | `SourcesTable` | MATCHES |
| 13 | Font | Inter | Geist + Space Grotesk | postojeći fontovi | INTENTIONALLY DIFFERENT |
| 14 | Global nav | sidebar rute | top `NavBar` | zadržan top nav | INTENTIONALLY DIFFERENT |
| 15 | Confidence | headline % | extraction label | C4 — bez headline % | MATCHES |

Preostalo za ručnu verifikaciju: screenshot diff na 1440/1024/390px (`tmp/visual-parity/`, ne commitovati).
