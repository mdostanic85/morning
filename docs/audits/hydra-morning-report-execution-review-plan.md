# Hydra Morning Report — plan izvršenja i review-a

Status: predlog za implementaciju  
Osnova: [`hydra-morning-report-vs-today-audit.md`](./hydra-morning-report-vs-today-audit.md)  
Datum: 20. jul 2026.

## 1. Cilj

Posle jednog `Sync my day` korisnik treba da dobije kratak, source-grounded jutarnji brief koji odgovara na:

1. Šta se najvažnije promenilo?
2. Šta radim prvo i zašto?
3. Koja su najviše dva sledeća prioriteta?
4. Koji je konkretan next action?
5. Kako proveravam da je task završen?
6. Šta je blokirano, konfliktno ili nejasno?
7. Koja pitanja treba zatvoriti na današnjem sastanku?
8. Koji izvori podržavaju svaki claim?

Rezultat mora da ostane miran dnevni brief, ne dashboard ili project-management ekran.

## 2. Obavezna pravila

- Jedan source sync po korisničkoj akciji; Hydra composer ne sme ponovo da povlači iste konektore.
- Svi connectori ostaju read-only.
- Svaki prikazani task mora imati evidence, next action i done criteria.
- Nepoznat scope ili owner ide u `Unclear`, ne nestaje i ne pretvara se u izmišljeni task.
- Jira je autoritet za assignee, status, priority i due date.
- Transcript/comment je autoritet za konkretno uputstvo i sledeću akciju.
- Jira `Done` isključuje isti canonical work item iz aktivnog rada.
- LLM ne sme da izmisli sadržaj linkovanog Jira ticketa, Confluence stranice ili Figma komentara koji nisu učitani.
- Today prikazuje najviše tri prioriteta: jedan primarni i dva sledeća.
- Sekundarni taskovi takođe moraju vidljivo imati tri obavezna task polja.

## 3. Odluke koje treba zaključati pre implementacije

### D1 — Today postaje consumer jednog Daily Brief modela

Preporuka: **da**.

Ne treba održavati odvojene `TodayBriefing` i `HydraReport` istine. Potrebno je napraviti `DailyBriefV2` koji preuzima:

- minimalni Today fokus;
- Hydra evidence snapshot i validaciju;
- tri prioriteta;
- konflikte, blockers, sastanke i pitanja;
- source coverage.

Stari Hydra report može ostati history/audit prikaz istog objekta.

### D2 — Maksimalan broj prioriteta

Preporuka: **3 ukupno**.

- 1 `todayFirst`;
- do 2 `afterThat`;
- ostali taskovi ostaju izvan glavnog briefa.

### D3 — Šta se smatra “najvažnijom promenom”

Preporuka:

- nova explicit Jira dodela;
- promena Jira statusa;
- promena due date/priority;
- nova direktna stakeholder instrukcija;
- potvrđen blocker/unblock;
- dokaz da je prethodni fokus završen.

`dayChange` mora porediti današnji snapshot sa prethodnim validnim daily briefom.

### D4 — Owner bez imena

Preporuka:

- explicit Jira assignee Miloš → `owned`;
- transcript direktno kaže Milošu / Miloš kaže “I will” → `owned`;
- owner nije naveden, ali next action jasno pripada korisniku → `owned` uz niži confidence;
- owner nije moguće dokazati → `unclear`;
- nikada tiho sakriti samo zato što je `owner = null`.

### D5 — Figma readiness

Preporuka:

- potvrđen readiness samo uz konkretan file/node evidence i proverljive nalaze;
- bez comments/node pristupa prikazati checklistu i upozorenje `not verified`;
- meeting tvrdnja da je dizajn pregledan nije zamena za Figma audit.

---

## 4. Redosled izvršenja

## Paket 1 — Regression fixture i karakterizacioni testovi

### Cilj

Zaključati scenario 20. jula pre promene produkcione logike.

