GeoPrzygoda — naprawa rozciągania flag zgodnie ze zgłoszeniem #17 🌍🏳️

- Zapisano poprzednie poprawki 238/238 plików SVG i ich przypisań ISO.
- Usunięto z mapy domyślne wzorce objectBoundingBox, które rozciągały grafikę.
- Każda flaga jest teraz dopasowana do oddzielnych fragmentów kraju i wysp.
- Symbole flag zachowują proporcje; prostym pasom wolno wypełniać kształty.
- Przeliczanie flag po załadowaniu szczegółowych granic Natural Earth 1:10m.
- Poszerzono automatyczne testy prawdziwej mapy w Chromium: świat, zoom i zoom-out, 14 państw, przełączanie flag oraz podbój.
- Wszystkie wcześniejsze funkcje mapy, quiz, muzyka i bitwy pozostały.

Uwaga: zrzuty PNG z GitHub Actions są materiałem do przeglądu, test na Android WebView pozostaje do wykonania.

Plan nr 4 — piękniejsze bitwy na mapie ⚔️🌍

- Prawdziwe granice administracyjne Natural Earth Admin-1 dla obsługiwanych krajów, bundlowane offline przy budowie APK.
- Polska naciera w kierunku Mińska przez kolejne regiony; kolor frontu zmienia się region po regionie.
- Umowne sektory pozostają tylko tam, gdzie brakuje prawdziwych podziałów Admin-1.
- Mniejszy panel z flagami obu stron, procentem zajętych regionów, pauzą i szybkością 1×/2×/4×.
- Tryby 1 na 1, Sojusze i Losowe wyzwanie. Poprawki flag, muzyki i dokładniejszej mapy zostały zachowane.
- Uwaga: wynik bitwy i punktacja są fikcyjne; obecna wersja nadal przypisuje cały kraj po zakończonej bitwie. Wizualna kontrola na urządzeniach Android jest kolejnym krokiem.
