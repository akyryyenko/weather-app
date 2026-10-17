# car-agent — аналіз авто з Gumtree

Даєш посилання на оголошення Gumtree — агент:

1. відкриває оголошення і витягує характеристики, ціну, опис і номерний знак;
2. завантажує повну історію MOT (DVSA);
3. шукає в інтернеті схожі авто на продаж і типові проблеми моделі;
4. пише звіт українською: оцінка стану /10, чи адекватна ціна (і діапазон для торгу), таблиця MOT з поясненнями, ризики з орієнтовною вартістю ремонту, чекліст для огляду, червоні прапорці.

Працює на Claude API (`claude-opus-5-5`, з web search).

## Встановлення

```bash
cd car-agent
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # https://console.anthropic.com
```

## Запуск

```bash
npm run check -- "https://www.gumtree.com/p/bmw/bmw-1-series-.../1803730898"

# якщо номера немає в тексті оголошення — вкажи вручну:
npm run check -- "<url>" --reg NC53DMC

# зберегти звіт у файл:
npm run check -- "<url>" --reg NC53DMC --out report.md
```

Хід роботи (які інструменти викликає агент) друкується в stderr, звіт — у stdout.

### Кілька авто одразу

Створи файл `links.txt` у папці `car-agent`: одне посилання на рядок, за бажанням номер через пробіл
(приклад — `links.example.txt`):

```
https://www.gumtree.com/p/.../1803730898 NC53DMC
https://www.gumtree.com/p/.../1801234567
```

```bash
npm run batch            # читає links.txt
npm run batch -- my.txt  # або інший файл
```

Агент аналізує до 3 авто паралельно і пише короткі звіти в `reports/<дата_час>/`:
`car-1.md`, `car-2.md`, … та `summary.md` — порівняльна таблиця (від найкращого варіанту) і всі короткі звіти.

### Якщо Gumtree блокує запит

Gumtree іноді віддає 403 скриптам. Тоді відкрий оголошення в браузері, збережи сторінку
(Ctrl+S → «Webpage, HTML only») і передай файл:

```bash
npm run check -- "<url>" --html ~/Downloads/ad.html --reg NC53DMC
```

## Історія MOT

За замовчуванням агент читає публічну сторінку `check-mot.service.gov.uk/results?registration=...`.
Надійніше — офіційний безкоштовний DVSA MOT History API
(реєстрація: https://documentation.history.mot.api.gov.uk/). Після реєстрації DVSA надішле дані —
додай їх у змінні середовища, і агент автоматично перейде на API:

```bash
export DVSA_CLIENT_ID=...
export DVSA_CLIENT_SECRET=...
export DVSA_API_KEY=...
export DVSA_TOKEN_URL=https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
```

## Варіант без коду — агент у Claude Code

У репозиторії також є субагент `.claude/agents/car-inspector.md`. Якщо працюєш у Claude Code
у цьому репозиторії, просто встав посилання на Gumtree і попроси «проаналізуй авто» — він зробить
те саме через WebFetch/WebSearch.

## Обмеження

- Агент не замінює HPI-перевірку (фінанси, крадіжка, списання) — для цього потрібен платний сервіс.
- Ціни порівнюються з тим, що знайдено пошуком на момент запуску; це орієнтир, а не оцінка дилера.
