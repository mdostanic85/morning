# Audit: zašto Sync my day ne daje Hydra jutarnji izveštaj

Datum audita: 20. jul 2026.  
Referenca: `hydra_asc_jutarnji_izvestaj_2026-07-20(3).html`  
Audit obuhvata: referentni HTML, trenutni kod, generisani `today-briefing.json`, lokalni PostgreSQL podaci i trenutna podešavanja izvora/modela.

Plan izvršenja i review-a: [`hydra-morning-report-execution-review-plan.md`](./hydra-morning-report-execution-review-plan.md)

## Kratak odgovor

Da, aplikacija može da napravi izveštaj vrlo sličan referenci, ali ne sa trenutnim tokom podataka i prikaza.

Glavni problem nije prvenstveno LLM. Glavni problem je što postoje **dva odvojena proizvoda u istom kodu**:

1. `Sync my day` gradi kratki Today briefing i task queue.
2. Poseban Hydra report sistem gradi operativni izveštaj sa konfliktima, blockerima, Jira stanjem i citatima.

`Sync my day` ne pokreće Hydra report. Today stranica ne čita Hydra report. Zato korisnik posle sync-a ne vidi izveštaj koji po strukturi već najviše liči na referentni HTML.

Dodatno:

- Today namerno prikazuje jedan primarni fokus.
- Prompt namerno zabranjuje Jira listu u briefingu.
- UI ne prikazuje `knowledgeHighlights`, `waitingOn`, `risks` ni `sourcesUsed`, iako ih briefing generiše.
- UATL-376 i UATL-233 su u bazi, ali ih UI skriva jer imaju `confidence` ispod 0.8.
- Taj `confidence` je greškom postao praktično kopija normalizovanog priority score-a, pa se nisko rangiran ali potpuno validan Jira task tretira kao nepouzdan.
- Trenutna hijerarhija daje ekstremnu prednost obavezama iz sastanka koji je Miloš pohađao. Zato UATL-367 ostaje ispred danas dodeljenog UATL-376.
- Sistem ne prati Jira link iz UATL-376 do CON-220 komentara, pa nema ključni scope.
- Figma sync čita strukturu fajla, ali ne komentare i ne dovoljno detaljan vizuelni sadržaj za pouzdan readiness audit.

Zaključak: **ne treba samo menjati prompt ili model**. Potrebno je objediniti report i Today pipeline, popraviti retrieval, lifecycle i ranking, pa tek onda koristiti LLM za sintezu.

---

## 1. Šta referentni HTML zapravo traži

Referenca nije samo lepši task card. Ona predstavlja dnevni operativni dokument koji radi sledeće:

1. Objavljuje najvažniju promenu od poslednjeg plana.
2. Daje jasan redosled rada, ne samo jednu karticu.
3. Za svaki prioritet objašnjava trenutni status i noviji kontekst.
4. Daje nekoliko konkretnih akcija.
5. Daje proverljive done kriterijume.
6. Poredi konfliktne izvore i eksplicitno bira šta trenutno važi.
7. Razlikuje formalno Jira stanje od realnog stanja rada.
8. Prikazuje današnje sastanke.
9. Priprema pitanja za relevantan sastanak.
10. Grupisano prikazuje blokirano, čeka odluku i “ne raditi sada”.
11. Daje checklistu za design review readiness.
12. Prikazuje ključne izvore i ograničenja konektora.

To je **cross-source operational report**, a ne samo task queue.

### Važna bezbednosna napomena o referenci

Referentni HTML je dobar UX cilj, ali neke njegove rečenice ne smeju automatski postati činjenice bez citata:

- “UATL-376 ima prednost” je planning odluka, ne činjenica iz Jira ticketa.
- “Potvrdi sa Mattom/Lucasom” je preporučena akcija koja zahteva dokaz da su oni decision owneri.
- “Prvi predlog u Figmi i link dodat u Jira ticket” je dobar done kriterijum samo ako ga zahtev ili prethodni dogovor podržava.
- Tvrdnja da je Miloš 10. jula tražio odluku za UATL-233 mora imati konkretan transcript/comment dokaz.
- Readiness checklista sme da bude standard procesa, ali mora biti jasno označena kao checklist, a ne kao potvrđeno stanje dizajna.

Finalni proizvod treba da zadrži bogatstvo reference, ali uz citat ili jasno označavanje “preporuka”, “nije potvrđeno” i “nedostaje izvor”.

---

## 2. Šta je sistem stvarno imao posle sync-a

Poslednji generisani Today briefing nastao je 20. jula u 15:20 po lokalnom vremenu.

Sistem je imao:

