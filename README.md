# GeoPrzygoda 🌍

Aplikacja geograficzna na Androida z mapą świata, polskimi opisami państw i quizem. Działa offline, bez konta i reklam.

## Pobierz aplikację

Instalatory **GeoPrzygoda.apk** pojawiają się w [Releases](https://github.com/mpuchara/geoprzygoda/releases) po poprawnym zbudowaniu projektu.

1. Otwórz najnowsze wydanie i pobierz **GeoPrzygoda.apk** na telefon.
2. Otwórz pobrany plik w Chrome, aplikacji „Moje pliki” lub Cx File Explorer.
3. Wybierz **Zainstaluj**. Jeśli Android poprosi o zgodę na instalację z tej aplikacji, dotyczy ona wybranego źródła pobranego APK.

Po instalacji na liście aplikacji pojawi się ikona **GeoPrzygoda**. Nie trzeba otwierać pliku HTML.

Wymagany Android 8.0 lub nowszy. Aplikacja jest przeznaczona między innymi do telefonów Samsung z One UI.

## Jak działa gra

- Kolorowy ekran z pytaniem o pseudonim wjeżdża od dołu.
- **Wyślij** zapisuje nazwę na tym urządzeniu, a **Pomiń** pozwala grać jako gość.
- Mapa świata wsuwa się z prawej strony i zajmuje ekran aplikacji.
- Dotknięcie państwa pokazuje flagę, opis, stolicę i inne informacje.
- Mapę można przesuwać i powiększać dwoma palcami. Małe państwa można też znaleźć w wyszukiwarce.
- Dokładniejsze granice Natural Earth 1:50m i odwzorowanie Merkatora zachowują naturalne proporcje Polski. Widok świata i zbliżenie kraju mają większy margines.
- Quiz polega na wskazywaniu krajów na mapie. Dostępne są podpowiedzi i kolejne próby, bez limitu czasu.
- Przycisk lub gest Wstecz zamyka opis, wyszukiwanie albo pomoc przed wyjściem z aplikacji.

## Dokładniejsza Holandia 🇳🇱

Na zbliżeniu Holandii mapa korzysta z dokładniejszych granic **Natural Earth 1:10m**
(zamiast 1:50m): lepiej odwzorowuje wybrzeże Morza Północnego, Wyspy Fryzyjskie,
ujścia rzek oraz wyspy i zatoki Zelandii. Sąsiednie Belgia i Niemcy otrzymują
dane z tej samej skali, aby ich granice były dopasowane.

Szczegółowe ścieżki SVG są zapisane lokalnie w `app/src/main/assets/benelux-10m.json`
i nakładane na istniejące obrysy krajów. Nie zmieniają flag, nazw, informacji,
oznaczeń ani mechaniki rywalizacji; gra nadal działa offline.

## Szczegółowe granice wszystkich krajów 🌍

Podczas budowania APK pobierany jest publiczny zestaw **Natural Earth 1:10m**
i zamieniany na lokalną warstwę SVG `world-detail-10m.json` dla ponad 220
mapowanych państw i terytoriów. Podczas oddalenia gry zachowujemy płynny,
lżejszy podkład 1:50m. Po zbliżeniu mapy wczytywane są dokładniejsze
wybrzeża, wyspy i granice krajów widocznych na ekranie.

Warstwa jest generowana poleceniem:

```sh
python3 scripts/build_world_detail.py
```

Plik `app/src/main/assets/world-detail-10m.json` jest budowany automatycznie
w GitHub Actions przed sprawdzeniem i złożeniem APK, dlatego zainstalowana
aplikacja działa w pełni **offline**. Kilka specjalnych małych obszarów bez
odpowiedników w Natural Earth 1:10m używa dotychczasowego obrysu 1:50m.
Flagi, muzyka, nazwy, quiz, rywalizacja i zapisane bitwy nie są zmieniane.

## Budowanie

Projekt korzysta z Java 17, Gradle 8.11.1, Android Gradle Plugin 8.9.2 i SDK 35.

```sh
python3 scripts/check_assets.py
./gradlew :app:assembleDebug :app:lintDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.

GitHub Actions automatycznie buduje projekt po zmianach w `main`, uruchamia Android lint i udostępnia APK w Releases. Wydania mają numer `1.0.<numer uruchomienia>`. Są to podpisane kluczem debug wydania testowe; wdrożenie do Google Play wymaga osobnego klucza wydawniczego. Pamięć podręczna Actions zachowuje klucz debug między kompilacjami, o ile nie zostanie usunięta.

## Struktura i dane

- `app/src/main/assets/index.html` — kompletna gra, mapa i opisy.
- `app/src/main/java/pl/mpuchara/geoprzygoda/MainActivity.java` — pełnoekranowa aplikacja na Androida.
- `data/countries.json` — wykorzystany zestaw informacji geograficznych.
- `data/world-50m.json` — dołączone granice Natural Earth 1:50m (domena publiczna).
- `scripts/build_map.py` — odtwarzanie mapy i wszystkich współrzędnych poleceniem `python3 scripts/build_map.py`, bez pobierania danych.
- `.github/workflows/android.yml` — budowanie i udostępnianie APK.

Gra jest dołączona do APK i ładowana lokalnie przez AndroidX WebViewAssetLoader. Manifest nie żąda dostępu do internetu, lokalizacji, aparatu ani kontaktów. Linki do źródeł otwierają się w zewnętrznej przeglądarce.

Kod aplikacji jest na licencji MIT. Dane pochodzą z Natural Earth (domena publiczna) i mledoze/countries (ODbL 1.0). Szczegóły znajdują się w [NOTICE.md](NOTICE.md) oraz [LICENSES/DATA_ODBL.md](LICENSES/DATA_ODBL.md).


## Relaksujące odkrywanie i rywalizacja

- **Ustawienia ⚙**: można włączyć lub wyłączyć flagi na mapie oraz spokojne dźwięki tła i ustawić ich głośność. Preferencje są zapisywane lokalnie. Muzyka jest generowana przez Web Audio, bez pobierania plików i bez automatycznego odtwarzania przed interakcją użytkownika.
- W opisach krajów przycisk **Więcej ciekawostek** pokazuje dodatkowe informacje z atlasu, m.in. region, status, kod kraju, liczbę sąsiadów i porównanie wielkości z Polską.
- **Rywalizacja 🏁** to fikcyjna gra porównująca powierzchnię i liczbę sąsiadów. Zawiera wybór drugiego kraju oraz utrudnień. Nie używa danych wojskowych i nie przewiduje rzeczywistych konfliktów.
- Nowe elementy mieszczą się w osobnych plikach \`features.js\` i \`features.css\`; mapa pozostaje generowana bez zmian przez \`scripts/build_map.py\`.

## Flagi w kształtach państw i muzyka

- Po włączeniu flag ich barwy wypełniają dokładne granice krajów na mapie, zamiast pojawiać się jako małe emoji. Nazwy państw są czytelne na flagach. W quizie wraca zwykłe kolorowanie odpowiedzi.
- Wszystkie 238 flag SVG są dołączone do APK w katalogu \`app/src/main/assets/flags/\` i działają bez internetu.
- Na dolnym pasku jest bezpośredni przycisk **🎵/🎶** do włączania i wyłączania łagodnej melodii, a w Ustawieniach pozostaje suwak głośności.
- Ekran wyboru nazwy nie narzuca już przykładowego nicku w polu.


## Kampania podbojów i Historia 🏰

Po kliknięciu państwa otwórz **Rywalizacja** i wybierz **Start: Kampania podbojów**. Wskaż sąsiednie państwo na mapie lub w wyszukiwarce i naciśnij **Rozpocznij natarcie**. Na mapie widać symboliczny marsz od granicy w kierunku stolicy, a potem rozchodzące się nieregularne obszary podboju. Dla Polski atakującej Białoruś animacja rusza z okolic Białegostoku w kierunku Mińska. Dla innych państw kierunek i przebieg frontu są inne; gdy obrona wygra, obszary podboju stopniowo znikają.

Kolorowana animacja jest ograniczona prawdziwym kształtem granic państwa, a nie pionowym paskiem. Jest to wyłącznie **fikcyjna animacja gry**, nie dokładna mapa działań wojskowych ani prowincji. Zwycięstwo zmienia barwy zdobytego kraju na barwy państwa gracza. Można potem zdobywać kolejne tereny graniczące z posiadanymi.

**Historia** zapisuje przebieg gry lokalnie na telefonie; można wznowić rozgrywkę. W Historii jest również scenariusz **Rzeczpospolita Obojga Narodów**: w uproszczonej zabawie Polska i Litwa zaczynają jako jeden sojusz, a celem jest zdobycie obszarów Białorusi i Ukrainy na współczesnej mapie. Nie jest to historyczna rekonstrukcja granic ani prawdziwa symulacja walk. Podbijamy całe kraje, ponieważ atlas nie zawiera prowincji.

Punkty oddziałów są liczbami wymyślonymi do zabawy; gra nie używa statystyk wojskowych. Wszystkie efekty działają offline, bez dostępu do internetu i bez konta.

## Flagi Francji, Stanów Zjednoczonych i Australii

Każda geograficznie oddzielona część tych państw ma teraz własne dopasowanie flagi w swoich dokładnych granicach. To poprawia wygląd Francji europejskiej (niezależnie od Gujany Francuskiej), kontynentalnych USA (niezależnie od Alaski i Hawajów), a także kontynentalnej Australii (niezależnie od Tasmanii). Wszystkie części państwa nadal działają wspólnie w trybie podbojów.

## Rywalizacja w kolorach startowych

Rywalizacja ma kolorowe, animowane tło w kolorach startowego ekranu. Na ekranie wybranego państwa i przeciwnika widać proste, prostokątne flagi SVG z lokalnego katalogu `flags/`. Do wyboru przeciwnika służy **Szukaj państwa** (nazwa, stolica lub kod ISO), a podczas Bitwy o terytoria podobna wyszukiwarka pokazuje wyłącznie sąsiadujące dostępne tereny. Działa offline.


## Sektory podbijane w czasie natarcia

Na filmie wzorcowym podbój nie jest pojedynczą pionową kreską: wzdłuż marszu przejmowane są małe obszary. Dlatego do **istniejącej animacji w stronę stolicy** dodano małe nieregularne sektory na mapie. Ich przejęcie następuje falami, najpierw przy trasie oddziału, potem w pobliżu stolicy. Gdy bitwa się kończy, zachowane są te same zasady, co wcześniej: wygrana zdobywa całe państwo, przegrana cofa front. Panel bitwy pozostaje zmniejszony w czasie animacji.

Podziały sektorów są generowane do zabawy i nie stanowią prawdziwych granic województw, prowincji ani powiatów.


## Flagi bez rozciągania symboli 🇹🇷 🇸🇦

Turcja ma teraz czerwone tło na całym swoim obszarze, ale półksiężyc i gwiazda nie są rozciągane poziomo. Podobnie flaga Arabii Saudyjskiej zachowuje proporcje napisu i miecza na zielonym tle. Wzory dopasowują się także do szczegółowej mapy świata Natural Earth 1:10m po przybliżeniu. Funkcja działa w Rywalizacji i po wyjściu z bitwy; granice państw nie są zmieniane przez tę poprawkę.

## Dwie rozmowy, wspólny kod

Przy rozwijaniu GeoPrzygody w dwóch rozmowach wspólnym źródłem jest repozytorium GitHub **mpuchara/geoprzygoda**. Każdą nową poprawkę zaczynamy od aktualnego `main`, wykonujemy na odrębnej gałęzi i łączymy dopiero po testach i sprawdzeniu, czy nie pojawiły się nowe commity z drugiej rozmowy. Nowy APK publikowany z `main` zawiera połączone poprawki (np. Turcji i Holandii) i nie nadpisuje innych zmian. Rozmowy nie mają automatycznej komunikacji między sobą — współdzielą repozytorium.

## Wygląd podboju wzorowany na nagraniu z gry strategicznej

Obszary w bitwie są podzielone na **fikcyjne nieregularne sektory** zamiast prostokątów i prostych linii Voronoi. Sektory mają wspólne, dopasowane do siebie łamane brzegi i są przejmowane kolejno od granicy w kierunku stolicy, dzięki czemu podbój przypomina stopniowe przejmowanie prowincji. Podczas bitwy na dole jest wąski pasek postępu pokazujący liczbę zajętych sektorów, tak aby mapa pozostała widoczna.

Geograficzne **granice państw nadal pochodzą z Natural Earth 1:10m**, a nie z nagrania. Szczegółową warstwę włączamy wcześniej podczas przybliżania (dla szerokości widoku do 680 jednostek mapy). Podziały wewnątrz celu to tylko **fikcyjne sektory rozgrywki**, nie rzeczywiste województwa czy prowincje.

Symbole na wybranych flagach (m.in. Turcja, Arabia Saudyjska, USA, Australia, Francja, Kanada, Brazylia, Indie, Japonia, Chiny) mają zachowane proporcje. Poprawne dopasowanie obejmuje również barwy zwycięzcy podczas podboju innych krajów. Mechanika została zaprojektowana na podstawie opisu zachowania gry referencyjnej, bez kopiowania jej zasobów graficznych.

## Plan nr 3 — kontrola wszystkich flag 🇳🇱 🇦🇹 🇦🇺

Porównano **238 z 238** lokalnych flag SVG po identyfikatorach blob Git SHA-1
ze źródłem [lipis/flag-icons](https://github.com/lipis/flag-icons) (`flags/4x3`,
commit `ac7e0eb3259eb62aa6100c435607e2fe03896a97`).
Wszystkie 238 plików są identyczne z odpowiednimi oryginałami. W bazie
występuje 238 unikalnych, mapowanych kodów ISO alpha-2, bez braków.
Weryfikacja ta jest powtarzana offline na GitHub Actions przez
`python3 scripts/check_flags.py`, z przypiętym wzorcem
`scripts/flag_reference.json`, który zabezpiecza zarówno zawartość flag,
jak i przypisania ISO alpha-3 → alpha-2.

**Wykryta przyczyna złego wyglądu:** nie podmiana flag, lecz rozciąganie
obrazów na nieregularnych kształtach państw. Teraz symbole w flagach mają
zachowane proporcje przez wzory SVG `userSpaceOnUse` i skalowanie
`xMidYMid meet` lub `xMidYMid slice`. Wyjątek stanowią
proste pasy bez herbów i gwiazd (np. Holandia, Austria, Francja), które
można wypełnić bez zniekształcenia wzoru. Symbole mieszczą się w granicach
państwa, a po wczytaniu granic 1:10m dopasowanie jest przeliczane.

Przy `slice` bardzo nietypowy kształt kraju może przyciąć brzegi flagi,
ale nie zniekształca samych znaków. Niektóre wysepki są tak małe, że
nie da się na nich dostrzec całego rysunku flagi bez większego przybliżenia.

Do sprawdzania wyglądu źródłowych flag na komputerze lub telefonie
generowana jest samodzielna galeria
`python3 scripts/build_flag_gallery.py flag-gallery.html`.
Plik `flag-gallery.html` jest publikowany razem z APK w wydaniach gry.
Galeria nie zastępuje sprawdzania flag na kształtach państw w telefonie.

Dodatkowa kontrola palety wykryła dziewięć przybliżonych kolorów tła
w nakładkach flag z symbolami (USA, Australia, Brazylia, Chiny, Nowa
Zelandia, Wielka Brytania, Pakistan, Albania, Szwajcaria). Zostały
zamienione na dokładne wartości barw znajdujące się w źródłowych SVG.
Test `scripts/check_flags.py` sprawdza również te dziewięć kolorów.

## Audyt renderowania flag (zadanie #17)

Po audycie 238 plików SVG dodano test prawdziwego renderera **Chromium** (`scripts/check_flag_render.cjs`) wykonywany na tym samym lokalnym HTML, JavaScript i mapie SVG, które trafiają do APK. Test sprawdza mapowanie ISO do obrazu w każdym renderowanym kraju i jego wyspach, rozmiar wzorca wobec aktualnego `getBBox()`, zachowanie proporcji przy zoomie, przełączanie flag oraz flagę zwycięzcy w trybie podboju. Weryfikuje m.in. Holandię, Austrię, Francję, USA, Australię, Turcję i Wielką Brytanię.

GitHub Actions publikuje osobny artefakt `GeoPrzygoda-Flag-Map-Render` ze zrzutami mapy, zbliżeniami i raportem JSON. Jest to realny test w przeglądarce oraz materiał do **ręcznej** oceny, lecz nie jest równoważny testom na fizycznym Android WebView; te należy wykonać po instalacji APK. Nie uznajemy samego testu obecności 238 flag za wizualne potwierdzenie 238 flag.

## Rozwiązanie #17 — flagi na prawdziwych konturach bez rozciągania

Po audycie 238 oryginalnych SVG poprawiono mapowanie **każdego**
widocznego konturu: `objectBoundingBox` usunięto z flag na mapie,
a każda flaga jest teraz dopasowywana w `userSpaceOnUse`.
Pierwszy fragment kraju zachowuje historyczny identyfikator
`flag-pattern-<ISO3>`, ale nie jest już wzorem obiektowym.
Pozostałe fragmenty (wyspy i oddzielne regiony) mają własne dopasowanie.

* Flagi z godłami, półksiężycami, gwiazdami i krzyżami używają
  `meet` albo `slice`, bez deformacji symboli.
* Wyłącznie sprawdzone proste flagi pasiaste (np. Austria, Holandia,
  Francja) mogą używać `preserveAspectRatio=none`, aby zachować pasy.
* Wzory przeliczają się po wczytaniu 1:10m, podczas przełączania
  flag, quizu oraz w trybie podbojów.

Do testów istniejących od zgłoszenia #17 dołączono walidację,
że **żadna flaga** nie używa `objectBoundingBox` na mapie,
oraz kolejne zrzuty z zoomu małych krajów i wysp.
Testy przeglądarkowe na Chromium nie są testami ręcznymi
na Samsungu/Android WebView.

## Plan nr 4 — bitwy z prawdziwymi granicami prowincji 🌍⚔️

- Przy tworzeniu APK skrypt `scripts/build_provinces.py` pobiera przypięte dane **Natural Earth Admin-1 1:10m** i zapisuje lokalny plik `world-provinces-10m.json` dla mapy bitew. Aplikacja na telefonie nie potrzebuje Internetu.
- Jeśli kraj ma podział Admin-1 w danych, podczas bitwy widać **rzeczywiste obrysy regionów**, a front przejmuje kolejne regiony w kierunku stolicy. Przy ataku Polski na Białoruś marsz zaczyna się przy Białymstoku i zmierza ku Mińskowi. Udział zdobytego obszaru na pasku liczony jest na podstawie powierzchni zaznaczonych regionów w odwzorowaniu mapy.
- Dla wysp i mikropaństw bez danych Admin-1 gra nadal działa, wyświetlając wyraźnie oznaczone **umowne sektory**. Granice państw są zawsze zachowywane przez przycinanie nakładek do oryginalnego konturu.
- Dolny pasek bitwy zawiera **dwie prawdziwe flagi SVG**, procent podboju, **Pauza/Wznów** i prędkość **1×/2×/4×**. Przytrzymanie pauzy zatrzymuje czas przebiegu bitwy, nie tylko grafikę.
- W Rywalizacji można wybrać **1 na 1**, **Sojusze** (sąsiad jako sprzymierzeniec) albo **Losowe wyzwanie** (losowany sąsiad). Cała punktacja sił i skuteczności pozostaje fikcyjna.
- W każdej turze zwycięstwo wciąż przypisuje cały pokonany kraj po zakończeniu stopniowej animacji. **Nie ma jeszcze trwałego zapisu pojedynczych zdobytych prowincji między turami**.
- Dane Natural Earth Admin-1 nie obejmują każdej jednostki administracyjnej na świecie, a niektóre granice mogą być generalizowane; wynik podboju to gra, nie odwzorowanie prawdziwych konfliktów.
- Flagi pozostają tymi samymi 238 plikami SVG, z testami zgodności ISO oraz poprawionymi proporcjami z Planu nr 3. Testy automatyczne nie zastępują oględzin w Android WebView.


## Plan nr 5 — stabilne kolory i płynna mapa na Androidzie 🌍⚡

- **Kolor kraju nigdy nie znika**: każda flaga na mapie ma pod spodem zwykły kolor kraju. Jeśli obraz flagi nie zostanie narysowany w Android WebView, widać bezpieczne tło.
- Flagi nadal odpowiadają 238 oryginalnym plikom ISO SVG, ale na mapie wyświetlane są **lekkie tekstury PNG 256×192**, generowane z tych samych SVG w czasie budowania APK. Źródłowe flagi SVG pozostają bez zmian.
- Widok świata korzysta z lekkiej geometrii **Natural Earth 1:50m**. Po przybliżeniu do kraju wczytywana jest wyłącznie potrzebna geometria **1:10m**, a po oddaleniu oryginalne ścieżki 1:50m są przywracane.
- Mapa pobiera mały indeks krajów i osobne pliki granic dla widocznych państw. Aktualizacja odbywa się po krótkim zatrzymaniu gestu i najwyżej dla kilku państw na raz; przeliczenia SVG są buforowane.
- Bitwa wczytuje wyłącznie prowincje atakowanego kraju. Przed poprawką pobierała wielomegabajtową geometrię wszystkich państw naraz; teraz pamięć przechowuje najwyżej dwa ostatnie kraje.
- Animacja bitwy ogranicza odświeżanie do ok. 30 klatek/s i nie przebudowuje ogromnego kształtu zajętych prowincji, dopóki nie zmieni się faktyczna granica.
- Nadal działają muzyka, quiz, wybór flag, tryby rywalizacji i pozostałe poprawki Planów 3 i 4. Nie wprowadzono nowego trybu gry.
- Automatyczne testy sprawdzają zgodność 238 flag, obecność bezpiecznego koloru, zmianę zoomu i przywrócenie 1:50m. Rzeczywistą płynność i wygląd w Android WebView trzeba dodatkowo ocenić na telefonie.


## Plan nr 6 — encyklopedia i historia państw (offline)

- Dla wszystkich **251 państw i terytoriów** są osobne, małe pliki JSON w katalogu `app/src/main/assets/encyclopedia/`. Wczytujemy wyłącznie otwarty kraj, nie wszystkie opisy naraz. W pamięci przeglądarki trzymamy maksymalnie 8 ostatnich rekordów.
- Dane obejmują dostępne nazwy stolic, powierzchnię, kontynent, waluty (246 pozycji), języki (249), dostęp do morza (249) i ludność z **2024 r.** (215 pozycji). Długości granic, wybrzeża i wybrane ukształtowanie terenu prezentujemy wyłącznie tam, gdzie mamy wiarygodne źródło (np. Polska, GUS); nie obliczamy długości z mapy 1:50m.
- W opisie jest przycisk **🏰 Jak było dawniej?**. Dla Polski, Niderlandów, Niemiec, Francji, USA i Austrii dostępna jest przesuwana palcem oś czasu z dawnymi nazwami, ustrojami i postaciami historycznymi. Pokazujemy historyczne flagi wyłącznie tam, gdzie da się potwierdzić wygląd i okres ich użycia. Brak zweryfikowanych historycznych wielokątów = brak fikcyjnych granic na mapie.
- Zakładka faktów oraz historia są tworzone dopiero po otwarciu kraju; animowana wstążka respektuje `prefers-reduced-motion`. Mapa, quiz, prowincje, flagi, muzyka i rywalizacja pozostają bez zmian.
- Zapisana prawdziwa nazwa gracza pomija ekran powitalny przy kolejnym uruchomieniu. **Pomiń** nie tworzy fikcyjnego konta. W ustawieniach jest opcja **Zmień nazwę gracza**.

### Źródła, datowanie i prawa do danych

- Dane administracyjno-geograficzne, języki, waluty: `mledoze/countries` (<https://github.com/mledoze/countries>) ODbL 1.0; stan repozytorium jest przypięty w `encyclopedia-sources.json`.
- Ludność: World Bank World Development Indicators `SP.POP.TOTL`, rok 2024, CC BY 4.0 (<https://data.worldbank.org/indicator/SP.POP.TOTL>), arkusz wg aktualizacji z 19 grudnia 2025; pochodzenie i rewizja kopii zapisane w metadanych.
- Granice i geografia Polski: GUS, `Mały Rocznik Statystyczny Polski 2025` i `Polska w liczbach` oraz ZPE (odnośniki w rekordzie `pol.json`).
- Historie: IPN, gov.pl, Rijksmuseum, holenderski Dom Królewski, Deutsches Historisches Museum, US National Archives, Smithsonian, Library of Congress i austriackie MSZ; źródła zapisane przy poszczególnych krajach.
- Brak danych = brak wartości w interfejsie; wskaźniki demograficzne mają zawsze rok. Wzorce flag historycznych mają opis wariantów i zastrzeżenia; nie są współczesnymi flagami mapy.

### Testy

CI sprawdza wszystkie 251 JSON, waliduje oznaczenia lat, wykonuje testy rysowania flag, nawigacji w historycznej osi czasu i odtwarzania pseudonimu po ponownym uruchomieniu. Testy Chromium i Android Lint nie zastępują pomiaru płynności na fizycznym telefonie.