### Akcije

1. Napraviti sanitizovan fixture sa:
   - UATL-376 `To Do`, danas dodeljen Milošu;
   - UATL-367 `Done`;
   - UATL-233 `In Progress` sa generičnim scope-om;
   - transcriptom koji kaže da je Canvas ranije bio važniji;
   - UATL-376 linkom na CON-220;
   - današnjim Hydra Daily sastankom;
   - Figma file-level linkom bez potvrđenih komentara.

2. Dodati characterization testove za trenutni ranking da pokažu postojeći pogrešan rezultat.

3. Dodati očekivani `DailyBriefV2` snapshot:
   - UATL-376 prvi ili `Unclear — clarify first`;
   - UATL-367 nije production task;
   - UATL-233 je `unclear`/`waiting`;
   - CON-220 naveden kao nedostajući evidence;
   - meeting pitanja postoje;
   - Figma readiness nije potvrđen.

### Verovatno pogođeni fajlovi

- `src/lib/tasks/sourceAuthority.test.mts`
- novi `src/lib/dailyBrief/*.test.mts`
- `package.json` test scripts
- `test/fixtures/` ili postojeća test-fixture lokacija

### Review

- Fixture ne sme sadržati tokene, email sadržaj koji nije potreban ili privatne cele transcripte.
- Test mora proveravati odluke i citations, ne tačnu marketinšku formulaciju LLM-a.
- Negativni test mora potvrditi da missing CON-220 sadržaj nije izmišljen.

### Done

- Test reprodukuje današnji bug.
- Očekivani target rezultat je zapisan pre izmene ranking/composer logike.

---

## Paket 2 — Razdvajanje confidence-a i priority-ja

### Cilj

Validan, niže rangiran task više ne sme da nestane kao “nepouzdan”.

### Akcije

1. U `prioritizer.ts` ukloniti fallback:

```ts
confidence: semantic?.confidence ?? decision.priorityScore
```

2. Definisati odvojene vrednosti:
   - `extractionConfidence`;
   - `ownershipConfidence`;
   - `priorityScore`.

3. Dok se schema ne proširi, postojeći `confidence` treba da predstavlja samo confidence u task/ownership interpretaciju.

4. Ukloniti globalni Today filter `confidence >= 0.8`.

5. Zameniti ga pravilom:
   - explicit assigned Jira task je vidljiv;
   - low-confidence task ide u `Unclear`;
   - drugi owner je izbačen;
   - `owner: null` zahteva klasifikaciju, ne skrivanje.

6. Dodati migraciju/backfill koji ne prepisuje postojeću nisku vrednost kao validan extraction confidence.

### Verovatno pogođeni fajlovi

- `src/lib/tasks/prioritizer.ts`
- `src/app/page.tsx`
- `src/lib/filters/ownerFilter.ts`
- `src/domain/workTask.ts`
- `src/db/schema.ts`
- `src/services/workTasks.ts`
- Drizzle migration

### Review

- Priority promena ne sme menjati evidence confidence.
- `Unclear` mora biti vizuelno različit.
- Explicit Jira assignee task ne sme nestati.
- Task eksplicitno dodeljen drugoj osobi ne sme se pojaviti kod Miloša.

### Done

- UATL-376 i UATL-233 su dostupni planneru/UI-ju bez obzira na njihov priority score.
- Low-confidence task je `Unclear`, ne nevidljiv.
- Postojeći testovi i novi ownership testovi prolaze.

---

## Paket 3 — Canonical Jira task i Done reconciliation

### Cilj

Jedan Jira issue ima jedan canonical open work item, a Jira `Done` se poštuje pre rangiranja.

### Akcije

1. Dodati stabilni `canonicalKey`, npr.:
   - `jira:{site}:{issueKey}`;
   - za meeting-only task: topic fingerprint.

2. U extraction/upsert toku prvo tražiti canonical key, pa tek onda fuzzy merge.

