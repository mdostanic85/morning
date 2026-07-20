# Preview parity — detaljan plan implementacije po fazama

Status: plan (pre implementacije)
Datum: 18. jul 2026.
Referenca: `preview.html` (trenutno u `~/Downloads/preview.html`, ~25 KB — kopirati u repo, vidi Fazu 0)
Povezani dokument: `docs/daily-work-operator-visual-redesign-audit.md` (raniji audit rađen nad drugim,
većim referencnim fajlom `daily_work_operator_priority_light_blue (2).html`)

---

## 0. Šta ovaj plan pokriva

Cilj: uskladiti Today stranicu (`src/app/page.tsx`) sa `preview.html` referencom — informaciona
hijerarhija, bento raspored, spacing ritam, tipografija, sadržaj, CTA hijerarhija, mikrointerakcije,
sync animacija, responsive ponašanje i pristupačnost — uz očuvanje realnih podataka, postojeće
arhitekture i design-system primitiva.

Princip proizvoda koji svaka faza mora da poštuje:

> Jedan dan. Jedan primarni fokus. Jedna jasna sledeća akcija.

Stranica mora za manje od 30 sekundi da odgovori na: šta radim danas, šta prvo, zašto je to
prioritet, koji izvori to podržavaju, šta znači "done", šta je blokirano/na čekanju i šta se
promenilo od poslednjeg sync-a.

---

## 1. Verifikovano trenutno stanje (proveren repo, ne pretpostavke)

Ovo je važno jer originalni brief sadrži nekoliko koraka koji su već rešeni ili ih treba
korigovati:

### Već postoji — ne praviti ponovo

| Šta | Gde | Napomena |
| --- | --- | --- |
| Lottie infrastruktura | `lottie-react@2.4.1` u `package.json` | Brief traži "pronađi besplatan Lottie asset" — **nepotrebno** |
| Sync animacija | `src/components/syncAnimation.ts` | Programski generisan Lottie, već čita boje iz CSS tokena (`--accent`, `--warm`), SSR-safe fallback |
| Evidence/decision drawer | `src/components/AIExplanationDrawer.tsx` | Brief traži da se "doda" — postoji, treba parity provera i eventualno proširenje sadržaja |
| Ordered action plan | `src/components/FocusExecution.tsx` | Proveriti stanja koraka (complete/current/upcoming/blocked) |
| Sources tabela | `src/components/SourcesTable.tsx` | Proveriti responsive (mobile stacked) ponašanje |
| "Šta se promenilo" panel | `src/components/SyncWhatsNewPanel.tsx` + `LastSyncSummary.tsx` | Povezati sa completed sync stanjem |
| Real sync sa per-provider progresom | `SyncMyDayButton.tsx`, `src/domain/syncRun.ts`, `/api/day/sync`, cancel ruta | Ne dirati sync logiku — samo prezentaciju |
| UI primitivi | `src/components/ui/*` (HeroUI wrapperi: Button, Badge, Card, Sheet, Dialog, Collapsible, Skeleton…) | Sve novo komponovati iz ovoga |
| Semantički tokeni | `src/app/globals.css` | Svetla/tamna tema, motion i reduced-motion pravila |
| Hydra konflikti | `src/lib/hydra/*`, `src/domain/hydraReport.ts` | Jedini legitimni izvor conflict podataka |

### Poznati integritetski problemi (iz prethodnog audita — rešiti pre vizuelnog rada)

- **C3**: `EvidencePanel.hasConflictingSources()` izvodi "konflikt" iz različitih datuma izvora.
  Lažni konflikti — ukloniti pre nego što se conflict UI proširi.
- **C4**: `work_tasks.confidence` je confidence ekstrakcije taska, ne confidence preporuke.
  Etiketirati tačno, ne prikazivati kao headline procenat.
- **C1/C2**: ne simulirati persistovane checkbox-ove ni "request review" akciju koja ne postoji.

### Ključna razlika u odnosu na raniji audit

Raniji audit je rađen nad drugim referencnim HTML-om. **`preview.html` je sada primarna
referenca.** Struktura `preview.html`:

- shell: `280px sidebar + main` (`grid-template-columns: 280px minmax(0,1fr)`), main padding 36px;
- sidebar: brend "Hydra / ASC", anchor navigacija (🔥 Najvažnije, Redosled, Done, Blokade,
  Konflikti, Ostalo, Kalendar, Izvori), kontekstualna napomena na dnu;
