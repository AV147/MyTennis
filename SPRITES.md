# MyTennis — структура спрайтов для графики

План ассетов для замены текущей CSS/эмодзи-графики на спрайты. Файловая
структура заведена заранее: интеграция сводится к замене `background`/эмодзи
в `styles-app.css` на `background-image` без изменения игровой логики.

## Принципы

- **Формат:** SVG для плоских элементов UI (масштабируются без потерь),
  PNG @2x для «сочных» иллюстраций (жетоны, мяч, фоны карт). WebP как
  альтернатива PNG для Telegram (меньше вес).
- **Именование:** `kebab-case`, суффикс состояния через `--`
  (`token-p1--idle.png`, `btn-play--pressed.svg`).
- **Сетка размеров:** размеры ниже — логические (CSS px); PNG рисуются @2x.
- **Один спрайт-лист на группу** (опционально, этап оптимизации): пока
  отдельные файлы — проще итерировать.

## Структура каталога

```
assets/
  sprites/
    court/
      court-bg.png            480×286   фон корта (трава/хард, разметка ВКЛЮЧЕНА в текстуру)
      court-net.svg           8×286     сетка (вертикальная полоса, полупрозрачная)
      zone-frame.svg          ~96×90    рамка зоны (нейтральная, dashed → графическая)
      zone-frame--active.svg  ~96×90    подсветка зоны текущей позиции игрока
      zone-frame--target.svg  ~96×90    подсветка зоны-цели удара (для анимации)
    tokens/
      token-p1--idle.png      60×60     жетон игрока 1 (базовый)
      token-p1--hit.png       60×60     игрок 1 в момент удара (замах)
      token-p2--idle.png      60×60     жетон игрока 2 / ИИ
      token-p2--hit.png       60×60
      token-shadow.png        48×16     тень под жетоном (общая)
      ball.png                20×20     мяч (для анимации полёта по линии удара)
      ball-trail.png          64×20     шлейф мяча (опционально)
    cards/
      card-frame--attack.png  132×185   рамка+фон карты «Атака» (красная)
      card-frame--defense.png 132×185   «Защита» (синяя)
      card-frame--volley.png  132×185   «Volley» (зелёная)
      card-frame--serve.png   132×185   «Подача» (фиолетовая)
      card-back.png           132×185   рубашка (полная, для анимаций)
      card-back--mini.png     34×46     рубашка мини (полоса ИИ)
      art/                              иллюстрации ударов (по одной на карту библиотеки)
        art-kick-serve.png    116×64
        art-flat-serve.png    116×64
        art-strong-forehand.png ...
        art-slice.png
        art-dropshot.png
        art-lob.png
        art-smash.png
        art-moonball.png
        art-approach.png
        art-approach-drop.png
        art-flat-strike.png
        art-volley-strike.png
        art-volley-slice.png
        art-volley-drop.png
        art-strike-line.png
        art-strike-cross.png
        art-slice-line.png
        art-slice-cross.png
        art-weak-line.png
        art-weak-cross.png
        art-weak-forehand.png
    dice/
      d6-1.svg … d6-6.svg     40×40     грани обычного d6 (белый)
      d6-power-1.svg … -6.svg 40×40     красный d6 (бонус мощного удара)
      d3-1.svg … d3-3.svg     30×30     розовый d3 (штраф «Сложный»)
      dice-roll-anim/                   кадры вращения (или один спрайт-лист 6×40×40)
    icons/
      stat-power.svg          14×14     ⚡ сила
      stat-spin.svg           14×14     🌀 вращение
      kw-guided.svg           12×12     Прицельный
      kw-complex.svg          12×12     Сложный
      kw-drop.svg             12×12     Укороченный
      kw-volley.svg           12×12     Слёта
      kw-smashable.svg        12×12     Можно смэшировать
      kw-anti-net.svg         12×12     Анти-сетка
      kw-approach.svg         12×12     Выход к сетке
      kw-overhead.svg         12×12     Смэш/overhead
      kw-powershot.svg        12×12     +1d6
      discard-red.svg         14×14     метка сброса 🔴
      discard-blue.svg        14×14     🔵
      discard-green.svg       14×14     🟢
      serve-indicator.svg     16×16     🎾 у имени подающего
    ui/
      btn-play.svg            116×30    кнопка «Играть» (9-slice или просто фон)
      btn-play--disabled.svg  116×30
      btn-draw.svg            full×32   кнопка «Добор»
      btn-pass.svg            full×32   «Пропустить»
      btn-move.svg            60×26     кнопки перемещения (→ BL / → Net)
      panel-turn.svg          9-slice   рамка панели «Текущий ход»
      panel-dice.svg          9-slice   рамка панели кубиков
      strip-ai-bg.png         тайл      фон полосы ИИ
      hand-bg.png             тайл      фон секции руки
      score-bar-bg.png        тайл      фон счёта
    fx/
      shot-line.svg                     пунктир траектории (заменит SVG-линию)
      hit-flash.png           48×48     вспышка в момент удара
      point-win.png           128×64    «Очко!» баннер
      fault.png               128×64    «Ошибка!»
      double-fault.png        128×64
      game-win.png            192×96    победа в гейме
```

## Приоритет внедрения (поэтапно)

1. **Этап 1 — корт и жетоны:** `court-bg`, `token-p1/p2 idle`, `ball` +
   анимация мяча вдоль линии удара. Максимальный визуальный эффект при
   минимуме работы (3 файла + 1 CSS-анимация).
2. **Этап 2 — карты:** рамки 4 категорий + рубашки. Иллюстрации ударов
   (`cards/art/*`) можно добавлять постепенно — карта работает и без арта.
3. **Этап 3 — кубики и иконки:** заменить CSS-точки на графические грани,
   эмодзи ⚡🌀 на иконки.
4. **Этап 4 — UI-хром и эффекты:** кнопки, панели, баннеры событий.

## Как подключаются (пример)

```css
/* сейчас */
.token-p1 { background: radial-gradient(circle at 35% 35%, #5dade2, #2471a3); }

/* станет */
.token-p1 { background: url('assets/sprites/tokens/token-p1--idle.png') center/contain no-repeat; border: none; }
```

Категория карты уже кодируется классом (`card-attack` / `card-defense` /
`card-volley` / `card-serve`) — рамки подключаются заменой `background` у
этих четырёх классов. Иллюстрации ударов потребуют небольшого изменения
`render.js`: добавить `<div class="card-art" data-art="...">` в шаблон карты
(ключ арта = имя карты из `CARD_LIBRARY`).
