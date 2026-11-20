/**
 * ============================================================
 * ViewportModule.js — Координатор канваса, камеры и выделения
 * ============================================================
 */

class ViewportModule {
    constructor() {
        this.shadowRoot = null;
        this.sheetsContainer = null;
        this.computedClassesStyle = null;
        this.orderedSheets = [];
        this.currentData = null;
        this.selectedUID = null;
        this.hoveredUID = null;
        this.mode = 'editor';
        this.camera = null;
        this.toolbar = null;
    }

    init(content) {
        this.content = content;
        this.content.innerHTML = '';

        const panelEl = this.content.closest('.floating-panel');
        if (panelEl) {
            panelEl.style.display = 'flex';
            panelEl.style.flexDirection = 'column';
        }
        this.content.style.cssText = 'flex:1 1 auto;min-height:0;width:100%;height:calc(100% - 30px);display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;';

        const stage = document.createElement('div');
        stage.id = 'canvas-container';
        stage.style.cssText = 'flex:1 1 auto;min-height:0;width:100%;position:relative;overflow:hidden;background:#141416;user-select:none;';

        const host = document.createElement('div');
        host.id = 'canvas-host';
        host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;box-shadow:0 0 28px rgba(0,0,0,0.75);';
        stage.appendChild(host);

        const controls = document.createElement('div');
        controls.id = 'viewport-controls';
        controls.className = 'viewport-controls';
        controls.style.flexShrink = '0';

        this.content.append(stage, controls);
        this.#initShadowDOM(host);

        this.toolbar = new ViewportToolbar(controls, {
            onModeChange: (m) => this.setMode(m),
            onResolutionChange: (w, h) => this.camera?.setResolution(w, h),
            onResetZoom: () => this.camera?.resetView()
        });

        this.camera = new ViewportCamera(stage, host, (z) => {
            this.toolbar.updateZoomDisplay(z);
        });

        this.#bindCanvasEvents();

        requestAnimationFrame(() => this.camera?.applyTransform());
    }

    getCurrentData() {
        return this.currentData;
    }

    #initShadowDOM(host) {
        this.shadowRoot = host.attachShadow({ mode: 'open' });

        const defaultStyle = document.createElement('style');
        defaultStyle.textContent = ViewportCascade.DEFAULT_THEME_CSS;

        const sheetsDiv = document.createElement('div');
        const computedStyle = document.createElement('style');

        const canvas = document.createElement('div');
        canvas.id = 'canvas';
        canvas.className = 'mode-editor';

