
GeoPrzygoda — Plan nr 5: naprawa widoczności flag i płynności mapy 🌍⚡

- Flagi zyskują zawsze widoczny kolor zapasowy; mapa używa PNG wygenerowanych z 238 poprawnych SVG.
- Mapa 1:50m jest przywracana po oddaleniu; 1:10m pobierane jest tylko dla widocznych krajów.
- Bitwy pobierają granice prowincji wybranego celu zamiast 20 MB danych całego świata.
- Mniej zbędnego renderowania SVG i maks. ok. 30 FPS dla animacji podbojów.
- Muzyka, rywalizacja i wcześniejsze poprawki flag pozostają zachowane.

Wymagane ręczne sprawdzenie na fizycznym Androidzie: jakość flag, gesty i płynność.

GeoPrzygoda — Plan 5, uzupełnienie wydajności i bezpieczeństwa flag:

- Wzorce flag powstają małymi porcjami podczas kolejnych klatek. Nie blokują wyświetlenia pierwszej mapy.
- Każde wypełnienie flagi ma zapasowy kolor SVG poza wzorcem, dzięki czemu państwo pozostaje widoczne nawet przy awarii paint server Android WebView.
- Wyspy pominięte poza pierwszym widokiem szczegółowym są doczytywane przy późniejszym przesuwaniu mapy bez przeładowania całego świata.
- Test przeglądarkowy czeka na ukończenie inicjalizacji i sprawdza zewnętrzny kolor zapasowy; MIME PNG poprawiony.
- Muzyka, rywalizacja, granice 1:10m i prowincje bez zmian.
