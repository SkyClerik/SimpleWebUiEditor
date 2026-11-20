/**
 * ============================================================
 * VisualElement.js — Runtime UI Engine (.ve.json + .css)
 * В стиле Unity UI Toolkit:
 * - Q() / Query() по живому дереву
 * - add() / insert() / clear() / removeFromHierarchy()
 * - VisualElement.instantiate('templateName') для клонирования .ve.json в списки
 * ============================================================
 */

class VisualElement {
    static DEFAULT_THEME_CSS = [
        ':host { display: block; width: 100%; height: 100%; font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; color: #e0e0e0; }',
        '[data-uid] { position: relative; box-sizing: border-box; }',
        'button { background: #3c3c3c; color: #ffffff; border: 1px solid #555555; border-radius: 4px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-family: inherit; }',
        'button:hover { background: #4a4a4a; }',
        'input { background: #2d2d30; color: #e0e0e0; border: 1px solid #555555; border-radius: 4px; padding: 6px 8px; font-size: 13px; font-family: inherit; }',
        'span { display: inline-block; }'
    ].join('\n');

    static AUTO_PX_PROPS = new Set([
        'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
        'fontSize', 'lineHeight', 'letterSpacing', 'gap',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'
    ]);

    static _templateCache = new Map();
    static _uidCounter = 0;

    static _nextUID() {
        VisualElement._uidCounter += 1;
        return 've-rt-' + Date.now().toString(36) + '-' + VisualElement._uidCounter;
    }

    /**
     * Поддерживает создание как из JSON-узла, так и вручную в коде:
     * new VisualElement('div', { name: 'MyBox', classes: ['card'], text: 'Hello' })
     */
    constructor(nodeDataOrTag = 'div', optionsOrDom = null, rootContext = null) {
        let nodeData = {};
        let domElement = null;

        if (typeof nodeDataOrTag === 'string') {
            const opts = (optionsOrDom && !(optionsOrDom instanceof HTMLElement)) ? optionsOrDom : {};
            nodeData = {
                uid: opts.uid || VisualElement._nextUID(),
                name: opts.name || '',
                tag: nodeDataOrTag,
                classes: Array.isArray(opts.classes) ? opts.classes : [],
                inlineStyles: opts.style || opts.inlineStyles || {},
                attributes: opts.attributes || {},
                textContent: opts.text !== undefined ? opts.text : (opts.textContent || '')
            };
            domElement = document.createElement(nodeData.tag);
            domElement.dataset.uid = nodeData.uid;
            if (nodeData.name) domElement.dataset.veId = nodeData.name;
            if (nodeData.classes.length) domElement.className = nodeData.classes.join(' ');
            Object.entries(nodeData.attributes).forEach(([k, v]) => {
                if (k !== 'style' && k !== 'class') domElement.setAttribute(k, v);
            });
        } else {
            nodeData = nodeDataOrTag || {};
            domElement = optionsOrDom;
        }

        this.uid = nodeData.uid || VisualElement._nextUID();
        this.name = nodeData.name || '';
        this.tag = nodeData.tag || 'div';
        this.classes = Array.isArray(nodeData.classes) ? [...nodeData.classes] : [];
        this.inlineStyles = { ...(nodeData.inlineStyles || {}) };
        this.attributes = { ...(nodeData.attributes || {}) };
        this.dom = domElement;
        this.parent = null;
        this.children = [];
        this._root = rootContext || this;

        if (this._root === this) {
            this._docName = 'unknown';
            this._shadow = null;
            this._rawSheetsDiv = null;
            this._loadedSheets = new Set();
            this._classRulesMap = new Map();
            this._computedStyleEl = null;
            this._baseCssUrl = 'stylesheets/';
        }

        this.style = new Proxy(this.inlineStyles, {
            set: (target, prop, value) => {
                if (value === '' || value === null || value === undefined) {
                    delete target[prop];
                    this.dom.style[prop] = '';
                } else {
                    let cssVal = String(value).trim();
                    if (VisualElement.AUTO_PX_PROPS.has(prop) && /^-?\d+(\.\d+)?$/.test(cssVal) && cssVal !== '0') {
                        cssVal += 'px';
                    }
                    target[prop] = cssVal;
                    this.dom.style[prop] = cssVal;
                }
                return true;
            },
            get: (target, prop) => target[prop] ?? this.dom.style[prop]
        });

        if (typeof nodeDataOrTag === 'string') {
            Object.entries(this.inlineStyles).forEach(([prop, val]) => {
                this.style[prop] = val;
            });
            if (nodeData.textContent !== '') {
                this.text = nodeData.textContent;
            }
        }
    }

