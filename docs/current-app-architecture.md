# Current Application Architecture

Ovaj dokument opisuje implementaciju zatečenu u repozitorijumu 16. jula 2026. godine. Zaključci su izvedeni iz izvršnog koda, šeme baze, migracija, ruta, komponenti i runtime konfiguracije; README je korišćen samo kao pomoćni trag kada se poklapa sa kodom.

Oznake statusa u dokumentu:

- **Implemented** — ponašanje je potvrđeno u izvršnom kodu.
- **Partially implemented** — deo toka postoji, ali je tok nepotpun, nedostupan iz aktuelnog interfejsa ili ima bitno ograničenje.
- **Mocked** — UI ili rezultat simulira ponašanje bez odgovarajuće realne obrade.
- **Hardcoded** — vrednost ili odluka je direktno upisana u kod.
- **Not found** — traženi ili UI-em nagovešteni mehanizam nije pronađen.
- **Unknown** — repozitorijum nije dovoljan da bi se stanje pouzdano utvrdilo.

## 1. Executive summary

Trenutna aplikacija je jedna Next.js aplikacija sa dve međusobno povezane, ali različito brendirane funkcionalne celine:

1. **Worklight dnevni organizator** uvozi podatke iz povezanih poslovnih servisa, čuva sirove izvore lokalno, koristi LLM da iz njih izdvoji zadatke i znanje, rangira rad za danas i prikazuje lični dnevni pregled.
2. **Hydra / ASC report operator** ručno ili po rasporedu ponovo prikuplja deo istih izvora, pravi dokazima potkrepljen dnevni izveštaj, čuva istoriju izvršavanja, delivery zapise, feedback i audit log.

Nazivi nisu dosledni: navigacija i metadata koriste Hydra, dok welcome modal i deo poruka koriste Worklight. To je potvrđeno u [src/app/layout.tsx](../src/app/layout.tsx), [src/components/NavBar.tsx](../src/components/NavBar.tsx) i [src/components/WelcomeModal.tsx](../src/components/WelcomeModal.tsx).

Problem koji aplikacija trenutno rešava jeste objedinjavanje ličnog radnog konteksta iz sastanaka, emaila, kalendara, Jira/Confluence/GitHub/Figma/Discord izvora, izdvajanje konkretnih obaveza i priprema prioriteta ili izveštaja sa dokazima. Trenutni model je **jedan implicitni operator aplikacije**, a ne više prijavljenih korisnika ili organizacija.

**Implemented:** korisnik može povezati stvarne integracije, ručno uneti transkript, pokrenuti stvarni sync, dobiti izdvojene zadatke i knowledge stavke, promeniti lokalni status zadatka, izvršiti Jira status tranziciju, završiti dan, postaviti pitanje nad radnim kontekstom i pokretati ili pregledati Hydra izveštaje. Većina poslovnih podataka se trajno čuva u SQLite bazi; tokeni, LLM podešavanja i dnevni briefing čuvaju se u lokalnim JSON fajlovima.

**Partially implemented:** personalizacija zavisi od imena profila koje novi korisnik ne može da unese kroz aktuelni UI; ownership je slobodan tekst, ne relacija ka korisniku; Today ne prikazuje sve već generisane briefing kategorije; Knowledge Q&A backend postoji, ali nije dostupan na Knowledge stranici; Figma i Discord tokovi imaju funkcionalna ograničenja; Hydra izvršavanje radi unutar HTTP zahteva bez posebnog worker procesa; otkazivanje ne zaustavlja nužno obradu koja je već počela.

**Mocked:** Sync overlay prikazuje vremenski simulirane korake i procenat. Sam sync, eksterni pozivi, AI obrada i upisi nisu mockovani.

**Hardcoded:** početna Hydra konfiguracija, rasporedi, deo scoring pravila, source katalog, pojedini setup linkovi i brojni limiti za uvoz. Nije pronađena kolekcija lažnih taskova, reporta ili source fixture podataka koja bi pokretala glavni UI.

**Not found:** aplikacioni login/logout, sesije, role, organizacije, timovi, manager hijerarhija, projektno članstvo, backend autorizacija, opšti sync lock, background job queue, Google Drive provider, test suite i automatsko pokretanje migracija pri startu.

Po zrelosti, repozitorijum predstavlja funkcionalan single-user interni alat/prototip sa stvarnom bazom, realnim eksternim API pozivima i širokim AI slojem, ali bez korisničke i tenant bezbednosti, automatizovanih testova i potvrđene trajne produkcijske storage konfiguracije.

## 2. Application overview

### Šta korisnik vidi

Root layout uvek prikazuje gornju navigaciju, sadržaj aktivne stranice, footer, globalni work-assistant launcher i toast sistem. Pri prvom otvaranju u browser sesiji pojavljuje se Worklight welcome modal. Informacija da je modal viđen čuva se samo u browser sessionStorage pod ključem worklight-welcome-seen, pa nije korisnički onboarding zapis u bazi i ponovo se pojavljuje u drugoj sesiji ili tabu. Implementacija je u [src/app/layout.tsx](../src/app/layout.tsx) i [src/components/WelcomeModal.tsx](../src/components/WelcomeModal.tsx).

**Login nije potreban i nije implementiran.** Server ne utvrđuje identitet posetioca. Svako ko može da otvori aplikaciju vidi iste podatke i može da pozove iste mutation rute.

Glavna navigacija sadrži:

- Today
- Reports
- Sources
- Schedule
- Projects
- Knowledge
- Audit
- Settings

Ruta Tomorrow postoji, ali nije u navigaciji i nije pronađen link ka njoj iz drugih ekrana.

### Glavne akcije i izlazi

Korisnik trenutno može:

- povezati Gmail, Calendar, Jira, Confluence, Granola, GitHub, Figma i Discord, u zavisnosti od dostupnih kredencijala;
- ručno nalepiti transcript ili source tekst;
- pokrenuti Sync my day;
- videti sastanke, jedan primarni fokus, lokalne zadatke i izdvojeno znanje;
- označiti zadatak kao started, done, later, tomorrow ili waiting;
- dodeliti projekat prethodno nedodeljenom zadatku;
- pokrenuti AI proveru da li je zadatak završen;
- izvršiti realnu Jira status tranziciju za povezani issue;
- završiti dan i sačuvati AI daily memory;
- postaviti pitanje o svim izvorima ili jednom zadatku preko globalnog asistenta;
- pregledati, pokrenuti, otkazati i oceniti Hydra report run;
- uključiti/isključiti i menjati dva Hydra rasporeda;
- menjati project connector hints, aktivnost projekta, LLM ključeve i profile email;
- pregledati Hydra audit događaje.

Izlaz aplikacije su lokalni taskovi sa evidence zapisima, knowledge stavke, dnevni briefing, daily memory, AI odgovori koji nisu sačuvani, verification/sync-review reporti i perzistentni Hydra reporti.

### Trenutno implementirane product capabilities

| Capability | Trenutno ponašanje | Status |
|---|---|---|
| Višestruki read izvori | Stvarni API/MCP pozivi i lokalni source zapisi | **Implemented**, uz ograničenja po integraciji |
| AI task extraction | Strukturirani taskovi i evidence iz source sadržaja | **Implemented** |
| AI knowledge extraction/search | Knowledge zapisi, embeddings i keyword fallback | **Implemented** |
| Daily priority queue | Deterministički score, zatim ograničena AI odluka | **Implemented** |
| Today briefing | Sačuvan lokalni JSON i jedan fokus | **Implemented**, prikaz je **Partially implemented** |
| Task lifecycle | Lokalni statusi, delete, project assignment | **Implemented**, bez pune izmene sadržaja |
| External task write | Jira transition | **Implemented** |
| End-of-day memory | AI generisanje i SQLite persistence | **Implemented** |
| Contextual Q&A | Globalni task/work chat | **Implemented**, odgovori su privremeni |
| Hydra reporting | Manual/scheduled report, evidence, history, feedback, audit | **Implemented**, izvršavanje/delivery su delimični |
| User/role system | Nema aplikacionih naloga, sesija ili rola | **Not found** |
| Team/organization model | Nema membership ili tenant modela | **Not found** |

Promene zadataka, projekata, knowledge zapisa, profila, konekcija, memorija i reporta se čuvaju. Chat poruke, otvoreni tabovi, sync progress i lokalna forma stanja nestaju pri punom refreshu.

## 3. User roles and access

### Uloge pronađene u implementaciji

| Identitet ili pojam | Kako nastaje | Pristup i akcije | Enforcement |
|---|---|---|---|
| Implicitni operator aplikacije | Nema dodele; to je svaki posetilac koji može da otvori aplikaciju | Vidi sve ekrane i može da pozove sve UI/API akcije | **Not found** — nema aplikacionog auth ili permission checka |
| Current profile | Prvi red iz user_profiles; UI može da sačuva email, a postojeće ime prenosi kroz skriven input | Ime se koristi za owner filtriranje i personal relevance; email za Hydra email delivery | **Partially implemented** — nije nalog niti sesija |
| External integration identity | OAuth, MCP OAuth, API key, PAT ili bot token | Daje aplikaciji prava nad konkretnim spoljnim servisom | Prava nameće eksterni servis; nisu app role |
| Hydra assignee/stakeholders | Stringovi u report konfiguraciji | Utiču na report scope/scoring | Nisu korisnici niti dozvole |
| Task owner | Slobodan tekst koji najčešće daje AI | Koristi se za filtriranje Today sadržaja | Nema referencijalni ili authorization enforcement |

Novi korisnik ne može kroz aktuelni Profile form da unese ime: name je registrovan kao skriveno polje, dok je vidljiv samo email. Today i Knowledge istovremeno zahtevaju profile.name i upućuju korisnika da ga doda u Settings. Zato je fresh-user personalizovani tok **Partially implemented**. Relevantni kod je u [src/components/ProfileForm.tsx](../src/components/ProfileForm.tsx), [src/components/TodayFilteredView.tsx](../src/components/TodayFilteredView.tsx) i [src/app/knowledge/page.tsx](../src/app/knowledge/page.tsx).

### Permissions

- **Not found — backend application authentication:** nema session cookie-ja, auth providera, middleware-a ili user lookup-a.
- **Not found — frontend role gating:** svi navigacioni linkovi i kontrole su vidljivi prema stanju podataka, ne prema roli.
- **Not found — backend authorization:** profile, LLM keys, connector secrets, task/project mutation, Hydra feedback/run i Jira write endpointi ne proveravaju aplikacionog korisnika.
- **Partially implemented — cron protection:** /api/cron/hydra proverava Bearer token samo kada je CRON_SECRET podešen. Ako nije podešen, endpoint prihvata poziv bez tog zahteva.

To znači da su skrivene UI kontrole samo pitanje prezentacije; nisu sigurnosna granica. Na primer, kod za task work context je sakriven feature konstantom, ali njegove API rute nemaju korisničku autorizaciju.

### Organizacijski pojmovi

| Pojam | Nalaz |
|---|---|
| Company | **Not found** |
| Team | **Not found** |
| Manager | **Not found** |
| Reporting relationship | **Not found** |
| Project membership | **Not found** |
| Project owner | **Not found** |
| Task owner | **Implemented kao slobodan tekst**, bez veze sa user tabelom |
| Project people | **Hardcoded/configured string hints**, koriste se u extraction/discovery logici, nisu članovi |
| Workspace | **Implemented samo u Hydra persistence modelu**, bez user membership ili tenant izolacije |

Aplikacija prema šemi i UI-u trenutno nije multi-organization sistem. Svi podaci pripadaju jednoj lokalnoj instanci.

## 4. Screens and routes

### Pregled ruta

| Route or screen | Purpose | Main data | Main actions | Implementation status |
|---|---|---|---|---|
| / | Lični Today dashboard i poslednji Hydra rezultat | Queue, projects, source_items, connections, profile, prior memory, briefing JSON, calendar source-i, latest report | Sync, End day, task akcije, project assignment, Jira transition, global Q&A | **Implemented**, personalizacija/prikaz **Partially implemented**, progress **Mocked** |
| /tomorrow | Sledeći predloženi task uz poslednju daily memory | Latest daily_memories i queue | Standardne task akcije, Back to Today | **Partially implemented** i bez ulaznog linka |
| /reports | Hydra run istorija | Poslednjih 100 report_runs | Run now, status filter, otvaranje run-a | **Implemented** |
| /reports/[id] | Detalj run-a, evidence i report | report_run, report, source states, evidence, relations, deliveries, feedback | Otvaranje izvora, feedback | **Implemented** |
| /sources | Pregled source konekcija i poslednjeg Hydra healtha | Hardcoded katalog + connections + latest run source status | Link ka Settings | Katalog **Hardcoded**, stanje **Implemented**, coverage **Partial** |
| /schedule | Hydra schedule, scope i delivery podešavanja | workspace/report_task/schedules i config JSON | Run now, save schedule, save report config | **Implemented**, deo konfiguracije se ne koristi |
| /projects | Lista lokalnih projekata i Jira brojevi | projects; MCP-only live Jira counts | Filter, activate/deactivate, open | **Implemented**, Jira transport coverage **Partial** |
| /projects/[id] | Project tasks/sources/knowledge/verification/settings | SQLite project podaci i MCP Jira list | Task akcije, knowledge delete, connector hints/repo paths | **Implemented**, pojedine greške i kategorije su skrivene |
| /knowledge | Nedavno personalno relevantno knowledge | approved knowledge i evidence/source veze | Search, source open, delete | Lista **Implemented**; Q&A na ovoj ruti **Not found/reachable** |
| /audit | Hydra audit istorija | Poslednjih 200 audit_logs | Link ka report run-u | **Implemented**, samo Hydra događaji |
| /settings | Integracije, manual transcript, model keys i profil | connections, env/local LLM settings, profile | Connect/disconnect/sync setup, transcript ingest, keys, email | **Implemented**, profile name **Partial** |