3. Dodati zaštitu od više aktivnih taskova sa istim Jira key-em.

4. Napraviti migraciju koja:
   - pronalazi duplikate;
   - bira canonical task;
   - prebacuje evidence;
   - čuva manual state kada postoji;
   - zatvara ili arhivira duplikate.

5. Pre queue rebuild-a primeniti najnoviji Jira status:
   - `Done/Closed/Resolved` zatvara isti canonical task;
   - otvoren dokazani follow-up postaje zaseban task samo kada ima sopstven evidence i next action.

6. `detectJiraDoneNotifications` ostaje notification sloj, ali više nije jedini Done mehanizam.

### Verovatno pogođeni fajlovi

- `src/lib/tasks/extractor.ts`
- `src/lib/tasks/transcriptTaskMerge.ts`
- `src/lib/tasks/resolveFocusTask.ts`
- `src/lib/imports/sourceImportPipeline.ts`
- `src/inngest/functions/syncMyDay.ts`
- `src/services/workTasks.ts`
- `src/db/schema.ts`
- Drizzle migration

### Review

- Manualno postavljen task status ne sme biti izgubljen bez jasnog reconciliation pravila.
- Evidence se ne briše pri merge-u.
- Migracija mora biti idempotentna.
- Jira `Done` ne sme zatvoriti različit meeting-only follow-up samo zbog sličnog naslova.

### Done

- Postoji jedan otvoren UATL-376 task.
- UATL-367 Jira work item nije aktivni Today focus.
- Svi raniji evidence linkovi ostaju dostupni.

---

## Paket 4 — Linked Jira retrieval

### Cilj

Kada ticket eksplicitno upućuje na drugi Jira issue/comment, composer dobija stvarni sadržaj ili jasno označen missing evidence.

### Akcije

1. Parsirati Jira URL/key reference iz description/comments.

2. Fetchovati direktno linkovani issue:
   - maksimalna dubina 1;
   - isti Atlassian cloud/domain;
   - maksimalan broj linkova po source-u;
   - read-only poziv.

3. Učitati relevantne komentare i autora/datume.

4. Sačuvati relationship:
   - `references`;
   - `clarifies`;
   - eventualno `blocks`.

5. Dodati linkovani source u per-task evidence bundle.

6. Ako fetch nije moguć:
   - `missingEvidence: CON-220 comment`;
   - task ostaje `Unclear`;
   - generator sme da postavi pitanje, ne sme da inventuje scope.

### Verovatno pogođeni fajlovi

- `src/lib/connectors/registry.ts`
- `src/lib/connectors/mcp/adapters/atlassian.ts`
- `src/lib/tasks/focusEvidenceBundle.ts`
- `src/lib/imports/sourceImportPipeline.ts`
- evidence relation service/schema

### Review

- Nema nekontrolisane rekurzije.
- Nema fetch-a van povezanog Atlassian domena.
- Komentari zadržavaju author/date metadata.
- LLM prompt jasno razlikuje parent ticket i linked context.

### Done

- UATL-376 bundle sadrži CON-220 komentar kada je dostupan.
- Kada nije dostupan, output eksplicitno kaže šta nedostaje.

---

## Paket 5 — DailyBriefV2 domen i composer

### Cilj

Jedan validirani model postaje izvor istine za Today i report history.

### Predložena schema

```ts
type DailyBriefV2 = {
  dayChange: CitedClaim | null;
  todayFirst: DailyWorkItem;
  afterThat: DailyWorkItem[];
  sourceConflicts: SourceConflict[];
  todayMeetings: BriefMeeting[];
  meetingPrep: MeetingPrepItem[];
  blockedWaiting: BlockedItem[];
  reviewReadiness: ReviewReadiness | null;
  knowledgeHighlights: CitedClaim[];
  keySources: BriefSource[];
  coverageWarnings: CoverageWarning[];
  generatedAt: string;
  inputHash: string;
};
```

