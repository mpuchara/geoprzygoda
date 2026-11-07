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
