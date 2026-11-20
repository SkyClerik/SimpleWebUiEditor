/**
 * ============================================================
 * LayoutManager.js — Пресеты раскладки и управление окнами
 * ============================================================
 */

class LayoutManager {
    static PRESETS_KEY = 've_window_layout_presets_v1';
    static ACTIVE_KEY = 've_window_layout_active_v1';
    static SESSION_KEY = 've_window_layout_session_v1';

    static DEFAULT_LAYOUT = {
        documents: { x: 10, y: 10, width: 240, height: 220, minimized: false, closed: false },
        stylesheets: { x: 10, y: 240, width: 240, height: 260, minimized: false, closed: false },
        library: { x: 260, y: 10, width: 230, height: 220, minimized: false, closed: false },
        hierarchy: { x: 260, y: 240, width: 230, height: 260, minimized: false, closed: false },
        inspector: { x: 500, y: 10, width: 320, height: 490, minimized: false, closed: false },
        viewport: { x: 830, y: 10, width: 760, height: 820, minimized: false, closed: false }
    };

    constructor(toolbarContainer) {
        this.container = toolbarContainer;
        this.presets = this.#loadPresets();
        this.activePresetName = localStorage.getItem(LayoutManager.ACTIVE_KEY) || 'Default';
        this.selectEl = null;
        this.delBtn = null;
        this.winMenuEl = null;

        this.#renderToolbarUI();
        bus.on('layout:changed', () => this.saveCurrentSession());
    }

