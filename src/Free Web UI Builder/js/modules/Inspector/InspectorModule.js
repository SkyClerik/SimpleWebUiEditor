/**
 * ============================================================
 * InspectorModule.js — Инспектор свойств (Element + CSS Selector + Library Controls)
 * ============================================================
 */

class InspectorModule {
    static SPACING_4_GROUPS = {
        padding: { shorthand: 'padding', props: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] },
        margin: { shorthand: 'margin', props: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] },
        borderWidth: { shorthand: 'borderWidth', props: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'] },
        borderRadius: { shorthand: 'borderRadius', props: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] }
    };
    constructor() {
        this.mode = 'none';
        this.currentUID = null;
        this.currentNode = null;
        this.inheritedStyles = {};
        this.availableClasses = [];
        this.currentSelector = null;
        this._collapsedCategories = new Set();
        this.colorPopover = null;
        this.activeClassDropdown = null;
    }
    init(content) {
        this.content = content;
        this.colorPopover = new CustomColorPopover();
        this.#renderEmpty();
    }
    #closeClassDropdown() {
        if (this.activeClassDropdown) { this.activeClassDropdown.remove(); this.activeClassDropdown = null; }
    }
    #renderEmpty() {
        this.#closeClassDropdown();
        this.mode = 'none';
        this.content.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'inspector-empty';
        const p = document.createElement('p');
        p.textContent = 'Выберите элемент или CSS-селектор';
        box.appendChild(p);
        this.content.appendChild(box);
    }
    showElementProperties(node, inheritedClassStyles = {}, availableClasses = []) {
        this.colorPopover?.close();
        this.#closeClassDropdown();
        if (!node) {
            this.#renderEmpty();
            this.currentUID = null; this.currentNode = null; this.currentSelector = null;
            return;
        }
        this.mode = 'element';
        this.currentUID = node.uid;
        this.currentNode = node;
        this.inheritedStyles = inheritedClassStyles || {};
        this.availableClasses = Array.isArray(availableClasses) ? availableClasses : [];
        this.currentSelector = null;
        this.content.innerHTML = '';
        this.#buildStyleCategories(node);
    }
    showSelectorProperties(selectorData) {
        this.colorPopover?.close();
        this.#closeClassDropdown();
        if (!selectorData) { this.#renderEmpty(); return; }
        this.mode = 'selector';
        this.currentUID = null; this.currentNode = null; this.inheritedStyles = {};
        this.currentSelector = selectorData;
        this.content.innerHTML = '';
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#094771;border:1px solid #007acc;border-radius:4px;padding:8px 10px;margin-bottom:10px;display:flex;flex-direction:column;gap:4px;';
        const topLine = document.createElement('div');
        topLine.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
        const title = document.createElement('div');
        title.style.cssText = 'font-family:monospace;font-size:13px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;';
        title.textContent = selectorData.selector;
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.textContent = '✎ Rename';
        renameBtn.style.cssText = 'background:#0e639c;border:1px solid #1177bb;color:#fff;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;flex-shrink:0;';
        renameBtn.addEventListener('click', () => bus.publish('selector:rename:request', { sheetName: selectorData.sheetName, oldSelector: selectorData.selector }));
        topLine.append(title, renameBtn);
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:11px;color:#9cdcfe;';
        sub.textContent = 'Stylesheet: ' + selectorData.sheetName + '.css';
        banner.append(topLine, sub);
        this.content.appendChild(banner);
        this.#buildStyleCategories(null);
    }
    #emitPropChange(prop, value) {
        if (this.mode === 'element' && this.currentUID) {
            bus.publish('style:updated', { uid: this.currentUID, field: prop, value });
        } else if (this.mode === 'selector' && this.currentSelector) {
            bus.publish('selector:style:updated', { sheetName: this.currentSelector.sheetName, selector: this.currentSelector.selector, field: prop, value });
        }
    }
    #emitAttrChange(key, attrValue) {
        if (!this.currentUID) return;
        bus.publish('attribute:updated', {
            uid: this.currentUID,
            value: attrValue === '' ? { key, action: 'delete' } : { key, action: 'update', attrValue }
        });
    }
    #buildStyleCategories(node) {
        if (this.mode === 'element' && node) {
            const textVal = node.textContent !== undefined ? node.textContent : (node.text || '');
            const basicFields = [
                this.#createPlainTextField('Tag', node.tag || 'div', true),
                this.#createPlainTextField('Name (ID)', node.name || '', false, '', (val) => bus.publish('name:changed', { uid: node.uid, value: val.trim() })),
                this.#createTextareaField('Text', textVal, (val) => bus.publish('style:updated', { uid: node.uid, field: 'textContent', value: val }))
            ];
            // Контекстные поля для тега 
            if (node.tag === 'img') {
                basicFields.push(
                    this.#createPlainTextField('Image Src', node.attributes?.src || '', false, 'https://...', (val) => this.#emitAttrChange('src', val.trim())),
                    this.#createPlainTextField('Alt Text', node.attributes?.alt || '', false, 'Description', (val) => this.#emitAttrChange('alt', val.trim()))
                );
            }
            // Контекстные поля для тега 
            if (node.tag === 'input') {
                basicFields.push(
                    this.#createPlainSelectField('Input Type', node.attributes?.type || 'text', ['text', 'password', 'number', 'email', 'checkbox', 'range'], (val) => this.#emitAttrChange('type', val)),
                    this.#createPlainTextField('Placeholder', node.attributes?.placeholder || '', false, 'Enter text...', (val) => this.#emitAttrChange('placeholder', val)),
                    this.#createPlainTextField('Default Value', node.attributes?.value || '', false, '', (val) => this.#emitAttrChange('value', val))
                );
            }
            this.#addCategory('Basic', '📋', basicFields);
            this.#addCategory('Classes', '🏷️', [this.#createClassChipsEditor(node)]);
        }
        this.#addCategory('Layout', '📐', [
            this.#createSelectField('Display', 'display', ['', 'flex', 'grid', 'block', 'inline', 'inline-flex', 'none']),
            this.#createSelectField('Flex Direction', 'flexDirection', ['', 'row', 'column', 'row-reverse', 'column-reverse']),
            this.#createSelectField('Justify Content', 'justifyContent', ['', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around']),
            this.#createSelectField('Align Items', 'alignItems', ['', 'flex-start', 'center', 'flex-end', 'stretch']),
            this.#createCssTextField('Width', 'width', 'auto'),
            this.#createCssTextField('Height', 'height', 'auto'),
            this.#createCssTextField('Min Width', 'minWidth', 'auto'),
            this.#createCssTextField('Max Width', 'maxWidth', 'none'),
            this.#createCssTextField('Min Height', 'minHeight', 'auto'),
            this.#createCssTextField('Max Height', 'maxHeight', 'none'),
            this.#createCssTextField('Flex', 'flex', '1'),
            this.#createCssTextField('Gap', 'gap', '0px'),
            this.#createSelectField('Overflow', 'overflow', ['', 'visible', 'hidden', 'auto', 'scroll'])
        ]);
        this.#addCategory('Background', '🖼️', [
            this.#createColorField('Color', 'backgroundColor', '#007acc'),
            this.#createImageUrlField('Image URL', 'backgroundImage'),
            this.#createSelectField('Image Stretch', 'backgroundImageStretch', ['', 'none', 'stretch', 'scale', 'scale-to-fill', 'tile']),
            this.#createSelectField('Image Alignment', 'backgroundImageAlignment', ['', 'center', 'topleft', 'topcenter', 'topright', 'centerleft', 'centerright', 'bottomleft', 'bottomcenter', 'bottomright']),
            this.#createColorField('Image Tint', 'backgroundImageTint', '#ffffff'),
            this.#createCssTextField('Image Size', 'backgroundSize', 'auto')
        ]);
        this.#addCategory('Spacing', '↔️', [
            this.#createSpacing4Field('Padding', InspectorModule.SPACING_4_GROUPS.padding),
            this.#createSpacing4Field('Margin', InspectorModule.SPACING_4_GROUPS.margin)
        ]);
        this.#addCategory('Border', '🔲', [
            this.#createSpacing4Field('Border Width', InspectorModule.SPACING_4_GROUPS.borderWidth),
            this.#createSpacing4Field('Border Radius', InspectorModule.SPACING_4_GROUPS.borderRadius),
            this.#createColorField('Border Color', 'borderColor', '#000000')
        ]);
        this.#addCategory('Text', '🔤', [
            this.#createColorField('Color', 'color', '#ffffff'),
            this.#createSelectField('Font Family', 'fontFamily', ['', 'inherit', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'sans-serif', 'serif', 'monospace']),
            this.#createCssTextField('Font Size', 'fontSize', '14px'),
            this.#createSelectField('Font Weight', 'fontWeight', ['', 'normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
            this.#createSelectField('Text Align', 'textAlign', ['', 'left', 'center', 'right', 'justify']),
            this.#createSelectField('Text Transform', 'textTransform', ['', 'none', 'uppercase', 'lowercase', 'capitalize']),
            this.#createCssTextField('Line Height', 'lineHeight', 'normal'),
            this.#createSelectField('Letter Spacing', 'letterSpacing', ['', 'normal', '1px', '2px', '3px', '-1px']),
            this.#createSelectField('White Space', 'whiteSpace', ['', 'normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line'])
        ]);
        if (this.mode === 'element' && node) {
            const attrRows = [];
            if (node.attributes && Object.keys(node.attributes).length) {
                Object.entries(node.attributes).forEach(([key, val]) => attrRows.push(this.#createAttributeRow(key, val)));
            } else {
                const emptyP = document.createElement('p');
                emptyP.className = 'inspector-empty-field';
                emptyP.textContent = 'No attributes';
                attrRows.push(emptyP);
            }
            const addAttrBtn = document.createElement('button');
            addAttrBtn.type = 'button';
            addAttrBtn.className = 'inspector-btn-add';
            addAttrBtn.textContent = '+ Add Attribute';
            addAttrBtn.addEventListener('click', () => {
                const key = prompt('Attribute name:');
                if (key && key.trim()) bus.publish('attribute:updated', { uid: this.currentUID, value: { key: key.trim(), action: 'add', attrValue: '' } });
            });
            attrRows.push(addAttrBtn);
            this.#addCategory('Attributes', '⚙️', attrRows);
            this.#addCategory('UID', '🔑', [this.#createPlainTextField('UID', node.uid || '', true)]);
        }
    }
    #createClassChipsEditor(node) {
        const container = document.createElement('div');
        container.className = 'inspector-field';
        container.style.cssText = 'padding-left:8px;';
        let appliedClasses = Array.isArray(node.classes) ? [...node.classes] : [];
        const chipsWrap = document.createElement('div');
        chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;';
        const commitClasses = () => {
            this.#closeClassDropdown();
            bus.publish('style:updated', { uid: node.uid, field: 'classes', value: [...appliedClasses] });
        };
        const addClass = (rawName) => {
            const clean = String(rawName || '').trim().replace(/^.+/, '').replace(/[^a-zA-Z0-9_-]/g, '');
            if (!clean || appliedClasses.includes(clean)) return;
            appliedClasses.push(clean);
            renderChips();
            commitClasses();
        };
        const removeClass = (cls) => { appliedClasses = appliedClasses.filter(c => c !== cls); renderChips(); commitClasses(); };
        const moveClass = (idx, delta) => {
            const targetIdx = idx + delta;
            if (targetIdx < 0 || targetIdx >= appliedClasses.length) return;
            const tmp = appliedClasses.at(idx);
            appliedClasses[idx] = appliedClasses.at(targetIdx);
            appliedClasses[targetIdx] = tmp;
            renderChips();
            commitClasses();
        };
        const renderChips = () => {
            chipsWrap.innerHTML = '';
            if (!appliedClasses.length) {
                const hint = document.createElement('span');
                hint.style.cssText = 'font-size:11px;color:#777;font-style:italic;';
                hint.textContent = 'No classes applied';
                chipsWrap.appendChild(hint);
                return;
            }
            appliedClasses.forEach((cls, idx) => {
                const isDefined = this.availableClasses.some(i => i.className === cls);
                const chip = document.createElement('span');
                chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:3px;font-size:12px;font-family:monospace;' +
                    (isDefined ? 'background:#094771;border:1px solid #007acc;color:#fff;' : 'background:#333337;border:1px solid #555;color:#ccc;');
                if (idx > 0) {
                    const lb = document.createElement('button');
                    lb.type = 'button'; lb.textContent = '‹';
                    lb.style.cssText = 'background:transparent;border:none;color:#9cdcfe;cursor:pointer;padding:0 1px;font-size:11px;';
                    lb.addEventListener('click', (e) => { e.stopPropagation(); moveClass(idx, -1); });
                    chip.appendChild(lb);
                }
                const txt = document.createElement('span');
                txt.textContent = '.' + cls;
                chip.appendChild(txt);
                if (idx < appliedClasses.length - 1) {
                    const rb = document.createElement('button');
                    rb.type = 'button'; rb.textContent = '›';
                    rb.style.cssText = 'background:transparent;border:none;color:#9cdcfe;cursor:pointer;padding:0 1px;font-size:11px;';
                    rb.addEventListener('click', (e) => { e.stopPropagation(); moveClass(idx, 1); });
                    chip.appendChild(rb);
                }
                const del = document.createElement('button');
                del.type = 'button'; del.textContent = '✕';
                del.style.cssText = 'background:transparent;border:none;color:#bbb;cursor:pointer;padding:0 0 0 2px;font-size:10px;';
                del.addEventListener('click', (e) => { e.stopPropagation(); removeClass(cls); });
                chip.appendChild(del);
                chipsWrap.appendChild(chip);
            });
        };
        renderChips();
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add class (type to search)...';
        this.#closeClassDropdown();
        const dropdown = document.createElement('div');
        dropdown.style.cssText = 'position:fixed;z-index:999999;background:#252526;border:1px solid #007acc;border-radius:4px;max-height:180px;overflow-y:auto;display:none;box-shadow:0 8px 24px rgba(0,0,0,0.75);font-family:sans-serif;';
        document.body.appendChild(dropdown);
        this.activeClassDropdown = dropdown;
        let highlightedIdx = -1, currentMatches = [], isSelecting = false;
        const posDrop = () => {
            const r = input.getBoundingClientRect();
            dropdown.style.left = r.left + 'px'; dropdown.style.width = r.width + 'px';
            if (window.innerHeight - r.bottom < 160 && r.top > 180) { dropdown.style.top = 'auto'; dropdown.style.bottom = (window.innerHeight - r.top + 3) + 'px'; }
            else { dropdown.style.bottom = 'auto'; dropdown.style.top = (r.bottom + 3) + 'px'; }
        };
        const hideDrop = () => { dropdown.style.display = 'none'; highlightedIdx = -1; };
        const renderDrop = () => {
            const q = input.value.trim().replace(/^.+/, '').toLowerCase();
            currentMatches = this.availableClasses.filter(i => !appliedClasses.includes(i.className) && i.className.toLowerCase().includes(q));
            dropdown.innerHTML = '';
            if (!currentMatches.length) {
                if (!q) { hideDrop(); return; }
                const h = document.createElement('div');
                h.style.cssText = 'padding:6px 8px;font-size:12px;color:#aaa;cursor:pointer;';
                h.textContent = '+ Add ".' + q + '" (Enter)';
                h.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); isSelecting = true; const v = input.value; input.value = ''; addClass(v); });
                dropdown.appendChild(h); posDrop(); dropdown.style.display = 'block'; return;
            }
            currentMatches.forEach((item, idx) => {
                const opt = document.createElement('div');
                opt.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:pointer;font-size:12px;' + (idx === highlightedIdx ? 'background:#094771;color:#fff;' : 'color:#e0e0e0;');
                const ns = document.createElement('span'); ns.style.fontFamily = 'monospace'; ns.textContent = '.' + item.className;
                const ss = document.createElement('span'); ss.style.cssText = 'font-size:10px;color:#888;'; ss.textContent = item.sheetName + '.css';
                opt.append(ns, ss);
                opt.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); isSelecting = true; input.value = ''; addClass(item.className); });
                dropdown.appendChild(opt);
            });
            posDrop(); dropdown.style.display = 'block';
        };
        input.addEventListener('focus', () => { isSelecting = false; renderDrop(); });
        input.addEventListener('click', (e) => { e.stopPropagation(); renderDrop(); });
        input.addEventListener('input', () => { highlightedIdx = -1; renderDrop(); });
        input.addEventListener('blur', () => { if (!isSelecting) setTimeout(hideDrop, 150); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' && currentMatches.length) { e.preventDefault(); highlightedIdx = (highlightedIdx + 1) % currentMatches.length; renderDrop(); }
            else if (e.key === 'ArrowUp' && currentMatches.length) { e.preventDefault(); highlightedIdx = (highlightedIdx - 1 + currentMatches.length) % currentMatches.length; renderDrop(); }
            else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                if (highlightedIdx >= 0 && currentMatches.at(highlightedIdx)) { const c = currentMatches.at(highlightedIdx).className; input.value = ''; addClass(c); }
                else if (input.value.trim()) { const t = input.value; input.value = ''; addClass(t); }
            } else if (e.key === 'Backspace' && input.value === '' && appliedClasses.length > 0) { removeClass(appliedClasses.at(-1)); }
            else if (e.key === 'Escape') hideDrop();
        });
        container.append(chipsWrap, input);
        return container;
    }
    #getActiveStylesMap() {
        if (this.mode === 'element') return this.currentNode?.inlineStyles || {};
        if (this.mode === 'selector') return this.currentSelector?.styles || {};
        return {};
    }
    #getEffectiveValue(prop) {
        const own = this.#getActiveStylesMap()[prop];
        if (own !== undefined && own !== '') return own;
        if (this.mode === 'element' && this.inheritedStyles[prop] !== undefined) return this.inheritedStyles[prop];
        return '';
    }
    #isOverridden(propsList) {
        const own = this.#getActiveStylesMap();
        return propsList.some(p => own[p] !== undefined && own[p] !== '');
    }
    #addCategory(title, icon, fieldElements) {
        const catId = title.toLowerCase().replace(/\s+/g, '-');
        const isCollapsed = this._collapsedCategories.has(catId);
        const cat = document.createElement('div');
        cat.className = 'insp-category';
        const header = document.createElement('div');
        header.className = 'insp-category-header';
        const arrow = document.createElement('span');
        arrow.className = 'insp-category-arrow';
        arrow.textContent = isCollapsed ? '▶' : '▼';
        const iconEl = document.createElement('span');
        iconEl.className = 'insp-category-icon';
        iconEl.textContent = icon;
        const titleEl = document.createElement('span');
        titleEl.className = 'insp-category-title';
        titleEl.textContent = title;
        header.append(arrow, iconEl, titleEl);
        const body = document.createElement('div');
        body.className = 'insp-category-body';
        body.style.display = isCollapsed ? 'none' : 'block';
        fieldElements.forEach(el => body.appendChild(el));
        header.addEventListener('click', () => {
            if (this._collapsedCategories.has(catId)) { this._collapsedCategories.delete(catId); body.style.display = 'block'; arrow.textContent = '▼'; }
            else { this._collapsedCategories.add(catId); body.style.display = 'none'; arrow.textContent = '▶'; }
        });
        cat.append(header, body);
        this.content.appendChild(cat);
    }
    #wrapStyleField(labelText, controlEl, propsList, onUnset) {
        const row = document.createElement('div');
        row.className = 'inspector-field';
        row.style.cssText = 'position:relative;padding-left:8px;';
        const bar = document.createElement('div');
        bar.style.cssText = 'position:absolute;left:0;top:2px;bottom:2px;width:3px;border-radius:2px;';
        const label = document.createElement('label');
        label.textContent = labelText;
        const refresh = () => {
            if (this.#isOverridden(propsList)) {
                bar.style.background = this.mode === 'element' ? '#007acc' : '#4ec9b0';
                bar.style.cursor = 'pointer';
                bar.title = 'Click to Unset';
                label.style.color = '#fff';
                label.style.fontWeight = '700';
            } else {
                bar.style.background = 'transparent';
                bar.style.cursor = 'default';
                bar.title = '';
                label.style.color = '#b0b0b0';
                label.style.fontWeight = '500';
            }
        };
        bar.addEventListener('click', () => {
            if (!this.#isOverridden(propsList)) return;
            propsList.forEach(p => this.#emitPropChange(p, ''));
            if (onUnset) onUnset();
            refresh();
        });
        refresh();
        row.append(bar, label, controlEl);
        row._refreshOverride = refresh;
        return row;
    }
    #createPlainTextField(labelText, value, readonly, placeholder, onChange) {
        const row = document.createElement('div');
        row.className = 'inspector-field';
        row.style.paddingLeft = '8px';
        const label = document.createElement('label');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        if (placeholder) input.placeholder = placeholder;
        if (readonly) { input.readOnly = true; input.className = 'inspector-readonly'; }
        else if (onChange) input.addEventListener('change', () => onChange(input.value));
        row.append(label, input);
        return row;
    }
    #createPlainSelectField(labelText, value, options, onChange) {
        const row = document.createElement('div');
        row.className = 'inspector-field';
        row.style.paddingLeft = '8px';
        const label = document.createElement('label');
        label.textContent = labelText;
        const sel = document.createElement('select');
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt;
            if (value === opt) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => onChange(sel.value));
        row.append(label, sel);
        return row;
    }
    #createTextareaField(labelText, value, onInput) {
        const row = document.createElement('div');
        row.className = 'inspector-field';
        row.style.paddingLeft = '8px';
        const label = document.createElement('label');
        label.textContent = labelText;
        const ta = document.createElement('textarea');
        ta.rows = 2; ta.value = value;
        ta.addEventListener('input', () => onInput(ta.value));
        row.append(label, ta);
        return row;
    }
    #createCssTextField(labelText, cssProp, placeholder) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.#getEffectiveValue(cssProp);
        if (placeholder) input.placeholder = placeholder;
        const row = this.#wrapStyleField(labelText, input, [cssProp], () => { input.value = this.#getEffectiveValue(cssProp); });
        input.addEventListener('change', () => { this.#emitPropChange(cssProp, input.value.trim()); row._refreshOverride(); });
        return row;
    }
    #createImageUrlField(labelText, cssProp) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.#getEffectiveValue(cssProp).replace(/^url\(["']?|["']?\)$/g, '');
        input.placeholder = 'https://...';
        const row = this.#wrapStyleField(labelText, input, [cssProp], () => { input.value = this.#getEffectiveValue(cssProp).replace(/^url\(["']?|["']?\)$/g, ''); });
        const emit = () => {
            const v = input.value.trim();
            this.#emitPropChange(cssProp, (v && v !== 'none' && !v.startsWith('url(')) ? 'url("' + v + '")' : v);
            row._refreshOverride();
        };
        input.addEventListener('change', emit);
        input.addEventListener('input', () => { if (input.value.trim() === '') emit(); });
        return row;
    }
    #createSelectField(labelText, cssProp, options) {
        const sel = document.createElement('select');
        const cur = this.#getEffectiveValue(cssProp);
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt || '— default —';
            if (cur === opt) o.selected = true;
            sel.appendChild(o);
        });
        const row = this.#wrapStyleField(labelText, sel, [cssProp], () => { sel.value = this.#getEffectiveValue(cssProp); });
        sel.addEventListener('change', () => { this.#emitPropChange(cssProp, sel.value); row._refreshOverride(); });
        return row;
    }
    #createColorField(labelText, cssProp, defaultHex = '#ffffff') {
        let cur = this.#getEffectiveValue(cssProp);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:100%;height:22px;padding:0;border:1px solid #4a4a4a;border-radius:3px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;background-image:linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%);background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;background-color:#222;';
        const mainLayer = document.createElement('div');
        mainLayer.style.cssText = 'flex:1;width:100%;';
        const alphaTrack = document.createElement('div');
        alphaTrack.style.cssText = 'height:4px;width:100%;background:#000;border-top:1px solid rgba(0,0,0,0.5);';
        const alphaBar = document.createElement('div');
        alphaBar.style.cssText = 'height:100%;background:#fff;width:100%;';
        alphaTrack.appendChild(alphaBar);
        btn.append(mainLayer, alphaTrack);
        const upd = (val) => {
            btn.title = val || 'Click to pick color';
            if (!val) { mainLayer.style.background = 'transparent'; alphaBar.style.width = '0%'; return; }
            const m = val.match(/rgba?(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
            if (m) {
                mainLayer.style.background = 'rgb(' + m.at(1) + ',' + m.at(2) + ',' + m.at(3) + ')';
                alphaBar.style.width = Math.round((m.at(4) !== undefined ? Number(m.at(4)) : 1) * 100) + '%';
            } else { mainLayer.style.background = val; alphaBar.style.width = '100%'; }
        };
        upd(cur);
        const row = this.#wrapStyleField(labelText, btn, [cssProp], () => { cur = this.#getEffectiveValue(cssProp); upd(cur); });
        btn.addEventListener('click', () => this.colorPopover.open(btn, cur, defaultHex, (nv) => { cur = nv; upd(nv); this.#emitPropChange(cssProp, nv); row._refreshOverride(); }));
        return row;
    }
    #createSpacing4Field(labelText, group) {
        const own = this.#getActiveStylesMap();
        const base = this.#parseShorthand(own[group.shorthand] || this.inheritedStyles[group.shorthand]);
        const rowEl = document.createElement('div');
        rowEl.className = 'insp-4value-row';
        const inputs = [];
        const wrapper = this.#wrapStyleField(labelText, rowEl, [group.shorthand, ...group.props], () => {
            const fb = this.#parseShorthand(this.inheritedStyles[group.shorthand]);
            group.props.forEach((p, i) => { inputs.at(i).value = this.inheritedStyles[p] ?? fb.at(i); });
        });
        group.props.forEach((cssProp, idx) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = own[cssProp] ?? this.inheritedStyles[cssProp] ?? base.at(idx);
            input.placeholder = ['T', 'R', 'B', 'L'].at(idx);
            inputs.push(input);
            input.addEventListener('change', () => {
                let v = input.value.trim();
                if (/^-?\d+(.\d+)?$/.test(v) && v !== '0') { v += 'px'; input.value = v; }
                this.#emitPropChange(cssProp, v);
                wrapper._refreshOverride();
            });
            rowEl.appendChild(input);
        });
        return wrapper;
    }
    #parseShorthand(val) {
        if (!val || val === '0px' || val === '0') return ['0px', '0px', '0px', '0px'];
        const p = String(val).trim().split(/\s+/);
        if (p.length === 1) return [p.at(0), p.at(0), p.at(0), p.at(0)];
        if (p.length === 2) return [p.at(0), p.at(1), p.at(0), p.at(1)];
        if (p.length === 3) return [p.at(0), p.at(1), p.at(2), p.at(1)];
        return [p.at(0), p.at(1), p.at(2), p.at(3)];
    }
    #createAttributeRow(key, val) {
        const row = document.createElement('div');
        row.className = 'inspector-field insp-attr-row';
        row.style.paddingLeft = '8px';
        const k = document.createElement('input'); k.type = 'text'; k.className = 'insp-attr-key'; k.value = key; k.readOnly = true;
        const v = document.createElement('input'); v.type = 'text'; v.className = 'insp-attr-val'; v.value = val;
        v.addEventListener('change', () => bus.publish('attribute:updated', { uid: this.currentUID, value: { key, action: 'update', attrValue: v.value } }));
        const d = document.createElement('button'); d.type = 'button'; d.className = 'insp-attr-del'; d.textContent = '✕';
        d.addEventListener('click', () => bus.publish('attribute:updated', { uid: this.currentUID, value: { key, action: 'delete' } }));
        row.append(k, v, d);
        return row;
    }
}