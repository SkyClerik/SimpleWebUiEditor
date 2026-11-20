/**
 * ============================================================
 * ViewportToolbar.js — Панель режимов (Editor/Preview) и разрешений
 * ============================================================
 */

class ViewportToolbar {
    static DEFAULT_PRESETS = [
        { id: 'responsive', label: 'Responsive (100%)', w: 0, h: 0 },
        { id: 'fhd', label: 'Desktop FHD (1920×1080)', w: 1920, h: 1080 },
        { id: 'hd', label: 'Desktop HD (1280×720)', w: 1280, h: 720 },
        { id: 'tablet', label: 'Tablet (768×1024)', w: 768, h: 1024 },
        { id: 'mobile', label: 'Mobile (375×812)', w: 375, h: 812 }
    ];

    static STORAGE_KEY = 've_builder_custom_resolutions';

    constructor(containerEl, callbacks) {
        this.el = containerEl;
        this.callbacks = callbacks; // { onModeChange, onResolutionChange, onResetZoom }
        this.presets = this.#loadPresets();
        this.activePresetId = 'responsive';
        this.#render();
    }

    #loadPresets() {
        const list = [...ViewportToolbar.DEFAULT_PRESETS];
        try {
            const raw = localStorage.getItem(ViewportToolbar.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach((p) => {
                        if (p?.id && p?.label && Number(p.w) > 0 && Number(p.h) > 0) {
                            list.push({ id: String(p.id), label: String(p.label), w: Number(p.w), h: Number(p.h), custom: true });
                        }
                    });
                }
            }
        } catch (e) {}
        return list;
    }

    #saveCustomPresets() {
        try {
            localStorage.setItem(ViewportToolbar.STORAGE_KEY, JSON.stringify(this.presets.filter((p) => p.custom)));
        } catch (e) {}
    }

    setModeUI(mode) {
        this.btnEditor?.classList.toggle('active', mode === 'editor');
        this.btnPreview?.classList.toggle('active', mode === 'preview');
    }

    updateZoomDisplay(zoom) {
        if (this.zoomBtn) this.zoomBtn.textContent = Math.round(zoom * 100) + '%';
    }

    #render() {
        this.el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:6px 10px;';
        this.el.innerHTML = '';

        // 1. Editor / Preview
        const modeWrap = document.createElement('div');
        modeWrap.style.cssText = 'display:flex;gap:4px;';
        this.btnEditor = this.#btn('✏️ Editor', 'viewport-btn active', () => this.callbacks.onModeChange('editor'));
        this.btnPreview = this.#btn('▶️ Preview', 'viewport-btn', () => this.callbacks.onModeChange('preview'));
        modeWrap.append(this.btnEditor, this.btnPreview);

        // 2. Resolution + Zoom Badge
        const resWrap = document.createElement('div');
        resWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';

        this.resSelect = document.createElement('select');
        this.resSelect.style.cssText = 'background:#3c3c3c;border:1px solid #555;color:#e0e0e0;padding:4px 8px;border-radius:3px;font-size:12px;cursor:pointer;';
        this.#populateSelect();

        this.delBtn = this.#btn('✕', 'viewport-btn', () => this.#deleteActiveCustom());
        this.delBtn.style.display = 'none';
        this.delBtn.title = 'Delete custom preset';

        this.resSelect.addEventListener('change', (e) => this.#selectPreset(e.target.value));

        this.zoomBtn = this.#btn('100%', 'viewport-btn', () => this.callbacks.onResetZoom());
        this.zoomBtn.title = 'Wheel to zoom at cursor · Space+Drag to pan · Click to reset 100%';
        this.zoomBtn.style.fontVariantNumeric = 'tabular-nums';

        resWrap.append(this.resSelect, this.delBtn, this.zoomBtn);

        // 3. Add Custom Resolution
        const addWrap = document.createElement('div');
        addWrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:#aaa;';
        const inpCss = 'background:#2d2d30;border:1px solid #555;color:#fff;padding:3px 6px;border-radius:3px;font-size:12px;';

        const nameInp = document.createElement('input');
        nameInp.placeholder = 'Name'; nameInp.style.cssText = inpCss + 'width:85px;';
        const wInp = document.createElement('input');
        wInp.type = 'number'; wInp.placeholder = 'W'; wInp.style.cssText = inpCss + 'width:58px;';
        const hInp = document.createElement('input');
        hInp.type = 'number'; hInp.placeholder = 'H'; hInp.style.cssText = inpCss + 'width:58px;';

        const addBtn = this.#btn('+ Add', 'viewport-btn', () => {
            const w = parseInt(wInp.value, 10), h = parseInt(hInp.value, 10);
            if (!w || !h || w < 50 || h < 50) return;
            const id = 'custom_' + Date.now();
            const label = (nameInp.value.trim() || 'Custom') + ' (' + w + '×' + h + ')';
            this.presets.push({ id, label, w, h, custom: true });
            this.#saveCustomPresets();
            this.#selectPreset(id);
            nameInp.value = ''; wInp.value = ''; hInp.value = '';
        });

        addWrap.append(nameInp, document.createTextNode('W'), wInp, document.createTextNode('H'), hInp, addBtn);
        this.el.append(modeWrap, resWrap, addWrap);
    }

    #btn(text, cls, onClick) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
    }

    #populateSelect() {
        this.resSelect.innerHTML = '';
        this.presets.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.label;
            if (p.id === this.activePresetId) opt.selected = true;
            this.resSelect.appendChild(opt);
        });
    }

    #selectPreset(id) {
        this.activePresetId = id;
        this.#populateSelect();
        const preset = this.presets.find((p) => p.id === id) || ViewportToolbar.DEFAULT_PRESETS.at(0);
        this.delBtn.style.display = preset.custom ? 'inline-block' : 'none';
        this.callbacks.onResolutionChange(preset.w, preset.h);
    }

    #deleteActiveCustom() {
        const idx = this.presets.findIndex((p) => p.id === this.activePresetId && p.custom);
        if (idx === -1) return;
        this.presets.splice(idx, 1);
        this.#saveCustomPresets();
        this.#selectPreset('responsive');
    }
}