- hero: naslov stanja ("UATL-367 još nije spreman za finalni sign-off");
- 12-kolonski bento grid, gap 18px, card radius 18px (`--radius`), unutrašnji radius 12px,
  card padding 24px:
  1. `#prioritet` — **Najvažnije** (span 7);
  2. **Trenutno stanje** (span 5);
  3. `#redosled` — **Redosled rada** (full width, numerisani koraci);
  4. `#done` — **Definition of Done** (span 7);
  5. `#blokade` — **Blokeri i čekanja** (span 5);
  6. `#konflikti` — **Konflikti između izvora** (full width);
  7. `#ostalo` — **Ostali aktivni tiket** (span 6) + `#calendar` — **Današnji sastanci** (span 6);
  8. **Dodatne napomene** (full width);
  9. `#sources` — **Izvori** (full width);
- breakpoint: sidebar kolabira, card padding 18px, hero padding 24/20px.

---

## 2. Korekcije i unapređenja originalnog brief-a (namerna odstupanja)

1. **Lottie asset se ne traži spolja.** Postojeća programski generisana animacija
   (`syncAnimation.ts`) je već tokenizovana, licencno čista i lokalna. Umesto potrage za
   besplatnim assetom: proširiti postojeću animaciju sa completed/partial/failed završnim
   stanjima. Ako se ikad zameni eksternim JSON-om, čuvati ga u `public/animations/` i
   dokumentovati licencu — ali to nije deo ovog plana.
2. **Font ostaje Geist + Space Grotesk.** `preview.html` koristi Inter. Zamena fonta ne donosi
   vrednost; parity se postiže hijerarhijom veličina/težina, ne fontom. Ovo je
   "intentionally different" stavka u matrici.
3. **Sidebar navigacija je odluka, ne automatizam.** Aplikacija ima top `NavBar` sa realnim
   rutama (Today, Projects, Knowledge, Reports…). Preview ima 280px sidebar sa anchor
   linkovima unutar jedne stranice. Predlog: **hibrid** — zadržati globalni top NavBar
   (rute), a na Today desktopu dodati sekundarnu in-page anchor navigaciju (sticky levi rail
   ≥1280px, sakriven ispod). Ne rušiti navigaciju ostalih ruta. Konačna odluka se donosi u
   Fazi 0 na osnovu rendera.
4. **Persistencija koraka i DoD checklisti zahteva mali backend dodatak.** Brief eksplicitno
   zabranjuje `localStorage` i traži persistovan progres. Trenutno ne postoji per-step /
   per-criterion state (audit C1). Umesto simulacije: dodati minimalan persistovani model
   (Faza 5) — jedna tabela ili JSON kolona + jedna API ruta. Ovo je jedini planirani backend
   dodatak i eksplicitno je ograničen.
5. **"Šta danas konkretno treba da uradiš" sažetak** se generiše kroz postojeći daily-briefing
   tok (`src/lib/tasks/todayBriefing.ts` + `src/lib/llm/prompts/todayBriefing.ts`), preko
   centralnog LLM routera — ne novim pozivom iz UI-ja. Ako polje ne postoji u izlazu
   briefinga, proširiti šemu izlaza, ne dodavati novi pipeline.
6. **Konflikti dolaze isključivo iz realnih struktuiranih podataka** (Hydra
   `evidence_relations` / report konflikti / sync-review). Ako za današnji fokus ne postoji
   realan konflikt, sekcija se ne prikazuje ili prikazuje "Nema poznatih konflikata" — nikad
   se ne izmišlja iz timestamp-ova.
7. **Poređenje se radi renderovanjem**, ne čitanjem koda: lokalni dev server + browser
   screenshotovi na 1440/1024/390px za obe strane (preview.html se otvara kao `file://` ili
   preko lokalnog statičkog servera).

---

## 3. Faze implementacije

Redosled je biran tako da: (a) integritet podataka ide pre vizuala, (b) tokeni/layout pre
sadržaja kartica, (c) svaka faza ostavlja aplikaciju u funkcionalnom stanju.

---

### Faza 0 — Referenca, baseline i uporedna matrica (bez izmena UI-ja)

**Cilj:** kompletna Phase 1 iz brief-a — renderovano poređenje i potvrđen spisak gapova.

Zadaci:

1. Kopirati referencu u repo: `docs/reference/preview.html` (stabilna putanja, ne zavisi od
   Downloads foldera). Ne importovati je nigde u build.
2. Podići dev server (`npm run dev`) i renderovati Today; otvoriti `preview.html` u browseru.
3. Screenshotovi obe strane na 1440px, 1024px, 390px → ignorisani lokalni direktorijum
   `tmp/visual-parity/`. Today screenshotovi mogu sadržati Jira, Gmail i meeting podatke i
   ne smeju se commitovati. U dokumentaciji se smeju čuvati samo eksplicitno redigovane slike
   statične reference kada za to postoji potreba.
4. Popuniti uporednu matricu (šablon u sekciji 4 ovog dokumenta) sa statusima
   MATCHES / PARTIALLY MATCHES / MISSING / INCORRECT / INTENTIONALLY DIFFERENT, po grupama:
   hijerarhija, bento layout, spacing, tipografija, čitljivost sadržaja, komponente i CTA,
   sync animacija, mikrointerakcije, responsive, accessibility, nedostajuća stanja.
