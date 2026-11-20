/**
 * ============================================================
 * EventBus.js — Центральная шина событий ядра
 * ============================================================
 *
 * Назначение: слабосвязанное взаимодействие между модулями.
 * Все коммуникации идут ТОЛЬКО через EventBus.
 *
 * Архитектура:
 * - subscribe(event, callback, context) — подписка
 * - publish(event, payload) — публикация
 * - unsubscribe(event, callback) — отписка
 * - on() / off() / emit() — алиасы для удобства
 *
 * Паттерн событий: "module:action" (например: doc:switched, ve:selected)
 * ============================================================
 */

class EventBus {
    // Хранилище подписок: Map<eventName, Array<{callback, context}>>
    #listeners = new Map();

    /**
     * Подписаться на событие
     * @param {string} event — имя события (например: "ve:selected")
     * @param {Function} callback — функция-обработчик
     * @param {*} context — контекст (this) для callback, опционально
     * @returns {Function} — функция для отписки
     */
    subscribe(event, callback, context = null) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        const entry = { callback, context };
        this.#listeners.get(event).push(entry);

        // Возвращаем функцию для отписки
        return () => this.unsubscribe(event, callback, context);
    }

    /**
     * Отписаться от события
     */
    unsubscribe(event, callback, context = null) {
        const list = this.#listeners.get(event);
        if (!list) return;
        const idx = list.findIndex(
            (e) => e.callback === callback && e.context === context
        );
        if (idx !== -1) {
            list.splice(idx, 1);
        }
    }

    /**
     * Опубликовать событие (синхронно)
     * @param {string} event — имя события
     * @param {*} payload — данные события
     * @returns {EventBus} — chainable
     */
    publish(event, payload) {
        const list = this.#listeners.get(event);
        if (!list) return this;

        // Копируем массив, чтобы мутации внутри обработчиков не ломали итерацию
        const snapshot = [...list];
        for (const { callback, context } of snapshot) {
            try {
                callback.call(context, payload);
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        }
        return this;
    }

    /** Алиас для subscribe */
    on(event, callback, context) {
        return this.subscribe(event, callback, context);
    }

    /** Алиас для unsubscribe */
    off(event, callback, context) {
        return this.unsubscribe(event, callback, context);
    }

    /** Алиас для publish */
    emit(event, payload) {
        return this.publish(event, payload);
    }

    /**
     * Одноразовая подписка (выполняется один раз и автоматически отписывается)
     */
    once(event, callback, context = null) {
        const wrapper = (payload) => {
            callback.call(context, payload);
            this.unsubscribe(event, wrapper, context);
        };
        return this.subscribe(event, wrapper, context);
    }

    /**
     * Получить список подписчиков для события (для отладки)
     */
    getSubscribers(event) {
        const list = this.#listeners.get(event);
        return list ? list.length : 0;
    }

    /**
     * Очистить все подписки
     */
    clear() {
        this.#listeners.clear();
    }

    /**
     * Очистить подписки для конкретного события
     */
    clearEvent(event) {
        this.#listeners.delete(event);
    }
}

// Глобальный экземпляр — единственная шина для всего приложения
const bus = new EventBus();

// Делаем доступным глобально для браузера
if (typeof globalThis !== 'undefined') {
    globalThis.bus = bus;
    globalThis.EventBus = EventBus;
}

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventBus, bus };
}