    // === Свойства элемента ===

    get text() {
        const textNode = Array.from(this.dom.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        return textNode ? textNode.nodeValue : '';
    }

    set text(val) {
        const str = val === null || val === undefined ? '' : String(val);
        const textNode = Array.from(this.dom.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (textNode) {
            textNode.nodeValue = str;
        } else {
            this.dom.insertBefore(document.createTextNode(str), this.dom.firstChild);
        }
    }

    get value() {
        return this.dom.value ?? '';
    }

    set value(val) {
        if ('value' in this.dom) this.dom.value = val;
    }

    get visible() {
        return this.dom.style.display !== 'none';
    }

    set visible(isVisible) {
        this.dom.style.display = isVisible ? '' : 'none';
    }

    // === Динамическое управление деревом в рантайме (как в Unity VisualElement) ===

    add(childVE) {
        if (!childVE || !(childVE instanceof VisualElement)) return this;
        if (childVE.parent) childVE.removeFromHierarchy();

        childVE.parent = this;
        this.children.push(childVE);
        this.dom.appendChild(childVE.dom);

        // Перепривязываем всё добавленное поддерево к контексту текущего корня
        childVE.#attachToRoot(this._root);

        // Если у добавленного шаблона были свои .css — подгружаем их в текущий ShadowRoot
        if (Array.isArray(childVE._pendingStylesheets) && childVE._pendingStylesheets.length && this._root._rawSheetsDiv) {
            VisualElement.#loadStylesheetsIntoRoot(
                childVE._pendingStylesheets,
                this._root,
                this._root._baseCssUrl
            ).then(() => this._root.#rebuildClassCascade());
        } else {
            this._root.#rebuildClassCascade();
        }

        return this;
    }

    insert(index, childVE) {
        if (!childVE || !(childVE instanceof VisualElement)) return this;
        if (childVE.parent) childVE.removeFromHierarchy();

        const clampedIdx = Math.max(0, Math.min(this.children.length, index));
        childVE.parent = this;
        this.children.splice(clampedIdx, 0, childVE);

        const refDom = this.dom.children[clampedIdx] || null;
        this.dom.insertBefore(childVE.dom, refDom);

        childVE.#attachToRoot(this._root);
        this._root.#rebuildClassCascade();
        return this;
    }

    removeFromHierarchy() {
        if (!this.parent) return;
        const rootRef = this._root;
        this.parent.children = this.parent.children.filter(c => c !== this);
        if (this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
        this.parent = null;
        this.#attachToRoot(this);
        rootRef.#rebuildClassCascade();
    }

    clear() {
        while (this.children.length > 0) {
            const child = this.children.pop();
            child.parent = null;
            child.#attachToRoot(child);
        }
        this.dom.innerHTML = '';
        this._root.#rebuildClassCascade();
        return this;
    }

    #attachToRoot(newRoot) {
        this._root = newRoot;
        for (const child of this.children) {
            child.#attachToRoot(newRoot);
        }
    }

    // === Поиск элементов по живому дереву: Q() -> первый совпавший, Query() -> список всех ===

    Q(query, options = { strict: true }) {
        if (!query || typeof query !== 'string') return null;
        const clean = query.trim();

        const found = clean.startsWith('.')
            ? this.#findFirst(el => el.classes.includes(clean.slice(1)))
            : this.#findFirst(el => el.name === (clean.startsWith('#') ? clean.slice(1) : clean));

        if (!found && options?.strict !== false) {
            const available = this.#collectAllNames().join(', ') || 'none';
            throw new Error(
                '[VisualElement] Element "' + clean + '" not found in "' + (this.name || this._root._docName) + '". ' +
                'Available IDs: [' + available + ']'
            );
        }

        return found || null;
    }

    Query(query) {
        if (!query || typeof query !== 'string') return [];
        const clean = query.trim();
        const results = [];

        const predicate = clean.startsWith('.')
            ? (el) => el.classes.includes(clean.slice(1))
            : (el) => el.name === (clean.startsWith('#') ? clean.slice(1) : clean);

        const walk = (el) => {
            if (predicate(el)) results.push(el);
            el.children.forEach(walk);
        };
        walk(this);
        return results;
    }

    #findFirst(predicate) {
        if (predicate(this)) return this;
        for (const child of this.children) {
            const res = child.#findFirst(predicate);
            if (res) return res;
        }
        return null;
    }
    #collectAllNames() {
        const names = [];
        const walk = (el) => {
            if (el.name) names.push(el.name);
            el.children.forEach(walk);
        };
        walk(this);
        return names;
    }
    // === Управление классами ===
    addClass(className) {
        const clean = String(className || '').replace(/^./, '').trim();
        if (!clean || this.classes.includes(clean)) return this;
        this.classes.push(clean);
        this.dom.className = this.classes.join(' ');
        this._root.#rebuildClassCascade();
        return this;
    }
    removeClass(className) {
        const clean = String(className || '').replace(/^./, '').trim();
        if (!this.classes.includes(clean)) return this;
        this.classes = this.classes.filter(c => c !== clean);
        this.dom.className = this.classes.join(' ');
        this._root.#rebuildClassCascade();
        return this;
    }
    toggleClass(className, force) {
        const has = this.classes.includes(className);
        const shouldAdd = force !== undefined ? Boolean(force) : !has;
        return shouldAdd ? this.addClass(className) : this.removeClass(className);
    }
    on(eventName, handler) {
        this.dom.addEventListener(eventName, (e) => handler(e, this));
        return this;
    }
    // === Загрузка документа и инстанцирование шаблонов ===
    static async #fetchDocData(docNameOrUrl) {
        let cleanDocName = String(docNameOrUrl || 'main').trim();
        if (cleanDocName.startsWith('documents/')) {
            cleanDocName = cleanDocName.slice('documents/'.length);
        }
        if (cleanDocName.endsWith('.ve.json')) {
            cleanDocName = cleanDocName.slice(0, -'.ve.json'.length);
        } else if (cleanDocName.endsWith('.json')) {
            cleanDocName = cleanDocName.slice(0, -'.json'.length);
        }

