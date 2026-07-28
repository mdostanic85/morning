# Global CSS, typography and UI styling — implementation plan

Status: implementirano i verifikovano  
Datum: 28. jul 2026.  
Obuhvat: `src/app/globals.css`, design tokeni, heading sistem, Tailwind v4, HeroUI i
komponentni stilovi

Rezultat verifikacije:

- `globals.css` je sveden na import/cascade orchestration;
- CSS architecture provera je deo `npm run lint`;
- production build prolazi;
- 36 kombinacija ključnih ruta, light/dark tema i ciljnih širina je vizuelno provereno;
- keyboard focus, modal/drawer Escape i povratak fokusa su provereni u browseru.

Povezani dokument:

- `docs/typography.md` — pravila semantičke i vizuelne heading hijerarhije

---

## 1. Cilj

Cilj je da globalni styling sloj bude mali, predvidljiv i skalabilan, bez promene
postojećeg vizuelnog identiteta ili funkcionalnosti aplikacije.

Posle implementacije:

- `globals.css` je samo globalna ulazna tačka i ne sadrži stilove pojedinačnih stranica;
- aplikacija ima jedan vlasnički sistem design tokena;
- Tailwind i HeroUI imaju jasno odvojene odgovornosti;
- globalni cascade je eksplicitan i ne pobeđuje utility klase slučajno;
- page/component stilovi žive uz svoje vlasnike kroz CSS Modules;
- svaki interaktivni element ima vidljiv keyboard focus;
- heading semantika ostaje nezavisna od vizuelnog nivoa;
- mrtav CSS, neiskorišćeni tokeni i napuštene komponente su uklonjeni;
- light/dark, responsive i reduced-motion ponašanje ostaje stabilno.

Ovaj plan ne predlaže uklanjanje Tailwinda ili HeroUI-ja.

---

## 2. Verifikovano trenutno stanje

### 2.1 Globalni ulaz

`src/app/layout.tsx` jednom importuje `src/app/globals.css`, pa se ceo fajl učitava na
svakoj ruti.

`globals.css` trenutno ima približno:

- 3.189 linija;
- 78 KB izvornog CSS-a;
- 15,6 KB gzipovanog lokalnog sadržaja, bez ubačenog Tailwind/HeroUI izlaza.

Samo page-specific blokovi čine približno 56% fajla. Dodatnih približno 21% čine motion
pravila i HeroUI izmene.

### 2.2 Načini na koje aplikacija koristi globalni CSS

| Sloj | Trenutna uloga |
| --- | --- |
| `:root` / `[data-theme="dark"]` | Light/dark primitive i semantic tokeni |
| `@theme inline` | Mapiranje aplikacionih tokena na Tailwind utility klase |
| Base pravila | `html`, `body`, selection, focus, scroll i transition ponašanje |
| Shared primitive klase | `app-card`, `field`, `tag`, `eyebrow`, `type-heading-*` |
| Vendor overrides | HeroUI klase, semantic varijable i `data-slot` selektori |
| Page/component pravila | `brief-*`, `ni-*`, `meetings-*`, `chat-*`, `decide-*`, `minimal-*` |

### 2.3 Upotreba Tailwinda i HeroUI-ja

Tailwind-style `className` koristi 75 od 78 TSX fajlova. HeroUI se importuje u 45 TSX
fajlova, najviše za:

- `Button`;
- `Toast`;
- `Input` i `TextArea`;
- `Switch`;
- `Drawer`, `Modal` i `AlertDialog`;
- `Dropdown`, `Select`, `ListBox` i `Tabs`;
- `Tooltip`, `Chip`, `Skeleton` i `Card`.

Zaključak: oba sistema su aktivno korišćena. Uklanjanje jednog sada bi bila velika
migracija bez proporcionalne koristi.

### 2.4 Cascade

Lokalni CSS sadrži veliki broj nelayerovanih pravila i manji broj pravila u
`@layer components`.

Normalna nelayerovana pravila imaju prednost nad normalnim pravilima unutar cascade
layera. To znači da page-specific globalni selektor može neočekivano pobediti Tailwind ili
HeroUI pravilo.

Nisu pronađeni identični duplirani selektori. Glavni problem nije copy/paste duplikacija,
već ownership, mrtav kod, širina selektora i cascade prioritet.