5. Za svaki mismatch: referentno ponašanje, trenutno ponašanje, odgovorna komponenta/fajl,
   severity (Critical/High/Medium/Low), potrebna korekcija.
6. Doneti i zapisati odluke: sidebar-hibrid (tačka 2.3), obim persistencije (tačka 2.4),
   labela primarnog CTA po stanjima.

Fajlovi: `docs/reference/preview.html`, `tmp/visual-parity/*` (ignored), matrica u ovom
dokumentu ili `docs/preview-parity-matrix.md`.

**Done kriterijum:** matrica kompletna i priložena u ovaj dokument (ili poseban
`docs/preview-parity-matrix.md`); Faza 0 je potpuno read-only — nema izmene aplikacionog koda
niti vizuelnih korekcija pre potvrđene matrice.

---

### Faza 1 — Tokeni, tipografija i spacing ritam

**Cilj:** centralno mapirati vizuelni jezik reference na semantičke tokene, bez restrukturiranja
stranice.

Zadaci:

1. `src/app/globals.css`:
   - uskladiti spacing/radius tokene sa referencom: card radius 18px, unutrašnji radius
     12–14px, grid gap 18px, card padding 24px (desktop) / 18px (mobile), main padding
     36px (desktop) / 20px (tablet) / 12px (mobile);
   - motion tokeni: 120–180ms (kontrole), 180–240ms (kartice/accordion/drawer);
   - proveriti kontrast svetle teme prema referenci (svetla pozadina, bele kartice, mirne
     senke) i definisati svesnu tamnu translaciju — ne auto-invert.
2. Tipografska skala (kroz postojeće klase/tokene, ne raw vrednosti po komponentama):
   - hero/primarni naslov: izražen, kompaktan;
   - naslovi sekcija ~20–22px;
   - naslovi akcija ~15–17px;
   - body ~14–16px;
   - metadata 12–13px (nikad za greške i ključne operativne detalje — minimum 14px);
   - ne preterivati sa bold; hijerarhija kroz veličinu, boju i spacing.
3. Ne uvoditi arbitrarne spacing vrednosti u komponentama; sve kroz tokene/Tailwind skalu.
4. Pre bilo kakvog conflict UI proširenja:
   - ukloniti date-based conflict inferencu iz `EvidencePanel` (C3);
   - proveriti da se `confidence` nigde ne prikazuje kao procenat recommendation confidence
     (C4); postojeći extraction confidence zadržava tu jasnu oznaku.

Fajlovi: `src/app/globals.css`, eventualno `src/components/ui/card.tsx`,
`src/components/ui/button.tsx` (samo mapiranje na tokene).

**Done kriterijum:** postojeće stranice rade bez regresije; spacing/typography audit na
1440px odgovara referentnom ritmu (screenshot diff).

---

### Faza 2 — Bento layout i redosled sekcija Today stranice

**Cilj:** 12-kolonski bento grid sa hijerarhijom iz reference; primarni fokus i sledeća akcija
iznad folda na 1440px.

Ciljna struktura (desktop):

1. hero traka: naslov stanja dana (generisan iz realnog fokusa — npr. status primarnog
   taska), datum, sync health, Sync My Day kontrola;
2. red 1: **Najvažnije** (span 7) + **Trenutno stanje** (span 5);
3. **Redosled rada** (full width);
4. **Definition of Done** (span 7) + **Blokeri i čekanja** (span 5);
5. **Konflikti između izvora** (full width — renderuje se samo uz realne konflikte);
6. **Ostali aktivni zadaci** (span 6) + **Današnji sastanci** (span 6);
7. **Dodatne napomene** (full width, tiho);
8. **Izvori** (full width, kolabirano/kompaktno).

Zadaci:

1. `src/components/TodayFilteredView.tsx` / `TodayBriefing.tsx`: reorganizovati kompoziciju u
   grid (`grid-cols-12`, gap token), sekcije sa `id` anchor-ima (`#prioritet`, `#redosled`,
   `#done`, `#blokade`, `#konflikti`, `#ostalo`, `#calendar`, `#sources`).
2. Desna/uža strana (span 5 kartice) je **kontekst**: trenutno Jira/Figma/review stanje,
   blokeri, ljudi od kojih se čeka odgovor, source/sync health. Ne sme da postane drugi
   glavni radni prostor.
3. In-page anchor navigacija (odluka iz Faze 0): sticky rail na ≥1280px, aktivna sekcija
   prati scroll (IntersectionObserver), smooth scroll, `scroll-margin-top` zbog sticky
   header-a.
4. Meetings, sync summary i resume sadržaj sele se ispod primarnog fokusa (audit H1).
5. Ne praviti sve kartice vizuelno jednakim — primarna kartica ima jasan akcenat
   (npr. obojena ivica/rail kao u referenci), sekundarne su tiše.