- Jira UATL-376, status `To Do`, assignee `Milos Dostanic`, priority `Medium`, ažuriran danas u 15:05.
- Jira UATL-367, status `Done`, assignee `Milos Dostanic`, ažuriran danas u 15:02.
- Jira UATL-233, status `In Progress`, assignee `Milos Dostanic`, poslednji sačuvani signal od 10. jula.
- Današnji Granola `Hydra Daily`.
- Gmail Gemini notes za `Product/Design - Weekly`, 17. jul.
- Granola sastanke o Content File Manageru.
- Jedan Confluence dokument: `PRD - Cross-Module Guidance`.
- Jedan Figma fajl: `Unified Search - ASC Connected`.
- Povezane izvore: Jira, Confluence, Gmail, Granola, Calendar i Figma.

### Šta je već uspešno izvučeno

Trenutni briefing je već znao:

- da James želi prominentniji Project Name u headeru;
- da UATL-376 upućuje na CON-220;
- da je Content File Manager prošao review sa Lucasom i Mattom;
- da su preostala konkretna pitanja oko edge case-a sa 18 fajlova po SKU-u;
- da postoje review i follow-up signali iz Granola/Gemini izvora.

Dakle, deo očekivanog konteksta **nije nedostajao u bazi**. Bio je generisan ili sačuvan, ali nije pravilno rangiran ili prikazan.

### Šta je Today briefing izabrao

`today-briefing.json` je izabrao:

- primarni fokus: UATL-367 / Content File Manager;
- još dva focus itema: `Request Developer Support` i `Advocate AI Work`;
- knowledge highlight za Jamesov Project Name feedback;
- pet `sourcesUsed`.

UATL-376 je tako završio kao knowledge highlight i dva odvojena `later` taska, umesto kao vidljiv prioritet.

---

## 3. Glavni uzroci

## P0 — Sync my day i Hydra report su odvojeni pipeline-i

`Sync my day` radi:

1. sync konektora;
2. task/knowledge extraction;
3. rebuild queue;
4. Figma task audit;
5. `buildTodayBriefing`.

To je vidljivo u `src/inngest/functions/syncMyDay.ts`, posebno oko:

- provider sync talasa: linije 87–210;
- queue rebuild-a: linija 294;
- Figma audit-a: linije 307–309;
- Today briefing-a: linija 311.

Hydra report radi drugi tok:

1. ponovo proverava konektore;
2. pravi immutable evidence snapshot;
3. rangira evidence;
4. detektuje konflikte;
5. pravi deterministički report;
6. dozvoljava LLM-u da ga preformuliše;
7. validira svaki evidence ID i URL;
8. čuva report i prikazuje ga na `/reports/[id]`.

To je u `src/lib/hydra/orchestrator.ts`, naročito linije 417–564.

Today stranica ne poziva `executeHydraRun`, ne čita tabelu `reports` i ne koristi `HydraReportView`.

**Posledica:** klik na “Sync my day” nikada ne može da prikaže sadržaj koji korisnik očekuje od Hydra report-a, bez obzira na kvalitet modela.

## P0 — Hydra report postoji, ali nikada nije pokrenut

U lokalnoj bazi postoje:

- `report_tasks`: Hydra Daily Work Operator;
- dva aktivna schedule-a: 09:30 i 19:15, Europe/Belgrade;
- `report_runs`: 0;
- `reports`: 0.

Postoji Vercel cron konfiguracija na svakih 15 minuta radnim danom u `vercel.json`, ali lokalni development server sam ne poziva taj Vercel cron.

Postoji i ručni `Run now` na `/schedule` i `/reports`, ali korisnik je radio “Sync my day”, ne Hydra run.

**Posledica:** najbliži postojeći mehanizam očekivanom izveštaju nije proizveo nijedan report.

## P0 — Today prompt namerno uklanja bogatiji Jira/report prikaz

U `src/lib/llm/prompts/todayBriefing.ts`:

- `summary` opisuje samo jedan fokus;
- `jiraPending` mora uvek biti prazan niz;
- LLM ne sme da generiše `focusItems`;
- fokus redosled je potpuno deterministički;
- output nema sekcije za sastanke, meeting pitanja, conflict narrative, readiness checklistu ili source coverage.

Ključne instrukcije su na linijama 110–147.

Ovo nije slučajan loš odgovor modela. Prompt eksplicitno traži proizvod koji je uži od referentnog HTML-a.

## P0 — UI odbacuje već generisane briefing podatke

`StoredTodayBriefing` sadrži:

- `summary`;
- `knowledgeHighlights`;
- `waitingOn`;
- `risks`;
- `sourcesUsed`;
- `connectedProviders`.