`DailyWorkItem` mora sadržati:

- title;
- reason/why now;
- next action;
- done criteria;
- evidence IDs;
- source links;
- canonical task/Jira key;
- fact/recommendation/unknown oznaku.

### Akcije

1. Napraviti verzionisanu Zod schemu.

2. Izdvojiti reusable composer iz Hydra orchestratora:
   - input je već sinhronizovan evidence snapshot;
   - nema connector fetch-a;
   - deterministic skeleton;
   - LLM synthesis;
   - evidence/URL validator;
   - deterministic fallback.

3. Preneti korisne Hydra sekcije:
   - evidence IDs;
   - conflicts;
   - blockers;
   - source health;
   - validation.

4. Preneti korisne Today sekcije:
   - focus action plan;
   - knowledge highlights;
   - live queue link;
   - previous daily memory.

5. Sačuvati Daily Brief u PostgreSQL, ne samo u lokalni JSON fajl.

6. Zadržati `data/today-briefing.json` samo privremeno tokom migracije; ukloniti ga kada novi read path bude stabilan.

### Verovatno pogođeni fajlovi

- novi `src/domain/dailyBrief.ts`
- novi `src/lib/dailyBrief/composer.ts`
- novi `src/lib/dailyBrief/validator.ts`
- `src/lib/hydra/orchestrator.ts`
- `src/lib/tasks/todayBriefing.ts`
- `src/lib/llm/prompts/todayBriefing.ts`
- `src/db/schema.ts`
- novi daily brief service i migration

### Review

- Schema je dovoljno mala za Today, ali podržava audit/history.
- Svaki operativni claim ima validan evidence ID.
- LLM ne može promeniti deterministički Jira status ili canonical identity.
- Invalid LLM output pada na bezbedan deterministic brief.
- Input hash sprečava nepotrebno ponovno generisanje.

### Done

- Jedan `DailyBriefV2` može da reprodukuje očekivani 20. jul scenario.
- Nema dva različita redosleda u queue summary, Today briefing i Hydra report-u.

---

## Paket 6 — Ranking policy po dimenzijama

### Cilj

Razrešiti konflikt “nova Jira dodela” naspram “starija meeting obaveza” bez jedne globalne authority težine.

### Akcije

1. Uvesti typed facts:
   - assignment;
   - mechanical status;
   - priority/due date;
   - requirement baseline;
   - action instruction;
   - completion evidence.

2. Za svaku dimenziju izabrati autoritet:
   - Jira za mechanical facts;
   - PRD/Confluence za baseline;
   - transcript/comment za instruction;
   - verifikovan artifact za done.

3. Dodati `newAssignment` signal.

4. Ukloniti mogućnost da transcript `forceInclude` vrati Jira `Done` work item.

5. Freshness primenjivati unutar istog claim tipa.

6. Objašnjenje rankinga generisati iz pobedničkih claimova, bez izlaganja score-a.

### Verovatno pogođeni fajlovi

- `src/lib/tasks/sourceAuthority.ts`
- `src/lib/tasks/priorityRank.ts`
- `src/lib/llm/prompts/priorityPlanner.ts`
- novi daily brief decision engine

### Review

- Nova Jira dodela nije automatski uvek prva; deadline/blocker i explicit same-day instruction i dalje mogu pobediti.
- Status i instruction nisu pomešani.
- Stari PRD ostaje baseline iako je van petodnevnog action freshness prozora.

### Done

- Jul 20 fixture daje očekivan redosled i objašnjenje.
- Existing source-authority testovi su prošireni za različite claim tipove.

---

## Paket 7 — Relevant retrieval i meeting prep

### Cilj

Brief kombinuje današnje promene sa relevantnim kontekstom prethodnih dana.

### Akcije

1. Ukloniti izbor:

```ts
todaySources.length > 0 ? todaySources : recentSources
```