Fajlovi: `src/app/page.tsx` (samo prosleđivanje već učitanih podataka),
`src/components/TodayFilteredView.tsx`, `TodayBriefing.tsx`, `TodayMeetings.tsx`,
`LastSyncSummary.tsx`, `NavBar.tsx` (samo ako hibridna navigacija to zahteva).

**Done kriterijum:** na 1440px prvi viewport prikazuje: primarni task + Jira ključ, konkretan
posao, sledeću akciju, razlog prioriteta, najvažniji bloker, primarni CTA i "Zašto je ovo
prioritet?" akciju. Grid spanovi odgovaraju referenci.

---

### Faza 3 — Sadržaj primarnog fokusa i CTA hijerarhija

**Cilj:** kartica "Najvažnije" prikazuje kompletan, konkretan, ljudski čitljiv sadržaj i jednu
dominantnu akciju.

Zadaci:

1. Sadržaj kartice (sve iz postojećih podataka fokus-toka):
   - Jira ključ, naslov, status, assignee, due date (kad postoji);
   - zašto je ovo prioritet (kratko, 1–3 rečenice — bez CSS truncation trika, audit H6);
   - šta se promenilo od poslednjeg sync-a (iz `LastSyncSummary`/`SyncWhatsNewPanel` podataka);
   - progres taska;
   - **"Šta danas konkretno treba da uradiš"** — kratak sažetak od 3–5 bullet-a, izveden iz
     već postojećeg strukturiranog `focus_action_plan` izlaza ili dodat kao polje tog istog
     plana (`src/lib/llm/prompts/focusActionPlan.ts` +
     `src/lib/tasks/focusActionPlanner.ts`). Ne dodavati ga u `todayBriefing` LLM izlaz:
     taj tok ne proizvodi fokus stavke. Proširiti `BriefingFocusItemDraft`, Zod šemu,
     prompt-version i cache/input hash kada se šema menja. Ne ponavlja ceo redosled rada
     doslovno. Bez izlaganja raw DB polja, JSON-a ili provider payload-a. Bez evidencije →
     sažetak se ne prikazuje (evidence over assertion).
2. Primarni CTA — labela iz realnog stanja, ne generička:
   - "Počni rad" / "Nastavi rad" / "Otvori u Figmi" / "Pripremi za review" / "Zatraži finalni
     review" (poslednja samo ako realna akcija postoji — inače je nema, audit C2);
   - deterministički frontend izbor targeta: Figma link kad je posao u Figmi → GitHub/repo →
     Jira → interna ruta; bez izmišljene univerzalne task rute.
3. Sekundarne akcije: "Otvori Jira", "Otvori Figmu", "Pogledaj izvore i odluku", "Vidi
   Definition of Done" (anchor scroll).
4. "Mark done" se seli kod Definition of Done sekcije, sa postojećom potvrdom (audit H2).
5. Sva dugmad kroz `src/components/ui/button.tsx`; verifikovati default/hover/pressed/focus/
   disabled/loading/success/error stanja.
6. Svaka pisana (write) akcija ka eksternom sistemu zadržava eksplicitnu potvrdu
   (postojeće pravilo, `ai-safety.mdc`).

Fajlovi: `src/components/DailyFocusCard.tsx` (dekompozicija po potrebi — audit M1),
`TaskActionButtons.tsx`, `ReasonText.tsx`, `src/lib/tasks/focusActionPlanner.ts`,
`src/lib/llm/prompts/focusActionPlan.ts`, `src/lib/tasks/priorityRank.ts`.

**Done kriterijum:** korisnik razume šta tačno da radi bez otvaranja Jire ili meeting beleški;
nema vagalnih formulacija ("Nastavi rad na UATL-367" bez konteksta); CTA labela odgovara
realnom stanju.

---

### Faza 4 — "Zašto ovo?" / evidence & decision drawer + kontekstualni source badge-ovi

**Cilj:** postojeći `AIExplanationDrawer` postaje jedina tačka za objašnjenje odluke i evidenciju,
sa punim sadržajem iz brief-a.

Zadaci:

1. Trigger "Zašto je ovo prioritet?" / "Pogledaj izvore i odluku" vidljiv uz objašnjenje
   prioriteta u primarnoj kartici.