Today stranica u `src/app/page.tsx` koristi uglavnom:

- `focusItems`;
- `sourceCount`;
- povezane taskove;
- zasebno učitane sastanke i mention signale.

Ne prosleđuje `knowledgeHighlights`, `waitingOn`, `risks`, `sourcesUsed` niti opšti briefing `summary` u `MinimalTodayView`. Focus action planner dodatno generiše `referenceLinks` i pune `doneCriteria`, ali Today ne prosleđuje reference linkove, dok done kriterijume svodi na broj “required outcomes”. Sekundarni taskovi dobijaju samo kratak naslov/opis, bez action steps i done bloka.

`MinimalTodayView` zato može da prikaže:

- jedan urgent task;
- ostale filtrirane taskove;
- sastanke;
- personal mention signale.

Ne može da prikaže report sekcije iz reference jer ih ne dobija.

**Posledica:** čak i kada LLM uspešno generiše relevantan signal, on može ostati nevidljiv.

## P0 — Validni Jira taskovi se skrivaju zbog pogrešnog confidence modela

Today stranica ima:

```ts
const MIN_CONFIDENCE = 0.8;
```

i odbacuje sve taskove sa manjim confidence-om (`src/app/page.tsx`, linije 50–54).

Trenutno stanje u bazi:

- UATL-376 task 430: priority 0.156, confidence 0.156, status `later`;
- UATL-376 task 432: priority 0.136, confidence 0.136, status `later`;
- UATL-233 task 431: priority 0.187, confidence 0.187, status `later`.

Svi su potpuno skriveni sa Today stranice.

U `src/lib/tasks/prioritizer.ts`, linije 370–396, planner zapisuje:

```ts
confidence: semantic?.confidence ?? decision.priorityScore
```

To znači da, kada semantic LLM odluka nije dostupna ili nije primenjena, **priority score postaje confidence**.

Priority i confidence nisu isto:

- priority odgovara na “koliko je visoko danas?”;
- confidence odgovara na “koliko verujemo da je ovo stvaran, pravilno shvaćen task?”.

UATL-376 može biti Medium/later, ali je činjenica da je dodeljen Milošu vrlo pouzdana. Ne sme nestati zato što nije trenutno rangiran kao prvi.

**Posledica:** UI meša “nije prvi” sa “ne verujemo da postoji”.

## P0 — Trenutna ranking politika je suprotna očekivanoj odluci

Referenca kaže da nova današnja dodela UATL-376 treba da pobedi stariji plan za Content File Manager.

Trenutni kod kaže:

- meeting transcript commitment: +180;
- recent attended meeting commitment: dodatnih +600 i `forceInclude`;
- fresh transcript: do +140;
- Jira prisustvo: +40;
- Jira Medium: +40;
- recent Jira update: +40.

Relevantno: `src/lib/tasks/sourceAuthority.ts`, linije 293–376, i `src/lib/tasks/priorityRank.ts`, linije 401–457.

UATL-367 ima veliki broj transcript evidence itema i tretira se kao sveža obaveza sa sastanka. UATL-376 ima samo tanak Jira ticket.

Zato trenutni kod radi upravo ono za šta je napisan: drži UATL-367 ispred UATL-376.

Ovo nije samo model greška. To je **policy mismatch**.

Potrebno je odvojiti autoritet po vrsti činjenice:

- Jira je autoritet za assignee, status i novu formalnu dodelu.
- Transcript je autoritet za konkretno “šta uraditi sledeće”.
- Nova Jira dodela može da promeni redosled rada.
- Transcript ne sme da zadrži završen ticket na vrhu ako Jira sada kaže `Done`.

## P0 — UATL-367 je Done u Jira, ali otvoreni task i dalje vodi Today

Sačuvani Jira source za UATL-367 kaže `Done`.

Ipak, work task 371 je:

- status `next`;
- confidence 0.9;
- priority 1.0;
- primarni briefing focus;
- obogaćen velikim brojem starijih Granola/Gmail evidence itema.

Sync ima `detectJiraDoneNotifications`, ali taj korak nije isto što i pouzdano zatvaranje, arhiviranje ili spuštanje povezanog open taska pre rangiranja.

`buildDeterministicFocusItems` isključuje task na osnovu work task statusa, ne na osnovu najnovijeg Jira `Done` stanja ako Jira issue nije u pending snapshot-u.

**Posledica:** završen Jira ticket može ostati aktivni Today focus zbog odvojenog lifecycle-a work taska.

## P0 — UATL-376 ne prati link do CON-220

UATL-376 body sadrži samo:

> See James' comment in https://ooden.atlassian.net/browse/CON-220

Jira connector uvozi rezultate assignee/mention JQL-a. Ne radi rekurzivno čitanje referenciranih Jira ticketa i komentara.

`focusEvidenceBundle` ume da prati:

- Confluence page URL;
- Figma file URL.

Ne prati Jira-to-Jira URL. Relevantno: `src/lib/tasks/focusEvidenceBundle.ts`, linije 138–169.

Zato model zna da CON-220 postoji, ali ne zna Jamesov komentar.

LLM ne sme da izmisli:

- pogođene ekrane;
- očekivano ponašanje;
- da li se menja samo prominence ili i struktura;
- responsive pravila.

**Posledica:** referentni report može legitimno da kaže “scope nedostaje” i da pripremi pitanje, ali ne može da izvuče stvarni scope dok connector ne učita CON-220 komentar.

## P1 — Briefing bira samo današnje raw izvore čim postoji makar jedan

U `src/lib/tasks/todayBriefing.ts`, linije 193–227:

- ako postoje `todaySources`, briefing koristi njih;
- samo ako ih nema, koristi širi skup relevantnih izvora;
- zatim uzima maksimalno 12;
- svaki excerpt je maksimalno 320 karaktera.

Današnji briefing je zato imao samo pet source itema:

- današnji Jira x2;
- današnji Granola x1;
- Confluence x1;
- Figma x1.

Referentni HTML eksplicitno kombinuje 13–17. jul sastanke sa današnjim Jira promenama.

Focus action planner naknadno radi bolji per-task retrieval sa do osam izvora i excerptom do 2200 karaktera, ali opšti briefing i konflikt analiza nemaju isti kontekst.

**Posledica:** globalni report ne vidi dovoljno istorije da objasni “stariji plan naspram današnje promene”.

## P1 — Duplikat UATL-376 taska

U bazi postoje najmanje dva otvorena taska za isti Jira issue:

- `UATL-376 · Promote Project Name`;
- `UATL-376 · Update Header`.

Oba se oslanjaju na isti source item 206.

Postoji merge-first logika, ali canonical identity nije enforced na nivou baze ili task upsert-a.

**Posledica:** isti posao može da dobije različite score/confidence vrednosti i da se pojavi više puta ili međusobno razdvoji context.

Potrebna je jedinstvena task identity:

- Jira task: `jira:{cloud}:{key}`;
- meeting-only task: stabilan topic/entity fingerprint;
- jedan canonical task, više evidence itema.

## P1 — Ownership filter ne rešava semantičko vlasništvo

Today je sada filtriran na Miloševe taskove, što rešava deo ranijeg problema.

Filter ima i drugi, suprotan failure mode: kada je profile name podešen, task sa `owner: null` se potpuno izbacuje sa Today stranice (`src/lib/filters/ownerFilter.ts`). To znači da jasna Miloševa first-person obaveza iz sastanka može biti izvučena bez eksplicitnog owner imena, pravilno rangirana u bazi, a zatim ipak nestati iz UI-ja.

Ipak, briefing je izabrao:

- `Request Developer Support`;
- `Advocate AI Work`.

Drugi je opisan kao zadatak Lucasa i Miloša. Leksički owner match može da ga propusti kao “moj”, iako iz izvora nije nužno jasno da Miloš ima neposrednu sledeću akciju.

Owner mora imati odvojena polja:

- accountable owner;
- next-action owner;
- participants/collaborators;
- waiting-on.

Task treba da uđe u Today samo kada je Miloš next-action owner ili eksplicitni assignee.

`owner: null` ne treba automatski tretirati kao “nije moje”. Takav task treba rešiti kroz evidence-backed ownership klasifikaciju ili poslati u `Unclear`, nikada ga tiho sakriti.

## P1 — Nema generatora pitanja za današnji sastanak

Calendar UI postoji i može da prikaže današnje sastanke (`src/lib/calendar/todayMeetings.ts`).

Međutim:

- Today briefing input nema strukturirane današnje sastanke;
- Today schema nema `meetingPrep`;
- Hydra report schema nema listu današnjih sastanaka ni pitanja po sastanku;
- nema koraka koji povezuje blocker/open question sa sledećim relevantnim meetingom.

**Posledica:** aplikacija može da pokaže “Hydra Daily 15:00”, ali ne i “ovo su pitanja koja moraš tamo da zatvoriš”.

## P1 — Figma konektor nije dovoljan za readiness tvrdnje

Trenutni Figma API sync čita fajl sa `depth=2` i čuva uglavnom node tree:

- file/canvas/frame/component imena;
- last modified;
- plitku strukturu.