        if (window.VE_BUNDLE?.documents?.[cleanDocName]) {
            return { cleanDocName, docData: window.VE_BUNDLE.documents[cleanDocName] };
        }

        if (VisualElement._templateCache.has(cleanDocName)) {
            return { cleanDocName, docData: VisualElement._templateCache.get(cleanDocName) };
        }

        const url = docNameOrUrl.endsWith('.json') || docNameOrUrl.startsWith('/') || docNameOrUrl.startsWith('http')
            ? docNameOrUrl
            : '/api/documents/' + encodeURIComponent(cleanDocName);

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error('[VisualElement] Failed to load UI document: ' + url + ' (' + res.status + ')');
        }
        const payload = await res.json();
        const docData = payload.data ? payload.data : payload;
        VisualElement._templateCache.set(cleanDocName, docData);
        return { cleanDocName, docData };
    }

    /**
    * Аналог VisualTreeAsset.Instantiate() в Unity:
    * Клонирует .ve.json шаблон со свежими UID для вставки в списки через parent.add(instance)
    */
    static async instantiate(docNameOrUrl) {
        const { cleanDocName, docData } = await VisualElement.#fetchDocData(docNameOrUrl);
        if (!docData || !docData.root) {
            throw new Error('[VisualElement] Invalid template structure for: ' + cleanDocName);
        }
        const instanceVE = VisualElement.#buildTree(docData.root, null, true);
        instanceVE._docName = docData.name || cleanDocName;
        instanceVE._pendingStylesheets = Array.isArray(docData.stylesheets) ? [...docData.stylesheets] : [];
        return instanceVE;
    }
    static async mount(docNameOrUrl, hostElement, options = {}) {
        const { cleanDocName, docData } = await VisualElement.#fetchDocData(docNameOrUrl);
        if (!docData || !docData.root) {
            throw new Error('[VisualElement] Invalid .ve.json structure for: ' + cleanDocName);
        }
        const shadow = hostElement.shadowRoot || hostElement.attachShadow({ mode: 'open' });
        shadow.innerHTML = '';
        const defaultStyle = document.createElement('style');
        defaultStyle.textContent = VisualElement.DEFAULT_THEME_CSS;
        shadow.appendChild(defaultStyle);
        const rawSheetsDiv = document.createElement('div');
        shadow.appendChild(rawSheetsDiv);
        const computedStyleEl = document.createElement('style');
        shadow.appendChild(computedStyleEl);
        const rootVE = VisualElement.#buildTree(docData.root, null, false);
        rootVE._docName = docData.name || cleanDocName;
        rootVE._shadow = shadow;
        rootVE._rawSheetsDiv = rawSheetsDiv;
        rootVE._computedStyleEl = computedStyleEl;
        rootVE._baseCssUrl = options.stylesheetsBaseUrl || '/stylesheets/';
        const stylesheets = Array.isArray(docData.stylesheets) ? docData.stylesheets : [];
        await VisualElement.#loadStylesheetsIntoRoot(stylesheets, rootVE, rootVE._baseCssUrl);
        rootVE.#rebuildClassCascade();
        shadow.appendChild(rootVE.dom);
        return rootVE;
    }
    static async #loadStylesheetsIntoRoot(stylesheets, rootVE, baseCssPath) {
        for (const sheetFile of stylesheets) {
            const cleanFile = sheetFile.endsWith('.css') ? sheetFile : sheetFile + '.css';
            const cleanSheetName = cleanFile.replace(/.css$/, '');
            if (rootVE._loadedSheets.has(cleanSheetName)) continue;
            let cssText = null;
            if (window.VE_BUNDLE?.stylesheets?.[cleanSheetName] !== undefined) {
                cssText = window.VE_BUNDLE.stylesheets[cleanSheetName];
            } else {
                try {
                    const cssRes = await fetch(baseCssPath + encodeURIComponent(cleanFile));
                    if (cssRes.ok) cssText = await cssRes.text();
                } catch (e) {
                    console.warn('[VisualElement] Could not load stylesheet:', cleanFile);
                }
            }
            if (cssText !== null) {
                rootVE._loadedSheets.add(cleanSheetName);
                const styleTag = document.createElement('style');
                styleTag.dataset.sheet = cleanSheetName;
                styleTag.textContent = cssText;
                rootVE._rawSheetsDiv.appendChild(styleTag);
                VisualElement.#parseCssIntoMap(cssText, rootVE._classRulesMap);
            }
        }
    }
    static #buildTree(node, rootContext, generateFreshUIDs = false) {
        const uid = generateFreshUIDs ? VisualElement._nextUID() : (node.uid || VisualElement._nextUID());
        const nodeClone = { ...node, uid };
        const el = document.createElement(nodeClone.tag || 'div');
        el.dataset.uid = uid;
        if (nodeClone.name) el.dataset.veId = nodeClone.name;
        if (Array.isArray(nodeClone.classes) && nodeClone.classes.length) {
            el.className = nodeClone.classes.join(' ');
        }
        if (nodeClone.attributes) {
            Object.entries(nodeClone.attributes).forEach(([k, v]) => {
                if (k !== 'style' && k !== 'class') el.setAttribute(k, v);
            });
        }
        const ve = new VisualElement(nodeClone, el, rootContext);
        const rootRef = rootContext || ve;
        if (nodeClone.inlineStyles) {
            Object.entries(nodeClone.inlineStyles).forEach(([prop, val]) => {
                ve.style[prop] = val;
            });
        }
        const text = nodeClone.textContent !== undefined ? nodeClone.textContent : nodeClone.text;
        if (text !== undefined && text !== null && text !== '') {
            ve.text = text;
        }
        if (Array.isArray(nodeClone.children)) {
            for (const childNode of nodeClone.children) {
                const childVE = VisualElement.#buildTree(childNode, rootRef, generateFreshUIDs);
                childVE.parent = ve;
                ve.children.push(childVE);
                el.appendChild(childVE.dom);
            }
        }
        return ve;
    }
    static #parseCssIntoMap(cssText, targetMap) {
        const selPattern = new RegExp('^\.([a-zA-Z0-9_-]+)(:[a-zA-Z-]+)?$');
        const blockRegex = new RegExp('([^{}]+)\{([^{}]*)\}', 'g');
        let match;
        while ((match = blockRegex.exec(cssText)) !== null) {
            const selector = match.at(1).trim();
            const body = match.at(2).trim();
            const selMatch = selector.match(selPattern);
            if (!selMatch) continue;
            const className = selMatch.at(1);
            const pseudo = selMatch.at(2) || '';
            if (!targetMap.has(className)) {
                targetMap.set(className, { base: {}, states: new Map() });
            }
            const entry = targetMap.get(className);
            const targetObj = pseudo ? (entry.states.get(pseudo) || {}) : entry.base;
            body.split(';').forEach(decl => {
                const idx = decl.indexOf(':');
                if (idx === -1) return;
                const prop = decl.slice(0, idx).trim();
                const val = decl.slice(idx + 1).trim();
                if (prop && val) targetObj[prop] = val;
            });
            if (pseudo) entry.states.set(pseudo, targetObj);
        }
    }
    #rebuildClassCascade() {
        if (!this._computedStyleEl) return;
        const blocks = [];
        const walk = (ve) => {
            if (ve.classes.length > 0) {
                const mergedBase = {};
                const mergedStates = new Map();
                for (const cls of ve.classes) {
                    const entry = this._classRulesMap.get(cls);
                    if (!entry) continue;
                    Object.assign(mergedBase, entry.base);
                    entry.states.forEach((stStyles, pseudo) => {
                        const prev = mergedStates.get(pseudo) || {};
                        mergedStates.set(pseudo, { ...prev, ...stStyles });
                    });
                }
                const baseLines = Object.entries(mergedBase).map(([k, v]) => '    ' + k + ': ' + v + ';');
                if (baseLines.length) {
                    blocks.push('[data-uid="' + ve.uid + '"] {\n' + baseLines.join('\n') + '\n}');
                }
                mergedStates.forEach((stStyles, pseudo) => {
                    const stLines = Object.entries(stStyles).map(([k, v]) => '    ' + k + ': ' + v + ';');
                    if (stLines.length) {
                        blocks.push('[data-uid="' + ve.uid + '"]' + pseudo + ' {\n' + stLines.join('\n') + '\n}');
                    }
                });
            }
            ve.children.forEach(walk);
        };
        walk(this);
        this._computedStyleEl.textContent = blocks.join('\n');
    }
}