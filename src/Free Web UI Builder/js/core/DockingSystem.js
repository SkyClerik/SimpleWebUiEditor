/**
 * ============================================================
 * DockingSystem.js — DnD плавающие панели + Snap to Grid (Ctrl)
 * ============================================================
 */

class FloatingPanel {
    static #zIndex = 10;
    static #instances = new Map();
    static GRID_STEP = 10;

    constructor(id, title, templateId, onInit) {
        this.id = id;
        this.title = title;
        this.onInit = onInit;
        this.element = null;
        this.content = null;
        this.header = null;
        this.resizeHandle = null;
        this.minimized = false;
        this.closed = false;
        this.focused = false;
        this._savedHeight = 400;

        FloatingPanel.#instances.set(id, this);
    }

    create(x = 0, y = 0, width = 300, height = 400) {
        const workspace = document.getElementById('workspace');
        if (!workspace) return;

        this._savedHeight = height;

        this.element = document.createElement('div');
        this.element.className = 'floating-panel focused';
        this.element.id = 'panel-' + this.id;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
        this.element.style.width = width + 'px';
        this.element.style.height = height + 'px';
        this.element.style.minWidth = '44px';
        this.element.style.zIndex = ++FloatingPanel.#zIndex;

        this.header = document.createElement('div');
        this.header.className = 'panel-header';
        this.header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;overflow:hidden;';
        this.header.innerHTML = `
            <span class="panel-title" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.title}</span>
            <div class="panel-actions" style="display:flex;align-items:center;flex-shrink:0;">
                <button class="panel-btn minimize" title="Minimize">−</button>
                <button class="panel-btn close" title="Close">×</button>
            </div>
        `;

        this.content = document.createElement('div');
        this.content.className = 'panel-content';
        const tpl = document.getElementById('tpl-' + this.id);
        if (tpl) {
            this.content.appendChild(tpl.content.cloneNode(true));
        }

        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'resize-handle';

        this.element.append(this.header, this.content, this.resizeHandle);
        workspace.appendChild(this.element);

        this.#initDrag(this.header);
        this.#initResize(this.resizeHandle);
        this.element.addEventListener('mousedown', () => this.focus());
        this.header.querySelector('.close').addEventListener('click', () => this.close());
        this.header.querySelector('.minimize').addEventListener('click', () => this.toggleMinimize());

        this.focus();
        if (this.onInit) this.onInit(this.content);
    }

    #initDrag(handle) {
        let isDragging = false;
        let startX, startY, origX, origY;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.panel-btn')) return;
            isDragging = true;
            this.focus();
            startX = e.clientX;
            startY = e.clientY;
            origX = this.element.offsetLeft;
            origY = this.element.offsetTop;
            this.element.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let nx = Math.max(0, origX + (e.clientX - startX));
            let ny = Math.max(0, origY + (e.clientY - startY));

            if (e.ctrlKey) {
                const s = FloatingPanel.GRID_STEP;
                nx = Math.round(nx / s) * s;
                ny = Math.round(ny / s) * s;
            }

