class CustomColorPopover {
    constructor() {
        this.el = null;
        this.svCanvas = null;
        this.svCursor = null;
        this.hueSlider = null;
        this.alphaSlider = null;
        this.alphaText = null;
        this.hexInput = null;
        this.previewSwatch = null;
        this.h = 0;
        this.s = 1;
        this.v = 1;
        this.a = 1;
        this.onChange = null;
        this.anchorEl = null;
        this.#createDOM();
    }

    #createDOM() {
        const pop = document.createElement('div');
        pop.style.cssText = 'position:fixed;z-index:99999;width:224px;padding:10px;background:#252526;border:1px solid #454545;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.65);display:none;flex-direction:column;gap:8px;font-family:sans-serif;font-size:12px;color:#ccc;user-select:none;';

        const svWrap = document.createElement('div');
        svWrap.style.cssText = 'position:relative;width:202px;height:140px;cursor:crosshair;border-radius:3px;overflow:hidden;border:1px solid #3c3c3c;';
        const canvas = document.createElement('canvas');
        canvas.width = 202;
        canvas.height = 140;
        canvas.style.display = 'block';
        const cursor = document.createElement('div');
        cursor.style.cssText = 'position:absolute;width:10px;height:10px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 2px #000;transform:translate(-50%,-50%);pointer-events:none;';
        svWrap.append(canvas, cursor);
        pop.appendChild(svWrap);

        const hue = document.createElement('input');
        hue.type = 'range';
        hue.min = '0';
        hue.max = '360';
        hue.value = '0';
        hue.style.cssText = 'width:100%;height:12px;cursor:pointer;background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%);appearance:none;border-radius:3px;outline:none;';
        pop.appendChild(hue);

        const alphaRow = document.createElement('div');
        alphaRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const alphaLbl = document.createElement('span');
        alphaLbl.textContent = 'A';
        alphaLbl.style.cssText = 'width:14px;color:#999;font-weight:600;';
        const alpha = document.createElement('input');
        alpha.type = 'range';
        alpha.min = '0';
        alpha.max = '1';
        alpha.step = '0.01';
        alpha.value = '1';
        alpha.style.cssText = 'flex:1;cursor:pointer;';
        const alphaVal = document.createElement('span');
        alphaVal.style.cssText = 'width:34px;text-align:right;font-variant-numeric:tabular-nums;color:#aaa;';
        alphaVal.textContent = '1.00';
        alphaRow.append(alphaLbl, alpha, alphaVal);
        pop.appendChild(alphaRow);

        const bottomRow = document.createElement('div');
        bottomRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const preview = document.createElement('div');
        preview.style.cssText = 'width:24px;height:24px;border-radius:3px;border:1px solid #555;flex-shrink:0;';
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.placeholder = '#RRGGBB';
        hexInput.style.cssText = 'flex:1;min-width:0;background:#1e1e1e;border:1px solid #3c3c3c;color:#fff;padding:4px 6px;border-radius:3px;font-family:monospace;font-size:11px;';
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = 'Unset';
        clearBtn.style.cssText = 'background:#333;border:1px solid #454545;color:#ccc;padding:4px 7px;border-radius:3px;cursor:pointer;font-size:11px;flex-shrink:0;';
        bottomRow.append(preview, hexInput, clearBtn);
        pop.appendChild(bottomRow);

        document.body.appendChild(pop);
        this.el = pop;
        this.svCanvas = canvas;
        this.svCursor = cursor;
        this.hueSlider = hue;
        this.alphaSlider = alpha;
        this.alphaText = alphaVal;
        this.hexInput = hexInput;
        this.previewSwatch = preview;

