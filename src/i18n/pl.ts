import type { Dictionary } from "./en";

export const pl: Dictionary = {
  app: {
    name: "Driftless",
    tagline: "Zbilansuj portfel. Zachowaj swoje dane.",
    demoBanner: "Dane demonstracyjne. Nic nie jest zapisywane na tym urządzeniu.",
    disclaimer:
      "Driftless to matematyczne narzędzie planistyczne, a nie porada inwestycyjna. Wynik to plan kwotowy w PLN, a nie gwarantowane zlecenia na liczbę jednostek; rozliczenie u brokera może się różnić.",
  },
  nav: {
    start: "Start",
    portfolio: "Portfel",
    edit: "Instrumenty i cele",
    rebalance: "Rebalansing",
    data: "Dane i prywatność",
    openGroup: "Przestrzeń robocza",
    language: "Język",
    theme: "Przełącz tryb ciemny",
  },
  start: {
    title: "Witaj w Driftless",
    description:
      "Sprawdź, jak rozdysponować nowe środki, aby portfel ETF wrócił w stronę wag docelowych, wyłącznie przez zakupy. Bez konta, bez śledzenia, bez wysyłania danych.",
    privacyTitle: "Local-first z założenia",
    privacyBody:
      "Portfele są przechowywane tylko w tej przeglądarce. Serwer nie przechowuje Twoich pozycji, a wszystkie obliczenia odbywają się na Twoim urządzeniu.",
    demo: "Wypróbuj demo",
    newPortfolio: "Nowy portfel",
    importJson: "Import JSON",
    soon: "Dostępne w fazie 2",
  },
  portfolio: {
    title: "Portfel",
    description: "Bieżąca wycena i odchylenia alokacji.",
    total: "Wartość całkowita",
    invested: "Zainwestowane",
    cash: "Gotówka do zainwestowania",
    allocation: "Bieżąca alokacja",
    instrument: "Instrument",
    value: "Wartość",
    current: "Obecnie",
    target: "Cel",
    drift: "Odchylenie",
    asOf: "Data wyceny",
    held: "Posiadany, bez celu",
  },
  edit: {
    title: "Instrumenty i cele",
    description: "Dodawaj instrumenty po ISIN, wpisuj bieżące wartości i wagi docelowe.",
    emptyTitle: "Edytor pojawi się w fazie 2",
    emptyBody: "Edycja, zapis w IndexedDB oraz import i eksport to kolejne punkty planu.",
  },
  rebalance: {
    title: "Rebalansing",
    description: "Plan tylko z zakupami: nowa gotówka trafia na najbardziej niedoważone pozycje.",
    cash: "Nowa gotówka do zainwestowania (PLN)",
    cashHint: "Wpisz kwotę, np. 1500 lub 1 500,50.",
    cashInvalid: "Podaj poprawną, nieujemną kwotę.",
    deployed: "Do wydania",
    leftover: "Niewykorzystane",
    totalAfter: "Portfel po zakupie",
    buy: "Kup (PLN)",
    after: "Po zakupie",
    driftAfter: "Odchylenie po",
    planNote: "To plan kwotowy w PLN, a nie zlecenie na określoną liczbę jednostek.",
    invalidPortfolio: "Portfel jest nieprawidłowy",
    noPurchases: "Brak sugerowanych zakupów: nic nie jest niedoważone albo brakuje gotówki.",
    warnings: {
      notInTarget:
        "Pozycja {isin} nie występuje w alokacji docelowej. Zostaje, ale nie jest kupowana.",
      cashConstrained:
        "Zakupy ograniczone dostępną gotówką ({amount}). Nie da się w pełni osiągnąć celów.",
    },
  },
  data: {
    title: "Dane i prywatność",
    description: "Co jest przechowywane, gdzie i jak zachować kopię.",
    principlesTitle: "Nasze zobowiązania",
    principles: [
      "Bez kont, reklam i śledzenia behawioralnego.",
      "Pozycje, wartości i nazwy rachunków nigdy nie opuszczają Twojej przeglądarki.",
      "Obliczenia działają lokalnie i po załadowaniu aplikacji działają także offline.",
      "Otwarty kod (MIT): możesz sprawdzić, co dokładnie robi aplikacja.",
    ],
    storageTitle: "Dane przeglądarki można utracić",
    storageBody:
      "Wyczyszczenie danych witryny, tryb prywatny lub czyszczenie przeglądarki może usunąć portfele. Regularnie eksportuj kopię zapasową i przechowuj ją w bezpiecznym miejscu.",
    backupSoon: "Eksport i import kopii zapasowej pojawią się w fazie 2.",
  },
  issues: {
    no_targets: "Dodaj co najmniej jedną wagę docelową.",
    invalid_isin: "{isin} nie ma poprawnego formatu ISIN.",
    invalid_amount: "Kwota jest ujemna lub nie jest liczbą.",
    invalid_weight: "Waga dla {isin} musi być większa niż 0% i nie większa niż 100%.",
    weights_sum: "Wagi docelowe muszą sumować się do 100% (obecnie {sum}).",
    duplicate_position: "ISIN {isin} występuje dwa razy w pozycjach.",
    duplicate_target: "ISIN {isin} występuje dwa razy w celach.",
    total_not_positive: "Wartość portfela musi być większa od zera.",
  },
};
