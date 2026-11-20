/**
 * ============================================================
 * LibraryModule.js — Библиотека UI-компонентов (Full / Icon-Only)
 * ============================================================
 */

class LibraryModule {
    static CONTROLS = [
        { type: 'div', label: 'VisualElement', icon: '📦', desc: 'Базовый контейнер (div)' },
        { type: 'row', label: 'Row', icon: '↔️', desc: 'Горизонтальный Flex-контейнер' },
        { type: 'column', label: 'Column', icon: '↕️', desc: 'Вертикальный Flex-контейнер' },
        { type: 'scrollview', label: 'ScrollView', icon: '📜', desc: 'Контейнер с прокруткой' },
        { type: 'span', label: 'Label', icon: '🔤', desc: 'Текстовая метка (span)' },
        { type: 'button', label: 'Button', icon: '🔘', desc: 'Кнопка (button)' },
        { type: 'input', label: 'TextField', icon: '⌨️', desc: 'Поле ввода текста' },
        { type: 'toggle', label: 'Toggle', icon: '☑️', desc: 'Чекбокс с подписью' },
        { type: 'img', label: 'Image', icon: '🖼️', desc: 'Изображение (img)' },
        { type: 'progressbar', label: 'ProgressBar', icon: '📊', desc: 'Индикатор прогресса' }
    ];

    static VIEW_STORAGE_KEY = 've_library_view_mode';

    constructor() {
        this.iconOnly = localStorage.getItem(LibraryModule.VIEW_STORAGE_KEY) === 'icons';
        this.wrapEl = null;
        this.toggleBtn = null;
    }

    init(content) {
        this.content = content;
        this.content.innerHTML = '';

        // Кнопка переключения вида в шапке окна Library
        const panelHeaderActions = this.content.closest('.floating-panel')?.querySelector('.panel-actions');
        if (panelHeaderActions && !panelHeaderActions.querySelector('.lib-view-toggle')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'panel-btn lib-view-toggle';
            toggleBtn.style.fontSize = '11px';
            this.toggleBtn = toggleBtn;

            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.iconOnly = !this.iconOnly;
                localStorage.setItem(LibraryModule.VIEW_STORAGE_KEY, this.iconOnly ? 'icons' : 'full');
                this.#renderItems();
            });

            panelHeaderActions.insertBefore(toggleBtn, panelHeaderActions.firstChild);
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start;';
        this.wrapEl = wrap;
        this.content.appendChild(wrap);

        this.#renderItems();
    }

    #renderItems() {
        if (!this.wrapEl) return;
        this.wrapEl.innerHTML = '';

        if (this.toggleBtn) {
            this.toggleBtn.textContent = this.iconOnly ? '☰' : '⊞';
            this.toggleBtn.title = this.iconOnly ? 'Switch to Full Buttons (Icon + Text)' : 'Switch to Compact Icons Only';
        }

        LibraryModule.CONTROLS.forEach((item) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hierarchy-btn';
            btn.title = item.label + ' — ' + item.desc;

            if (this.iconOnly) {
                btn.style.cssText = 'width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-size: 16px; padding: 0; flex-shrink: 0;';
                btn.textContent = item.icon;
            } else {
                btn.style.cssText = 'flex: 1 1 200px; min-width: 200px; display: flex; align-items: center; gap: 8px; padding: 6px 10px; text-align: left; font-size: 12px;';
                const ic = document.createElement('span');
                ic.textContent = item.icon;
                ic.style.flexShrink = '0';

                const lbl = document.createElement('span');
                lbl.textContent = item.label;
                lbl.style.whiteSpace = 'nowrap';

                btn.append(ic, lbl);
            }

            btn.addEventListener('click', () => {
                bus.publish('ve:create', { tag: item.type });
            });

            this.wrapEl.appendChild(btn);
        });
    }

    static createPresetNode(presetType, uidGenerator) {
        const suffix = String(Date.now()).slice(-4);
        const presets = {
            row: { name: 'Row_' + suffix, tag: 'div', inlineStyles: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', padding: '8px' } },
            column: { name: 'Column_' + suffix, tag: 'div', inlineStyles: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' } },
            scrollview: { name: 'ScrollView_' + suffix, tag: 'div', inlineStyles: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', overflow: 'auto', minHeight: '120px', maxHeight: '300px', border: '1px solid #3c3c3c' } },
            span: { name: 'LBL_' + suffix, tag: 'span', inlineStyles: { fontSize: '14px', color: '#e0e0e0' }, textContent: 'Label Text' },
            button: { name: 'BTN_' + suffix, tag: 'button', textContent: 'Button' },
            input: { name: 'TXT_' + suffix, tag: 'input', inlineStyles: { minWidth: '160px' }, attributes: { type: 'text', placeholder: 'Enter text...' } },
            toggle: {
                name: 'TGL_' + suffix, tag: 'label',
                inlineStyles: { display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' },
                children: [
                    { uid: uidGenerator(), name: 'TGL_Check_' + suffix, tag: 'input', classes: [], inlineStyles: { width: '16px', height: '16px', margin: '0' }, attributes: { type: 'checkbox' }, textContent: '', children: [] },
                    { uid: uidGenerator(), name: 'TGL_Label_' + suffix, tag: 'span', classes: [], inlineStyles: {}, attributes: {}, textContent: 'Toggle Option', children: [] }
                ]
            },
            img: {
                name: 'IMG_' + suffix, tag: 'img',
                inlineStyles: { width: '120px', height: '80px', borderRadius: '4px', backgroundColor: '#2d2d30' },
                attributes: { src: 'https://placehold.co', alt: 'Preview' }
            },
            progressbar: {
                name: 'PRG_' + suffix, tag: 'div',
                inlineStyles: { width: '200px', height: '14px', backgroundColor: '#2d2d30', borderRadius: '7px', overflow: 'hidden', border: '1px solid #454545' },
                children: [
                    { uid: uidGenerator(), name: 'PRG_Fill_' + suffix, tag: 'div', classes: [], inlineStyles: { width: '65%', height: '100%', backgroundColor: '#007acc' }, attributes: {}, textContent: '', children: [] }
                ]
            },
            div: { name: 'VE_' + suffix, tag: 'div', inlineStyles: { padding: '12px', minHeight: '40px' } }
        };

        const cfg = presets[presetType] || presets.div;
        return {
            uid: uidGenerator(),
            name: cfg.name,
            tag: cfg.tag,
            classes: [],
            inlineStyles: cfg.inlineStyles || {},
            attributes: cfg.attributes || {},
            textContent: cfg.textContent || '',
            children: cfg.children || []
        };
    }
}