Ne čita:

- komentare;
- resolved/unresolved review threads;
- dovoljno dubok vizuelni sadržaj;
- prototyping completeness;
- design token usage kao pouzdanu proveru;
- handoff annotations po konkretnim frameovima.

Hydra report dodatno dozvoljava Figma audit samo kada postoji node-specific URL sa `node-id`.

Trenutni Figma source URL je file-level URL bez `node-id`.

**Posledica:** sistem može da prikaže generičku readiness checklistu, ali ne može pošteno da tvrdi da su stavke ispunjene.

## P1 — Confluence/project scope je preuzak

Aktivni Hydra/UATL projekti su konfigurisani sa:

- Confluence space: `Hydra`;
- eksplicitni URL: samo `PRD - Cross-Module Guidance`;
- Figma file key: samo `Unified Search - ASC Connected`.

U bazi trenutno postoji samo jedan Confluence source item.

Referenca navodi i:

- PRD — Global Search Bar;
- Intake — Global Search Bar.

Ti dokumenti nisu dostupni u trenutnom source snapshot-u.

Iako connector pokušava da lista do 20 stranica iz space-a, rezultat u bazi je samo jedna stranica. Potrebno je proveriti MCP response parsing/paginaciju i eksplicitno dodati važne page URL-ove.

## P1 — Nema trajnog LLM observability zapisa

LLM router ispisuje job događaje u `console.info`, ali ih ne čuva u posebnoj tabeli.

Postoji `audit_logs`, ali trenutno sadrži samo Hydra report audit događaje, ne task extraction/planning/briefing prompt rezultate.

To otežava odgovor na:

- koji model je doneo odluku;
- da li je korišćen fallback;
- koji prompt/input hash je dao task;
- zašto su nastala dva UATL-376 taska;
- zašto je confidence pao.

Za lokalni-first proizvod dovoljno je čuvati redigovan job metadata zapis i input/output hash, bez čuvanja tajnih vrednosti.

---

## 4. Koliko sadašnji sistem može da proizvede

### Može već sada

Uz postojeće podatke sistem može pouzdano da prikaže:

- da je UATL-376 danas dodeljen Milošu;
- da je To Do / Medium;
- da ticket nema dovoljan opis i zavisi od CON-220 komentara;
- da je Content File Manager prošao review i da su otvoreni konkretni follow-up detalji;
- da je UATL-233 formalno In Progress, ali ima generičan scope;
- današnje sastanke;
- relevantne Granola/Gemini/Jira source linkove;
- da Figma comment stanje nije direktno potvrđeno;
- da postoje konfliktni ili zastareli signali;
- konkretne next action i done criteria kada ih source stvarno podržava.

### Ne može pouzdano sa trenutnim retrieval-om

Ne može da zna:

- sadržaj Jamesovog komentara u CON-220;
- tačan scope UATL-376 koji postoji samo u tom komentaru;
- trenutno stanje Figma review komentara;
- da li su svi relevantni screenovi i states zaista pokriveni;
- da li su tokeni/komponente/prototype veze zaista pravilno primenjeni;
- sadržaj Confluence stranica koje nisu uvezene;
- da je neko “još nije odgovorio” ako to nije u sačuvanom komentaru/transcriptu;
- šta je “najvažnija promena” bez eksplicitne, proverljive planning politike.

### Procena trenutne pokrivenosti reference

Kvalitativno:

- source ingestion: srednje dobra;
- task extraction: dobra za jasne pojedinačne izvore, slaba za canonical merge i ownership;
- cross-source reconciliation: slaba;
- conflict detection: postoji u Hydra report-u, ali je previše uska;
- calendar display: dobra;
- meeting prep: ne postoji;
- Figma readiness: nedovoljna;
- Today rendering: namerno previše usko;
- evidence safety: dobra namera i validacija postoje, ali nisu ujedinjene u glavnom toku.

Najvažnije: **sirovi podaci pokrivaju veći deo reference nego što UI pokazuje**. Najveći gubitak nastaje između retrieval-a, rankinga i prikaza.

---

## 5. Da li je trenutni LLM dovoljno dobar

### Model nije glavni blocker

Aktivno podešavanje trenutno koristi Groq kao jedini omogućen text provider. OpenAI i Anthropic su disabled.

Za glavne text jobove koristi se:

- `llama-3.3-70b-versatile`;
- fallback `llama-3.1-8b-instant`.

Hydra report je konfigurisan da prvo proba OpenAI `gpt-4.1`, ali pošto je OpenAI disabled, router preskače taj provider i može da koristi aktivni Groq fallback.

Ovaj nivo modela je dovoljan za:

