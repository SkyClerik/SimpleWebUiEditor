/**
 * ============================================================
 * StylesheetsModule.js — Отдельное окно управления .css и селекторами
 * ============================================================
 */

class StylesheetsModule {
    constructor() {
        this.sheetsContainer = null;
        this.activeDoc = null;
        this.selectedSelectorKey = null;
        this._collapsedSheets = new Set();
        this.stylesheetsData = new Map();
        this.attachMenuEl = null;
        this.fileInputEl = null;
    }

    init(content) {
        this.content = content;
        this.content.innerHTML = [
            '<div style="display: flex; gap: 4px; margin-bottom: 8px;">',
            '    <button type="button" class="hierarchy-btn" id="btn-new-css" style="flex: 1;">+ New CSS</button>',
            '    <button type="button" class="hierarchy-btn" id="btn-attach-css" style="flex: 1;">+ Attach CSS</button>',
            '</div>',
            '<div id="stylesheets-list"></div>'
        ].join('\n');

        this.sheetsContainer = this.content.querySelector('#stylesheets-list');
        this.#initAttachMenuAndFileDialog();
        this.content.querySelector('#btn-new-css')?.addEventListener('click', () => this.#createStylesheet());
        this.content.querySelector('#btn-attach-css')?.addEventListener('click', (e) => this.#openAttachMenu(e.currentTarget));
    }

    clearSelection() {
        this.selectedSelectorKey = null;
        this.render();
    }

    async setDocument(data) {
        this.activeDoc = data;
        this.selectedSelectorKey = null;
        if (!data) {
            if (this.sheetsContainer) this.sheetsContainer.innerHTML = '';
            return;
        }
        if (!Array.isArray(data.stylesheets)) data.stylesheets = [];
        await this.loadDocumentStylesheets(data.stylesheets);
        this.render();
    }

    async loadDocumentStylesheets(sheetNames) {
        for (const rawName of sheetNames) {
            const name = rawName.replace('.css', '');
            if (!this.stylesheetsData.has(name)) {
                try {
                    const res = await fetch('/api/stylesheets/' + encodeURIComponent(name));
                    if (res.ok) {
                        const payload = await res.json();
                        this.stylesheetsData.set(name, { name, rules: this.parseCssToRules(payload.css || '') });
                    } else {
                        this.stylesheetsData.set(name, { name, rules: new Map() });
                    }
                } catch (e) {
                    this.stylesheetsData.set(name, { name, rules: new Map() });
                }
            }
        }
    }

    getOrderedStylesheets() {
        if (!this.activeDoc || !Array.isArray(this.activeDoc.stylesheets)) return [];
        return this.activeDoc.stylesheets.map((raw) => {
            const name = raw.replace('.css', '');
            const sheet = this.stylesheetsData.get(name) || { name, rules: new Map() };
            return { name, cssText: this.serializeRulesToCss(sheet.rules), rules: sheet.rules };
        });
    }

    getAvailableClassItems() {
        const items = [];
        const seen = new Set();
        const classRegex = new RegExp('^\\.[a-zA-Z0-9_-]+$');

        for (const sheet of this.getOrderedStylesheets()) {
            sheet.rules.forEach(function (styleObj, selector) {
                if (classRegex.test(selector)) {
                    const className = selector.slice(1);
                    if (!seen.has(className)) {
                        seen.add(className);
                        items.push({ className: className, sheetName: sheet.name });
                    }
                }
            });
        }
        return items;
    }

    getMatchedClassStyles(node) {
        const merged = {};
        if (!node || !Array.isArray(node.classes) || !node.classes.length) return merged;
        for (const sheet of this.getOrderedStylesheets()) {
            for (const cls of node.classes) {
                const rule = sheet.rules.get('.' + cls);
                if (rule) Object.assign(merged, rule);
            }
        }
        return merged;
    }

    #normalizeSelectorInput(raw) {
        const trimmed = String(raw || '').trim();
        if (!trimmed) return '';
        const baseTags = new Set(['div', 'button', 'span', 'input', 'img', 'p', 'h1', 'h2', 'h3', 'a', 'label']);
        if (!trimmed.startsWith('.') && !trimmed.startsWith('#') && !trimmed.startsWith(':') && !trimmed.startsWith('[') && !baseTags.has(trimmed.toLowerCase())) {
            return '.' + trimmed;
        }
        return trimmed;
    }

    render() {
        if (!this.sheetsContainer) return;
        this.sheetsContainer.innerHTML = '';

        const list = this.activeDoc?.stylesheets || [];
        if (!list.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:12px;color:#777;font-style:italic;padding:6px 2px;';
            empty.textContent = 'No stylesheets attached';
            this.sheetsContainer.appendChild(empty);
            return;
        }

        list.forEach((rawName, idx) => {
            const name = rawName.replace('.css', '');
            const sheet = this.stylesheetsData.get(name) || { name, rules: new Map() };
            const isCollapsed = this._collapsedSheets.has(name);

            const sheetBox = document.createElement('div');
            sheetBox.style.cssText = 'background:#252526;border:1px solid #191919;border-radius:3px;margin-bottom:6px;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 6px;background:#333337;cursor:pointer;font-size:12px;';

            const arrow = document.createElement('span');
            arrow.textContent = isCollapsed ? '▶' : '▼';
            arrow.style.cssText = 'font-size:9px;color:#999;width:10px;';

            const title = document.createElement('span');
            title.textContent = name + '.css';
            title.style.cssText = 'flex:1;font-weight:600;color:#dcdcaa;overflow:hidden;text-overflow:ellipsis;';

            const addSelBtn = this.#miniBtn('+ Selector', 'Add CSS selector (.btn, .btn:hover)');
            addSelBtn.addEventListener('click', (e) => { e.stopPropagation(); this.#addSelectorToSheet(name); });

            const detachBtn = this.#miniBtn('✕', 'Detach from document');
            detachBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.activeDoc.stylesheets.splice(idx, 1);
                this.render();
                bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
            });

            header.append(arrow, title, addSelBtn, detachBtn);
            header.addEventListener('click', () => {
                if (this._collapsedSheets.has(name)) this._collapsedSheets.delete(name);
                else this._collapsedSheets.add(name);
                this.render();
            });

            sheetBox.appendChild(header);

            if (!isCollapsed) {
                const rulesWrap = document.createElement('div');
                rulesWrap.style.cssText = 'padding:4px;display:flex;flex-direction:column;gap:2px;';

                if (sheet.rules.size === 0) {
                    const hint = document.createElement('div');
                    hint.style.cssText = 'font-size:11px;color:#777;padding:2px 6px;';
                    hint.textContent = 'Click "+ Selector" to add .class';
                    rulesWrap.appendChild(hint);
                } else {
                    sheet.rules.forEach((stylesObj, selector) => {
                        const key = name + '::' + selector;
                        const isSelected = this.selectedSelectorKey === key;

                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:3px;cursor:pointer;font-size:12px;font-family:monospace;' +
                            (isSelected ? 'background:#094771;color:#fff;' : 'color:#9cdcfe;');

                        const selText = document.createElement('span');
                        selText.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;';
                        selText.textContent = selector;

                        const renameBtn = document.createElement('button');
                        renameBtn.type = 'button'; renameBtn.textContent = '✎'; renameBtn.title = 'Rename selector';
                        renameBtn.style.cssText = 'background:transparent;border:none;color:#aaa;cursor:pointer;font-size:11px;padding:0 2px;';
                        renameBtn.addEventListener('click', (e) => { e.stopPropagation(); this.promptRenameSelector(name, selector); });

                        const delBtn = document.createElement('button');
                        delBtn.type = 'button'; delBtn.textContent = '✕'; delBtn.title = 'Delete selector';
                        delBtn.style.cssText = 'background:transparent;border:none;color:#888;cursor:pointer;font-size:10px;padding:0 2px;';
                        delBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            sheet.rules.delete(selector);
                            if (this.selectedSelectorKey === key) {
                                this.selectedSelectorKey = null;
                                bus.publish('selector:selected', null);
                            }
                            this.saveStylesheetToServer(name);
                            this.render();
                            bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
                        });

                        row.append(selText, renameBtn, delBtn);
                        row.addEventListener('click', () => {
                            this.selectedSelectorKey = key;
                            this.render();
                            bus.publish('selector:selected', { sheetName: name, selector, styles: stylesObj });
                        });
                        rulesWrap.appendChild(row);
                    });
                }
                sheetBox.appendChild(rulesWrap);
            }
            this.sheetsContainer.appendChild(sheetBox);
        });
    }
    #miniBtn(text, title) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = text; b.title = title;
        b.style.cssText = 'background:#252526;border:1px solid #444;color:#ccc;border-radius:2px;padding:1px 5px;font-size:10px;cursor:pointer;';
        return b;
    }
    #initAttachMenuAndFileDialog() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = '.css,text/css'; fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        this.fileInputEl = fileInput;
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.item(0);
            fileInput.value = '';
            if (!file || !this.activeDoc) return;
            const name = file.name.toLowerCase().replace('.css', '').replace(/[^a-z0-9_-]/g, '_');
            const cssText = await file.text();
            this.stylesheetsData.set(name, { name, rules: this.parseCssToRules(cssText) });
            await this.saveStylesheetToServer(name);
            const fileName = name + '.css';
            if (!this.activeDoc.stylesheets.includes(fileName)) this.activeDoc.stylesheets.push(fileName);
            this.render();
            bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
        });
        const menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;z-index:99999;min-width:210px;max-width:280px;background:#252526;border:1px solid #454545;border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,0.65);display:none;flex-direction:column;padding:4px 0;font-family:sans-serif;font-size:12px;color:#e0e0e0;';
        document.body.appendChild(menu);
        this.attachMenuEl = menu;
        document.addEventListener('mousedown', (e) => {
            if (menu.style.display === 'none') return;
            const btn = this.content?.querySelector('#btn-attach-css');
            if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) menu.style.display = 'none';
        });
    }
    async #openAttachMenu(anchorBtn) {
        if (!this.activeDoc || !this.attachMenuEl) return;
        if (this.attachMenuEl.style.display === 'flex') { this.attachMenuEl.style.display = 'none'; return; }
        this.attachMenuEl.innerHTML = '';
        const header = document.createElement('div');
        header.style.cssText = 'padding:4px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#888;border-bottom:1px solid #333;';
        header.textContent = 'Project Stylesheets';
        this.attachMenuEl.appendChild(header);
        let serverSheets = [];
        try {
            const res = await fetch('/api/stylesheets');
            if (res.ok) serverSheets = (await res.json()).stylesheets || [];
        } catch (e) { }
        const alreadyAttached = new Set(this.activeDoc.stylesheets || []);
        const available = serverSheets.filter((s) => !alreadyAttached.has(s.path));
        if (!available.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:6px 10px;font-size:12px;color:#777;font-style:italic;';
            empty.textContent = serverSheets.length ? 'All project .css attached' : 'No .css in project yet';
            this.attachMenuEl.appendChild(empty);
        } else {
            available.forEach((s) => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;';
                item.addEventListener('mouseenter', () => { item.style.background = '#094771'; item.style.color = '#fff'; });
                item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; item.style.color = '#e0e0e0'; });
                item.textContent = '🎨 ' + s.path;
                item.addEventListener('click', async () => {
                    this.attachMenuEl.style.display = 'none';
                    this.activeDoc.stylesheets.push(s.path);
                    await this.loadDocumentStylesheets(this.activeDoc.stylesheets);
                    this.render();
                    bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
                });
                this.attachMenuEl.appendChild(item);
            });
        }
        const divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:#333;margin:4px 0;';
        this.attachMenuEl.appendChild(divider);
        const browseBtn = document.createElement('div');
        browseBtn.style.cssText = 'padding:6px 10px;cursor:pointer;color:#9cdcfe;font-weight:600;';
        browseBtn.addEventListener('mouseenter', () => { browseBtn.style.background = '#094771'; browseBtn.style.color = '#fff'; });
        browseBtn.addEventListener('mouseleave', () => { browseBtn.style.background = 'transparent'; browseBtn.style.color = '#9cdcfe'; });
        browseBtn.textContent = '📂 Browse local .css file...';
        browseBtn.addEventListener('click', () => { this.attachMenuEl.style.display = 'none'; this.fileInputEl.click(); });
        this.attachMenuEl.appendChild(browseBtn);
        const rect = anchorBtn.getBoundingClientRect();
        this.attachMenuEl.style.display = 'flex';
        this.attachMenuEl.style.top = (rect.bottom + 4) + 'px';
        this.attachMenuEl.style.left = Math.max(8, Math.min(window.innerWidth - 230, rect.left)) + 'px';
    }
    async #createStylesheet() {
        if (!this.activeDoc) return;
        const raw = prompt('New stylesheet name (e.g. theme):');
        if (!raw || !raw.trim()) return;
        const name = raw.trim().toLowerCase().replace('.css', '').replace(/[^a-z0-9_-]/g, '_');
        if (!this.stylesheetsData.has(name)) {
            this.stylesheetsData.set(name, { name, rules: new Map() });
            await this.saveStylesheetToServer(name);
        }
        const fileName = name + '.css';
        if (!this.activeDoc.stylesheets.includes(fileName)) this.activeDoc.stylesheets.push(fileName);
        this.render();
        bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
    }
    #addSelectorToSheet(sheetName) {
        const raw = prompt('CSS Selector (e.g. .btn-primary, .btn-primary:hover, .btn-primary:active):', '.btn-primary');
        const selector = this.#normalizeSelectorInput(raw);
        if (!selector) return;
        const sheet = this.stylesheetsData.get(sheetName);
        if (!sheet) return;
        if (!sheet.rules.has(selector)) sheet.rules.set(selector, {});
        this.selectedSelectorKey = sheetName + '::' + selector;
        this.saveStylesheetToServer(sheetName);
        this.render();
        bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
        bus.publish('selector:selected', { sheetName, selector, styles: sheet.rules.get(selector) });
    }
    promptRenameSelector(sheetName, oldSelector) {
        const sheet = this.stylesheetsData.get(sheetName);
        if (!sheet || !sheet.rules.has(oldSelector)) return;
        const raw = prompt('Rename CSS selector:', oldSelector);
        const newSelector = this.#normalizeSelectorInput(raw);
        if (!newSelector || newSelector === oldSelector) return;
        if (sheet.rules.has(newSelector)) { alert('Selector already exists: ' + newSelector); return; }
        const newRules = new Map();
        sheet.rules.forEach((stylesObj, key) => {
            newRules.set(key === oldSelector ? newSelector : key, stylesObj);
        });
        sheet.rules = newRules;
        const wasSelected = this.selectedSelectorKey === (sheetName + '::' + oldSelector);
        if (wasSelected) this.selectedSelectorKey = sheetName + '::' + newSelector;
        this.saveStylesheetToServer(sheetName);
        this.render();
        bus.publish('selector:renamed', { sheetName, oldSelector, newSelector, stylesheets: this.getOrderedStylesheets() });
        if (wasSelected) bus.publish('selector:selected', { sheetName, selector: newSelector, styles: sheet.rules.get(newSelector) });
    }
    updateSelectorStyle(sheetName, selector, prop, value) {
        const sheet = this.stylesheetsData.get(sheetName);
        const rule = sheet?.rules.get(selector);
        if (!rule) return;
        if (value === '' || value === null || value === undefined) delete rule[prop];
        else rule[prop] = value;
        this.saveStylesheetToServer(sheetName);
        bus.publish('stylesheets:updated', { stylesheets: this.getOrderedStylesheets() });
    }
    async saveStylesheetToServer(sheetName) {
        const sheet = this.stylesheetsData.get(sheetName);
        if (!sheet) return;
        try {
            await fetch('/api/stylesheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: sheetName, css: this.serializeRulesToCss(sheet.rules) })
            });
        } catch (e) { }
    }
    parseCssToRules(cssText) {
        const rules = new Map();
        const blockRegex = new RegExp('([^{}]+)\{([^{}]*)\}', 'g');
        let match;
        while ((match = blockRegex.exec(cssText)) !== null) {
            const selector = match.at(1).trim();
            const body = match.at(2).trim();
            if (!selector) continue;
            const styleObj = {};
            body.split(';').forEach((decl) => {
                const colonIdx = decl.indexOf(':');
                if (colonIdx === -1) return;
                const kebab = decl.slice(0, colonIdx).trim();
                const val = decl.slice(colonIdx + 1).trim();
                if (!kebab || !val) return;
                const camel = kebab.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
                styleObj[camel] = val;
            });
            rules.set(selector, styleObj);
        }
        return rules;
    }
    serializeRulesToCss(rulesMap) {
        const numRegex = new RegExp('^-?\d+(\.\d+)?$');
        const blocks = [];
        rulesMap.forEach((stylesObj, selector) => {
            const lines = [];
            Object.entries(stylesObj).forEach(([prop, val]) => {
                if (val === '' || val === null || val === undefined) return;
                const kebab = prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
                let cssVal = String(val).trim();
                if (numRegex.test(cssVal) && cssVal !== '0' && !['opacity', 'flex', 'fontWeight', 'zIndex'].includes(prop)) cssVal += 'px';
                lines.push('    ' + kebab + ': ' + cssVal + ';');
            });
            blocks.push(selector + ' {\n' + lines.join('\n') + '\n}');
        });
        return blocks.join('\n\n') + (blocks.length ? '\n' : '');
    }
}