2. Sadržaj drawer-a (samo auditabilan, user-facing sažetak — bez chain-of-thought):
   - **Sažetak odluke**: zašto je task rangiran prvi, koja novija informacija je promenila
     plan, koje source-of-truth pravilo je primenjeno;
   - **Hijerarhija evidencije**: najnovija direktna instrukcija → poslednja meeting odluka →
     Jira status/komentari → PRD/Confluence → Figma stanje → ostalo (renderovati samo nivoe
     koji realno postoje);
   - **Konflikti**: stariji claim / noviji claim / izabrana rezolucija / zašto (samo realni,
     iz Hydra podataka);
   - **Detalji izvora**: provider, naslov, autor/učesnici (plumbing `author` polja iz
     `SourceItem` u view model — audit H7), datum/vreme lokalizovano, svežina, direktan link,
     relevantan izvod, health/access stanje izvora;
   - **Confidence**: High/Medium/Low + kratko objašnjenje; procenat samo ako sistem realno
     računa; ekstrakcioni confidence označen kao takav (C4).
3. Ponašanje: keyboard navigacija, focus trap, Escape, vidljiv close, focus se vraća na
   trigger, mobile full-screen (HeroUI Sheet proširenje ako treba).
4. Kontekstualni `SourceBadge`/`SourceLink` pored važnih tvrdnji u glavnoj stranici (fokus
   razlog, koraci, DoD kriterijumi, konflikti) — ne oslanjati se samo na tabelu izvora na dnu.
5. Dugi evidence sadržaj napušta Dialog (audit H4) — sve kroz drawer; jedan drawer po fokus
   kontekstu, bez ugnježdenih modala.

Fajlovi: `src/components/AIExplanationDrawer.tsx`, `EvidencePanel.tsx`, `SourceBadge.tsx`,
`src/domain/evidenceItem.ts` (view-tip proširenje, bez novih kolona), `src/components/ui/sheet.tsx`.

**Done kriterijum:** svaki "Zašto/Izvori/Objasni" trigger otvara isti drawer sa kontekstom
kliknute stavke; svi izvori imaju link, vreme i autora kad postoji; ništa nije hardkodovano.

---

### Faza 5 — Redosled rada i Definition of Done (sa persistencijom)

**Cilj:** numerisani plan i realna checklista sa progresom koji preživljava refresh i radi
cross-device.

Zadaci:

1. **Strukturirani, evidence-linked plan pre persistencije.** Prepraviti `focus_action_plan`
   izlaz tako da koraci i DoD kriterijumi nisu `string[]`, već stavke poput
   `{ id, title, instruction, evidenceIds, completionKind }`. `id` se generiše uz plan i
   ostaje stabilan za njegovu verziju; `evidenceIds` se validiraju prema evidence bundle-u.
   Ne prikazivati source badge niti stanje `blocked` kada za to ne postoji eksplicitna
   evidence veza. Tek zatim adaptirati `BriefingFocusItemDraft`, cache/prompt verziju i
   sadašnje string-only call-siteove.
2. **Minimalan persistovani model** (jedina backend izmena u planu):
   - nova tabela npr. `task_progress_state` sa `taskId`, `planVersion`, stabilnim
     `itemId`, `itemType` (`step` | `done_criterion`), `completed`, `completedAt` u
     `src/db/schema.ts` + Drizzle migracija (SQLite i Postgres);
   - jedna API ruta npr. `PATCH /api/work-tasks/[id]/progress`;
   - servis u `src/services/workTasks.ts` ili poseban `taskProgress.ts`;
   - pri promeni `planVersion` ne prenositi state preko indeksa ili hash-a teksta: eksplicitno
     arhivirati/odbaciti stari progres i prikazati novu verziju plana kao novu;
   - progres je trajan u aktivnoj aplikacionoj bazi. Cross-device radi samo kada uređaji
     koriste istu korisničku bazu (npr. zajednički Postgres); lokalni SQLite je lokalni po
     uređaju.
3. **Redosled rada** (`FocusExecution.tsx` parity):
   - svaki korak: broj, kratak naslov, ljudski čitljiva instrukcija, stanje
     (complete / current / upcoming / blocked), source/evidence indikator kad postoji;
   - tačno jedan vizuelno naglašen "current" korak; ne prikazivati sve korake kao jednake;
   - kompletiranje koraka piše u persistovani state (lokalna aplikaciona baza — nije
     eksterna write akcija, pa ne zahteva confirm dialog);
   - bez `localStorage`.
4. **Definition of Done**:
   - progres "3 od 8 završeno";
   - jasna separacija: kriterijumi koje korisnik može da štiklira vs. eksterna odobrenja;
   - eksterna odobrenja read-only: "Čeka se Matt", "Čeka se Sofia", "Potrebno odobrenje" —
     bez mogućnosti ručnog štikliranja (C2);
   - kriterijumi izvedeni iz Jira/PRD/meetinga nose source indikator;
   - postojeći verification report mapira verified/missing stanje kad postoji;
   - završeni itemi dobijaju suptilan feedback ali ostaju čitljivi (bez teškog strikethrough).

Fajlovi: `src/db/schema.ts`, `drizzle/*` (nova migracija), `src/services/*`, nova API ruta,
`src/components/FocusExecution.tsx`, novi/prošireni `DefinitionOfDone` deo u fokus kompoziciji,
`src/lib/llm/prompts/focusActionPlan.ts`, `src/lib/tasks/focusActionPlanner.ts`,
`src/lib/tasks/priorityRank.ts`.