- sažimanje;
- grupisanje dokaza;
- pisanje meeting pitanja;
- preformulisanje prioriteta;
- source-grounded next steps;
- označavanje nedostajućih informacija.

Nije dovoljan da nadoknadi podatke koji nisu povučeni.

### Šta LLM trenutno radi dobro

Postojeći focus action plan je uspeo da spoji:

- Jira UATL-367;
- Granola review;
- Gemini weekly notes;
- konkretan 18-files-per-SKU edge case;
- Figma action steps;
- source linkove.

To pokazuje da model može da napravi bogat, praktičan task kada dobije dobar evidence bundle.

### Šta LLM trenutno radi loše ili rizično

- Kreira previše taskova iz širokih meeting notes.
- Meša učesnike sa stvarnim next-action ownerom.
- Generiše generičke ili spekulativne done kriterijume kada source nema scope.
- Ne može sam da canonicalize-uje taskove bez stabilnog entity ključa.
- Dobija različite, delimično preklopljene source bundle-ove u različitim fazama.
- Ranking odluke su delom determinističke, delom LLM, ali se rezultat na kraju ne objašnjava kroz jedan dosledan policy.

### Ne treba samo “jači model”

Promena modela može poboljšati formulaciju i entity matching, ali neće popraviti:

- odvojene report/Today pipeline-e;
- skrivena UI polja;
- confidence bug;
- Jira Done lifecycle;
- nedostajući CON-220;
- Figma comments gap;
- nepostojeći meeting-prep schema;
- duplikate bez canonical task ključa.

Preporuka je: prvo bolji data contract i retrieval, zatim evaluacija modela na fiksnom skupu dnevnih scenarija.

---

## 6. Postojeći Hydra report: koliko je blizu

Hydra report schema već ima:

- `todayFirst`;
- `afterThat`;
- `directInstructions`;
- `blockers`;
- `jiraState`;
- `conflicts`;
- `suggestedMessage`;
- `figmaAudit`;
- source health i evidence count.

To je mnogo bliže referentnom HTML-u od `TodayBriefing`.

Ima i važne safety karakteristike:

- immutable evidence snapshot;
- svaki report item mora imati validan `evidenceId`;
- URL mora da postoji u snapshot-u;
- LLM ne sme da promeni deterministički prvi prioritet;
- nevalidan LLM output pada na deterministički report;
- read-only source semantics.

Ipak, nije dovoljan bez dorade:

- conflict detector trenutno uglavnom traži `done` naspram `not done` za isti Jira key;
- ne detektuje pouzdano “stariji plan naspram nove dodele” po topicu;
- deterministic fallback daje generičke “review source” akcije;
- nema današnje sastanke;
- nema pitanja za sastanak;
- nema review-readiness checklistu kao poseban tip;
- Figma audit zahteva node URL, a sync uglavnom ima file URL;
- normalizacija uzima širok 45-day skup i do 80 evidence itema, bez dovoljno jakog topic/entity retrieval-a;
- nije povezan sa glavnim Sync my day iskustvom.

Najbolji smer nije pravljenje trećeg report sistema, već spajanje najboljih delova Today i Hydra pipeline-a.

---

## 7. Preporučena ciljna arhitektura

## 7.1 Jedan sync, jedan evidence graph, jedan dnevni report

Predloženi tok:

1. Read-only sync svih konektora.
2. Normalizacija source dokumenata.
3. Entity resolution:
   - Jira key;
   - project;
   - feature/topic;
   - meeting;
   - people;
   - Confluence page;
   - Figma file/node.
4. Canonical task reconciliation.
5. State resolution po vrsti činjenice.
6. Deterministički daily plan skeleton.
7. LLM synthesis sa evidence bundle-om po sekciji.
8. Citation/schema validation.
9. Today prikazuje report.

Task queue ostaje storage/workflow model, ali Today postaje čitljiv dnevni brief.

## 7.2 Autoritet treba definisati po dimenziji

Jedna globalna hijerarhija nije dovoljna.

Preporučena pravila:

- assignee: najnoviji Jira;
- Jira status: najnoviji Jira;
- ticket priority/due date: Jira;
- product baseline: PRD/Confluence;
- konkretna design instrukcija: najnoviji relevantni stakeholder transcript/comment;
- “šta prvo danas”: kombinacija nove dodele, deadline-a, blockera, statusa i eksplicitne današnje odluke;
- done state: proverljiv artifact/status, ne stari transcript;
- Figma readiness: konkretan node snapshot/comment/audit, ne samo meeting tvrdnja.

UATL-376 i UATL-367 tada mogu da se razreše ovako:

- UATL-367 je Jira `Done`, pa se ne tretira kao production task.
- Njegovi otvoreni review follow-up-i ostaju samo ako postoji poseban, još otvoren evidence-backed task.
- UATL-376 je nova formalna dodela i postaje kandidat za prvi aktivni task.
- Transcript iz prethodne nedelje može da objasni da je ranije bio niži prioritet, ali današnja dodela predstavlja novu promenu.

## 7.3 Report schema treba proširiti

Predložene sekcije:

- `dayChange`: najvažnija promena od prethodnog plana, sa evidence IDs;
- `orderedWork`: 1–3 canonical taska;
- `sourceConflicts`;
- `todayMeetings`;
- `meetingPrep`: pitanja povezana sa taskom/blockerom i sastankom;
- `blockedWaiting`;
- `reviewReadiness`;
- `knowledgeHighlights`;
- `keySources`;
- `coverageWarnings`.

Svaki operativni claim mora imati:

- evidence IDs;
- claim type: `fact`, `recommendation`, `checklist`, `unknown`;
- confidence koji nije priority score;
- eventualni `missingEvidence`.

## 7.4 Retrieval mora biti topic-based, ne samo “danas”

Za svaki canonical task treba povući:

- najnoviji Jira issue i komentare;
- direktno linkovane Jira issue-e;
- relevantne Confluence/PRD stranice;
- 3–5 najrelevantnijih Granola/Gemini segmenata;
- relevantan Figma file/node;
- prethodni daily memory;
- današnje sastanke sa relevantnim učesnicima.

Freshness treba primeniti na konfliktne tvrdnje, ne slepo odbaciti sav stariji kontekst. Stariji PRD može i dalje biti baseline čak i kada je sastanak noviji.

---

## 8. Prioriteti za implementaciju

## Faza 0 — proizvodna odluka

Potvrditi da je glavni Today rezultat:

> kratak jutarnji operativni brief, sa jednim jasnim prvim taskom i najviše dva sledeća, plus samo relevantni konflikti, pitanja i sastanci.

To zadržava minimalni karakter aplikacije i ne pretvara je u dashboard.

## Faza 1 — obavezno

1. Spojiti `Sync my day` sa report composer-om.
   - Ne pokretati drugi puni connector sync.
   - Posle source sync-a koristiti već uvezene source iteme za report snapshot.
   - Today treba da čita najnoviji validni report za današnji datum.

2. Proširiti report schema za:
   - najvažniju promenu;
   - tri prioriteta;
   - sastanke;
   - pitanja za sastanak;
   - blockers/waiting;
   - readiness;
   - ključne izvore i coverage upozorenja.

3. Razdvojiti `confidence` i `priorityScore`.
   - Priority planner ne sme da zapisuje priority score kao confidence.
   - Explicit Jira assignee task ne sme biti potpuno skriven zbog priority score-a.
   - Niska extraction confidence treba da vodi u `Unclear`, ne u nevidljivost.

4. Reconcile Jira Done pre rangiranja.
   - Povezani open task mora biti zatvoren, arhiviran ili pretvoren u dokazani follow-up.
   - Stari transcript ne sme da oživi završen Jira task bez novog otvorenog zahteva.

5. Uvesti canonical Jira task uniqueness.
   - Jedan open task po Jira key-u.
   - Novi evidence ažurira isti task.
   - Migrirati/merge-ovati postojeće UATL-376 duplikate.

6. Pratiti Jira-to-Jira linkove.
   - Učitaj CON-220 i komentare kada UATL-376 eksplicitno upućuje na njega.
   - Ograničiti dubinu i domen radi sigurnosti i performansi.
   - Sačuvati link relationship u evidence graph-u.

7. Promeniti ranking policy.
   - Nova explicit assignee dodela dobija jak “new assignment” signal.
   - Jira `Done` je tvrdi exclusion za isti canonical work item.
   - Transcript određuje next action, ali ne prepisuje mehanički Jira status.

## Faza 2 — kvalitet

8. Zameniti `todaySources ? todaySources : recentSources` relevantnim mešanim retrieval-om.

9. Dodati meeting-prep generator.
   - Blocker/open question → relevantan današnji meeting → konkretno pitanje.

10. Poboljšati ownership.
    - `nextActionOwner`, `accountableOwner`, `collaborators`, `waitingOn`.

11. Proširiti Confluence coverage.
    - Popraviti space pagination/parsing.
    - Dodati eksplicitne važne PRD/Intake URL-ove.

12. Poboljšati Figma evidence.
    - Čuvati node-specific linkove za aktivni task.
    - Učitati konkretne frameove.
    - Ako connector podržava, čitati comments/review stanje.
    - Ako ne podržava, eksplicitno reći da readiness nije potvrđen.