    #loadPresets() {
        const base = { Default: LayoutManager.DEFAULT_LAYOUT };
        try {
            const raw = localStorage.getItem(LayoutManager.PRESETS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') Object.assign(base, parsed);
            }
        } catch (e) {}
        return base;
    }

    #savePresets() {
        try {
            const customOnly = {};
            Object.entries(this.presets).forEach(([k, v]) => {
                if (k !== 'Default') customOnly[k] = v;
            });
            localStorage.setItem(LayoutManager.PRESETS_KEY, JSON.stringify(customOnly));
        } catch (e) {}
    }

    captureAllPanels() {
        const snapshot = {};
        FloatingPanel.getInstances().forEach((panel, id) => {
            snapshot[id] = panel.getState();
        });
        return snapshot;
    }

    saveCurrentSession() {
        try {
            localStorage.setItem(LayoutManager.SESSION_KEY, JSON.stringify(this.captureAllPanels()));
        } catch (e) {}
    }

    restoreInitialLayout() {
        try {
            const sessionRaw = localStorage.getItem(LayoutManager.SESSION_KEY);
            if (sessionRaw) {
                this.applyLayoutMap(JSON.parse(sessionRaw));
                return;
            }
        } catch (e) {}
        this.applyPreset(this.activePresetName);
    }

    applyLayoutMap(layoutMap) {
        if (!layoutMap) return;
        FloatingPanel.getInstances().forEach((panel, id) => {
            if (layoutMap[id]) panel.applyState(layoutMap[id]);
        });
        this.saveCurrentSession();
    }

    applyPreset(name) {
        const target = this.presets[name] || LayoutManager.DEFAULT_LAYOUT;
        this.activePresetName = this.presets[name] ? name : 'Default';
        localStorage.setItem(LayoutManager.ACTIVE_KEY, this.activePresetName);
        this.#populateSelect();
        this.applyLayoutMap(target);
    }

    #renderToolbarUI() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const lbl = document.createElement('span');
        lbl.textContent = 'Layout:';
        lbl.style.cssText = 'font-size:12px;color:#aaa;';

        const sel = document.createElement('select');
        sel.style.cssText = 'background:#3c3c3c;border:1px solid #555;color:#fff;padding:3px 8px;border-radius:3px;font-size:12px;cursor:pointer;';
        this.selectEl = sel;
        sel.addEventListener('change', (e) => this.applyPreset(e.target.value));

        const overwriteBtn = this.#btn('💾 Save', 'Overwrite active preset', () => {
            if (this.activePresetName === 'Default') {
                const name = prompt('Default is read-only. Save as new preset:', 'My Layout');
                if (!name || !name.trim()) return;
                this.activePresetName = name.trim();
            }
            this.presets[this.activePresetName] = this.captureAllPanels();
            this.#savePresets();
            localStorage.setItem(LayoutManager.ACTIVE_KEY, this.activePresetName);
            this.#populateSelect();
        });

        const newBtn = this.#btn('+ New', 'Save current window layout as new preset', () => {
            const name = prompt('New layout preset name:');
            if (!name || !name.trim()) return;
            const clean = name.trim();
            this.presets[clean] = this.captureAllPanels();
            this.activePresetName = clean;
            this.#savePresets();
            localStorage.setItem(LayoutManager.ACTIVE_KEY, clean);
            this.#populateSelect();
        });

        const delBtn = this.#btn('✕', 'Delete active preset', () => {
            if (this.activePresetName === 'Default') return;
            if (!confirm('Delete layout preset "' + this.activePresetName + '"?')) return;
            delete this.presets[this.activePresetName];
            this.#savePresets();
            this.applyPreset('Default');
        });
        this.delBtn = delBtn;

        // Выпадающее меню со списком всех окон (открыть/скрыть каждое окно)
        const winBtn = this.#btn('🪟 Windows ▾', 'Show or hide individual windows', () => this.#toggleWindowsMenu(winBtn));

        const winMenu = document.createElement('div');
        winMenu.style.cssText = 'position:fixed;z-index:999999;min-width:170px;background:#252526;border:1px solid #454545;border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,0.7);display:none;flex-direction:column;padding:4px 0;font-family:sans-serif;font-size:12px;color:#e0e0e0;';
        document.body.appendChild(winMenu);
        this.winMenuEl = winMenu;

        document.addEventListener('mousedown', (e) => {
            if (winMenu.style.display === 'none') return;
            if (!winMenu.contains(e.target) && !winBtn.contains(e.target)) winMenu.style.display = 'none';
        });

        this.container.append(lbl, sel, overwriteBtn, newBtn, delBtn, winBtn);
        this.#populateSelect();
    }

    #toggleWindowsMenu(anchorBtn) {
        if (!this.winMenuEl) return;
        if (this.winMenuEl.style.display === 'flex') {
            this.winMenuEl.style.display = 'none';
            return;
        }

        this.winMenuEl.innerHTML = '';
        FloatingPanel.getInstances().forEach((panel) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;';
            row.addEventListener('mouseenter', () => { row.style.background = '#094771'; row.style.color = '#fff'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; row.style.color = '#e0e0e0'; });

            const check = document.createElement('span');
            check.style.width = '14px';
            check.textContent = panel.closed ? '' : '✓';

            const name = document.createElement('span');
            name.textContent = panel.title;

            row.append(check, name);
            row.addEventListener('click', () => {
                if (panel.closed) panel.open();
                else panel.close();
                this.winMenuEl.style.display = 'none';
            });

            this.winMenuEl.appendChild(row);
        });

        const rect = anchorBtn.getBoundingClientRect();
        this.winMenuEl.style.display = 'flex';
        this.winMenuEl.style.top = (rect.bottom + 4) + 'px';
        this.winMenuEl.style.left = rect.left + 'px';
    }

    #populateSelect() {
        if (!this.selectEl) return;
        this.selectEl.innerHTML = '';
        Object.keys(this.presets).forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === this.activePresetName) opt.selected = true;
            this.selectEl.appendChild(opt);
        });
        if (this.delBtn) {
            this.delBtn.style.display = this.activePresetName === 'Default' ? 'none' : 'inline-block';
        }
    }

    #btn(text, title, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'toolbar-btn';
        b.textContent = text;
        b.title = title;
        b.style.padding = '3px 8px';
        b.style.fontSize = '12px';
        b.addEventListener('click', onClick);
        return b;
    }
}