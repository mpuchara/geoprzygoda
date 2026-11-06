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