            this.element.style.left = nx + 'px';
            this.element.style.top = ny + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.element.classList.remove('dragging');
                bus.publish('layout:changed', { panelId: this.id });
            }
        });
    }

    #initResize(handle) {
        let isResizing = false;
        let startX, startY, origW, origH;

        handle.addEventListener('mousedown', (e) => {
            if (this.minimized) return;
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            origW = this.element.offsetWidth;
            origH = this.element.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            let newW = Math.max(44, origW + (e.clientX - startX));
            let newH = Math.max(40, origH + (e.clientY - startY));

            if (e.ctrlKey) {
                const s = FloatingPanel.GRID_STEP;
                newW = Math.max(40, Math.round(newW / s) * s);
                newH = Math.max(40, Math.round(newH / s) * s);
            }

            this._savedHeight = newH;
            this.element.style.width = newW + 'px';
            this.element.style.height = newH + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                bus.publish('layout:resized', { panelId: this.id });
                bus.publish('layout:changed', { panelId: this.id });
            }
        });
    }

    focus() {
        if (this.closed) return;
        FloatingPanel.#instances.forEach((p) => {
            if (p.id !== this.id && p.element) p.element.classList.remove('focused');
        });
        this.focused = true;
        this.element.classList.add('focused');
        this.element.style.zIndex = ++FloatingPanel.#zIndex;
        bus.publish('panel:focused', { panelId: this.id });
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.element.style.display = 'none';
        bus.publish('panel:closed', { panelId: this.id });
        bus.publish('layout:changed', { panelId: this.id });
    }

    open() {
        this.closed = false;
        this.element.style.display = 'flex';
        if (!this.minimized) {
            this.content.style.display = this.id === 'viewport' ? 'flex' : 'block';
            this.element.style.height = this._savedHeight + 'px';
        }
        this.focus();
        bus.publish('panel:opened', { panelId: this.id });
        bus.publish('layout:changed', { panelId: this.id });
    }

    setMinimized(shouldMinimize, silent = false) {
        this.minimized = Boolean(shouldMinimize);
        const minBtn = this.header.querySelector('.minimize');

        if (this.minimized) {
            const currentH = this.element.offsetHeight;
            if (currentH > 50) this._savedHeight = currentH;
            this.content.style.display = 'none';
            if (this.resizeHandle) this.resizeHandle.style.display = 'none';
            this.element.style.minHeight = '0px';
            this.element.style.height = 'auto';
            if (minBtn) minBtn.textContent = '+';
            if (!silent) bus.publish('panel:minimized', { panelId: this.id });
        } else {
            this.content.style.display = this.id === 'viewport' ? 'flex' : 'block';
            if (this.resizeHandle) this.resizeHandle.style.display = 'block';
            this.element.style.minHeight = '';
            this.element.style.height = this._savedHeight + 'px';
            if (minBtn) minBtn.textContent = '−';
            if (!silent) bus.publish('panel:restored', { panelId: this.id });
        }

        if (!silent) bus.publish('layout:changed', { panelId: this.id });
    }

    toggleMinimize() {
        this.setMinimized(!this.minimized);
    }

    getState() {
        return {
            x: this.element.offsetLeft,
            y: this.element.offsetTop,
            width: this.element.offsetWidth,
            height: this.minimized ? this._savedHeight : this.element.offsetHeight,
            minimized: this.minimized,
            closed: this.closed,
            zIndex: Number(this.element.style.zIndex) || 10
        };
    }

    applyState(st) {
        if (!st || !this.element) return;
        if (typeof st.x === 'number') this.element.style.left = st.x + 'px';
        if (typeof st.y === 'number') this.element.style.top = st.y + 'px';
        if (typeof st.width === 'number') this.element.style.width = st.width + 'px';
        if (typeof st.height === 'number') this._savedHeight = st.height;
        if (typeof st.zIndex === 'number') this.element.style.zIndex = st.zIndex;

        this.closed = Boolean(st.closed);
        this.element.style.display = this.closed ? 'none' : 'flex';
        this.setMinimized(Boolean(st.minimized), true);
    }

    getContent() { return this.content; }
    getElement() { return this.element; }
    move(x, y) { this.element.style.left = x + 'px'; this.element.style.top = y + 'px'; }
    getPosition() { return { x: this.element.offsetLeft, y: this.element.offsetTop }; }

    static getInstances() { return new Map(FloatingPanel.#instances); }
    static createPanel(id, title, templateId, onInit, x, y, w, h) {
        const panel = new FloatingPanel(id, title, templateId, onInit);
        panel.create(x, y, w, h);
        return panel;
    }
}

class Resizer { constructor() { } }
class TabManager { constructor() { } }
class LayoutSaver {
    static STORAGE_KEY = 'ui-builder-layout';
    static save(panels) {
        try {
            localStorage.setItem(LayoutSaver.STORAGE_KEY, JSON.stringify({
                panels: panels.map(p => ({ id: p.id, ...p.getState() })),
                timestamp: Date.now()
            }));
        } catch (e) { }
    }
    static load() {
        try { const d = localStorage.getItem(LayoutSaver.STORAGE_KEY); return d ? JSON.parse(d) : null; } catch (e) { return null; }
    }
    static reset() { localStorage.removeItem(LayoutSaver.STORAGE_KEY); }
}