13. Dodati trajni LLM job audit.
    - job type, provider/model, success/fallback, latency, prompt version, input/output hash, validation failure.

## Faza 3 — evaluacija

Napraviti fiksni eval scenario za 20. jul:

- UATL-376 danas dodeljen;
- UATL-367 danas Done;
- stari transcript kaže Canvas prvo;
- UATL-376 zavisi od CON-220;
- UATL-233 ima generičan scope;
- postoji današnji Hydra Daily;
- Figma comments nisu dostupni.

Očekivano:

1. UATL-376 je prvi ili eksplicitno `Unclear but first to clarify`.
2. UATL-367 nije aktivan production task; može biti review closure samo uz otvoren dokaz.
3. UATL-233 je waiting/unclear, ne aktivni design task.
4. CON-220 nedostajući scope je jasno označen.
5. Pitanja za Hydra Daily su izvedena iz stvarnih otvorenih polja.
6. Figma readiness nije predstavljena kao potvrđena ako node/comments nisu pročitani.
7. Svaki claim ima source link/evidence ID.
8. Nijedan task drugog ownera nije u Miloševom redosledu.
9. Nema duplikata istog Jira key-a.

---

## 9. Predlog kako bi bezbedna verzija današnjeg briefa izgledala

Ovo nije zamena za finalni generator, već demonstracija šta trenutni dokazi podržavaju:

### Najvažnija promena

UATL-376 je danas dodeljen Milošu i trenutno je `To Do`. Ticket traži prominentniji Project Name u headeru, ali se stvarni zahtev nalazi u Jamesovom komentaru na CON-220, koji još nije uvezen. Zato je prvi korak razjašnjenje scope-a, ne širok redizajn.

### 1. Razjasni UATL-376

- Činjenica: Jira ga je danas dodelila Milošu.
- Poznato: Project Name treba da bude prominentniji.
- Nepoznato: pogođeni headeri, konkretna hijerarhija, struktura i responsive ponašanje.
- Sledeća akcija: pribaviti CON-220 komentar ili postaviti tačna pitanja na Hydra Dailyju.
- Done: scope je evidence-backed i dovoljno konkretan da se napravi Figma predlog.

### 2. Zatvori samo stvarne Content File Manager follow-up-e

- Jira UATL-367 je sada `Done`.
- Današnji Granola signal kaže da je design pregledan i da su pitanja uglavnom rešena.
- Ne treba ga prikazati kao otvoren veliki production task.
- Eventualni review follow-up mora biti zaseban, dokazano otvoren task.

### 3. UATL-233 tretiraj kao Unclear/Waiting

- Jira formalno kaže `In Progress`.
- Opis je generičan design-debt bucket.
- Nema konkretan deliverable ni done kriterijum u trenutno sačuvanom Jira source-u.
- Ne treba trošiti produkciono vreme dok se scope ne razbije na konkretne stavke.

### Pitanja za Hydra Daily

- Koji deo Jamesovog CON-220 komentara definiše UATL-376?
- Koji headeri i moduli ulaze u scope?
- Da li se menja samo prominence ili i struktura/responsive ponašanje?
- Da li posle Jira `Done` statusa postoji još neki konkretan Milošev CFM follow-up?
- Da li UATL-233 treba zatvoriti, vratiti u backlog ili razbiti na konkretne tickete?

Ove rečenice moraju u finalnom proizvodu nositi direktne source linkove i jasno razlikovati činjenicu od preporuke.

---

## 10. Finalni zaključak

Korisnik ne vidi očekivani izveštaj iz četiri glavna razloga:

1. Kliknuo je Sync my day, a očekivani format pripada nepovezanom Hydra report sistemu.
2. Today schema i UI su dizajnirani da budu znatno uži i odbacuju već generisani kontekst.
3. Ranking i confidence logika guraju novu Jira dodelu u `later` i zatim je potpuno skrivaju.
4. Nedostaju ključni retrieval koraci: linked Jira comments, širi relevantni history, canonical merge i dublji Figma evidence.

Sadašnji LLM može da napiše kvalitetan izveštaj kada dobije kompletan i pravilno grupisan evidence bundle. Ne može bezbedno da izmisli sadržaj CON-220, Figma comments ili nepostojeći scope.

Najispravniji sledeći korak je:

> objediniti Hydra report composer sa Sync my day tokom i učiniti taj validirani, source-grounded report glavnim Today modelom, uz popravku confidence/ranking/lifecycle logike.

Samo promena prompta ili jači model neće rešiti problem.