Sve glavne page komponente koriste Next App Router i označene su force-dynamic. Nema loading.tsx, error.tsx ili prilagođenog not-found.tsx fajla. Server greške zato padaju na framework ponašanje; dva pronađena Suspense fallback-a su null.

### / — Today

**Kako se dolazi:** početna ruta i prvi link u navigaciji.

**Komponente i podaci:** [src/app/page.tsx](../src/app/page.tsx) paralelno učitava queue, projekte, sve source zapise, konekcije, singleton profil, najnoviju prethodnu daily memory, briefing za tekući datum i najnoviji completed/partial Hydra report. Calendar meetings se računaju iz već sačuvanih calendar source_items; nema live Calendar poziva pri renderu.

Ako ne postoje otvoreni taskovi, source-i, aktuelni briefing ni Hydra report, prikazuje se fresh-start stanje sa Sync pozivom. Stanje konekcija samo po sebi ne ukida fresh-start.

Ako profile.name postoji, Today strogo zadržava taskove čiji free-text owner odgovara tom imenu. Taskovi bez ownera i tuđi taskovi se ne prikazuju. Ako ime ne postoji, personalne sekcije su zaključane porukom za dodavanje imena, iako vidljivo Profile polje za ime ne postoji.

Briefing generator trenutno ograničava fokus na jedan task. UI prikazuje taj primarni fokus, meetings i redove queue-a. Generisani jiraIssueCount/jiraPending nisu prikazani u TodayBriefing komponenti; persisted knowledgeHighlights, waitingOn i risks se za imenovanog korisnika prazne u owner filteru. Zbog toga je briefing data flow širi od aktuelnog prikaza.

Non-primary task kartice nude Start, Done uz potvrdu, Check if done, Skip, Snooze, Waiting, Delete i, kada postoji Jira veza, realnu Jira tranziciju. Primarni focus card izlaže samo Mark done. Project dropdown se pojavljuje samo kada task trenutno nema projekat. Not mine backend akcija nema UI kontrolu.

Globalni assistant je dostupan. Njegov TaskChatPanel se mountuje i kada je dijalog zatvoren, pa svaki non-Knowledge ekran poziva /api/task-chat/tasks pri učitavanju.

**Loading/empty/error:** nema page loading UI-a. Fresh-start je eksplicitni empty state. Sync ima detaljne toast/dialog greške. Ostale server-load greške nisu lokalno obrađene.

### /tomorrow

**Kako se dolazi:** direktnim URL-om; nije pronađen link iz navigacije ili Today ekrana.

Stranica čita najnoviju daily memory bez provere da li je od juče i pun, owner-nefiltriran queue. Prikazuje prvi task statusa tomorrow, inače prvi next. Taj task se ne uparuje sa tekstom memory.firstTomorrow. Project name se prosleđuje kao null, pa čak i project-linked task izgleda kao Unassigned project.

TaskCard nudi standardne akcije. Empty state upućuje korisnika da završi dan. Nema prilagođenog loading/error stanja.

### /reports i /reports/[id]

**Kako se dolazi:** Reports navigacija; detalj se otvara iz liste, audit loga ili latest-report bannera.

Lista čita do 100 stvarnih Hydra run zapisa. URL filter podržava all, completed, partial i failed, ali ne cancelled. Run now kreira queued run, pokreće odvojeni execute request bez čekanja njegovog odgovora i polluje status jednom u sekundi.

Detail ekran prikazuje lifecycle rail, warning/error, strukturirani report, source health, evidence snapshot, evidence relations, delivery zapise i feedback. Nevažeći ID koristi framework 404, a postojeći run bez reporta ima eksplicitno prazno stanje.

Feedback UI šalje jednu od četiri overall ocene. API podržava i note, ali UI nema note polje. Više feedback zapisa za isti report je dozvoljeno; UI nema trajno selected stanje.

Execute rejection i neuspešan polling se u klijentu uglavnom ignorišu, pa dugotrajno running stanje može ostati prikazano. Cancel ne proverava odgovor. Browser notification permission se traži pri prvom manual run-u nezavisno od push podešavanja.

### /sources

**Kako se dolazi:** Sources navigacija.

Katalog je direktno definisan kao Granola, Calendar, Google Drive, Jira, Confluence i Figma. Kartica Google Drive zapravo koristi Gmail connection status; Drive provider nije pronađen. GitHub i Discord postoje u Settings, ali ih ovaj ekran ne navodi.

Status konekcije dolazi iz connections tabele, a health iz latest Hydra run-a. To su dva stvarna, odvojena stanja. Ekran nema connect ili per-source sync akciju; vodi u Settings. Empty i error stanje za neuspešno učitavanje nije posebno implementirano.

### /schedule

**Kako se dolazi:** Schedule navigacija.

Render poziva ensureHydraSetup, pa samo otvaranje stranice može da kreira workspace, report task, dva weekday schedule reda i audit događaj. Default je **Hardcoded**: 09:30 i 19:15, Europe/Belgrade, Hydra/ASC scope, Jira UATL, assignee Milos Dostanic i stakeholders Matt/Lucas.

Korisnik može da uključi/isključi raspored, promeni vreme/timezone i sačuva report/delivery config. Vreme se validira u browseru; timezone je slobodan string sa server length validacijom. Jira project, assignee, source priority, report sections i retention se čuvaju, ali ih orchestrator trenutno ne primenjuje; stakeholders utiču na score. In-app delivery kontrola je u UI-u uvek uključena.

### /projects i /projects/[id]

**Kako se dolazi:** Projects navigacija, zatim project card.

Lista čita sve lokalne projekte. Active/inactive filter je URL query state; nema globalno izabranog projekta. Activate/deactivate radi optimistic PATCH. Inactive projekat i dalje može direktno da se otvori.

Live Jira counts postoje samo za Jira MCP transport. Direct OAuth transport ne puni taj ekran. MCP greške se pretvaraju u praznu listu/mapu, pa UI ne razlikuje zero issues od neuspešnog Jira poziva.

Project detail podržava overview, tasks, sources, knowledge i verification tab. Default query tab je tasks, iako je Overview prvi prikazan u tab listi. Podaci za sve tabove, uključujući live Jira, učitavaju se pre izbora aktivnog taba.

Overview unutar zatvorenog details elementa čuva lokalne repo putanje i Jira/GitHub/Confluence/Discord/Figma hints. Source kartice prikazuju preview i datum, ali ne link ka izvornom URL-u. Knowledge grouping ne uključuje validni deadline tip, pa se deadline stavke ne vide u tom tabu. Delete na knowledge kartici briše globalni zapis.

### /knowledge

**Kako se dolazi:** Knowledge navigacija.

Stranica čita approved knowledge, ograničava ga na poslednjih deset dana i personal relevance, pa prikazuje evidence i source linkove. Search je stvarni in-memory AND filter kroz content, project/source naslov i evidence.

Ako profile.name ne postoji, prikazuje se poruka za podešavanje imena. Knowledge item može trajno da se obriše; ne postoji edit sadržaja.

KnowledgeChat i KnowledgeAskLauncher komponente i /api/knowledge/ask postoje, ali ih ova stranica ne renderuje. Globalni assistant se namerno skriva baš na /knowledge. Zato Knowledge Q&A na aktuelnom ekranu nije dostupan, iako backend funkcija postoji.

### /audit

Prikazuje poslednjih 200 stvarnih Hydra audit_logs redova bez paginacije. Samo entity type report_run dobija link ka report detalju. Empty state postoji; filter, search, actor view i detail drawer nisu pronađeni. Worklight sync/task/project aktivnosti se ne auditiraju ovde.

### /settings

Četiri client-state taba su Connections, Manual transcript, Model keys i Profile. Izbor taba nije u URL-u niti storage-u i vraća se na Connections posle refresh-a.

Connections tab koristi osam **Hardcoded** kartica: Gmail, Calendar, Jira, Confluence, Granola, GitHub, Figma i Discord. Prikazuje realne OAuth/MCP/token akcije. Jira i Confluence mogu da dele Atlassian MCP. Disconnect ne proverava HTTP success i ne pokazuje rezultat. GitHub dodatno učitava repo/branch listu i čuva jedan globalni work repo/branch.

Manual transcript forma stvarno validira i šalje source, prikazuje extraction/project-match rezultate i radi refresh. Model keys tab upravlja Groq/OpenAI/Anthropic ključevima sačuvanim lokalno; env ključevi imaju prioritet i ne mogu se obrisati kroz UI. Profile tab trajno čuva email, ali je name skriven.

## 5. Main user flows

### Application startup

1. Next root layout renderuje welcome modal, NavBar, aktivnu server stranicu, footer, global assistant provider i toaster.
2. **Not found:** nema session ili current-user autentikacionog lookup-a.
3. Welcome modal nakon mount-a čita sessionStorage; bez worklight-welcome-seen otvara modal.
4. Za Today server paralelno čita SQLite servise i lokalni briefing JSON.
5. Calendar meetings se izvode iz persisted source zapisa.
6. Bez operativnih podataka prikazuje se fresh-start; inače latest Hydra summary i Today view.
7. Server-load greška nema lokalni error boundary i prelazi na Next framework error ponašanje.

### Login i logout

**Not found:** ne postoje login stranica, auth provider, password/social login, application OAuth callback, session creation, cookie storage, protected routes ni logout akcija. OAuth callback rute u repozitorijumu povezuju eksterne izvore; ne prijavljuju korisnika u aplikaciju.

Posledica trenutne implementacije je da ne postoji failed-login niti expired-session tok. Pristup se određuje samo time da li mrežni korisnik može da dođe do aplikacije.

### Povezivanje eksternog izvora

1. Korisnik otvara Settings/Connections.
2. UI bira direct OAuth, MCP OAuth ili secret form prema provideru i dostupnoj konfiguraciji.
3. OAuth connect ruta generiše state i redirektuje korisnika; callback menja code za token. MCP tok dodatno radi discovery/verifier korake.
4. Secret tok prvo upisuje token u lokalni secret JSON, zatim testira konekciju.
5. connections tabela čuva provider status, scope i metadata, ali ne sirov token.
6. UI radi refresh i prikazuje stanje.
7. Disconnect briše connection i odgovarajući secret, ali client ne proverava da li je request uspeo.

Direct OAuth state je random, single-use i važi deset minuta. Kredencijali služe connectoru, ne app session-u.

### Project selection

Ne postoji globalni selected project.

1. /projects učitava lokalne project redove.
2. Active/inactive filter se čuva samo u query parametru.
3. Klik na card otvara /projects/[id].
4. Project detail ponovo učitava sve podatke za taj ID.
5. Promena active statusa menja samo project status.
6. Backend ne proverava membership ili project access jer takav model ne postoji.

Za task bez projekta Today može prikazati project dropdown. Izbor poziva PATCH /api/work-tasks/[id]/project, upisuje projectId i refreshuje UI. Već dodeljen task nema isti correction dropdown u prikazanom Today toku.

### Sync my day

1. Korisnik klikne Sync my day.
2. Klijent otvara overlay, startuje vremenski simulirane korake i šalje POST /api/day/sync.
3. Server odobrava legacy pending task/knowledge zapise i učitava connected providere.
4. Project discovery se pokreće pre uvoza.
5. Provideri se obrađuju sekvencijalno; svaki kontaktira stvaran eksterni API ili MCP.
6. Svaki kandidat se deduplikuje po source type + external ID u aplikacionom kodu, čuva ili ažurira, project-matchuje i po potrebi šalje AI-ju za task/knowledge extraction i embedding.
7. Server backfilluje najviše osam ranije neobrađenih/neuspelih source zapisa.
8. Čita Jira pending, po potrebi ponavlja discovery, rebuild-uje queue i generiše briefing/focus.
9. Proverava nedavno završene Jira issue-e i sastavlja What’s new.
10. JSON odgovor se vraća tek kada je ceo HTTP tok završen; klijent prikazuje toasts/dialog i poziva router.refresh.

Cancel abortuje samo browser fetch. Server nema cancellation signal i može nastaviti API pozive i upise. Precizan processing i failure tok je u odeljku 12.

### Daily work i recommendation generation

1. Otvoreni taskovi, Jira snapshot, projekti, recent source-i, knowledge i prior memory ulaze u queue rebuild.
2. Regularni kod računa score iz statusa, manual flag-a, due date-a, evidence recency-a, Jira priority/workflow-a i tekstualnih signala.
3. AI dobija najviše 40 kandidata, ali ne preuzima numerički score niti slobodno određuje aktivni red. Može da dopuni reason/confidence i da task prebaci u waiting/tomorrow/unclear.
4. Kod primenjuje now/next/later odluke i čuva task izmene.
5. Queue summary se čuva u data/today-queue-summary.json sa input hash-om.
6. Briefing builder kombinuje queue sa Jira, source, knowledge, connection, profile i memory inputom.
7. Deterministički bira najviše jedan primarni fokus; AI priprema action plan i dnevni sažetak.
8. Rezultat se čuva u data/today-briefing.json.
9. Refresh istog dana vraća persisted rezultat. Ako su datum i input hash isti, queue/briefing generator može da preskoči novo LLM generisanje.