---

## 3. Arhitektonske odluke

### Odluka A — Zadržati Tailwind i HeroUI

Odgovornosti moraju biti jasno podeljene:

| Sistem | Vlasništvo |
| --- | --- |
| Tailwind | Layout, grid/flex, spacing, responsive ponašanje, osnovna tipografija i token utilities |
| HeroUI | Pristupačne interaktivne primitive i kompleksno ponašanje |
| CSS Modules | Stilovi konkretnog ekrana ili komponente |
| App design tokeni | Jedini izvor boja, tipografije, radiusa, spacinga i motion vrednosti |

Ne praviti paralelne aplikacione `Button`, `Input`, `Modal`, `Select` ili `Dropdown`
primitive ako HeroUI već rešava potrebnu interakciju i accessibility.

HeroUI nije obavezan za statične wrapper elemente, layout kontejnere i jednostavne
dekorativne kartice.

### Odluka B — Aplikacija je vlasnik design tokena

HeroUI vrednosti se mapiraju na aplikacione semantic tokene. Ne održavati drugi, nezavisan
sistem boja, radiusa ili tipografije samo za HeroUI.

Komponente koriste semantic namenu:

- `background`, `surface`, `surface-raised`;
- `foreground`, `muted`;
- `border`, `border-strong`;
- `action-primary`, `danger`, `success`, `waiting`;
- `focus`;
- semantic spacing, radius i motion nivoe.

Naziv tokena ne treba da opisuje konkretnu komponentu ako vrednost deli više komponenti.

### Odluka C — Globalni CSS sadrži samo stvarno globalne ugovore

Globalno ostaju:

- Tailwind i HeroUI stylesheet importi;
- light/dark tokeni;
- Tailwind `@theme inline` mapiranje;
- minimalna base pravila;
- zajednički accessibility ugovori;
- mali broj stvarno deljenih aplikacionih primitiva;
- globalni HeroUI override fajl, odvojen i dokumentovan.

Stil koji ima jednog jasnog React vlasnika prelazi u CSS Module tog vlasnika.

### Odluka D — Semantika headinga je nezavisna od izgleda

`Heading` komponenta ostaje standard za aplikacione naslove:

```tsx
<Heading level={2} visualLevel={4}>
  Supporting sources
</Heading>
```

- `level` određuje `h1`–`h6` i dokument outline;
- `visualLevel` bira zajednički vizuelni tier;
- promena izgleda ne sme da menja semantički nivo;
- eyebrow, badge, metadata i običan label nisu heading elementi.

---

## 4. Ciljna struktura

```text
src/
  app/
    globals.css
    how-ai-works/
      page.module.css

  styles/
    tokens.css
    tailwind-theme.css
    base.css
    primitives.css
    motion.css
    vendor/
      heroui.css

  components/
    Heading.tsx
    Heading.module.css
    HumanReadableTodayView.module.css
    NeedsInputRail.module.css
    TodayMeetingsCard.module.css
    TaskChatPanel.module.css
    WelcomeModal.module.css
```

### Odgovornosti ciljnih fajlova

#### `src/app/globals.css`

- globalna ulazna tačka;
- import redosled;
- bez page-specific selektora;
- bez komponentnih keyframes koji imaju jednog vlasnika.

#### `src/styles/tokens.css`

- `:root`;
- `[data-theme="dark"]`;
- primitive i semantic tokeni;
- heading tokeni;
- bez selektora konkretnih komponenti.

#### `src/styles/tailwind-theme.css`

- samo `@theme inline`;
- mapiranje aplikacionih tokena na Tailwind utility API;
- bez novih nezavisnih vrednosti kada odgovarajući app token već postoji.

#### `src/styles/base.css`

- `html`, `body` i selection;
- normalizacija osnovnih elemenata;
- zajednički `:focus-visible`;
- globalno reduced-motion ponašanje;
- usko definisani scroll anchor ugovor.

#### `src/styles/primitives.css`

- samo klase sa više nepovezanih vlasnika;
- primeri: `app-card`, `field`, `tag`, `eyebrow`;
- klase moraju koristiti tokene, ne sirove boje.

#### `src/styles/motion.css`

- deljeni keyframes i opt-in motion helperi;
- nijedan transition samo zato što je element `button` ili `a`;
- komponentni keyframe ostaje u komponentnom modulu.

