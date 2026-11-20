# default — Exported UI Bundle

Готовый пакет пользовательского интерфейса, собранный в **Free Web UI Builder**.

## Быстрый старт (2 способа)

1. **Через батник в 1 клик (Windows):**
   Запустите **start_preview.bat** двойным кликом — он поднимет локальный сервер на порту 8001 и откроет UI в браузере.
2. **Мгновенный просмотр без сервера:**
   Откройте файл **index.html** двойным кликом в браузере (данные встроены в runtime/bundle.js).

## Структура архива

- start_preview.bat — запуск локального предпросмотра в один клик (Windows).
- index.html — чистая точка входа без бизнес-логики.
- app_logic.js — контроллер логики (Q, события кнопок, VisualElement.instantiate).
- runtime/VisualElement.js — автономный движок рендера.
- runtime/bundle.js — скомпилированный пакет документов и стилей.
- documents/*.ve.json — исходные файлы разметки экранов.
- stylesheets/*.css — таблицы стилей.
- default_binding.json — карта всех ID и документов.

## Основные методы VisualElement

- root.Q("ElementID") — находит первый элемент по Name (ID) или .className.
- root.Query("ElementID") / root.Query(".class") — возвращает массив всех совпадений.
- await VisualElement.instantiate("TemplateDoc") — клонирует .ve.json шаблон со свежими UID.
- parent.add(childVE) / parent.clear() / el.removeFromHierarchy() — управление деревом в рантайме.
- el.text = "Новый текст" — меняет текстовое содержимое элемента.
- el.addClass("active") / el.removeClass("active") / el.toggleClass("active") — управление классами.
- el.on("click", (event, el) => { ... }) — подписка на события.

## Экспортированные ID элементов в этом проекте

- 10Root (<div> в 10.ve.json)
- header (<div> в 10.ve.json)
- content (<div> в 10.ve.json)
- div_1795183655391 (<div> в 10.ve.json)
- div_1795184385063 (<div> в 10.ve.json)
- button_1795184381530 (<button> в 10.ve.json)
- button_1795184381711 (<button> в 10.ve.json)
- 548Root (<div> в 548.ve.json)
- rootPanel (<div> в main.ve.json)
- contentArea (<div> в main.ve.json)
- buttonContainer (<div> в main.ve.json)
- BTN_Submit (<button> в main.ve.json)
- BTN_Cancel (<button> в main.ve.json)