        this.shadowRoot.append(defaultStyle, sheetsDiv, computedStyle, canvas);
        this.sheetsContainer = sheetsDiv;
        this.computedClassesStyle = computedStyle;
    }

    setMode(newMode) {
        this.mode = newMode === 'preview' ? 'preview' : 'editor';
        const canvas = this.shadowRoot?.getElementById('canvas');
        if (canvas) {
            canvas.classList.toggle('mode-editor', this.mode === 'editor');
            canvas.classList.toggle('mode-preview', this.mode === 'preview');
        }
        if (this.mode === 'preview') this.#clearHover();
        this.toolbar?.setModeUI(this.mode);
    }

    setStylesheets(orderedSheets) {
        this.orderedSheets = Array.isArray(orderedSheets) ? orderedSheets : [];
        if (this.sheetsContainer) {
            this.sheetsContainer.innerHTML = '';
            this.orderedSheets.forEach((s) => {
                const st = document.createElement('style');
                st.textContent = s.cssText || '';
                this.sheetsContainer.appendChild(st);
            });
        }
        this.rebuildElementClassCascade();
    }

    rebuildElementClassCascade() {
        if (!this.computedClassesStyle) return;
        this.computedClassesStyle.textContent = ViewportCascade.buildElementClassCss(this.currentData?.root, this.orderedSheets);
    }

    render(data) {
        this.currentData = data;
        this.rebuildElementClassCascade();
        const canvas = this.shadowRoot.getElementById('canvas');
        canvas.innerHTML = '';

        if (data?.root) {
            canvas.appendChild(ViewportCascade.renderNodeDOM(data.root));
            if (this.selectedUID) {
                const el = canvas.querySelector('[data-uid="' + this.selectedUID + '"]');
                if (el) el.setAttribute('data-ve-selected', '');
                else this.selectedUID = null;
            }
        }
    }

    updateNodeStyle(uid, prop, value, allStyles) {
        const el = this.shadowRoot?.querySelector('[data-uid="' + uid + '"]');
        if (el) ViewportCascade.applySingleInlineStyle(el, prop, value, allStyles);
    }

    updateNodeText(uid, text) {
        const el = this.shadowRoot?.querySelector('[data-uid="' + uid + '"]');
        if (!el) return;
        const tn = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
        if (tn) tn.nodeValue = text;
        else el.insertBefore(document.createTextNode(text), el.firstChild);
    }

    updateNodeClasses(uid, classes) {
        const el = this.shadowRoot?.querySelector('[data-uid="' + uid + '"]');
        if (el) el.className = Array.isArray(classes) ? classes.join(' ') : '';
        this.rebuildElementClassCascade();
    }

    updateNodeName(uid, name) {
        const el = this.shadowRoot?.querySelector('[data-uid="' + uid + '"]');
        if (!el) return;
        if (name) el.dataset.veId = name;
        else delete el.dataset.veId;
    }

    updateSelection(uid, emitEvent = false) {
        this.shadowRoot?.querySelector('[data-ve-selected]')?.removeAttribute('data-ve-selected');
        this.selectedUID = uid;
        if (!uid) return;

        const el = this.shadowRoot?.querySelector('[data-uid="' + uid + '"]');
        if (el) {
            el.removeAttribute('data-ve-hovered');
            el.setAttribute('data-ve-selected', '');
            if (emitEvent) {
                const node = this.#findNode(this.currentData?.root, uid);
                if (node) bus.publish('ve:selected', { element: el, jsonNode: node, uid, name: node.name });
            }
        }
    }

    #bindCanvasEvents() {
        const canvas = this.shadowRoot.getElementById('canvas');

        canvas.addEventListener('click', (e) => {
            if (this.mode === 'preview' || this.camera?._spacePressed) return;
            const veNode = e.target.closest('[data-uid]');
            if (veNode) {
                e.stopPropagation();
                this.updateSelection(veNode.dataset.uid, true);
            }
        });

        canvas.addEventListener('mouseover', (e) => {
            if (this.mode === 'preview') return;
            const veNode = e.target.closest('[data-uid]');
            if (veNode && veNode.dataset.uid !== this.hoveredUID) {
                this.#clearHover();
                if (veNode.dataset.uid !== this.selectedUID) this.#setHover(veNode.dataset.uid);
            }
        });

        canvas.addEventListener('mouseout', (e) => {
            if (!e.relatedTarget || !canvas.contains(e.relatedTarget)) this.#clearHover();
        });
    }

    #setHover(uid) {
        const el = this.shadowRoot?.querySelector('[data-uid="' + uid + '"]');
        if (el) { el.setAttribute('data-ve-hovered', ''); this.hoveredUID = uid; bus.publish('ve:hover', { uid }); }
    }

    #clearHover() {
        if (!this.hoveredUID) return;
        this.shadowRoot?.querySelector('[data-uid="' + this.hoveredUID + '"]')?.removeAttribute('data-ve-hovered');
        bus.publish('ve:unhover', { uid: this.hoveredUID });
        this.hoveredUID = null;
    }

    #findNode(root, uid) {
        if (!root) return null;
        if (root.uid === uid) return root;
        if (root.children) {
            for (const c of root.children) {
                const found = this.#findNode(c, uid);
                if (found) return found;
            }
        }
        return null;
    }
}