Evidence je povezano sa izdvojenim taskovima i Hydra stavkama. Briefing sadrži task/source reference, ali deo auxiliary briefing sadržaja se ne prikazuje na Today ekranu.

### Marking work complete i druge task akcije

Za lokalne akcije klijent šalje PATCH /api/work-tasks/[id]/status:

| Akcija | Novi status | Dodatno ponašanje |
|---|---|---|
| Start | now | Postavlja manual status flag |
| Done | done | Lokalni DB update; nema obavezne verifikacije |
| Skip | later | Lokalni DB update |
| Snooze | tomorrow | Lokalni DB update |
| Waiting | waiting | Dodaje default waiting razlog ako nije poslat |
| Not mine | unclear | Backend postoji i dopisuje napomenu; **Not found u UI-u** |

Posle uspeha klijent refreshuje server state. User ne može da menja title, reason, next action, done criteria, priority, owner ili due date kroz aktuelni UI.

**Check if done** prikuplja delivery notes, task evidence, knowledge i raspoloživ Git/GitHub/Figma kontekst, poziva AI i čuva verification_reports. Ne postavlja task na done.

**Jira transition** prvo čita stvarne dostupne tranzicije, zatim šalje write poziv Jira-i. Lokalni task/source status se time ne ažurira. Obrnuto, lokalni Done ne menja Jira issue. Footer tvrdnja da su svi izvori read-only zato nije tačna za Jira transition tok.

**Delete** briše task, evidence i verification report zapise. Kod ne briše sync_review_reports; uz uključene foreign keys task koji ih ima može završiti DB greškom.

### End day

1. Korisnik otvara dialog i opciono unosi beleške.
2. POST /api/day/end učitava taskove, današnje done taskove, verification reportove, recent source naslove i lokalni Git kontekst.
3. LLM generiše structured daily memory.
4. Novi daily_memories red se upisuje.
5. Klijent refreshuje UI.

Više izvršavanja istog dana može napraviti više memory redova jer datum nije unique; čita se najnoviji. Ako AI ne uspe, memory se ne čuva. Network/JSON exception na klijentu nije potpuno uhvaćen i dialog može ostati u pending stanju.

### Manual transcript

1. Korisnik unosi naslov, body i opcione metadata u Settings.
2. Forma radi Zod validaciju i šalje POST /api/source-items.
3. Body hash služi za dedupe ručnog source-a.
4. Source se čuva pre project matching/embedding/extraction koraka.
5. AI pokušava project matching, task extraction i knowledge extraction.
6. Parcijalni rezultati ostaju sačuvani ako kasniji korak padne.
7. UI prikazuje šta je kreirano i refreshuje stanje.

### Hydra manual i scheduled report

Manual:

1. Run now kreira queued report_run.
2. Browser pokreće execute endpoint i polluje run status.
3. Orchestrator paralelno sync-uje šest izvora, normalizuje source documents/evidence, računa deterministic draft, opciono poziva LLM, čuva report i delivery/audit zapise.
4. UI refreshuje kada status postane terminalan.

Scheduled:

1. Vercel cron manifest poziva /api/cron/hydra na svakih 15 minuta radnim danima.
2. Scheduler traži due schedule u 15-minutnom prozoru.
3. Idempotency key sprečava isti task/report type/date run.
4. Isti orchestrator se izvršava sinhrono unutar cron HTTP zahteva.

Nema odvojenog worker procesa. Cancel menja run state na granicama faza, ali ne abortuje već pokrenute connector/LLM pozive.

## 6. Current technical architecture

### Komponente

- **Frontend i backend framework:** Next.js 16.2.10 App Router na React 19.2.4.
- **Frontend rendering:** server components za page load; client components za interakcije.
- **API:** Next route handlers pod src/app/api.
- **Service/data access:** src/services direktno koristi Drizzle ORM.
- **Database:** SQLite preko better-sqlite3, fiksno data/worklight.db.
- **Local file storage:** JSON fajlovi za secrets, OAuth/MCP state, LLM settings, queue i briefing.
- **Authentication:** **Not found** za aplikaciju; connector OAuth/MCP/token auth postoji.
- **AI:** centralni LLM router za Groq, OpenAI i Anthropic; OpenAI embeddings.
- **Integrations:** direct REST i/ili MCP connector moduli.
- **Background processing:** **Not found** kao zaseban worker/queue. Dugi procesi rade u route requestu.
- **Scheduled processing:** Vercel cron manifest za Hydra.
- **Email:** opcioni Resend.
- **Browser notifications:** samo klijentski Notification API posle manual run-a.
- **Deployment platform:** Vercel je nagovešten samo cron manifestom; aktivan deployment nije potvrđen iz repozitorijuma.

### Runtime dijagram

~~~mermaid
flowchart LR
    U[User in browser] --> SC[Next.js server-rendered pages]
    U --> CC[React client components]
    CC --> API[Next.js API route handlers]
    SC --> SVC[Services and domain modules]
    API --> SVC
    SVC --> DB[(SQLite data/worklight.db)]
    SVC --> JSON[(Local JSON files)]
    SVC --> CONN[Connector modules]
    CONN --> EXT[External APIs and MCP servers]
    SVC --> LLM[LLM router]
    LLM --> GROQ[Groq]
    LLM --> OPENAI[OpenAI and embeddings]
    LLM --> ANTHROPIC[Anthropic]
    VC[Vercel Cron, if deployed] --> CRON[/api/cron/hydra]
    CRON --> SVC
    SVC --> RESEND[Resend, optional]
    CC --> NOTIFY[Browser Notification API]
~~~

Server components ne moraju da zovu sopstveni HTTP API: page fajlovi direktno pozivaju service sloj. Client komponente koriste API rute i zatim router.refresh da bi server ponovo učitao stanje. SQLite i JSON storage su lokalni tom istom Node procesu/filesystemu.

Ne postoje odvojeni frontend/backend repozitorijumi, message broker, cache server, object storage, analytics servis ili hosted database adapter u aktuelnom kodu.

## 7. Frontend architecture

### Framework, rute i rendering

Frontend koristi Next.js 16.2.10 App Router, React 19.2.4 i TypeScript 5, prema [package.json](../package.json). Root je [src/app/layout.tsx](../src/app/layout.tsx); UI stranice su page.tsx fajlovi pod src/app, dok su HTTP handleri odvojeni pod src/app/api.

Page komponente su po defaultu server components i direktno pozivaju services/data module. Sve glavne stranice koriste dynamic = force-dynamic, pa se oslanjaju na runtime stanje umesto static build rezultata. Interaktivne komponente imaju use client, zovu route handlers kroz fetch i uglavnom završavaju sa router.refresh.

Nema Pages Router-a, Redux/Zustand store-a, React Query/SWR server-state biblioteke niti server actions. Nisu pronađeni fajlovi sa use server direktivom.

### Page i component organizacija

- src/app/page.tsx sastavlja Today server podatke.
- src/app/reports, projects, settings, knowledge, sources, schedule i audit sadrže route-level kompoziciju.
- src/components sadrži product komponente kao TodayFilteredView, DailyFocusCard, TaskCard, TaskActionButtons, SyncMyDayButton, HydraRunNowButton, ConnectionCard i TaskChatPanel.
- src/components/ui obavija lokalne/HeroUI primitive.
- src/domain definiše TypeScript/Zod oblike proizvoda.
- src/lib sadrži i frontend pomoćnu logiku i većinu server business logike; sama granica foldera nije strogo frontend/backend.

Globalni AskMemoryProvider obavija sve stranice. AskMemoryWidget se sakriva na /knowledge, ali TaskChatPanel na drugim stranicama učitava task opcije čak i kada dialog nije otvoren.

### Client i server state

| Vrsta stanja | Mehanizam | Primer | Persistence |
|---|---|---|---|
| Server data | Server component direktno poziva service | Today queue, reports, projects | SQLite ili JSON |
| Mutation result | Native fetch + router.refresh | Task status, sync, profile | Zavisi od endpointa; većinom SQLite |
| Lokalni UI | useState/useMemo | Settings tab, dialog, pending dugme | Gubi se na refresh |
| Globalni client context | AskMemoryContext | Otvoren assistant i scope | Gubi se na refresh |
| URL state | searchParams | Project/report filter, project tab | Ostaje u URL-u |
| Browser session | sessionStorage | Welcome modal seen | Samo dati tab/session |
| Chat messages | React state | Work/task Q&A razgovor | **Not persisted** |
| Sync progress | Timers i React state | Procenat i aktivni source step | **Mocked**, gubi se |

**Not found:** localStorage, session cookie, offline cache, service worker ili browser-persisted data cache.

### Data fetching i forms

Server page fetch se radi običnim async pozivima service sloju, često Promise.all. Client mutation radi native fetch; nema centralnog API clienta, retry cache-a ili optimistic frameworka. Neke kontrole, kao project status, ručno rade optimistic state.

React Hook Form + Zod se koriste za Profile i manual transcript. Schedule, Hydra config, connections, model keys, project settings i task verification koriste controlled state i route-specifičnu validaciju. Zod se koristi široko na serveru, ali nisu sve rute jednako strogo validirane.

### Styling i design system

- Tailwind CSS 4 i @heroui/styles se uvoze u [src/app/globals.css](../src/app/globals.css).
- HeroUI 3.2.2 primitive se koriste direktno ili kroz src/components/ui adaptere.
- Lucide daje ikone.
- Sonner daje toast poruke.
- Framer Motion daje manje tranzicije.
- Lottie se koristi u Sync overlay-u.
- Next font setup koristi Geist, Geist Mono i Space Grotesk iz Google font izvora pri buildu.

### Loading, empty i error ponašanje

Nema route-level loading.tsx, error.tsx ili custom not-found.tsx. Empty states postoje unutar pojedinačnih ekrana: fresh start, no reports, report not produced, no audit, no tomorrow task i missing profile name. Sync komponenta ima najopsežniji lokalni error prikaz. Većina server-render grešaka ide na Next default.

### Frontend business logika

Bitna poslovna logika koja se trenutno izvršava ili utiče u frontendu uključuje:

- owner filter i skrivanje briefing kategorija u [src/lib/filters/ownerFilter.ts](../src/lib/filters/ownerFilter.ts);
- personal relevance/search filter u [src/lib/filters/knowledgeFilter.ts](../src/lib/filters/knowledgeFilter.ts);
- mapiranje task akcija i dostupnost dugmadi u [src/components/TaskActionButtons.tsx](../src/components/TaskActionButtons.tsx);
- simulaciju Sync progresije u [src/components/SyncMyDayButton.tsx](../src/components/SyncMyDayButton.tsx);
- polling i browser notification za manual Hydra run u [src/components/HydraRunNowButton.tsx](../src/components/HydraRunNowButton.tsx);
- route/tab filtere kroz search params.

TaskWorkContext komponenta ima kod za Figma URL, local path, GitHub repo i sync review, ali SHOW_WORK_CONTEXT = false uzrokuje da uvek vrati null. To je **Partially implemented**, ne aktivna capability.

### Environment na frontendu

Nisu pronađene NEXT_PUBLIC promenljive. OAuth availability i ostala environment odluka izračunavaju se na serveru i prosleđuju UI-u. Secret vrednosti se ne embed-uju u client bundle prema pronađenom toku.

## 8. Backend architecture

### Entry points i slojevi

Ne postoji zaseban backend framework ili proces. Backend čine:

1. Next server components, koji direktno čitaju service sloj;
2. Next route handlers u src/app/api, koje pozivaju client komponente ili cron;
3. services u src/services, koji rade CRUD i secret/file persistence;
4. business moduli u src/lib za import, connectors, tasks, knowledge, LLM i Hydra;
5. Drizzle/better-sqlite3 data layer u src/db.

Glavni DB entry je [src/db/connection.ts](../src/db/connection.ts), a šema je [src/db/schema.ts](../src/db/schema.ts). SQLite koristi WAL i foreign keys. Server actions nisu pronađene.

### Validation, auth, errors, logging i config