2. Za svaki canonical task napraviti topic-based bundle:
   - latest Jira + comments;
   - linked Jira;
   - relevantan PRD/Confluence;
   - 3–5 relevantnih meeting segmenata;
   - relevantan Figma file/node;
   - prethodni daily memory.

3. Posebno učitati današnje meetings.

4. Povezati open question/blocker sa meetingom preko:
   - projekta;
   - učesnika/decision ownera;
   - Jira key/topic match-a.

5. Generisati najviše pet pitanja po sastanku.

6. Svako pitanje mora navesti task i evidence koji je pokazao prazninu.

### Verovatno pogođeni fajlovi

- `src/lib/tasks/todayBriefing.ts`
- `src/lib/tasks/focusEvidenceBundle.ts`
- `src/lib/calendar/todayMeetings.ts`
- novi `src/lib/dailyBrief/retrieval.ts`
- novi `src/lib/dailyBrief/meetingPrep.ts`

### Review

- Nema pitanja za sastanak koji nije relevantan.
- Pitanje ne pretpostavlja da određena osoba ima odgovor bez evidence-a.
- Meeting koji je završen može imati status, ali ne treba nuditi buduća pitanja za njega.
- Token/input limit je kontrolisan per-section bundle-ovima.

### Done

- Hydra Daily prikazuje konkretna UATL-376/UATL-233 pitanja.
- Stariji Content File Manager kontekst ostaje dostupan bez potiskivanja današnjeg Jira stanja.

---

## Paket 8 — Today UI integracija

### Cilj

Today prikazuje Daily Brief bez dashboard sprawl-a.

### Predloženi redosled prikaza

1. Hero: datum, izvori, sync stanje.
2. `dayChange` alert samo kada postoji stvarna promena.
3. Primarni task:
   - evidence;
   - next action;
   - done criteria;
   - why first.
4. Do dva sledeća taska, sa ista tri obavezna polja u kompaktnijem obliku.
5. Današnji relevantni sastanci i pitanja.
6. Samo relevantni blockers/conflicts.
7. Key sources i coverage warnings u mirnom, collapsible prikazu.

### Akcije

1. `page.tsx` učitava današnji `DailyBriefV2`.

2. `MinimalTodayView` dobija report object, ne desetine parcijalnih props-a.

3. Prikazati:
   - pune done kriterijume;
   - reference links;
   - conflicts;
   - blockers/waiting;
   - meeting purpose/questions;
   - coverage warnings.

4. Ukloniti generički `Urgent` badge kada evidence ne potvrđuje hitnost.

5. `Unclear` dobija poseban tretman.

6. Existing task detail ostaje mesto za puni evidence i execution history.

### Verovatno pogođeni fajlovi

- `src/app/page.tsx`
- `src/components/MinimalTodayView.tsx`
- `src/components/TodayMeetingsCard.tsx`
- `src/components/WhyThisButton.tsx`
- eventualno novi mali report-section komponenti
- `src/app/globals.css`

### Review

- Nema horizontalnog/vertikalnog dashboard osećaja.
- Nema nepotrebnog scrolla u osnovnom desktop briefu.
- Svaki task card prikazuje evidence, next action i done criteria.
- Keyboard/focus, heading hierarchy i link labels su pristupačni.
- Mobile ne skriva obavezna polja.
- Nema write akcije bez potvrde.

### Done

- Jul 20 scenario je čitljiv bez otvaranja task detaila.
- Korisnik može da razume prvi potez, razlog, završetak i pitanja za sastanak.

---

## Paket 9 — Confluence, Figma i observability kvalitet

### Cilj

Jasno razlikovati stvarni source coverage od pretpostavki.

### Akcije

1. Confluence:
   - proveriti MCP pagination/parsing;
   - dodati važne PRD/Intake URL-ove u project config;
   - izmeriti koliko stranica je fetched/imported/skipped.