        const updateSV = (cx, cy) => {
            const r = svWrap.getBoundingClientRect();
            this.s = Math.max(0, Math.min(r.width, cx - r.left)) / r.width;
            this.v = 1 - Math.max(0, Math.min(r.height, cy - r.top)) / r.height;
            this.#syncUI(true);
        };
        svWrap.addEventListener('mousedown', (e) => {
            updateSV(e.clientX, e.clientY);
            const mv = (ev) => updateSV(ev.clientX, ev.clientY);
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
        });
        hue.addEventListener('input', () => { this.h = Number(hue.value); this.#drawSV(); this.#syncUI(true); });
        alpha.addEventListener('input', () => { this.a = Number(alpha.value); this.#syncUI(true); });
        hexInput.addEventListener('change', () => {
            const raw = hexInput.value.trim();
            if (!raw || raw === 'none') { if (this.onChange) this.onChange(''); this.close(); return; }
            this.#parseColor(raw);
            this.#drawSV();
            this.#syncUI(true);
        });
        clearBtn.addEventListener('click', () => { if (this.onChange) this.onChange(''); this.close(); });
        document.addEventListener('mousedown', (e) => {
            if (this.el.style.display !== 'none' && !this.el.contains(e.target) && (!this.anchorEl || !this.anchorEl.contains(e.target))) this.close();
        });
    }

    open(anchorEl, initialColor, defaultHex, onChange) {
        this.anchorEl = anchorEl;
        this.onChange = onChange;
        this.#parseColor(initialColor || defaultHex || '#ffffff');
        this.#drawSV();
        this.#syncUI(false);
        const rect = anchorEl.getBoundingClientRect();
        this.el.style.display = 'flex';
        this.el.style.top = Math.min(window.innerHeight - 255, rect.bottom + 6) + 'px';
        this.el.style.left = Math.max(8, Math.min(window.innerWidth - 235, rect.left)) + 'px';
    }

    close() { this.el.style.display = 'none'; this.onChange = null; }

    #drawSV() {
        const ctx = this.svCanvas.getContext('2d');
        const w = this.svCanvas.width, h = this.svCanvas.height;
        ctx.fillStyle = 'hsl(' + this.h + ',100%,50%)';
        ctx.fillRect(0, 0, w, h);
        const wg = ctx.createLinearGradient(0, 0, w, 0);
        wg.addColorStop(0, '#fff'); wg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = wg; ctx.fillRect(0, 0, w, h);
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, '#000');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    }

    #syncUI(emit) {
        const { r, g, b } = this.#hsvToRgb(this.h, this.s, this.v);
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        const css = this.a >= 0.999 ? hex : 'rgba(' + r + ',' + g + ',' + b + ',' + Number(this.a.toFixed(2)) + ')';
        this.svCursor.style.left = (this.s * 100) + '%';
        this.svCursor.style.top = ((1 - this.v) * 100) + '%';
        this.hueSlider.value = String(Math.round(this.h));
        this.alphaSlider.value = String(this.a);
        this.alphaText.textContent = this.a.toFixed(2);
        this.previewSwatch.style.background = css;
        if (document.activeElement !== this.hexInput) this.hexInput.value = css;
        if (emit && this.onChange) this.onChange(css);
    }

    #parseColor(str) {
        let r = 255, g = 255, b = 255, a = 1;
        if (/^#[0-9a-f]{6}$/i.test(str)) {
            r = parseInt(str.slice(1, 3), 16); g = parseInt(str.slice(3, 5), 16); b = parseInt(str.slice(5, 7), 16);
        } else if (/^#[0-9a-f]{3}$/i.test(str)) {
            r = parseInt(str.charAt(1) + str.charAt(1), 16); g = parseInt(str.charAt(2) + str.charAt(2), 16); b = parseInt(str.charAt(3) + str.charAt(3), 16);
        } else {
            const m = str?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (m) { r = Number(m.at(1)); g = Number(m.at(2)); b = Number(m.at(3)); a = m.at(4) !== undefined ? Number(m.at(4)) : 1; }
        }
        const hsv = this.#rgbToHsv(r, g, b);
        this.h = hsv.h; this.s = hsv.s; this.v = hsv.v; this.a = Math.max(0, Math.min(1, a));
    }

    #hsvToRgb(h, s, v) {
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        let r1 = 0, g1 = 0, b1 = 0;
        if (h < 60) { r1 = c; g1 = x; } else if (h < 120) { r1 = x; g1 = c; }
        else if (h < 180) { g1 = c; b1 = x; } else if (h < 240) { g1 = x; b1 = c; }
        else if (h < 300) { r1 = x; b1 = c; } else { r1 = c; b1 = x; }
        return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
    }

    #rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = 60 * (((g - b) / d) % 6);
            else if (max === g) h = 60 * ((b - r) / d + 2);
            else h = 60 * ((r - g) / d + 4);
        }
        if (h < 0) h += 360;
        return { h, s: max === 0 ? 0 : d / max, v: max };
    }
}