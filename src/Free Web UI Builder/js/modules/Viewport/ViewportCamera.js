/**
 * ============================================================
 * ViewportCamera.js — Камера холста (Figma-style Zoom to Cursor + Pan)
 * ============================================================
 */

class ViewportCamera {
    constructor(stageEl, hostEl, onZoomChanged) {
        this.stage = stageEl; // внешняя область (overflow: hidden)
        this.host = hostEl;   // масштабируемый артборд
        this.onZoomChanged = onZoomChanged;

        this.zoom = 1.0;
        this.panX = 24;
        this.panY = 24;
        this.baseW = 0; // 0 = Responsive (100%)
        this.baseH = 0;

        this._isPanning = false;
        this._spacePressed = false;
        this._panStartX = 0;
        this._panStartY = 0;

        this.#bindEvents();
    }

    setResolution(w, h) {
        this.baseW = Number(w) || 0;
        this.baseH = Number(h) || 0;
        this.resetView();
    }

    resetView() {
        this.zoom = 1.0;
        if (!this.baseW || !this.baseH) {
            this.panX = 0;
            this.panY = 0;
        } else {
            const rect = this.stage.getBoundingClientRect();
            this.panX = Math.max(20, Math.round((rect.width - this.baseW) / 2));
            this.panY = Math.max(20, Math.round((rect.height - this.baseH) / 2));
        }
        this.applyTransform();
        if (this.onZoomChanged) this.onZoomChanged(this.zoom);
    }

    setZoomAtPoint(newZoom, clientX, clientY) {
        const clamped = Math.max(0.1, Math.min(4.0, Number(newZoom) || 1.0));
        if (Math.abs(clamped - this.zoom) < 0.0001) return;

        const rect = this.stage.getBoundingClientRect();
        const cursorX = clientX - rect.left;
        const cursorY = clientY - rect.top;

        // Координаты точки на холсте до зума
        const worldX = (cursorX - this.panX) / this.zoom;
        const worldY = (cursorY - this.panY) / this.zoom;

        this.zoom = clamped;

        // Сдвигаем pan так, чтобы worldX/worldY остались строго под курсором
        this.panX = cursorX - worldX * this.zoom;
        this.panY = cursorY - worldY * this.zoom;

        this.applyTransform();
        if (this.onZoomChanged) this.onZoomChanged(this.zoom);
    }

    applyTransform() {
        if (!this.host || !this.stage) return;
        this.host.style.transformOrigin = '0 0';

        if (!this.baseW || !this.baseH) {
            const rect = this.stage.getBoundingClientRect();
            const w = Math.max(200, rect.width || 800);
            const h = Math.max(200, rect.height || 600);
            this.host.style.width = w + 'px';
            this.host.style.height = h + 'px';
        } else {
            this.host.style.width = this.baseW + 'px';
            this.host.style.height = this.baseH + 'px';
        }

        this.host.style.transform = 'translate(' + Math.round(this.panX) + 'px, ' + Math.round(this.panY) + 'px) scale(' + this.zoom + ')';
    }

    #bindEvents() {
        // Зум колёсиком мыши к курсору
        this.stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 0.89;
            this.setZoomAtPoint(this.zoom * factor, e.clientX, e.clientY);
        }, { passive: false });

        // Панорамирование средней кнопкой мыши или Space + ЛКМ
        window.addEventListener('keydown', (e) => {
            const tag = document.activeElement?.tagName;
            if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
                this._spacePressed = true;
                this.stage.style.cursor = 'grab';
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spacePressed = false;
                if (!this._isPanning) this.stage.style.cursor = 'default';
            }
        });

        this.stage.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && this._spacePressed)) {
                e.preventDefault();
                this._isPanning = true;
                this._panStartX = e.clientX - this.panX;
                this._panStartY = e.clientY - this.panY;
                this.stage.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this._isPanning) return;
            this.panX = e.clientX - this._panStartX;
            this.panY = e.clientY - this._panStartY;
            this.applyTransform();
        });

        window.addEventListener('mouseup', () => {
            if (!this._isPanning) return;
            this._isPanning = false;
            this.stage.style.cursor = this._spacePressed ? 'grab' : 'default';
        });

        // Пересчёт Responsive при изменении размера окна Viewport
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => {
                if (!this.baseW || !this.baseH) this.applyTransform();
            }).observe(this.stage);
        }
    }
}
