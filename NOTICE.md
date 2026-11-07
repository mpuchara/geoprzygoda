# Źródła i licencje

Kod aplikacji GeoPrzygoda: MIT, zobacz `LICENSE`.

Mapa: Natural Earth 1:50m, v5.1.1, domena publiczna. Granice i geometria są uproszczone; drobne państwa i terytoria są oznaczone znacznikami. Odwzorowanie Merkatora zachowuje lokalne proporcje kształtów; obszary przy biegunach są przycięte. Plik `data/world-50m.json` zawiera współrzędne i wybrane właściwości źródła, bez upraszczania wierzchołków.

- https://www.naturalearthdata.com/about/terms-of-use/
- https://github.com/nvkelso/natural-earth-vector
- https://github.com/nvkelso/natural-earth-vector/blob/9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_50m_admin_0_countries.geojson

Dodatkowe kontury Holandii, Belgii i Niemiec: Natural Earth 1:10m Admin-0
Countries, domena publiczna. Ścieżki do mapy przygotowano na podstawie
[Can-Sahin/geojson-regions](https://github.com/Can-Sahin/geojson-regions)
(`countries/10m/NLD.geojson`, `BEL.geojson`, `DEU.geojson`).
Współrzędne przekształcono na mapę Merkatora oraz zaokrąglono do trzech
miejsc po przecinku w SVG. Dane wynikowe znajdują się w
`app/src/main/assets/benelux-10m.json`.

- https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/
- https://github.com/Can-Sahin/geojson-regions

Informacje geograficzne i polskie nazwy: mledoze/countries, ODC Open Database License 1.0. Wykorzystany i opracowany zestaw jest dostępny w `data/countries.json`, również na ODbL 1.0. Zmiany obejmują wybór pól, polskie opisy, część polskich nazw stolic i punktów na mapie. Zestaw jest edukacyjnym zapisem danych, bez aktualizacji przez internet.

- https://github.com/mledoze/countries
- https://opendatacommons.org/licenses/odbl/1-0/
- Pełna licencja: `LICENSES/DATA_ODBL.md`.

Weryfikacja informacji o stolicy Sri Lanki: https://www.mfa.gov.lk/en/national-profile-and-geography

Gradle Wrapper: projekt Gradle, Apache License 2.0. Skrypty startowe zachowują oryginalne informacje licencyjne; kod wrappera znajduje się w dołączonym `gradle/wrapper/gradle-wrapper.jar`.

- https://github.com/gradle/gradle
- https://www.apache.org/licenses/LICENSE-2.0


## Flagi państw
Flagi SVG 4x3: [lipis/flag-icons](https://github.com/lipis/flag-icons), MIT License.
Copyright (c) 2013 Panayiotis Lipiridis. Pełne warunki w \`LICENSES/FLAG_ICONS_MIT.md\`.
Są dołączone lokalnie do aplikacji, bez połączenia internetowego.