2. Figma:
   - povezati aktivni task sa konkretnim node URL-om;
   - učitati relevantan frame, ne samo file tree;
   - čitati comments/review state samo ako connector to podržava;
   - u suprotnom generisati coverage warning.

3. LLM audit:
   - job type;
   - provider/model;
   - primary/fallback;
   - prompt/schema version;
   - input/output hash;
   - latency/token usage;
   - validation rezultat;
   - bez čuvanja API ključeva.

4. Source health:
   - prikazati poslednji uspešan sync;
   - degraded provider;
   - šta report zbog toga nije mogao da potvrdi.

### Review

- Figma “ready” nije dozvoljen iz file-level strukture.
- Confluence rezultat nije predstavljen kao potpun ako pagination nije potvrđen.
- Audit log ne sadrži secrets ili nepotrebno cele privatne source body-je.

### Done

- Coverage warning jasno objašnjava nedostajući Figma/Confluence dokaz.
- LLM odluka je reproduktivna preko verzije, hash-a i evidence IDs.

---

## 5. Predlog PR redosleda

### PR 1 — Fixtures and decision tests

Sadrži samo test fixture, characterization testove i target assertions.

### PR 2 — Confidence and owner visibility

Razdvaja confidence/priority i uklanja tiho skrivanje.

### PR 3 — Canonical Jira lifecycle

Canonical key, duplicate migration i Jira Done reconciliation.

### PR 4 — Linked Jira evidence

CON-220 retrieval, comments i evidence relationships.

### PR 5 — DailyBriefV2 core

Schema, storage, composer, validator i deterministic fallback.

### PR 6 — Claim-aware ranking

Authority po dimenzijama i Jul 20 očekivani redosled.

### PR 7 — Retrieval and meeting prep

Topic bundles, today meetings i pitanja.

### PR 8 — Today rendering

Minimalni report UI sa svim obaveznim task poljima.

### PR 9 — Source coverage and observability

Confluence/Figma kvalitet i LLM audit.

Svaki PR treba da bude samostalno reviewable i da ne meša široki vizuelni redesign sa data/ranking promenama.

---

## 6. Review checklist za svaki PR

### Funkcionalnost

- Da li promena rešava tačno definisan failure mode?
- Da li je ponašanje pokriveno testom?
- Da li postoje positive, negative i ambiguous slučajevi?
- Da li fallback radi bez LLM-a?

### Evidence i AI safety

- Da li svaki claim ima source/evidence?
- Da li LLM može da inventuje missing content?
- Da li se ambiguity šalje u `Unclear`?
- Da li je source authority primenjen na odgovarajući claim tip?
- Da li invalid output pada na bezbedan deterministic rezultat?

### Ownership

- Da li je korisnik stvarni next-action owner?
- Da li `owner: null` prolazi kroz klasifikaciju umesto skrivanja?
- Da li task druge osobe ostaje van Miloševog plana?
- Da li collaborator nije pogrešno proglašen ownerom?

### Jira lifecycle

- Da li najnoviji Jira status pobeđuje?
- Da li `Done` zatvara isti canonical work item?
- Da li stvarni follow-up ostaje zaseban samo uz novi evidence?
- Da li postoji najviše jedan aktivni task po Jira key-u?

### UI

- Da li svaki task vidljivo ima evidence, next action i done criteria?
- Da li je `Unclear` vizuelno različit?
- Da li je glavni brief miran i kratak?
- Da li su source warnings jasni bez tehničkog preopterećenja?
- Da li mobilni prikaz čuva obavezne informacije?

### Data i migracije

- Da li je migracija idempotentna?
- Da li čuva evidence i manual user state?
- Da li postoji rollback plan?
- Da li nema brisanja source history-ja?

### Performanse

- Da li sync radi samo jedan connector pass?
- Da li linked retrieval ima stroge limite?
- Da li prompt payload ima per-section limite?
- Da li input hash sprečava nepotrebne LLM pozive?

### Observability