#### `src/styles/vendor/heroui.css`

- HeroUI semantic varijable;
- dokumentovani library class i `data-slot` override selektori;
- verzijska napomena za selektore koji zavise od internog HeroUI markup-a;
- dozvoljeni `!important` samo kada je potreban za vendor specificity i obrazložen komentarom.

#### CSS Modules

- lokalni layout, state i responsive stilovi;
- jedan glavni React vlasnik po modulu;
- nema oslanjanja na globalno jedinstvena imena klasa;
- globalne tokene koriste kroz `var(...)`.

---

## 5. Prioritetni problemi

### P0 — Keyboard focus

Trenutno globalno pravilo uklanja `outline` sa:

- `button`;
- `a`;
- `textarea`;
- `input`;
- `select`;
- `summary`.

Focus stil se ne vraća svim običnim native kontrolama.

Ciljni ugovor:

```css
:where(button, a, input, textarea, select, summary):focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

Komponenta sme da zameni ovaj stil samo ako ima drugi, najmanje jednako vidljiv focus
indikator. Ne uklanjati browser focus bez zamene.

### P0 — Neaktivan `MinimalTodayView`

`src/components/MinimalTodayView.tsx` nema pronađenog aktivnog import vlasnika.

Pre uklanjanja:

1. još jednom proveriti dynamic import, test/preview i feature-flag reference;
2. potvrditi da nije planiran fallback ekran;
3. ukloniti komponentu i samo njene ekskluzivne `minimal-*`/`ft-*` stilove;
4. ne uklanjati `ft-*` klase koje još koriste task i correction stranice.

### P0 — Mrtve klase i keyframes

Kandidati bez statičkih vlasnika:

- `step-in`;
- `btn`, `btn-sm`, `btn-primary`, `btn-outline`, `btn-quiet`;
- `health-dot`;
- `confidence-bar`;
- `focus-dots`;
- `reveal-init`, `reveal-up`, `reveal-left`, `reveal-right`;
- `table-row-shift`;
- povezani `step-in`, `health-pulse`, `confidence-load` i `reveal-*` keyframes.

Svaki kandidat se pre brisanja proverava i prema:

- dinamički sastavljenim klasama;
- vendor stylesheetu;
- testovima, pričama i dokumentacionim preview fajlovima.

### P1 — Preširoki globalni selektori

Potrebne korekcije:

- `[id]` zameniti sa naslovima/sekcijama koje su stvarni scroll anchor ili `.scroll-anchor`;
- globalni transition za svaki `button`, `a` i `summary` zameniti opt-in klasama;
- ukloniti `background-attachment: fixed` sa ravne body pozadine;
- preispitati globalni `button[data-slot="button"]`;
- dark tema ne sme da navodi spisak `brief-*`, `minimal-*` i drugih komponentnih klasa.

Za dark temu komponente treba da čitaju surface/border tokene umesto da tema zna njihova
imena.

### P1 — HeroUI specificity

Sve HeroUI izmene izdvojiti pre veće komponentne migracije. Posebno proveriti:

- `.button--primary`;
- `.tabs__list-container`;
- `.tabs__indicator`;
- `button[data-slot="button"]`;
- `.chat-composer` pravila koja koriste `!important`.

`src/components/FigmaValidateButton.tsx` treba da importuje Button iz
`@heroui/react/button`, umesto barrel importa iz `@heroui/react`.

---

## 6. Token i typography korekcije

### 6.1 Heading tokeni

Zadržati postojeće H1–H6 tokene za:

- font family;
- fluid/static font size;
- weight;
- line height;
- letter spacing.

Heading visual klase premestiti u `Heading.module.css`, dok vrednosti ostaju u
`tokens.css`.

Semantičke uloge:

| Nivo | Uloga |
| --- | --- |
| H1 | Naslov stranice ili view-a; normalno jedan po stranici |
| H2 | Glavna sekcija unutar stranice |
| H3 | Podsekcija unutar H2 |
| H4 | Ugnježdena grupa ili panel |
| H5 | Naslov kartice ili dublje podsekcije |
| H6 | Najdublja smislena podsekcija, ne eyebrow zamena |

Document outline ne preskače nivo proizvoljno. Komponenta koja može da se pojavi na više
dubina prihvata semantic `level` prop.

### 6.2 Font tokeni

`--font-mono` trenutno mapira Inter i nije monospaced.

Izabrati jedno:

1. uvesti pravi mono font za ID-jeve, timestamps i tehničke vrednosti; ili
2. preimenovati vizuelnu ulogu u `font-utility` i dodati `font-variant-numeric:
   tabular-nums` tamo gde je potreban stabilan numeric alignment.

Ne ostavljati naziv `mono` ako rezultat nije monospaced.

### 6.3 Text skala

`text-xs` i `text-sm` su oba 14px. Minimum od 14px je poželjan za operativne informacije,
ali ne treba menjati značenje cele Tailwind skale i HeroUI tipografije.

Predlog:

- vratiti različite `xs` i `sm` u framework skali;
- dodati proizvodni `text-caption`/`text-metadata` token sa minimalno 14px gde čitljivost
  ima prednost;
- ne koristiti sitniji tekst za greške, blocking state, ključne dokaze i akcije.

### 6.4 Radius skala

Trenutno su `lg`, `xl` i `2xl` praktično isti, dok komponente koriste mnoge proizvoljne
vrednosti.

Ciljna semantic skala:

| Token | Namena |
| --- | --- |
| `radius-control` | Input, button i kompaktna kontrola |
| `radius-inset` | Unutrašnji panel ili grouped content |
| `radius-card` | Standardna kartica |
| `radius-hero` | Velika/primarna površina |
| `radius-pill` | Chip, badge i pill kontrola |

Konačne vrednosti se biraju iz renderovanog baseline-a, zatim se arbitrary radius vrednosti
migriraju na tokene.

### 6.5 Color tokeni

- `--pink` je u light temi ljubičast; preimenovati ga u `violet` ili uskladiti hue;
- ispraviti zastareli komentar koji opisuje prethodnu foreground vrednost;
- raw boja van token fajla dozvoljena je samo za jasno dokumentovan izolovani slučaj;
- zadržati postojeće kontrastne odnose koji trenutno prolaze normalne text pragove.

### 6.6 Kandidati za uklanjanje

Proveriti i ukloniti kada nemaju runtime/vendor potrošača:

- `--sync-sweep-2`;
- `--sync-sweep-3`;
- `--today-card-radius`;
- `--today-card-padding`;
- `--today-card-padding-mobile`;
- `--motion-control`;
- `--motion-surface`;
- `--motion-slow`;
- `--glow-dawn`.

Tokeni kao `--surface-shadow` mogu biti implicitni HeroUI ugovor i ne brišu se samo zato
što nema lokalnog `var(--surface-shadow)` poziva.

---

## 7. Faze implementacije

Svaka faza mora da ostavi aplikaciju buildabilnom. Ne raditi jedan veliki rewrite.

### Faza 0 — Baseline i zaštita od regresije

Zadaci:

1. Sačuvati light/dark screenshot baseline za ključne rute:
   - `/`;
   - `/settings`;
   - `/projects`;
   - jedna project detail ruta;
   - `/knowledge`;
   - `/how-ai-works`.
2. Snimiti širine 1440px, 1024px i 390px.
3. Evidentirati:
   - focus state;
   - modal/drawer/dropdown;
   - loading/skeleton;
   - empty/error state;
   - reduced-motion ponašanje.
4. Pokrenuti postojeći lint i production build.

Done:

- baseline postoji lokalno i nije commitovan ako sadrži poslovne podatke;
- poznate postojeće greške su zapisane i neće se pogrešno pripisati migraciji.

### Faza 1 — Accessibility i bezbedni globalni popravci

Zadaci:

1. ukloniti blanket `outline: none`;
2. dodati zajednički `:focus-visible`;
3. suziti `[id]` scroll-margin pravilo;
4. ukloniti globalne element transitions;
5. ukloniti nepotreban body `background-attachment: fixed`;
6. proveriti native i HeroUI kontrole tastaturom.

Done:

- Tab fokus je vidljiv na svakoj interaktivnoj kontroli;
- modal i drawer zadržavaju focus trap;
- Escape i povratak fokusa rade kao pre;
- light/dark focus kontrast je dovoljan.

### Faza 2 — Mrtav kod

Zadaci:

1. potvrditi status `MinimalTodayView`;
2. ukloniti potvrđeno neaktivnu komponentu i ekskluzivni CSS;
3. ukloniti potvrđene mrtve klase/keyframes;
4. ukloniti potvrđene neiskorišćene tokene;
5. ponoviti statičku pretragu nakon brisanja.

Done:

- nema uklonjene klase koja se sastavlja dinamički;
- lint i production build prolaze;
- ključne rute vizuelno odgovaraju baseline-u.

### Faza 3 — Globalna struktura i cascade

Zadaci:

1. kreirati `src/styles/` ciljnu strukturu;
2. premestiti tokene bez promene vrednosti;
3. premestiti `@theme inline` bez promene utility API-ja;
4. premestiti base, primitives i motion pravila;
5. uvesti eksplicitne cascade layere kompatibilne sa Tailwind/HeroUI redosledom;
6. ostaviti `globals.css` kao kratku ulaznu tačku.

Važno: ovo je mehanička faza. Ne menjati istovremeno token vrednosti i lokaciju pravila,
jer bi regresije bile teže za izolovanje.

Done:

- utility klase i HeroUI stilovi imaju isti rezultat kao baseline;
- `globals.css` više nema velike implementacione blokove;
- nema nedokumentovanih nelayerovanih aplikacionih pravila.

### Faza 4 — HeroUI vendor izolacija

Zadaci:

1. premestiti sve HeroUI override selektore u `styles/vendor/heroui.css`;
2. uz interni selector navesti komponentu i razlog;
3. suziti `button[data-slot="button"]` ili zameniti opt-in klasom gde ponašanje nije
   univerzalno;
4. dokumentovati preostale `!important`;
5. ispraviti barrel import u `FigmaValidateButton`;
6. proveriti HeroUI komponente kroz sve state varijante.

Done:

- globalna HeroUI zavisnost je na jednom mestu;
- update HeroUI-ja može da se proveri pregledom jednog vendor fajla;
- nema nenamernog pill/motion ponašanja na svakoj Button instanci.

### Faza 5 — Page/component CSS Modules

Migrirati u malim, odvojenim koracima:

1. `WelcomeModal` / `welcome-beam`;
2. `TaskChatPanel` / `chat-*`;
3. `NeedsInputRail` / `ni-*`;
4. `TodayMeetingsCard` / `meetings-*`;
5. `HumanReadableTodayView`, `BlockedWaitingCard`, `DismissibleDayChange` / `brief-*`;
6. `/how-ai-works` / `decide-*`;
7. `Heading` / `type-heading-*`.

Za prefiks koji trenutno ima više vlasnika:

- odrediti kompozicionog vlasnika;
- mali deljeni deo ostaviti u primitives samo ako je stvarno generičan;
- ostalo podeliti po modulima;
- ne koristiti `:global(...)` kao trajni izlaz iz migracije.

Done za svaki korak:

- globalni prefiks više ne postoji;
- responsive, dark i interaction state odgovaraju baseline-u;
- modul se importuje samo uz svog React vlasnika;
- production build prolazi pre prelaska na sledeći prefiks.

### Faza 6 — Token normalizacija

Tek nakon strukturne migracije:

1. ispraviti color nazive i zastarele komentare;
2. doneti odluku za mono/utility font;
3. razdvojiti `xs`, `sm` i product metadata uloge;
4. uvesti semantic radius skalu;
5. svesti motion vrednosti na jasne nivoe;
6. zameniti ponovljene raw vrednosti tokenima;
7. ponovo proveriti light/dark kontrast.

Done:

- nema različitih značenja pod istim tokenom;
- nema više tokena sa istom vrednošću bez semantičkog razloga;
- proizvoljne vrednosti postoje samo uz dokumentovano obrazloženje.

### Faza 7 — Enforcement i dokumentacija

Dodati ili podesiti Stylelint/CI provere:

- raw colors van `tokens.css`;
- `!important` van `styles/vendor/`;
- nedozvoljeni globalni class pattern;
- preširoki element/attribute selektori;
- duplikat selektori;
- prazna pravila;
- pogrešan cascade layer;
- CSS Module naming i import greške.

Dopuniti dokumentaciju:

- `docs/typography.md` ostaje canonical heading uputstvo;
- README ili kratki `src/styles/README.md` opisuje gde ide novi stil;
- zabeležiti pravilo za HeroUI upgrade proveru.

Done:

- nova komponenta može jednoznačno da odredi gde joj pripada stil;
- CI sprečava vraćanje istih globalnih problema.

---

## 8. Validaciona matrica

### Automatske provere

- TypeScript/lint prolazi;
- production build prolazi;
- nema CSS parse greške;
- nema import cycle-a;
- nema uklonjenih referenci;
- nema novih warninga vezanih za hydration ili React keys.

### Vizuelne provere

Za light i dark temu proveriti:

- 1440px desktop;
- 1024px tablet;
- 390px mobile;
- normalan i dug sadržaj;
- hover, active, focus-visible, disabled, loading, success i error;
- modal, drawer, dropdown, select, tabs i tooltip;
- page loading/skeleton;
- reduced motion.

### Heading provere

Na svakoj ključnoj ruti:

- normalno jedan H1;
- H2–H6 prate stvarnu strukturu sadržaja;
- nema biranja heading taga zbog veličine;
- nema proizvoljnog preskakanja nivoa;
- komponenta na promenljivoj dubini prihvata `level`;
- drugačiji izgled se dobija kroz `visualLevel`.

### Accessibility provere

- kompletan glavni tok je dostupan tastaturom;
- fokus je uvek vidljiv;
- modal/drawer pravilno zaključava i vraća fokus;
- nema informacije dostupne samo kroz boju;
- body i muted tekst zadržavaju potreban kontrast;
- reduced-motion uklanja neesencijalno pomeranje bez skrivanja state promene.

---

## 9. Rizici i način kontrole

| Rizik | Kontrola |
| --- | --- |
| Promena cascade reda menja izgled velikog broja komponenti | Prvo mehaničko premeštanje bez menjanja vrednosti; validacija po fazi |
| CSS Module promeni specificity | Migracija jednog prefiksa, pa screenshot/build provera |
| HeroUI interni selector se promeni pri upgrade-u | Izolovan vendor fajl i komentar uz svaki interni hook |
| Brisanje dinamički sastavljene klase | Statička i runtime pretraga pre brisanja |
| Dark tema zavisi od komponentnih selektora | Prvo uvesti semantic surface/border tokene |
| Token cleanup promeni Tailwind/HeroUI rezultat | Token normalizacija tek nakon strukturne migracije |
| Focus fix napravi dvostruki ring | Zajednički fallback; komponentno uklanjanje samo uz vidljivu zamenu |

---

## 10. Definition of Done

Implementacija je završena kada:

- `globals.css` sadrži samo globalni orchestration;
- page/component stilovi imaju jasnog vlasnika;
- Tailwind, HeroUI i CSS Modules imaju dokumentovane granice;
- HeroUI override pravila su izolovana;
- nema blanket outline reset-a;
- sve kontrole imaju vidljiv focus;
- nema potvrđenog mrtvog CSS-a iz ovog audita;
- tokeni imaju jednoznačna imena i uloge;
- H1–H6 semantic i visual hijerarhija ostaje odvojena;
- light/dark i tri ciljne širine prolaze vizuelnu proveru;
- lint i production build prolaze;
- dokumentacija i CI pravila sprečavaju povratak problema.

---

## 11. Kratki implementation checklist

- [x] Sačuvati vizuelni baseline.
- [x] Popraviti globalni focus ugovor.
- [x] Suziti globalne element/attribute selektore.
- [x] Potvrditi i ukloniti `MinimalTodayView`, ako je napušten.
- [x] Ukloniti potvrđeno mrtve klase, keyframes i tokene.
- [x] Kreirati `src/styles/` strukturu.
- [x] Razdvojiti tokens, Tailwind theme, base, primitives i motion.
- [x] Uvesti kontrolisane cascade layere.
- [x] Izdvojiti HeroUI override fajl.
- [x] Suziti univerzalne HeroUI override selektore.
- [x] Migrirati page/component prefikse u CSS Modules.
- [x] Premestiti Heading klase u `Heading.module.css`.
- [x] Normalizovati font, text, radius, color i motion tokene.
- [x] Dodati CSS architecture/CI zaštitu.
- [x] Proveriti light/dark, responsive, keyboard i reduced-motion.
- [x] Pokrenuti lint i production build.