**Done kriterijum:** štikliranje preživljava refresh u aktivnoj bazi i radi kroz oba DB
dijalekta; plan sa promenjenom verzijom ne prenosi completion na semantički pogrešnu stavku;
eksterna odobrenja se ne mogu ručno kompletirati; progres brojač je tačan.

---

### Faza 6 — Blokeri, čekanja i konflikti

**Cilj:** operativno tačna slika šta koči rad, bez lažnih uzbuna.

Zadaci:

1. **Blokeri i čekanja** (span 5 kartica):
   - četiri različita tretmana: blokirano / čeka se osoba / nedostaje informacija koja NE
     blokira / informativni rizik;
   - ljudski čitljive labele ("SKU lista nije dostupna, ali to ne blokira dizajn paginacije");
   - najvažniji bloker vidljiv u prvom viewportu (u primarnoj kartici ili hero traci);
   - ne označavati svaki nedostajući podatak kao bloker.
2. **Konflikti** (full width, uslovno renderovanje):
   - svaki konflikt: tema, starija informacija, novija informacija, izabrani source of truth,
     preporučena akcija, direktni evidence linkovi;
   - kompaktan brojač konflikata uz primarni task;
   - detalji inline (Collapsible) ili u evidence drawer-u;
   - iskључivo realni struktuirani podaci (Hydra); bez date-inference (C3 rešeno u Fazi 0);
   - ako nema konflikata — sekcija se ne prikazuje ili je jedan tihi red.

Fajlovi: nova/proširena `BlockersCard` kompozicija (iz postojećih primitiva),
`HydraReportView.tsx` / conflict view komponenta, `TodayFilteredView.tsx`.

**Done kriterijum:** nijedan prikazani konflikt ili bloker nije izveden bez realnog podatka;
razlika blokirano/čekanje/informacija je vizuelno i tekstualno jasna.

---

### Faza 7 — Sync My Day: panel, animacija i stanja

**Cilj:** sync vezan za realno stanje run-a, sa poliranom animacijom, bez blokiranja stranice.

Zadaci:

1. **Prezentaciona dekompozicija** `SyncMyDayButton.tsx` (audit M2, H5) — bez promene
   request/poll/cancel logike:
   - kompaktan in-context sync panel umesto pointer-blocking modala (osim eventualno prvog
     onboarding sync-a);
   - stranica ostaje vidljiva i upotrebljiva tokom sync-a;
   - bez layout shift-a kad se panel pojavi (rezervisan prostor / fiksna visina animacije).
2. **Animacija** — proširiti postojeći `syncAnimation.ts`:
   - loop tokom `running`;
   - jednokratan success završetak na `completed`;
   - mirno warning stanje za `partially completed`;
   - stop + statična ikona za `failed` / `cancelled`;
   - boje ostaju iz semantičkih tokena (već implementirano čitanje `--accent`/`--warm`;
     dodati success/warning/danger tokene po potrebi);
   - lazy-load Lottie player komponente (`next/dynamic`, bez SSR-a);
   - `prefers-reduced-motion`: statična ilustracija/ikona, bez loop-a, status tekst i progres
     ostaju.