- Da li se vidi korišćeni model/fallback?
- Da li se vidi source coverage?
- Da li validation failure ima razumljivu dijagnozu?
- Da li logovi ne sadrže secrets?

---

## 7. Obavezna verifikacija

Za svaki paket pokrenuti relevantne testove, a pred integraciju:

```bash
npm test
npm run lint
npm run build
```

Za DB promene:

```bash
npm run db:pg:generate
npm run db:pg:migrate
```

### End-to-end scenario

1. Pokrenuti čist Jul 20 fixture.
2. Izvršiti jedan `Sync my day`.
3. Potvrditi da nema drugog connector fetch ciklusa.
4. Otvoriti Today.
5. Proveriti:
   - `dayChange` navodi novu UATL-376 dodelu;
   - UATL-376 je prvi ili `clarify first`;
   - UATL-367 nije aktivan production task;
   - UATL-233 je `Unclear/Waiting`;
   - CON-220 scope je učitan ili eksplicitno nedostaje;
   - pitanja za Hydra Daily postoje;
   - Figma readiness nije lažno potvrđen;
   - evidence linkovi rade;
   - nema taskova drugih ownera;
   - nema UATL-376 duplikata.

### Dodatni regression scenariji

- Nema LLM provider ključa.
- Jira radi, Granola ne radi.
- Granola radi, Jira ne radi.
- Linked Jira issue nema permission.
- Calendar nema današnje sastanke.
- Figma ima samo file URL.
- User je ručno promenio task status.
- Jira issue prelazi iz `In Progress` u `Done`.
- Task ima `owner: null`.
- Task eksplicitno pripada drugoj osobi.

---

## 8. Rollout i rollback

### Rollout

1. Prvo generisati `DailyBriefV2` u shadow režimu bez promene Today UI-ja.
2. Uporediti stari Today i novi brief na najmanje nekoliko realnih sync runova.
3. Pregledati:
   - top priority;
   - owner accuracy;
   - missing evidence;
   - duplicate rate;
   - citation coverage;
   - LLM fallback rate.
4. Tek posle prolaska Jul 20 acceptance testa prebaciti Today read path na `DailyBriefV2`.
5. Zadržati stari briefing read-only kao privremeni rollback izvor dok novi tok ne bude stabilan.

Shadow režim ne treba da uvodi dodatni UI chrome ili korisnički feature flag.

### Rollback

- Today ponovo čita prethodni briefing.
- Novi evidence/report podaci ostaju sačuvani radi dijagnoze.
- Ne raditi destructive rollback migracije nad source/evidence istorijom.
- Connector sync ostaje upotrebljiv čak i kada Daily Brief generation ne uspe.

---

## 9. Go / no-go kriterijumi

### Go

- Jul 20 fixture prolazi.
- Citation coverage je 100% za operativne claimove.
- Nema aktivnih Jira duplikata.
- Explicit Jira assignee task nije tiho skriven.
- Jira `Done` se poštuje.
- Missing linked/Figma evidence je jasno označen.
- Today prikazuje sva tri obavezna task polja.
- Deterministic fallback daje bezbedan i upotrebljiv brief.
- `npm test`, lint i build prolaze.

### No-go

- LLM može da izmisli CON-220/Figma sadržaj.
- Priority score se i dalje koristi kao confidence.
- UATL-367 ostaje aktivan samo zbog starog transcript evidence-a uprkos Jira `Done`.
- `owner: null` taskovi i dalje nestaju.
- Today i report history pokazuju različit prvi prioritet.
- Daily Brief pokreće drugi puni source sync.
- Migracija gubi evidence ili manual user state.

---

## 10. Prva preporučena akcija

Početi sa **PR 1 — fixture i decision testovi**, zatim odmah uraditi **PR 2 — confidence/owner visibility**.

To prvo zaključava očekivano ponašanje i uklanja najdirektniji razlog zbog kog validni Jira taskovi nestaju. Tek nakon toga treba menjati report schema i Today UI.