- **Validation:** Zod se koristi za LLM outpute, forme i deo API inputa; dinamički ID-jevi se najčešće ručno proveravaju kao pozitivni integeri. Neke config vrednosti su samo string-length ili enum provere.
- **Authentication/authorization:** **Not found** za aplikaciju na svim redovnim endpointima.
- **Connector auth:** direct OAuth state je random/single-use/10 minuta; MCP ima sopstveni OAuth state/verifier storage.
- **Errors:** rute uglavnom vraćaju JSON sa 400/404/500, ali nema zajedničkog error middleware-a. /api/day/sync nema top-level try/catch.
- **Logging:** LLM router piše provider/model/duration/token usage u console; Hydra čuva audit_logs; generalni request/task/sync audit nije pronađen.
- **Configuration:** env, data/*.json, connections metadata, project JSON polja i report_tasks.config. Deo konfiguracije je hardcoded u domain/service modulima.

### API endpoints i actions

Napomena: svi endpointi u tabeli osim uslovno zaštićenog cron endpointa nemaju aplikacioni auth check.

| Endpoint or action | Called from | Input | Processing | Output | Status |
|---|---|---|---|---|---|
| POST /api/day/sync | SyncMyDayButton | Nema body-ja | Project discovery, provider sync, import/AI, queue, briefing, Jira done check | Agregirani provider/backfill/briefing/what’s-new JSON | **Implemented**, bez locka/transakcije |
| POST /api/day/end | EndDayButton | Opcione notes | Prikuplja dnevni kontekst, LLM memory, DB insert | Daily memory ili error | **Implemented** |
| POST /api/today/rebuild-queue | Nije pronađen aktivni UI poziv | Nema | Rebuild prioriteta | Queue summary | **Implemented backend**, uglavnom legacy/internal |
| POST /api/source-items | IngestForm | Manual source fields | Validacija, hash dedupe, source insert, match/extract/index | Source i extraction rezultati | **Implemented**, partial writes moguće |
| GET /api/profile | Profile data consumers | Nema | Čita prvi user_profiles red | Profile/null | **Implemented** singleton |
| POST /api/profile | ProfileForm | Email i skriveno name | Upsert prvog profila | Sačuvan profile | **Partially implemented UI** |
| GET /api/settings | ApiKeyForm | Nema | Spaja env i local provider settings | Maskirani provider statusi | **Implemented** |
| POST /api/settings | ApiKeyForm | Provider i API key | Čuva local key i uključuje provider | Maskirani setting | **Implemented** |
| PATCH /api/settings | ApiKeyForm | Provider, enabled | Menja enabled state | Updated setting | **Implemented** |
| DELETE /api/settings | ApiKeyForm | Provider | Briše local key/settings | Success; env key ostaje efektivan | **Implemented** |
| GET /api/connections/[provider] | Connection UI | Provider | Čita connection status | Connection JSON | **Implemented** |
| DELETE /api/connections/[provider] | ConnectionCard | Provider | Briše connection i secret/MCP podatke | Success/error | **Implemented**, client ignoriše rezultat |
| GET /api/connections/[provider]/connect | OAuth button | Provider i redirect kontekst | Generiše OAuth URL/state | Redirect | **Implemented** za podržane direct OAuth providere |
| GET /api/connections/[provider]/callback | External OAuth provider | code/state/error query | Validira state, exchange/refresh metadata, čuva connection | Redirect u Settings | **Implemented** |
| POST /api/connections/[provider]/secret | Secret/PAT/bot form | Provider-specific secret | Čuva secret, testira connector, upisuje status | Connection/test rezultat | **Implemented**, neuspešan secret ostaje sačuvan |
| POST /api/connections/[provider]/sync | Connection UI/individual flow | Provider | Sync jednog providera kroz import pipeline | Import summary | **Implemented**, nije glavni Today tok |
| GET /api/mcp/[provider]/connect | MCP button | Provider | MCP discovery, PKCE/state setup | Redirect | **Implemented** za podržane MCP providere |
| GET /api/mcp/[provider]/callback | MCP OAuth server | code/state | Token exchange i lokalni MCP token zapis | Redirect u Settings | **Implemented** |
| GET /api/connections/github/repos | GitHub settings | Nema | Čita dostupne repo-e | Repo lista | **Implemented** |
| GET /api/connections/github/branches | GitHub settings | repo query | Čita branch-eve | Branch lista | **Implemented** |
| PATCH /api/connections/github/settings | GitHub settings | Repo/branch | Čuva globalnu GitHub konfiguraciju u metadata | Updated connection | **Implemented** |
| PATCH /api/work-tasks/[id]/status | TaskActionButtons | Akcija i opcioni waiting razlog | Mapira akciju na status, postavlja manual flag | Updated task | **Implemented** |
| PATCH /api/work-tasks/[id]/project | Unassigned task dropdown | projectId | Proverava i menja task project | Updated task | **Implemented** |
| POST /api/work-tasks/[id]/review | Nije pronađen aktuelni Inbox UI | approve/reject | Approve ili delete pending task | Action/task | **Implemented backend**, legacy |
| PATCH /api/work-tasks/[id]/context | Disabled TaskWorkContext | Figma/local/GitHub context | Validira delove i čuva snapshot | Updated context | **Partially implemented**, UI hard-disabled |
| POST /api/work-tasks/[id]/verify | Check if done | Delivery notes/context | Sastavlja evidence, LLM verification, DB insert | Verification report | **Implemented** |
| POST /api/work-tasks/[id]/sync-review | Disabled TaskWorkContext | Branch/Figma/context | LLM requirements-vs-delivery review, DB insert | Sync review report | **Partially implemented**, UI hard-disabled |
| GET /api/work-tasks/[id]/jira-transitions | JiraStatusDropdown | Task ID | Nalazi Jira key i čita transitions | Transition lista | **Implemented** |
| POST /api/work-tasks/[id]/jira-transition | JiraStatusDropdown | transitionId | Realni Jira write | Success/error | **Implemented external write** |
| DELETE /api/work-tasks/[id] | Task delete | Task ID | Briše evidence/verification pa task | Success/error | **Implemented**, sync-review FK edge case |
| GET /api/jira/[issueKey]/transitions | Jira-key UI helper | Jira key | Čita live Jira transitions | Transition lista | **Implemented**, preklapa task-specifičan tok |
| POST /api/jira/[issueKey]/transition | Jira-key UI helper | transitionId | Realni Jira transition | Success/error | **Implemented** |
| POST /api/jira/[issueKey]/ensure-task | Jira-only focus control mount | Jira key | Kreira ili nalazi lokalni task/source vezu | Local task | **Implemented**, može se desiti pri mount-u |
| POST /api/jira/[issueKey]/sync-review | Jira delivery helper | Issue/context | AI sync review | Report | **Implemented backend** |
| GET /api/task-chat/tasks | TaskChatPanel mount | Nema | Čita chat-eligible task opcije | Task lista | **Implemented** |
| POST /api/task-chat/ask | Global assistant | Pitanje i opcioni task ID | Prikuplja source/knowledge/task kontekst, OpenAI-only LLM | Odgovor sa referencama | **Implemented**, response nije sačuvan |
| POST /api/knowledge/ask | Neaktivne Knowledge chat komponente | Pitanje/scope | Embedding ili keyword retrieval, LLM QA | Odgovor sa sources | **Implemented backend**, UI nedostupan |
| PATCH /api/knowledge-items/[id] | Legacy review flow | ID | Approve i pokušaj embedding indeksa | Item + indexingError | **Implemented backend**, novi extracts već approved |
| DELETE /api/knowledge-items/[id] | Knowledge cards | ID | Briše embeddings pa knowledge | Success | **Implemented** |
| GET /api/local-path/browse | Disabled work-context picker | path query | Lista nedot direktorijume ispod server home/cwd | Directory listing | **Partially implemented**, bez auth-a |
| PATCH /api/projects/[id]/status | ProjectCard | active/inactive | DB update | Updated project | **Implemented** |
| PATCH /api/projects/[id]/repo-paths | Project overview | Path lista | Čuva project repoPaths | Updated project | **Implemented** |
| PATCH /api/projects/[id]/integration-settings | Project overview | Connector hint arrays | Čuva Jira/GitHub/Confluence/Discord/Figma scope | Updated project | **Implemented** |
| GET /api/hydra/config | Schedule page/form | Nema | ensure setup i čita report config | Config | **Implemented** |
| PATCH /api/hydra/config | HydraConfigForm | Scope/delivery config | Validira, verzionira i čuva config/audit | Updated config | **Implemented**, deo polja ne koristi orchestrator |
| PATCH /api/hydra/schedules/[id] | Schedule settings | Time/timezone/enabled | Menja schedule i auditira | Updated schedule | **Implemented** |
| POST /api/reports/run | Run now | Nema | ensure setup i kreira manual queued run | Run | **Implemented** |
| POST /api/reports/run/[id]/execute | HydraRunNowButton | Run ID | Sinhrono izvršava Hydra orchestrator | Final run | **Implemented**, nema worker |
| GET /api/reports/run/[id] | Polling | Run ID | Čita run/report summary | Current status | **Implemented** |
| DELETE /api/reports/run/[id] | Cancel button | Run ID | Obeležava cancellable run | Cancelled/current run | **Partially implemented** cancellation |
| POST /api/reports/[id]/feedback | ReportFeedback | section/rating, opcioni note | Insert report_feedback i audit | Feedback | **Implemented**, više zapisa dozvoljeno |
| GET/POST /api/cron/hydra | Vercel cron ili direktan caller | Opcioni Bearer CRON_SECRET | Nalazi due schedules i izvršava ih | Executions JSON | **Implemented**, uslovna zaštita |

## 9. Database and data model

### Tehnologija i lifecycle

Glavna baza je SQLite, otvorena preko better-sqlite3 i Drizzle ORM. Putanja je fiksno data/worklight.db; DATABASE_URL se ne koristi. Connection setup uključuje WAL i foreign_keys pragma. Schema definicija je u [src/db/schema.ts](../src/db/schema.ts), Drizzle konfiguracija u [drizzle.config.ts](../drizzle.config.ts), a migracije 0000–0010 u [drizzle](../drizzle).

DB connection kreira direktorijum/fajl ako nedostaje, ali ne pokreće migracije. Schema mora prethodno biti primenjena kroz db:migrate ili db:push. knowledge_embeddings ima i runtime create-table zaštitu u embedding modulu, uz migraciju koja već postoji.

### Core Worklight tabele

| Table | Purpose i važna polja | Relationships | Gde nastaje / čita se / menja se |
|---|---|---|---|
| projects | Lokalni projekti; name, status, keywords, people i connector scope arrays | Parent za source_items, work_tasks, knowledge, embeddings; opcioni Hydra report_task | Discovery/Jira sync ili postojeći DB; Projects/Today/processing čita; status/settings rute menjaju |
| source_items | Kanonski sirovi uvoz; type, external ID, title, puni body, author/date/url/metadata | Opcioni project; evidence, knowledge, embeddings i source_documents referenciraju source | Connector/manual import kreira ili ažurira; Today, extraction, QA, Hydra čitaju |
| work_tasks | Lokalni rad; status/manual flag, score, reason, action, criteria, due, free-text owner, context | Opcioni project; evidence, verification i sync-review child zapisi | AI extraction/Jira ensure kreira; queue/UI čita; planner i user akcije menjaju |
| evidence | Veza taska sa source-om, quote/summary/date/url | Obavezni taskId i sourceItemId | Kreira se uz extracted task; task/QA/verification UI čita; briše uz task |
| knowledge_items | Requirement/decision/question/risk/deadline/preference/criteria sa evidence quotes | Opcioni project i source | AI extraction kreira; Knowledge/project/briefing/QA čita; review/delete menja |
| knowledge_embeddings | Chunk teksta i vector/model za source ili knowledge | Opcioni source, knowledge i project | OpenAI indexing kreira; semantic search čita; reindex/delete menja |
| verification_reports | AI verdict done/mostly/missing/cannot, matches/missing/risks/action | Obavezni task | Check if done kreira; Today/project/end-day čita |
| sync_review_reports | AI poređenje delivery contexta, ok/notOk/conflicts | Obavezni task | Disabled work-context/Jira helper kreira; project verification čita |
| user_profiles | Singleton-like email i opciono name | Nema user FK iz drugih tabela | Profile save kreira/menja prvi red; Today/Knowledge/delivery čitaju |
| connections | Provider status/auth type/scopes/metadata, bez raw tokena | Logička veza ka secret JSON-u | Connect/disconnect/sync menja; Settings i sync čitaju |
| daily_memories | Dnevni sažetak, completed/open/waiting/first tomorrow/risks | Nema user/project FK | End day insertuje; Today/Tomorrow/planner čitaju |

### Hydra tabele

| Table | Purpose i važna polja | Relationships | Gde nastaje / čita se / menja se |
|---|---|---|---|
| workspaces | Name i timezone za Hydra instance | Parent report_tasks i audit_logs | ensureHydraSetup kreira prvi; Schedule/Hydra čita |
| report_tasks | Report template, versions, config JSON, delivery settings, active | Opcioni workspace/project; parent schedules/cursors/runs | ensure setup kreira; config endpoint menja; orchestrator čita |
| task_schedules | Start-of-day / end-of-day, cron/hour/minute/timezone/enabled/lastRunAt | Obavezni report_task | ensure setup kreira; Schedule menja; cron scheduler čita; lastRunAt se trenutno ne ažurira |
| sync_cursors | Provider cursor i lastSuccessfulSyncAt po tasku | Obavezni report_task | Hydra upsertuje timestamp; connectori ga ne koriste kao input |
| source_documents | Provider/external/version/content hash za canonical source | Obavezni source_item | Hydra normalizacija upsertuje; koristi se za verziju/dedupe |
| report_runs | Lifecycle, type/date/idempotency, source health, warnings/timings/config/model/error | Obavezni report_task; parent evidence/report/relations | Manual/cron kreira; orchestrator menja; Reports/UI čita |
| hydra_evidence_items | Run snapshot sadržaja, source metadata, score/reasons/hash | Obavezni run, opcioni source_item | Svaki run zamenjuje svoj evidence skup; decision/LLM/report UI čita |
| evidence_relations | Conflict/support odnos između dva evidence zapisa | Run + from/to hydra evidence | Decision engine kreira; report detalj čita |
| reports | Jedan structuredJson/renderedText/citation coverage po run-u | Unique obavezni run | Orchestrator kreira; report pages/delivery čitaju |
| notification_deliveries | Kanal, status, pokušaji i provider response | Obavezni report | Delivery faza kreira/menja; report detail čita |
| audit_logs | Actor/action/entity/metadata za Hydra | Opcioni workspace | Setup/config/schedule/run/cancel/feedback upisuje; Audit čita |
| report_feedback | Section, rating, opcioni note | Obavezni report | Feedback endpoint insertuje; report detail čita; nije input novog reporta |

### Entity-relationship dijagram

~~~mermaid
erDiagram
    PROJECTS ||--o{ SOURCE_ITEMS : groups
    PROJECTS ||--o{ WORK_TASKS : groups
    PROJECTS ||--o{ KNOWLEDGE_ITEMS : groups
    PROJECTS ||--o{ KNOWLEDGE_EMBEDDINGS : scopes
    WORK_TASKS ||--o{ EVIDENCE : has
    SOURCE_ITEMS ||--o{ EVIDENCE : supports
    SOURCE_ITEMS ||--o{ KNOWLEDGE_ITEMS : produces
    SOURCE_ITEMS ||--o{ KNOWLEDGE_EMBEDDINGS : indexed_as
    KNOWLEDGE_ITEMS ||--o{ KNOWLEDGE_EMBEDDINGS : indexed_as
    WORK_TASKS ||--o{ VERIFICATION_REPORTS : checked_by
    WORK_TASKS ||--o{ SYNC_REVIEW_REPORTS : reviewed_by

    WORKSPACES ||--o{ REPORT_TASKS : owns
    WORKSPACES ||--o{ AUDIT_LOGS : records
    PROJECTS ||--o{ REPORT_TASKS : scopes
    REPORT_TASKS ||--o{ TASK_SCHEDULES : scheduled_by
    REPORT_TASKS ||--o{ SYNC_CURSORS : tracks
    REPORT_TASKS ||--o{ REPORT_RUNS : executes
    SOURCE_ITEMS ||--o{ SOURCE_DOCUMENTS : versioned_as
    REPORT_RUNS ||--o{ HYDRA_EVIDENCE_ITEMS : snapshots
    SOURCE_ITEMS ||--o{ HYDRA_EVIDENCE_ITEMS : originates
    REPORT_RUNS ||--o{ EVIDENCE_RELATIONS : relates
    HYDRA_EVIDENCE_ITEMS ||--o{ EVIDENCE_RELATIONS : from
    HYDRA_EVIDENCE_ITEMS ||--o{ EVIDENCE_RELATIONS : to
    REPORT_RUNS ||--o| REPORTS : produces
    REPORTS ||--o{ NOTIFICATION_DELIVERIES : delivers
    REPORTS ||--o{ REPORT_FEEDBACK : receives
~~~

### Constraints i integritet

- report_runs.idempotency_key je unique.
- reports.run_id je unique.
- **Not found:** unique constraint na source_items(source_type, source_external_id), connections.provider, user_profiles singleton ili daily_memories.date.
- Dedupe source-a i provider upsert se zato oslanjaju na aplikacioni kod.
- Foreign keys su uključeni, ali schema nema on-delete cascade deklaracije.
- Core import koristi lokalne transakcije za novi task + evidence, ali ceo sync nije jedna transakcija.
- Knowledge za promenjeni source može prvo biti obrisan, pa izgubljen ako nova extraction faza padne.

### Gde se podaci nalaze

| Kategorija | Primeri | Trajnost |
|---|---|---|
| SQLite persistent data | Projects, source body, tasks, evidence, knowledge, profile, connections metadata, memories, kompletan Hydra model | Trajno dok postoji data/worklight.db |
| Lokalni JSON | secrets, llm-settings, oauth-states, mcp-oauth, today briefing, queue summary | Trajno na datom filesystemu |
| Browser session | Welcome modal seen | Do kraja browser session-a |
| React in-memory | Chat, tabovi, dialog, progress, toast state | Do refresh-a/unmount-a |
| Hardcoded data | Source katalog, Hydra defaults, score weights, limiti | U source kodu |
| AI-generated persistent | Tasks, knowledge, memories, verification, Hydra reports | SQLite ili briefing/queue JSON |
| AI-generated temporary | Task/knowledge Q&A response | Samo client response/state |
| Mocked | Sync step/progress animacija | Samo client timer |

Sirovi email, note, ticket, page, PR, message i Figma tekst može biti sačuvan u source_items.body, a zatim poslat AI provideru u relevantnim extraction/QA/report tokovima.

## 10. External integrations

Connector registry je u [src/lib/connectors/registry.ts](../src/lib/connectors/registry.ts). Direct OAuth tokeni i secret-i se čuvaju u connection_secrets tabeli, šifrovani AES-256-GCM ključem iz SECRETS_ENCRYPTION_KEY; MCP tokeni i PKCE/discovery podaci i dalje u data/mcp-oauth/*.json. connections tabela sadrži status, auth type, scopes i metadata, ne sirove tokene.

### Integracije

| Integracija | Auth i potrebna konfiguracija | Podaci, trigger i storage | Error handling | Status |
|---|---|---|---|---|
| Gmail | Google OAuth; GOOGLE_CLIENT_ID/SECRET; gmail.readonly | Day/Hydra sync traži Gemini/Meet/meeting-note poruke. Prvi sync koristi newer_than:30d, sledeći lastSync minus 7 dana, max 50. Puni email body ide u source_items | API greška ruši provider sync; per-item import greške se skupljaju | **Implemented**, read-only |
| Google Calendar | Google OAuth; isti client; calendar.readonly | Čita primary calendar samo za današnji lokalni dan, max 50; čuva događaje kao calendar source | Provider greška se vraća; stari događaji se ne povlače ovim tokom | **Implemented**, read-only |
| Jira | Atlassian direct OAuth ili Atlassian MCP; direct scope uključuje read/write Jira | Uvozi assigned/reported non-Done issues, opcioni project-key filter, do 25; čuva issue body/metadata. UI može da čita i izvrši realne transitions | Sync greške per provider; project MCP greške se gutaju kao prazna lista. Direct OAuth token se refreshuje | **Implemented**, uključuje external write |
| Confluence | Atlassian direct OAuth ili shared MCP; potreban bar jedan space ili page URL | Čita eksplicitne URL-ove i do 20 current stranica po prostoru; body se čuva | Bez scope config-a sync vraća config error; API/MCP greške obeležavaju provider | **Implemented**, read-only |
| Granola | API key ili MCP; optional GRANOLA_API_BASE_URL | Poslednjih 30 dana, max 20 notes/meetings; summary/transcript se čuva; extraction dodatno traži personal relevance | API/MCP greška obeležava provider; nema poseban history UI | **Implemented**, read-only |
| GitHub | OAuth ili PAT; OAuth scopes read:user, read:org, repo | Globalni ili project repo scope; reads open relevant PRs, comments/reviews, commits/checks, max 50 po repo-u; source_items i verification context | Potrebno je izabrati repo/branch; connector error ulazi u sync result | **Implemented**, read-only u aplikaciji |
| Discord | UI koristi bot token; OAuth kod postoji sa DISCORD_CLIENT_ID/SECRET | Čita poslednjih 50 poruka po project channel-u i zadržava keyword ili myUserId mention match. Day sync ne prosleđuje myUserId, pa praktično radi keyword match | Channel/API greška ruši provider; OAuth accessToken nije format koji connector čita | **Partially implemented** |
| Figma | PAT ili Figma MCP; MCP može tražiti FIGMA_MCP_CLIENT_ID/SECRET | Čita konfigurisane file keys. REST čuva file metadata i depth-2 tekstualno stablo; MCP pokušava design context/screenshot pozive. Source i verification context su tekst | REST tiho preskače nečitljiv fajl. MCP parser odbacuje image blockove, pa screenshot nije prosleđen LLM-u kao slika | **Partially implemented**, nema stvarnu image analizu |
| Google Drive | Nema provider, OAuth scope, connector ili source type | Sources UI kartica Google Drive mapira se na Gmail; Hydra Gmail ponekad označava kao drive | Nije primenljivo | **Not found / mislabeled UI** |
| Local Git | Lokalni git executable i sačuvana repo putanja | Read-only status/diff/log evidence za verification, sync review i End day; nije deo standardnog connector registry sync-a | Command/path greške ulaze u evidence warning ili nedostajući context | **Implemented**, read-only |
| Resend | RESEND_API_KEY i REPORT_EMAIL_FROM; profile.email | Hydra email delivery; report body se šalje posle report persistence | Do pet neposrednih pokušaja; nema eksplicitni timeout/backoff | **Implemented, optional** |
| Browser Notification API | Browser permission | Manual Hydra run može prikazati local completion notification | Permission se traži nezavisno od push config-a; nema server push subscription | **Partially implemented** |
| Vercel Cron | vercel.json schedule; opcioni CRON_SECRET | Poziva Hydra cron endpoint svakih 15 minuta radnim danima | Endpoint vraća execution rezultate; auth samo ako secret postoji | **Implemented kao config**, aktivan deployment **Unknown** |

### Connector auth detalji

Direct OAuth scope definicije su u [src/lib/connectors/oauth.ts](../src/lib/connectors/oauth.ts):

- Gmail: gmail.readonly.
- Calendar: calendar.readonly.
- Jira: read:jira-work, write:jira-work, read:jira-user, read:me i offline_access.
- Confluence: read content/space, read:me i offline_access.
- GitHub: read:user, read:org i repo.
- Discord: identify, guilds i bot.

Google Gmail i Calendar dele redirect callback; stvarni provider se vraća iz OAuth state-a. Direct access token se automatski refreshuje kada postoji refresh token. State se čuva lokalno, single-use je i ističe posle deset minuta.

MCP transport je implementiran za Atlassian, Granola i Figma. Jira i Confluence mogu koristiti istu Atlassian MCP vezu. MCP server response parser izvlači tekst/structured content; slikovni content nije sačuvan kao image input.

### Šta se piše nazad eksternim servisima

Jedini potvrđen business write ka eksternom work sistemu jeste **Jira issue transition**. Connector registry source sync pozivi su read-only. GitHub, Gmail, Calendar, Confluence, Granola, Figma, Discord i local Git nemaju write akciju u pronađenom product toku.

Resend email je outbound delivery, ne izmena source sistema. Browser notification je lokalna browser akcija.

## 11. AI and LLM behavior

### Provideri, modeli i routing

Centralni router je [src/lib/llm/router.ts](../src/lib/llm/router.ts). Samo provideri koji su uključeni i imaju env ili local key učestvuju u lancu.

| Grupa poslova | Primarni model | Fallback redosled |
|---|---|---|
| Task extraction, project matching, knowledge extraction/QA | Groq llama-3.3-70b-versatile | Groq llama-3.1-8b-instant, Anthropic claude-3-7-sonnet-latest, OpenAI gpt-4.1-mini |
| Project discovery, priority, Today briefing, focus plan | Groq llama-3.3-70b-versatile | Groq 8B, Anthropic Sonnet, OpenAI gpt-4.1 |
| Daily memory | Groq 70B | Groq 8B, Anthropic Sonnet, OpenAI gpt-4.1 |
| Delivery verification | Groq 70B | Groq 8B, Anthropic Sonnet |
| Task/work Q&A | OpenAI gpt-5.4 | Nema fallback |
| Delivery sync review | OpenAI gpt-4.1 | OpenAI mini, Groq 70B, Groq 8B, Anthropic Sonnet |
| Hydra report | OpenAI gpt-4.1 | OpenAI mini, Groq 70B, Anthropic Sonnet |
| Embeddings | OpenAI text-embedding-3-small | Nema embedding fallback |

Komentari u .env.example koji Groq opisuju kao primarni za sve text poslove i Anthropic samo za verification nisu potpuno usklađeni sa ovim routerom.

LLM ključevi dolaze iz GROQ_API_KEY, OPENAI_API_KEY i ANTHROPIC_API_KEY ili iz lokalnih Settings fajlova. Environment key ima prioritet. Provider može biti paused u local settings; env ključ tada i dalje postoji, ali active-provider logika koristi sačuvani enabled state.

### Zajedničko ponašanje poziva

Prompt moduli su u [src/lib/llm/prompts](../src/lib/llm/prompts). Shared prompt zahteva JSON-only, evidence-grounded odgovor i tretira source sadržaj kao untrusted data, a ne instrukcije.

Za strukturirane poslove router:

1. bira samo aktivne modele iz job lanca;
2. šalje system prompt i user payload;
3. parsira JSON;
4. validira rezultat konkretnom Zod šemom;
5. posle invalidnog JSON/schema outputa jednom traži ispravljeni odgovor;
6. za transient problem pokušava poziv dva puta;
7. za podržane error vrste prelazi na sledeći aktivni fallback.

OpenAI Responses koristi strict JSON schema i store: false. Groq koristi JSON object mode, a Anthropic tekstualnu JSON instrukciju; oba prolaze isti Zod validator. Većina LLM HTTP poziva ima timeout oko 60 sekundi. Router loguje job, provider, model, trajanje i token usage, ali ne raw prompt/output.

Ako svi fallback modeli padnu, caller dobija primarnu, ne nužno poslednju grešku. Prvi provider-level embeddings failure memoizuje se u Node procesu i naredni embedding pokušaji se preskaču do restarta. Knowledge search tada koristi keyword fallback.

### AI operacije

| AI operation | Trigger | Inputs | Prompt location | Expected output | Storage |
|---|---|---|---|---|---|
| Task extraction | Novi/promenjeni non-Calendar source ili manual transcript/backfill | Puni source body, title, author/date, project context, do 30 open taskova; normalni sync uključuje current profile name | [taskExtractor.ts](../src/lib/llm/prompts/taskExtractor.ts) | Lista actionable/waiting/unclear taskova, owner, action, done criteria, due, evidence i existingTaskId | work_tasks i evidence |
| Knowledge extraction | Novi/promenjeni non-Calendar source | Puni source body, project i Granola relevance context | [knowledgeExtractor.ts](../src/lib/llm/prompts/knowledgeExtractor.ts) | Requirement/decision/question/risk/deadline/preference/criteria sa quotes | knowledge_items, zatim embeddings |
| Project matching | Source/task bez pouzdanog projekta | Source/task sadržaj, aktivni projekti i recent excerpts | [projectMatcher.ts](../src/lib/llm/prompts/projectMatcher.ts) | Postojeći project ID, confidence i reason | source metadata/projectId ili task projectId |
| Project discovery | Početak sync-a, ponekad ponovo posle importa | Recent connector/source signals i postojeći projekti | [projectDiscovery.ts](../src/lib/llm/prompts/projectDiscovery.ts) | Kandidati za nove projekte sa signals/confidence | projects |
| Priority planning | Day sync ili rebuild endpoint | Deterministički top 40 taskova, Jira, projects, recent sources, prior memory | [priorityPlanner.ts](../src/lib/llm/prompts/priorityPlanner.ts) | Semantic reason/confidence i dozvoljeni defer status | work_tasks + today-queue-summary.json |
| Focus action plan | Today briefing build | Izabrani focus task/Jira evidence bundle | [focusActionPlan.ts](../src/lib/llm/prompts/focusActionPlan.ts) | Kratak executable plan i evidence reference | today-briefing.json |
| Today briefing | Day sync | Jira, knowledge, source excerpts, queue, connections, profile, memory | [todayBriefing.ts](../src/lib/llm/prompts/todayBriefing.ts) | Summary, highlights, waiting, risks | today-briefing.json |
| Daily memory | End day | Task statusi, verification, source naslovi, local Git i user notes | [dailyMemory.ts](../src/lib/llm/prompts/dailyMemory.ts) | Structured work/completed/open/waiting/tomorrow/risks summary | daily_memories |
| Knowledge Q&A | POST /api/knowledge/ask | Top 8 semantic/keyword chunkova i pitanje | [knowledgeQa.ts](../src/lib/llm/prompts/knowledgeQa.ts) | Answer i cited source IDs | Nije sačuvano |
| Task/work Q&A | Global assistant | Pitanje, opcioni task, do 60 source-a uz truncation, knowledge i profile context | [taskQa.ts](../src/lib/llm/prompts/taskQa.ts) | Grounded answer i references | Nije sačuvano |
| Delivery verification | Check if done | Done criteria, notes, task evidence, knowledge, Git/GitHub/Figma context | [deliveryVerifier.ts](../src/lib/llm/prompts/deliveryVerifier.ts) | Verdict, matches, missing, risks, next action | verification_reports |
| Delivery sync review | Disabled work-context flow ili Jira helper | Requirements prema branch/Figma/Git contextu | [deliverySyncReview.ts](../src/lib/llm/prompts/deliverySyncReview.ts) | ok/notOk/conflicts/next action | sync_review_reports |
| Hydra report | Manual/scheduled run | Deterministički draft i do 80 ranked evidence body-ja, svaki do oko 1.600 znakova | [hydraReport.ts](../src/lib/llm/prompts/hydraReport.ts) | Structured Hydra report sa evidence ID-jevima i URLs | reports i report_runs model metadata |
| Embeddings | Source/knowledge index i semantic query | Tekstualni chunks ili query | Nema generativni prompt; OpenAI embedding API | Numeric vectors | knowledge_embeddings; query vector privremen |

### Koje AI sposobnosti stvarno postoje

| Capability | Nalaz |
|---|---|
| Summarization | **Implemented** u briefing, memory, QA i Hydra reportu |
| Extraction | **Implemented** za taskove i knowledge |
| Prioritization | **Implemented** kao deterministic score + ograničen AI semantic/defer sloj |
| Ownership assignment | **Implemented kao AI free-text**, bez user validacije |
| Conflict detection | **Implemented** u Hydra deterministic relation logici i delivery sync review |
| Recommendation generation | **Implemented** za focus action, next action i report actions |
| Chat responses | **Implemented**, task chat zahteva aktivan OpenAI |
| Visual Figma analysis | **Not found**; tekstualni tree/context postoji, image block nije prosleđen |

### Input, validacija, persistence i ponovljivost

Raw source content se šalje eksternom LLM provideru u extraction, QA i report tokovima. Kod ga označava kao untrusted, ali ga ne anonimizuje ili lokalno rediguje.

Novi task mora imati nextAction i najmanje jedan done criterion. Evidence ID-jevi i Hydra URL-ovi se proveravaju protiv stvarnog evidence skupa; Hydra LLM ne sme da promeni deterministic Today first. Nevalidan Hydra rezultat pada na deterministic report. Queue i briefing takođe imaju deterministic fallback. Daily memory, extraction, verification i chat nemaju odgovarajući kompletan zamenski rezultat.

Isti input ne mora uvek dati isti AI tekst. Međutim:

- nepromenjen source se obično preskače preko content/fingerprint poređenja;
- queue i briefing istog datuma sa istim input hash-om koriste postojeći JSON;
- Hydra svaki novi run pravi novi evidence/report snapshot i može pozvati model ponovo;
- chat i verification svaki put prave novi poziv;
- Zod i evidence validatori ograničavaju oblik, ne garantuju identičan sadržaj.

## 12. Sync and data processing

Postoje dva odvojena značenja sync-a:

1. **Sync my day** — ručni Worklight sync preko /api/day/sync.
2. **Hydra source fetch** — deo manual ili scheduled report run-a.

### Sync my day: redosled

Glavna ruta je [src/app/api/day/sync/route.ts](../src/app/api/day/sync/route.ts), a pipeline [src/lib/imports/sourceImportPipeline.ts](../src/lib/imports/sourceImportPipeline.ts).

1. Automatski se odobravaju svi legacy pending task i knowledge zapisi.
2. Čitaju se connections i bira samo status connected iz skupa Gmail, Calendar, Jira, Confluence, Granola, GitHub, Discord i Figma.
3. Project discovery se pokreće pre source sync-a.
4. Provideri se obrađuju **sekvencijalno** kroz syncProvider.
5. Connector kontaktira stvaran eksterni API/MCP i vraća source candidates.
6. Za svaki candidate pipeline traži postojeći source po sourceType + sourceExternalId.
7. Poredi core sadržaj i metadata bez pojedinih volatile vrednosti; nepromenjen source preskače.
8. Novi ili promenjen source se insertuje/ažurira.
9. AI project matching pokušava da veže postojeći project; prihvata se confidence najmanje 0,7.
10. Ako je OpenAI embedding dostupan, source/knowledge chunks se indeksiraju.
11. Za svaki source osim Calendar-a pokušava se task extraction.
12. Za svaki source osim Calendar-a pokušava se knowledge extraction; Granola prolazi i personal relevance filter.
13. Novi task i njegov evidence se čuvaju lokalnom DB transakcijom. Existing task može biti ažuriran, osim manual status odluke.
14. Source processing fingerprint/status ulazi u metadata.
15. Per-source greška se beleži, a sledeći candidate se nastavlja.
16. Posle provider petlje backfill obrađuje najviše osam unprocessed/failed source zapisa.
17. Čita se Jira pending snapshot.
18. Ako Jira nije povezan kao provider, project discovery se može ponoviti na novim source signalima.
19. Priority queue se deterministički score-uje, zatim opciono AI obogaćuje/deferuje.
20. Generišu se Today briefing i focus action plan.
21. Direct Jira API se proverava za nedavno završene issues i sastavlja se profile-specific What’s new.
22. Ruta vraća agregirani JSON; browser prikazuje rezultate i radi router.refresh.

Client smatra HTTP success glavnim success signalom i ne zahteva da response data.ok bude true u svim internim rezultatima. Zato pojedini partial problem može koegzistirati sa completion UI-em.

### Worklight sync sekvenca

~~~mermaid
sequenceDiagram
    actor User
    participant UI as SyncMyDayButton
    participant API as POST /api/day/sync
    participant PD as Project discovery
    participant C as Connected providers
    participant EXT as External APIs / MCP
    participant IMP as Import pipeline
    participant DB as SQLite
    participant AI as LLM and embeddings
    participant Q as Queue and briefing
    participant FS as Local JSON

    User->>UI: Click Sync my day
    UI->>UI: Start simulated progress
    UI->>API: POST request
    API->>PD: Discover/sync project signals
    PD->>DB: Read/create projects
    loop Each connected provider, sequentially
        API->>C: syncProvider
        C->>EXT: Read recent/current items
        EXT-->>C: Source candidates
        C->>IMP: Import each candidate
        IMP->>DB: Find/create/update source
        IMP->>AI: Match project, extract tasks/knowledge, embed
        AI-->>IMP: Structured validated output or error
        IMP->>DB: Persist source/tasks/evidence/knowledge/embeddings
    end
    API->>IMP: Backfill up to 8 sources
    API->>Q: Rebuild priority and Today briefing
    Q->>AI: Priority/briefing/focus jobs
    Q->>DB: Update task scores/statuses
    Q->>FS: Save queue and briefing JSON
    API-->>UI: Aggregate result
    UI->>UI: Show toasts and router.refresh
~~~

Progress koraci u UI-u ne dolaze sa servera: menjaju se timerom približno svake 2,4 sekunde, a procenat se približava 94% dok request traje. Tek odgovor pomera prikaz ka 100%. To je **Mocked progress**, ne mocked sync.

### Koliko se podataka povlači

| Provider | Trenutni window/limit |
|---|---|
| Gmail | Default meeting-notes query; prvi put 30 dana, zatim lastSync minus 7 dana; max 50 |
| Calendar | Samo događaji današnjeg lokalnog dana; max 50 |
| Jira | Assigned/reported, non-Done, opcioni project filter; max 25 |
| Confluence | Eksplicitne page URL vrednosti i do 20 current stranica po configured space-u |
| Granola | Poslednjih 30 dana; max 20 |
| GitHub | Open relevant PR signals; max 50 po repo-u |
| Discord | Poslednjih 50 poruka po channel-u; relevance filter |
| Figma | Svi configured file keys; REST koristi lastModified, MCP candidate date može biti vreme trenutnog čitanja |

Zbog MCP Figma trenutnog sourceDate-a ista struktura može izgledati promenjeno na svakom run-u. Local Git se ne uvozi u source registry.

### Dedupe, cursor, partial failure i repeat safety

- Normalni source dedupe je **Implemented u kodu** po type + external ID i content poređenju.
- **Partially implemented:** DB nema odgovarajući unique constraint ni sync lock. Dva paralelna sync-a mogu napraviti duplikate.
- Existing task dedupe zavisi od LLM existingTaskId odluke nad ponuđenih do 30 otvorenih taskova.
- Source embeddings failure ne sprečava source persistence.
- Svaki provider i source može ostaviti parcijalne upise; ceo sync nema rollback.
- Promenjeni source briše staro extracted knowledge pre novog extraction rezultata; kasniji AI failure ostavlja stari knowledge obrisan.
- Provider success može ažurirati lastSync i kada pojedinačni importi imaju greške.
- Potpuni connector failure postavlja connection status error; sledeći daily sync bira samo connected, pa ga više ne pokušava automatski.
- Individual sync čuva postojeći status na uspehu, pa prethodni error status ne mora sam da se vrati na connected.
- **Not found:** general sync run/history tabela, job ID, lock, durable retry queue ili background worker.
- Browser čeka ceo Worklight HTTP proces. Abort na clientu ne zaustavlja server.
- Sync cursor tabela postoji samo u Hydra modelu; Worklight koristi provider metadata.lastSync i hardcoded overlap/window.

### Manual source i backfill

Manual transcript source se prvo čuva, zatim obrađuje. Ruta ne zapisuje isti processing marker kao standardni import. Ako task extraction uspe, a knowledge extraction padne, legacy backfill heuristika može smatrati source već obrađenim i ne ponoviti neuspešnu polovinu.

Backfill bira najviše osam active-project ili global source zapisa sa missing/failed markerom. Parcijalni rezultat ostaje u bazi.

### Hydra sync

Hydra orchestrator u [src/lib/hydra/orchestrator.ts](../src/lib/hydra/orchestrator.ts) paralelno pokreće Granola, Calendar, Gmail, Jira, Confluence i Figma. GitHub i Discord nisu deo Hydra fetch seta.

Po provideru postoje do tri pokušaja i 15-sekundni Promise.race timeout. Timeout ne abortuje originalni connector promise, pa završeni poziv kasnije može nastaviti upise. Source se normalizuje u source_documents i per-run hydra_evidence_items. Standardni lookback je 45 dana, uz project/UATL izuzetke; config sourceRetentionDays se čuva ali nije korišćen.

Hydra upsertuje sync_cursors.lastSuccessfulSyncAt, ali provider connectori ne čitaju cursor. To zato nije pravi incremental sync cursor. Svaki run ima source health i evidence snapshot. Ako je bilo koji od šest provider statusa not connected/error, finalni run može biti partial čak i kada taj provider nije namerno povezan.

Manual Hydra run čeka orchestrator kroz execute HTTP request, dok UI polluje drugi endpoint. Scheduled Hydra run čeka isti orchestrator unutar cron requesta. Nema pozadinskog procesora.

### Može li se sync sigurno ponoviti?

Sekvencijalni, pojedinačni ponovljeni Worklight sync je uglavnom idempotentan za nepromenjene source-e zbog external ID/content dedupe-a. Nije potpuno bezbedan pri konkurentnim pozivima, promenjenim MCP datumima, AI task matching razlikama ili parcijalnom prethodnom upisu.

Hydra koristi unique idempotency key za report task/type/date i sprečava dupli scheduled run tog identiteta. Manual run dobija novi identitet i namerno pravi novu istorijsku instancu.

## 13. Current business logic

### Pravila task ekstrakcije i assignmenta

| Rule | Trenutno ponašanje | Implementacija | Status |
|---|---|---|---|
| Koji source daje task/knowledge | Calendar se preskače za oba; drugi source tipovi pokušavaju oba; Granola mora biti personal-relevant | Regularni kod u import/extractor modulima | **Implemented** |
| Actionable task početni status | Novi actionable task počinje kao later; waiting/unclear ostaju takvi | Regularni kod | **Implemented** |
| Minimalni task oblik | Potrebni su title, nextAction i najmanje jedan done criterion | Zod + service validacija | **Implemented** |
| Evidence uslov | Novi extracted task dobija evidence; bez evidence-a se ne tretira kao čist actionable rezultat | Service/extractor kod | **Implemented** |
| Existing task | AI može vratiti existingTaskId iz ponuđenog seta i ažurirati task; stariji signal se ne koristi da prepiše noviji | AI prompt + regularni kod | **Partially implemented**, probabilistički dedupe |
| Manual odluka | Planner ne prepisuje task sa statusManuallySet | Regularni kod/DB flag | **Implemented** |
| Owner | AI vraća slobodan tekst; normalni connector prompt dobija profile name, manual/backfill ga ne prosleđuju | AI prompt + text kolona | **Partially implemented** |
| Project match | Dozvoljen je samo postojeći project ID uz confidence najmanje 0,7 | AI prompt + regularni kod | **Implemented** |
| Knowledge project | Extracted knowledge se čuva sa projectId null; project prikaz ga može izvesti preko source veze | Regularni kod | **Implemented**, indirektna veza |

### Priority score

Numerički prioritet računa regularni kod u [src/lib/tasks/priorityRank.ts](../src/lib/tasks/priorityRank.ts). LLM ne računa niti menja finalni score.

| Signal | Weight |
|---|---:|
| Status now / next / later | +80 / +40 / 0 |
| Status waiting / tomorrow / unclear | -300 / -120 / -200 |
| User manual status | +1.000 |
| Blocks other people/delivery tekst | +160 |
| Stakeholder/client explicit request | +120 |
| PR/review requested changes | +100 |
| Changed requirement/scope | +80 |
| Jira Highest/Critical/P0 | +120 |
| Jira High/P1 | +80 |
| Jira Medium/P2/Normal | +40 |
| Jira Low/P3/Minor | +10 |
| Druga nepoznata Jira priority vrednost | +25 |
| Overdue / due today / tomorrow / within week / later | +180 / +150 / +110 / +70 / +20 |
| Evidence u poslednjih 48 h / sedam dana | +60 / +30 |
| Najmanje dva evidence source-a | +25 |
| General maintenance bez commitment signala | -45 |
| Task ima waitingOn | -250 |

Jira workflow status dodaje poseban weight iz jiraStatusFocusWeight. Taskovi se sortiraju po score-u. Deterministička odluka dodeljuje prvi eligible task na now, sledeći na next, ostale na later; waiting/tomorrow/unclear se poštuju. AI može samo da prebaci ponuđeni task na waiting, tomorrow ili unclear i dopuni reason/waiting/confidence. Manual i unclear taskovi, kao i taskovi inactive projekta, ne ulaze u replanning.

Kod pokušava da održi jedan planner-postavljen now task, ali više ručno startovanih taskova može istovremeno ostati now. Daily focus limit je **Hardcoded** na jedan.

### Status i completion pravila

- Start → now.
- Done → done.
- Snooze → tomorrow.
- Skip → later.
- Waiting → waiting; bez razloga postavlja Manual follow-up needed.
- Not mine → unclear i dopisuje napomenu, ali UI akcija nije pronađena.
- Svaka korisnička status akcija postavlja statusManuallySet.
- Mark Done je lokalna odluka; verification nije obavezan.
- Verification report ne menja task status.
- Jira transition ne menja lokalni status.
- Jira done detection osvežava source metadata i notification payload, ali ne zatvara lokalni task.

### Project discovery

Pre svakog day sync-a:

- ako je Jira povezan preko MCP-a, Jira project signal sync može kreirati projekte samo za assigned key ili nazive koji počinju Hydra -; više Hydra projekata može dovesti do umbrella Hydra projekta;
- ako je Jira direct OAuth, discovery Jira funkcija vraća bez MCP rezultata, ali taj rani izlaz preskače LLM discovery, pa je ovaj put **Partially implemented**;
- bez Jira providera LLM analizira recent signals i kreira samo kandidate sa confidence najmanje 0,7 i evidence-om.

Inactive projects ostaju u bazi i direktno su dostupni, ali su isključeni iz normalnog prioritizovanja i dela backfill-a.

### Source i knowledge pravila

- Source identity je type + external ID u aplikacionom kodu.
- Poredi se core sadržaj i stabilizovana metadata; nepromenjen source se preskače.
- Manual transcript identity je SHA-256 body hash.
- Novi extracts se odmah čuvaju kao approved; pending review endpointi ostaju iz starijeg toka.
- Day sync automatski odobrava eventualne legacy pending zapise.
- Global Knowledge prikazuje approved stavke iz poslednjih deset dana koje owner/personal relevance filter smatra relevantnim.
- Knowledge search zahteva da svaki upisani termin postoji u nekom od pretraživanih polja; semantic QA koristi top osam chunks.

### Hydra decision pravila

Hydra decision engine u [src/lib/hydra/decisionEngine.ts](../src/lib/hydra/decisionEngine.ts) koristi **Hardcoded** regular expressions i weights:

| Signal | Weight |
|---|---:|
| Direktni Miloš/you need/assigned tekst | +100 |
| Tekst pominje current profile name | +30 |
| Autor odgovara configured stakeholder-u | +80 |
| Granola/Calendar/meeting evidence | +55 |
| Jira evidence | +40 |
| Confluence ili drive evidence | +20 |
| Blocker/unresolved decision tekst | +25 |
| Jira status nije done/closed/resolved | +15 |
| Recency | Najviše +30, pada 3 po danu |

Reason string i dalje kaže Instruction from Matt or Lucas, a direct pattern eksplicitno sadrži Miloš/Milos, čak i ako se config/profile promeni.

Conflict detection trenutno traži isti Jira key sa done naspram not-done tekstom. Pobednik je evidence sa većim score-om, zatim noviji; obe tvrdnje ostaju sačuvane i povezane evidence relation zapisom.

Deterministički report daje najviše četiri action item-a i odbija run bez evidence-a. Za source bez lokalnog taska generiše generičan review/resolve next step. Figma audit postoji samo ako se pronađe validan node-specific URL i eksplicitno je preliminary tekstualni nalaz.

LLM može da preformuliše/obogati report, ali validator zahteva:

- isti deterministic todayFirst predmet;
- samo validne evidence ID-jeve;
- samo source URL-ove koji pripadaju evidence-u;
- validan Figma node URL.

Ako validacija ili LLM padne, čuva se deterministic report. Bilo koji not-connected/error status u šest source slotova vodi ka partial run-u. Feedback se čuva, ali se ne koristi u narednom score-u ili promptu.

### Schedule i delivery pravila

- ensureHydraSetup kreira prvi workspace Miloš · Hydra, report task i dva weekday rasporeda ako ne postoje.
- Default vremena su 09:30 i 19:15 u Europe/Belgrade.
- Due prozor je od schedule vremena do 15 minuta posle njega.
- Idempotency task/type/date sprečava dupli scheduled run.
- task_schedules.lastRunAt postoji, ali se ne ažurira.
- In-app delivery red se uvek kreira, bez obzira na sačuvani inApp config.
- Email radi samo uz enabled config, Resend env i profile email.
- Push config pravi DB ready delivery; nema stvaran server push.

## 14. Error handling and edge cases

| Scenario | Trenutno ponašanje | Status |
|---|---|---|
| Failed login | Login ne postoji, pa nema failed-login UI ili recovery | **Not found / not applicable** |
| Missing LLM key | Router preskače neaktivne providere; API vraća missing-key grešku; queue/briefing/Hydra mogu koristiti deterministic fallback | **Partially handled** |
| Missing OAuth env | OAuth dugme je disabled ili connect ruta vraća missing config; token/MCP alternativa zavisi od providera | **Handled po provideru** |
| Missing connector secret | Connector baca not configured; sync prikazuje provider issue | **Handled** |
| Invalid connector secret | Secret se sačuva pre testa i ostaje i kada test padne | **Partially handled** |
| Failed provider API | Worklight obeležava provider error i nastavlja druge providere; Hydra čuva source health/warning | **Handled sa partial rezultatom** |
| Jedan source import padne | Beleži error i nastavlja sledeći source; raniji upisi ostaju | **Handled, non-atomic** |
| Empty source data | Provider može vratiti zero items; queue/report nastavlja. Hydra bez ikakvog evidence-a pada | **Handled**, različit rezultat po toku |
| Invalid AI JSON/schema | Jedan corrective reprompt, transient retry i model fallback | **Handled** |
| Svi AI modeli padnu | Queue/briefing/Hydra imaju fallback; extraction/memory/verification/chat vraćaju grešku ili preskaču rezultat | **Partially handled** |
| Slow LLM | Oko 60 s request timeout po pozivu; retry/fallback može produžiti ceo route | **Handled po pozivu**, UI nema server progress |
| Slow connector | Većina fetch poziva koristi oko 20 s timeout; Hydra dodatno 15 s Promise.race | **Partially handled**; Hydra originalni promise nije abortovan |
| Database failure | Lokalni try/catch u nekim rutama; nema globalne transakcije ili shared handlera; server page/API može vratiti framework 500 | **Partially handled** |
| Duplicate day sync | Nema locka/unique source constraint | **Not handled pouzdano** |
| Partial sync | Raniji upisi ostaju; response sadrži issues | **Implemented behavior**, nema rollback |
| Connection status error recovery | Glavni sync više ne bira error provider; individualni uspeh može sačuvati stari error status | **Partially implemented** |
| Page refresh | DB/JSON stanje ostaje; chat, tab, modal, progress i toasts nestaju | **Expected current behavior** |
| Expired OAuth token | Direct OAuth refreshuje token ako postoji refresh token; MCP koristi svoj token flow | **Implemented** |
| Expired app session | App session ne postoji | **Not found / not applicable** |
| Unauthorized access | Redovne rute ne proveravaju user; cron samo uslovno proverava secret | **Not handled** |
| CSRF/rate limiting | Nisu pronađeni | **Not found** |
| Jira project load failure | MCP helper vraća praznu listu/mapu | **Partially handled**, greška izgleda kao zero data |
| Jira pending/done check failure | Greška se često pretvara u prazan snapshot | **Partially handled** |
| Nečitljiv Figma file | REST connector ga tiho preskače | **Partially handled**, bez user-visible razloga |
| Sync cancel | Client abortuje fetch; server može nastaviti | **Partially implemented** |
| Hydra cancel | Status se proverava između faza; in-flight connector/LLM nije abortovan | **Partially implemented** |
| Hydra execute request/poll failure | Client ignoriše neke neuspešne odgovore i može ostati running | **Partially handled** |
| End Day network/JSON exception | Nije potpuno catch-ovan na clientu; pending UI može ostati | **Partially handled** |
| Dva End Day poziva istog datuma | Kreiraju dva memory reda; latest se koristi | **Not prevented** |
| Delete task sa sync review | Delete ne uklanja sync_review_reports, pa FK može izazvati 500 | **Partially implemented** |
| Local path access | Browse ograničava listing na nedot direktorijume ispod server home/cwd, ali nema auth; context PATCH prihvata bilo koji postojeći direktorijum | **Partially constrained** |

Worklight sync nema top-level try/catch oko celog toka. Neočekivana DB/config greška zato prekida request generičnim errorom, dok već završeni provider/source upisi ostaju. Hydra ima izraženiji run lifecycle: status, error, warnings i audit failure se čuvaju.

## 15. Testing

### Test konfiguracija i coverage

- **Not found:** test script u package.json.
- **Not found:** Jest, Vitest, Playwright, Cypress ili druga eksplicitna test dependency/config.
- **Not found:** repository test/spec fajlovi za unit, integration ili end-to-end tokove.
- **Not found:** CI workflow koji pokreće testove.

Zbog toga nijedan važan tok — auth, connector sync, extraction, queue, task actions, Jira write, Hydra report ili migrations — nema pronađenu automatizovanu test coverage. Connectori i LLM mogu biti ručno testirani kroz UI/API, ali to nije test suite.

### Bezbedno izvršene statičke provere

Provere su izvršene nad zatečenim working tree-jem bez izmene koda:

| Command | Result |
|---|---|
| npx tsc --noEmit | Prošao, exit 0 |
| npm run lint | Pao: 23 nalaza, od čega 15 errors i 8 warnings |
| npm run build | Nije potvrđen: next/font nije mogao da preuzme Geist, Geist Mono i Space Grotesk zbog ograničenog mrežnog pristupa u ovom okruženju |

Lint greške uključuju React hooks pravila, ref access tokom rendera, setState u effect-u, prefer-const i unescaped entities. Build rezultat nije dokaz TypeScript ili runtime greške; potvrđuje da produkcijski build u pregledanom, mrežno ograničenom okruženju nije završen.

Nije pokretan stvarni connector/LLM/end-to-end tok jer bi zahtevao spoljne naloge, kredencijale, moguće Jira write akcije i realne podatke.

## 16. Deployment and runtime

### Lokalno pokretanje

Prema package skriptama:

1. Instalirati Node dependency-je kroz npm install.
2. Primeniti šemu kroz npm run db:migrate ili npm run db:push.
3. Pokrenuti development sa npm run dev.
4. Produkcijski build je npm run build, a start npm start.

Nije definisana Node engines verzija. better-sqlite3 je native dependency i proces mora imati kompatibilan binary/runtime. Local Git evidence zahteva git executable i dostupne repo putanje.

### Potrebni servisi i environment

| Promenljiva / servis | Svrha | Obaveznost |
|---|---|---|
| WORKLIGHT_APP_URL | Stabilan app URL za MCP OAuth redirect; default je localhost:3000 | Opciona, bitna van localhosta |
| GROQ_API_KEY | Većina primarnih text AI poslova | Opciona ako drugi aktivan fallback može obaviti dati job |
| OPENAI_API_KEY | Task Q&A, Hydra/delivery primary i embeddings | Potrebna za te konkretne capabilities |
| ANTHROPIC_API_KEY | Text fallback | Opciona |
| GOOGLE_CLIENT_ID/SECRET | Gmail/Calendar direct OAuth | Opciona ako se ti provider-i ne koriste |
| ATLASSIAN_CLIENT_ID/SECRET | Jira/Confluence direct OAuth | Opciona kada se koristi MCP ili provider nije povezan |
| GITHUB_CLIENT_ID/SECRET | GitHub OAuth | Opciona uz PAT ili bez GitHub-a |
| DISCORD_CLIENT_ID/SECRET | Discord OAuth code path | Opciona; aktuelni connector ipak zahteva botToken |
| FIGMA_MCP_CLIENT_ID/SECRET | Figma MCP OAuth | Opciona uz PAT ili bez Figma MCP-a |
| GRANOLA_API_BASE_URL | Override Granola API endpointa | Opciona |
| CRON_SECRET | Bearer zaštita Hydra cron rute | Opciona u kodu; bez nje ruta je otvorena |
| RESEND_API_KEY | Hydra email slanje | Opciona |
| REPORT_EMAIL_FROM | Sender za Hydra email | Potrebna zajedno sa Resend ključem |

Granola API key, Figma PAT, Discord bot token, GitHub PAT i drugi provider secret-i mogu se uneti kroz Settings i čuvaju se u lokalnom secret JSON-u. LLM ključevi se mogu čuvati kroz Settings ili env. .env.example ne navodi CRON_SECRET, Resend, Discord OAuth, Figma MCP client ni Granola base URL, pa nije potpun opis stvarnog runtime config-a.

### Storage i runtime zahtevi

- Proces mora imati writable data direktorijum.
- SQLite baza je lokalni data/worklight.db; nema hosted DB konfiguracije.
- JSON secrets/cache se takođe pišu lokalno.
- Nema Redis-a, queue servisa, object storage-a ili zasebnog worker-a.
- External connector/LLM/email capabilities zahtevaju outbound internet.
- Next font build zahteva pristup Google font izvoru u aktuelnoj konfiguraciji.

### Deployment

[vercel.json](../vercel.json) definiše weekday cron na /api/cron/hydra svakih 15 minuta, pa je Vercel nameravani ili bar podržani scheduler u repozitorijumu. Nisu pronađeni Dockerfile, docker-compose, Kubernetes manifest, GitHub Actions deployment, cloud database, volume mount ili druga hosting konfiguracija.

**Unknown:** da li je aplikacija zaista deployovana na Vercel ili drugde. Sam manifest to ne potvrđuje.

**Unknown:** kako je data/worklight.db i lokalni JSON storage učinjen trajnim u produkciji. Repozitorijum nema adapter ili volume konfiguraciju koja to objašnjava. Lokalno podaci ostaju na filesystemu; ponašanje u serverless/ephemeral runtime-u ne može se pouzdano odrediti iz koda.

### Local naspram production ponašanja

| Oblast | Local | Production iz repozitorijuma |
|---|---|---|
| DB/files | Lokalni writable data folder | **Unknown** trajnost |
| Schema setup | Developer ručno pokreće migration/push | Nema automatic migration step |
| Scheduler | Nema ugrađenog local scheduler-a; endpoint se poziva ručno | Vercel cron config postoji |
| OAuth URL | Default localhost | WORKLIGHT_APP_URL/real origin mora odgovarati provider config-u |
| Secrets | Local ignored JSON/env | Secret management/volume **Unknown** |
| Long report/sync | Jedan dug Node HTTP request | Isto u kodu; platform timeout ponašanje **Unknown** |
| Fonts build | Mrežni fetch | Zahteva dostupan font source ili prethodni cache |

## 17. Implemented vs mocked vs missing

| Product area | Implemented | Partial | Mocked or hardcoded | Not found |
|---|---|---|---|---|
| Authentication | External connector OAuth/MCP/token auth | Cron auth samo kada CRON_SECRET postoji | — | App login, logout, session, protected routes |
| Users | Singleton-like profile email/name storage | Name je potreban, ali nije vidljivo editabilan; nema user-linked data | Default/actor strings | Pravi user accounts |
| Teams | — | — | Project people su string hints, nisu team | Team entity/membership |
| Hierarchy | — | — | Stakeholders/assignee su config stringovi | Manager/reporting relationship |
| Projects | DB persistence, active status, discovery, settings, project views | Direct Jira counts/discovery path; nema membership/owner | Discovery pravila i connector limits | Project access model |
| Integrations | Gmail, Calendar, Jira, Confluence, Granola, GitHub; Figma/Discord delovi | Figma image, Discord OAuth mismatch, source-screen coverage | Source katalog; Drive label mapira Gmail | Google Drive provider |
| Sync | Real external fetch, import, AI, DB write, queue/briefing | No lock/full rollback/history; partial status recovery | UI progress/steps su **Mocked**; windows/limits **Hardcoded** | Background queue/worker |
| AI processing | Structured router, validation, fallback, extraction/QA/report | Neki poslovi nemaju fallback; raw content ide provideru | Model chains i prompt rules su configured/hardcoded | Local/private model |
| Daily recommendations | Deterministički score, AI enrichment, persisted briefing | Auxiliary briefing data se ne prikazuje; single focus | Score weights i focus limit su **Hardcoded** | User-editable prioritization |
| Task ownership | Owner text extraction i profile-name filter | Nema user relation/validation/correction UI | Prompt-inferred owner | Ownership authorization |
| Manager view | — | — | — | Manager/team dashboard |
| Source evidence | Task evidence, knowledge quotes, Hydra evidence/relations i links | Project source preview nema link; Figma nije vizuelno analiziran | Hydra scoring patterns | — |
| User corrections | Status, unassigned project, delete, report feedback, project settings | Nema edit title/action/criteria/owner/due/priority; not-mine UI nedostaje | — | Full task edit/audit |
| Persistence | SQLite za domain/report data; JSON za secrets/briefing | Local filesystem production durability unknown | — | Persisted chat/UI session |
| External write actions | Jira status transition; Resend delivery | Jira/local status nisu sinhronizovani; cancellation nije hard abort | Browser push samo ready/client notification | GitHub/Figma/Confluence/Calendar write |
| Notifications | Sync toasts, Jira what’s-new, optional Resend email, manual browser notification | MCP-only Jira done detection i browser push | Push delivery ready zapis bez server push | Notification subscription/service |
| Daily memory | End Day LLM i DB insert | Nema unique date; AI failure nema fallback memory | — | Manual memory edit |
| Knowledge | Extraction, evidence, embeddings/keyword search, list/delete | Q&A route postoji ali nije dostupna na Knowledge screen-u | 10-day/personal filter pravila | Knowledge content edit |
| Hydra reports | Manual/scheduled runs, evidence, deterministic/AI report, history, audit, feedback | HTTP-bound execution, timeout/cancel/delivery/config ograničenja | Defaults, scoring i schedule su **Hardcoded** | Worker/job infrastructure |
| Tests | TypeScript statička provera je moguća | Lint trenutno pada; build nije potvrđen u mrežno ograničenom okruženju | — | Test suite i CI |

Najveći činjenični nedostaci su odsustvo app authentication/authorization i multi-user/team modela; nekompletan fresh-user profile tok; nepostojanje sync concurrency/history/background obrade; nepoklapanje pojedinih UI tvrdnji i realnih akcija; lokalni storage bez potvrđene production persistence konfiguracije; i potpuno odsustvo automatizovanih testova. To su opisi zatečenog stanja, ne predlog budućeg rešenja.

## 18. Open questions

| Pitanje | Zašto repozitorijum nije dovoljan | Šta je potrebno za odgovor |
|---|---|---|
| Da li i gde je trenutna aplikacija produkcijski deployovana? | Postoji samo Vercel cron manifest, bez deployment evidencije ili environment instance | Hosting dashboard ili informacija vlasnika sistema |
| Kako se u produkciji čuvaju SQLite i data JSON fajlovi? | Nema volume, hosted DB ili storage adapter konfiguracije | Runtime/hosting storage konfiguracija |
| Koje su integracije stvarno povezane u aktivnoj instanci? | Connection i secret fajlovi su runtime/ignored stanje i njihove vrednosti nisu deo dokumentovanog koda | Bezbedan pregled aktivne instance ili connector status export |
| Koji LLM provideri i ključevi su aktivni u produkciji? | Env i lokalni secret settings nisu version-controlled; kod samo opisuje mogućnosti | Runtime environment/provider settings bez otkrivanja samih ključeva |
| Da li direct OAuth/MCP aplikacije imaju odobrene callback URL-ove i potrebne spoljne dozvole? | Repo sadrži scope i callback logiku, ne provider admin konfiguraciju | Google/Atlassian/GitHub/Figma/MCP app konfiguracija |
| Da li Hydra cron zaista poziva endpoint i da li je CRON_SECRET podešen? | vercel.json i opcioni check ne potvrđuju aktivan cron niti environment value | Deployment cron logs i secret-presence potvrda |
| Da li je Resend email delivery aktivan i verifikovan? | Kod postoji, ali env, sender verification i realan delivery log nisu deo repozitorijuma | Resend/runtime konfiguracija i operativni logovi |
| Da li svi eksterni API/MCP response oblici i dalje odgovaraju parserima? | Bez realnih naloga nije bezbedno izvršen end-to-end connector test | Test nalozi ili operativni sync logovi |
| Koji naziv je trenutno proizvodno autoritativan: Worklight ili Hydra? | Oba naziva se aktivno renderuju; kod ne sadrži odluku | Potvrda product owner-a |
| Postoji li operativni backup/retention proces za lokalne podatke i secret fajlove? | Backup i filesystem lifecycle nisu pronađeni u repozitorijumu | Hosting/operations dokumentacija |

## Current application in one paragraph

Korisnik danas otvara nezaštićenu single-user Next.js aplikaciju, povezuje poslovne izvore ili ručno unosi transcript, pa pokreće Sync my day; server čita Gmail, Calendar, Jira, Confluence, Granola, GitHub, Discord i Figma prema konfiguraciji, čuva sirove source-e u lokalnom SQLite-u, šalje relevantan sadržaj Groq/OpenAI/Anthropic modelima radi project matchinga, task/knowledge extractiona, prioritizacije i briefinga, a zatim korisniku prikazuje sastanke, jedan fokus, lokalne taskove, evidence i knowledge. Korisnik može menjati lokalni task status, pokrenuti AI proveru, izvršiti stvarnu Jira tranziciju, završiti dan i dobiti daily memory, kao i pokretati manualne ili zakazane Hydra izveštaje koji imaju evidence, istoriju, optional email i audit. Glavna ograničenja su da nema app login/rola/timova ni projektnih dozvola, ownership je slobodan tekst, fresh profile name tok nije dostupan u UI-u, sync progress je simuliran i sam sync nema lock/worker/full rollback, deo briefing/Figma/notification funkcija je nepotpun, Google Drive nije implementiran, storage je lokalni bez potvrđene produkcijske trajnosti i ne postoji automatizovani test suite.