3. **Stanja panela** (mapirana na realan `syncRun` status, bez lažnog tajmera/procenta):
   - idle: normalan CTA, bez animacije;
   - queued: "Priprema tvog dnevnog sync-a";
   - running: trenutni korak/provider ("Proveravam kalendar", "Čitam nove meeting beleške",
     "Ažuriram Jira promene", "Poredim verzije izvora", "Sastavljam današnji plan") + realna
     provider stanja i brojači ("Calendar — završeno, 2 promene; Granola — obrađujem 1
     meeting; Jira — čeka; Confluence — konekcija zahteva pažnju");
   - completed: kratko success stanje + "šta se promenilo" (`SyncWhatsNewPanel`);
   - partially completed: koji provideri nisu uspeli, uspešni rezultati sačuvani;
   - failed: akcioni error (Retry = postojeća sync akcija, View details);
   - cancelling/cancelled: jasno "otkazano", nikad success;
   - ne implicirati da je provider završio pre nego što realan status to potvrdi.
4. `aria-live="polite"` za ključne statusne promene (ne za svaki frame); animacija je
   dekorativna (`aria-hidden`) jer tekst nosi značenje.
5. Human-readable status mapiranje centralizovano (jedan util):
   `partially_completed` → "Završeno uz probleme", `config_error` → "Konekcija zahteva
   podešavanje", `disconnected` → "Nije povezano", ISO timestamp → lokalizovano vreme.
   Primeniti isti util i na `ConnectionCard`/`SourcesTable`.
6. **Deterministička testabilnost stanja:** izdvojiti čiste prezentacione komponente i state
   mapper-e tako da fixture-i pokriju queued/running/completed/partial/failed/cancelling/
   cancelled. Jedan realan sync E2E test potvrđuje API wiring; fixture-i proveravaju svako
   vizuelno stanje bez fabričkog progresa ili namernog rušenja stvarnih providera.

Fajlovi: `src/components/SyncMyDayButton.tsx` (split na `SyncMyDayControl` +
`SyncStatusPanel` + postojeći hook-ovi), `syncAnimation.ts`, `LastSyncSummary.tsx`,
`SyncWhatsNewPanel.tsx`, novi `src/lib/format/statusLabels.ts` (ili postojeće mesto za
label mape).

**Done kriterijum:** svih 7 stanja (queued/syncing/completed/partial/failed/cancelling/
cancelled) vizuelno provereno nad realnim sync run-om; reduced-motion proveren; nema fake
progresa.

---

### Faza 8 — Mikrointerakcije i tranzicije

**Cilj:** suptilna, funkcionalna kretnja, konzistentna sa referencom.

Zadaci:

1. Tajminzi kroz motion tokene: 120–180ms (dugmad, badge hover, checkbox), 180–240ms
   (kartice, accordion, drawer), duže samo Lottie loop.
2. Ciljane transition properties (opacity/transform/boja) — **nikad `transition: all`**;
   proveriti postojeće komponente i počistiti.
3. Pokriti: CTA hover/press, source-button hover, hover interaktivnih kartica (mali lift,
   samo gde je kartica zaista klikabilna), checkbox completion + progres bar tranzicija,
   aktivna navigacija, accordion, otvaranje drawer-a, skeleton→content, sync status update,
   scroll-to-top kontrola.
4. Tranzicije stanja bez skakanja layouta: skeleton čuva približne dimenzije finalnog
   sadržaja; tokom mutacije postojeći sadržaj ostaje vidljiv (bez uklanjanja pa vraćanja).
5. Ne preuzimati iz prototipa: sparkles, kursorske spotlight efekte, kontinuirane dekorativne
   animacije (audit L1).

Fajlovi: `globals.css` (tokeni), pojedinačne komponente iz prethodnih faza, `src/app/loading.tsx`.

**Done kriterijum:** interakcije ne kasne (bez animacija koje blokiraju input); reduced-motion
gasi sve neesencijalne kretnje.

---

### Faza 9 — Responsive i accessibility

**Cilj:** verifikovan parity na 1440/1024/390px i pristupačnost celog toka.

Zadaci:

1. **Desktop (1440px)**: bento očuvan; prva akcija i bloker iznad folda; desna strana kao
   kontekst.
2. **Tablet (1024px)**: kolabirati samo gde je nužno; bez uskih neupotrebljivih dvokolonskih
   kartica; main padding 20px.
3. **Mobile (390px)** — redosled sadržaja:
   1. primarni fokus; 2. konkretan današnji posao; 3. trenutna sledeća akcija; 4. primarni
   CTA (full width); 5. blokeri; 6. redosled rada; 7. Definition of Done; 8. sastanci;
   9. promene i konflikti; 10. sekundarni zadaci; 11. izvori;
   - drawer full-screen; touch targeti ≥44px; bez horizontalnog scroll-a; kompaktna Lottie;
     main padding 12px, card padding 18px; `SourcesTable` → stacked redovi.
4. **Accessibility**:
   - semantička hijerarhija naslova (h1 hero → h2/h3 sekcije, bez preskakanja);
   - button vs. link semantika (navigacija = link, akcija = button);
   - checkbox labele povezane; vidljiv focus ring svuda;
   - focus trap + Escape + focus-return u drawer-u (HeroUI, verifikovati);
   - `aria-current` na aktivnoj anchor navigaciji; `scroll-margin-top` da sticky header ne
     prekriva anchor sekcije;
   - status se ne komunicira samo bojom (uvek i tekst/ikona);
   - `aria-live` za sync (restrained); Lottie `aria-hidden`;
   - test tastaturom kroz ceo Today tok i 200% zoom.

Fajlovi: komponente iz prethodnih faza (responsive klase), `NavBar.tsx` (mobile disclosure,
audit M4 — bez reorderovanja aktivnog itema).

**Done kriterijum:** screenshotovi na sva tri viewporta uporedivi sa referencom; keyboard-only
prolaz kroz ceo tok radi.

---

### Faza 10 — Stanja, validacija i završna verifikacija

**Cilj:** svaki state iz brief-a implementiran i vizuelno proveren; regresija nula.

Matrica stanja za proveru (svako čuva istu layout hijerarhiju):

- initial loading; nema primarnog taska (empty state); primarni task postoji;
- sync: queued / running / completed / partial / failed / cancelling / cancelled;
- nema sastanaka; nema blokera; provider diskonektovan; ustajao (stale) izvor;
- konfliktni izvori; čeka se odobrenje; završen task;
- drawer loading; evidencija nedostupna.

Validacija:

1. Render + poređenje sa `preview.html` na 1440/1024/390px (lokalni, ignorisani screenshotovi
   u `tmp/visual-parity/after/`; ne commitovati potencijalne poslovne podatke).
2. Ručni test: sync animacija i sva terminalna stanja, cancel, reduced motion, evidence
   drawer, source linkovi, persistencija checklisti (refresh + drugi browser), keyboard
   navigacija.
3. Automatski: `npx tsc --noEmit`, `npm run lint`, `npm test` (+ novi fokusirani testovi za:
   status-label util, itemKey hash za progress state, CTA target rezoluciju),
   `npm run build`.
4. `git status` provera: nema izmena van planiranih fajlova; nema sirovih secreta; nema
   eksternih animation URL-ova; Lottie ostaje lokalan/programski.

**Done kriterijum:** finalni izveštaj po formatu iz brief-a (matrica → implementirano →
namerna odstupanja → animacija → fajlovi → reuse → nove komponente → test/build rezultati →
preostala ograničenja). Ne tvrditi full parity bez rendera na sva tri viewporta.

---

## 4. Šablon uporedne matrice (popunjava se u Fazi 0)

| # | Oblast | Element | Referenca | Trenutno | Status | Severity | Fajl | Korekcija |
|---|--------|---------|-----------|----------|--------|----------|------|-----------|
| 1 | Hijerarhija | Primarni fokus prvi | span-7 kartica na vrhu | … | | | | |
| 2 | Layout | 12-col bento, gap 18px | grid `repeat(12)` | … | | | | |
| 3 | Spacing | main padding 36px | … | … | | | | |
| … | | | | | | | | |

Statusi: MATCHES / PARTIALLY MATCHES / MISSING / INCORRECT / INTENTIONALLY DIFFERENT.

Kandidati za INTENTIONALLY DIFFERENT odstupanja (status se potvrđuje tek u Fazi 0):

1. font: Geist + Space Grotesk umesto Inter (postojeći brend, hijerarhija se prenosi);
2. globalna navigacija: top NavBar sa realnim rutama ostaje; in-page anchor rail se uvodi samo
   ako Faza 0 potvrdi da ne duplira navigaciju i ne narušava minimalni Today cockpit;
3. Lottie: programski generisana animacija umesto eksternog asseta (tokenizovana, bez
   licencnih pitanja);
4. konflikti/koraci/odobrenja: renderuju se samo iz realnih podataka — statički sadržaj
   reference se ne kopira;
5. checkbox persistencija: kroz aplikacionu bazu (SQLite/Postgres), ne `localStorage`.

---

## 5. Granice i pravila za sve faze

1. Sync logika (request/poll/cancel/Inngest) se ne menja — samo prezentacija.
2. Bez novih zavisnosti (Lottie, motion i toast infrastruktura već postoje).
3. Bez klijentskog fetch-ovanja podataka koje server već učitava.
4. Sav LLM sadržaj kroz centralni router (`src/lib/llm/router.ts`); bez izlaganja
   chain-of-thought-a.
5. Svaka eksterna write akcija zadržava eksplicitnu potvrdu.
6. Bez kopiranja statičkog sadržaja iz `preview.html`; svi podaci dinamički.
7. Bez fake progresa, fake confidence-a, fake konflikata i fake odobrenja.
8. Ne dirati nepovezane rute (Projects, Knowledge, Reports, Settings…) osim ako dele
   izmenjeni primitiv — u tom slučaju samo regresiona provera.
9. Jedina backend izmena: minimalni progress-state model iz Faze 5 (tabela + ruta + servis).
10. Sve mora da radi i lokalno (SQLite) i na Vercelu (Postgres).

## 6. Redosled izvršavanja i zavisnosti

```
Faza 0 (matrica + integritet)
  └─> Faza 1 (tokeni) ─> Faza 2 (layout) ─> Faza 3 (fokus + CTA)
                                              ├─> Faza 4 (drawer + izvori)
                                              ├─> Faza 5 (koraci + DoD + persistencija)
                                              └─> Faza 6 (blokeri + konflikti)
      Faza 7 (sync) — nezavisna od 3–6, može paralelno posle Faze 1
  Faza 8 (mikrointerakcije) — posle 2–7
  Faza 9 (responsive + a11y) — posle 8
  Faza 10 (stanja + validacija) — poslednja
```

Procena obima (grubo, za planiranje sesija): Faza 0 ~pola dana; Faze 1–2 ~1 dan; Faza 3 ~1 dan;
Faze 4–6 ~1,5–2 dana; Faza 7 ~1 dan; Faze 8–10 ~1–1,5 dan.
