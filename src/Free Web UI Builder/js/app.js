(function () {
    'use strict';

    function sendLog(type, data) {
        try {
            fetch('/api/error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, url: window.location.href, time: new Date().toISOString(), ...data })
            }).catch(() => { });
        } catch (e) { }
    }

    const origConsoleError = console.error;
    console.error = function () {
        const msg = Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        sendLog('CONSOLE_ERROR', { message: msg });
        origConsoleError.apply(console, arguments);
    };

    window.addEventListener('error', function (event) {
        if (event.target && (event.target.src || event.target.href)) {
            sendLog('RESOURCE_ERROR', { tag: event.target.tagName, src: event.target.src || event.target.href });
        } else {
            sendLog('JS_ERROR', { message: event.message, file: event.filename, line: event.lineno, col: event.colno, stack: event.error ? event.error.stack : '' });
        }
    }, true);

    window.addEventListener('unhandledrejection', function (event) {
        sendLog('PROMISE_REJECTION', { reason: event.reason ? String(event.reason) : 'Unknown' });
    });

    // === Инициализация 6 независимых модулей ===
    const documentsModule = new DocumentsModule();
    const stylesheetsModule = new StylesheetsModule();
    const libraryModule = new LibraryModule();
    const hierarchyModule = new HierarchyModule();
    const inspectorModule = new InspectorModule();
    const viewportModule = new ViewportModule();
    const undoRedo = new UndoRedo(50);

    // === 6 отдельных плавающих окон ===
    new FloatingPanel('documents', 'Documents', 'tpl-documents', (c) => documentsModule.init(c))
        .create(10, 10, 240, 210);

    new FloatingPanel('stylesheets', 'StyleSheets', 'tpl-stylesheets', (c) => stylesheetsModule.init(c))
        .create(10, 230, 240, 230);

    new FloatingPanel('library', 'Library', 'tpl-library', (c) => libraryModule.init(c))
        .create(260, 10, 250, 210);

    new FloatingPanel('hierarchy', 'Hierarchy', 'tpl-hierarchy', (c) => hierarchyModule.init(c))
        .create(260, 230, 250, 230);

    new FloatingPanel('inspector', 'Inspector', 'tpl-inspector', (c) => inspectorModule.init(c))
        .create(520, 10, 320, 450);

    new FloatingPanel('viewport', 'Viewport', 'tpl-viewport', (c) => viewportModule.init(c))
        .create(850, 10, 740, 820);

    const layoutManager = new LayoutManager(document.getElementById('layout-presets-bar'));
    layoutManager.restoreInitialLayout();

    function openElementInInspector(node) {
        if (!node) {
            inspectorModule.showElementProperties(null);
            return;
        }
        const inherited = stylesheetsModule.getMatchedClassStyles(node);
        const availableClasses = stylesheetsModule.getAvailableClassItems();
        inspectorModule.showElementProperties(node, inherited, availableClasses);
    }

    function replaceClassInTree(node, oldClass, newClass) {
        if (!node) return false;
        let changed = false;
        if (Array.isArray(node.classes) && node.classes.includes(oldClass)) {
            node.classes = Array.from(new Set(node.classes.map(c => (c === oldClass ? newClass : c))));
            changed = true;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                if (replaceClassInTree(child, oldClass, newClass)) changed = true;
            }
        }
        return changed;
    }

    document.getElementById('btn-undo').addEventListener('click', () => {
        undoRedo.undo();
        const data = viewportModule.getCurrentData();
        if (data) {
            viewportModule.render(data);
            hierarchyModule.buildTree(data);
            openElementInInspector(viewportModule.selectedUID ? findNode(data.root, viewportModule.selectedUID) : null);
        }
    });

    document.getElementById('btn-redo').addEventListener('click', () => {
        undoRedo.redo();
        const data = viewportModule.getCurrentData();
        if (data) {
            viewportModule.render(data);
            hierarchyModule.buildTree(data);
            openElementInInspector(viewportModule.selectedUID ? findNode(data.root, viewportModule.selectedUID) : null);
        }
    });

    bus.on('doc:switched', async (payload) => {
        viewportModule.selectedUID = null;
        hierarchyModule.updateSelection(null);
        await stylesheetsModule.setDocument(payload.data);
        viewportModule.setStylesheets(stylesheetsModule.getOrderedStylesheets());
        viewportModule.render(payload.data);
        hierarchyModule.buildTree(payload.data);
        inspectorModule.showElementProperties(null);
    });

    bus.on('stylesheets:updated', (payload) => {
        viewportModule.setStylesheets(payload.stylesheets);
        const data = viewportModule.getCurrentData();
        if (data && viewportModule.selectedUID) {
            const node = findNode(data.root, viewportModule.selectedUID);
            if (node) openElementInInspector(node);
        }
    });

    bus.on('selector:selected', (payload) => {
        viewportModule.updateSelection(null, false);
        hierarchyModule.updateSelection(null);
        inspectorModule.showSelectorProperties(payload);
    });

    bus.on('selector:style:updated', (payload) => {
        stylesheetsModule.updateSelectorStyle(payload.sheetName, payload.selector, payload.field, payload.value);
    });

    bus.on('selector:rename:request', (payload) => {
        stylesheetsModule.promptRenameSelector(payload.sheetName, payload.oldSelector);
    });

    bus.on('selector:renamed', (payload) => {
        viewportModule.setStylesheets(payload.stylesheets);
        const oldClass = payload.oldSelector.startsWith('.') ? payload.oldSelector.slice(1) : null;
        const newClass = payload.newSelector.startsWith('.') ? payload.newSelector.slice(1) : null;
        const validNameRegex = new RegExp('^[a-zA-Z0-9_-]+$');

        if (oldClass && newClass && validNameRegex.test(oldClass) && validNameRegex.test(newClass)) {
            const sheetFile = payload.sheetName + '.css';
            documentsModule.cache.forEach((docData) => {
                if (docData?.root && Array.isArray(docData.stylesheets) && docData.stylesheets.includes(sheetFile)) {
                    replaceClassInTree(docData.root, oldClass, newClass);
                }
            });
            const activeData = viewportModule.getCurrentData();
            if (activeData && activeData.root) {
                replaceClassInTree(activeData.root, oldClass, newClass);
                viewportModule.render(activeData);
                if (viewportModule.selectedUID) {
                    const node = findNode(activeData.root, viewportModule.selectedUID);
                    if (node) openElementInInspector(node);
                }
            }
        }
    });

    bus.on('ve:selected', (payload) => {
        stylesheetsModule.clearSelection();
        hierarchyModule.updateSelection(payload.uid);
        openElementInInspector(payload.jsonNode);
    });

    bus.on('tree:selected', (payload) => {
        stylesheetsModule.clearSelection();
        viewportModule.updateSelection(payload.uid, false);
        const data = viewportModule.getCurrentData();
        openElementInInspector(data ? findNode(data.root, payload.uid) : null);
    });

    bus.on('ve:hover', (payload) => hierarchyModule.highlightHover(payload.uid));
    bus.on('ve:unhover', (payload) => hierarchyModule.removeHoverHighlight(payload.uid));
    bus.on('style:updated', (payload) => updateStyle(payload.uid, payload.field, payload.value));
    bus.on('name:changed', (payload) => updateName(payload.uid, payload.value));
    bus.on('ve:create', (payload) => createElement(payload.tag));
    bus.on('ve:moved', (payload) => moveElement(payload.sourceUID, payload.targetUID));
    bus.on('ve:delete', (payload) => deleteElement(payload.uid));
    bus.on('attribute:updated', (payload) => updateAttribute(payload.uid, payload.value));

    function findNode(root, uid) {
        if (!root) return null;
        if (root.uid === uid) return root;
        if (root.children) {
            for (const child of root.children) {
                const found = findNode(child, uid);
                if (found) return found;
            }
        }
        return null;
    }

    function findParent(root, uid, parent = null) {
        if (!root) return null;
        if (root.uid === uid) return parent;
        if (root.children) {
            for (const child of root.children) {
                const found = findParent(child, uid, root);
                if (found) return found;
            }
        }
        return null;
    }

    function generateUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    function updateStyle(uid, field, value) {
        const data = viewportModule.getCurrentData();
        if (!data || !data.root) return;
        const node = findNode(data.root, uid);
        if (!node) return;

        if (field === 'textContent' || field === 'text') {
            const oldText = node.textContent ?? node.text ?? '';
            node.textContent = value;
            delete node.text;
            undoRedo.execute(new UpdatePropertyCommand(node, 'textContent', oldText, value));
            viewportModule.updateNodeText(uid, value);
            return;
        }
        if (field === 'classes') {
            const oldClasses = node.classes ? [...node.classes] : [];
            node.classes = value;
            undoRedo.execute(new UpdateClassesCommand(node, oldClasses, value));
            viewportModule.updateNodeClasses(uid, value);
            openElementInInspector(node);
            return;
        }
        if (!node.inlineStyles) node.inlineStyles = {};
        const oldStyle = node.inlineStyles[field];
        if (value === '' || value === null || value === undefined) delete node.inlineStyles[field];
        else node.inlineStyles[field] = value;
        undoRedo.execute(new UpdateStyleCommand(node, field, oldStyle, value));
        viewportModule.updateNodeStyle(uid, field, value, node.inlineStyles);
    }
    function updateName(uid, value) {
        const data = viewportModule.getCurrentData();
        if (!data || !data.root) return;
        const node = findNode(data.root, uid);
        if (node) {
            const oldName = node.name;
            node.name = value;
            undoRedo.execute(new UpdatePropertyCommand(node, 'name', oldName, value));
            viewportModule.updateNodeName(uid, value);
            hierarchyModule.buildTree(data);
        }
    }
    function createElement(presetType) {
        const data = viewportModule.getCurrentData();
        if (!data) return;
        if (!data.root) data.root = { uid: generateUID(), name: 'root', tag: 'div', children: [] };
        let parentNode = (viewportModule.selectedUID && findNode(data.root, viewportModule.selectedUID)) || data.root;
        if (parentNode.tag === 'input' || parentNode.tag === 'img') {
            parentNode = findParent(data.root, parentNode.uid) || data.root;
        }
        if (!parentNode.children) parentNode.children = [];
        const newNode = LibraryModule.createPresetNode(presetType, generateUID);
        undoRedo.execute(new CreateElementCommand(parentNode, newNode, parentNode.children.length));
        viewportModule.render(data);
        hierarchyModule.buildTree(data);
        viewportModule.updateSelection(newNode.uid, true);
    }
    function cloneNodeDeep(node, isTopLevel = true) {
        return {
            uid: generateUID(),
            name: isTopLevel && node.name ? node.name + '_copy' : (node.name || ''),
            tag: node.tag || 'div',
            classes: Array.isArray(node.classes) ? [...node.classes] : [],
            inlineStyles: node.inlineStyles ? { ...node.inlineStyles } : {},
            attributes: node.attributes ? { ...node.attributes } : {},
            textContent: node.textContent !== undefined ? node.textContent : (node.text || ''),
            children: Array.isArray(node.children) ? node.children.map(c => cloneNodeDeep(c, false)) : []
        };
    }
    function duplicateElement(uid) {
        const data = viewportModule.getCurrentData();
        if (!data || !data.root || !uid || data.root.uid === uid) return;
        const sourceNode = findNode(data.root, uid);
        const parent = findParent(data.root, uid);
        if (!sourceNode || !parent || !Array.isArray(parent.children)) return;
        const index = parent.children.findIndex(c => c.uid === uid);
        if (index === -1) return;
        const clonedNode = cloneNodeDeep(sourceNode, true);
        undoRedo.execute(new CreateElementCommand(parent, clonedNode, index + 1));
        viewportModule.render(data);
        hierarchyModule.buildTree(data);
        viewportModule.updateSelection(clonedNode.uid, true);
    }
    function deleteElement(uid) {
        const data = viewportModule.getCurrentData();
        if (!data || !data.root || data.root.uid === uid) return;
        const parent = findParent(data.root, uid);
        if (!parent || !parent.children) return;
        const index = parent.children.findIndex(c => c.uid === uid);
        if (index === -1) return;
        undoRedo.execute(new DeleteElementCommand(parent, parent.children[index], index));
        if (viewportModule.selectedUID === uid) viewportModule.selectedUID = null;
        viewportModule.render(data);
        hierarchyModule.buildTree(data);
        inspectorModule.showElementProperties(null);
    }
    function moveElement(sourceUID, targetUID) {
        const data = viewportModule.getCurrentData();
        if (!data || !data.root) return;
        const sourceNode = findNode(data.root, sourceUID);
        const targetNode = findNode(data.root, targetUID);
        if (!sourceNode || !targetNode) return;
        const sourceParent = findParent(data.root, sourceUID);
        if (!sourceParent || !sourceParent.children) return;
        const sourceIndex = sourceParent.children.findIndex(c => c.uid === sourceUID);
        if (sourceIndex === -1) return;
        if (!targetNode.children) targetNode.children = [];
        undoRedo.execute(new MoveElementCommand(sourceParent, targetNode, sourceNode, sourceIndex, targetNode.children.length));
        viewportModule.render(data);
        hierarchyModule.buildTree(data);
    }
    function updateAttribute(uid, value) {
        const data = viewportModule.getCurrentData();
        if (!data || !data.root) return;
        const node = findNode(data.root, uid);
        if (!node) return;
        if (!node.attributes) node.attributes = {};
        if (value.action === 'add') {
            node.attributes[value.key] = node.attributes[value.key] || '';
            openElementInInspector(node);
        } else if (value.action === 'update') {
            node.attributes[value.key] = value.attrValue;
        } else if (value.action === 'delete') {
            delete node.attributes[value.key];
            openElementInInspector(node);
        }
        viewportModule.render(data);
    }
    async function saveAllDocuments() {
        const promises = [];
        documentsModule.cache.forEach((docData, docName) => {
            if (!docData) return;
            promises.push(fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: docName, data: docData })
            }));
        });
        await Promise.all(promises);
    }
    function showBuildModal(projectName, binding) {
        document.getElementById('ve-build-modal')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 've-build-modal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'width:520px;max-width:92vw;max-height:85vh;background:#252526;border:1px solid #454545;border-radius:6px;box-shadow:0 12px 32px rgba(0,0,0,0.75);display:flex;flex-direction:column;color:#e0e0e0;overflow:hidden;';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#333337;border-bottom:1px solid #1e1e1e;';
        const title = document.createElement('span');
        title.style.cssText = 'font-weight:700;font-size:14px;color:#fff;';
        title.textContent = '🔨 Build Completed — ' + projectName;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button'; closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:transparent;border:none;color:#aaa;font-size:16px;cursor:pointer;';
        closeBtn.addEventListener('click', () => overlay.remove());
        header.append(title, closeBtn);
        const body = document.createElement('div');
        body.style.cssText = 'padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;font-size:13px;';
        const docNames = Object.keys(binding.documents || {});
        const idEntries = Object.entries(binding.ids || {});
        const stats = document.createElement('div');
        stats.style.cssText = 'display:flex;gap:12px;';
        stats.innerHTML = 'DOCUMENTS' + docNames.length + '' +
            'NAMED ELEMENTS (IDs)' + idEntries.length + '';
        body.appendChild(stats);
        const idsList = document.createElement('div');
        idsList.style.cssText = 'background:#1e1e1e;border:1px solid #3c3c3c;border-radius:4px;max-height:180px;overflow-y:auto;padding:6px;font-family:monospace;font-size:12px;';
        if (!idEntries.length) idsList.textContent = 'No named elements found.';
        else {
            idEntries.forEach(([elName, info]) => {
                const line = document.createElement('div');
                line.style.cssText = 'display:flex;justify-content:space-between;padding:3px 6px;border-bottom:1px solid #2a2a2a;';
                line.innerHTML = '' + elName + '<' + info.tag + '> in ' + info.doc + '.ve.json';
                idsList.appendChild(line);
            });
        }
        body.appendChild(idsList);
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background:#2d2d30;border-top:1px solid #1e1e1e;';
        const dlZip = document.createElement('button');
        dlZip.type = 'button'; dlZip.className = 'toolbar-btn primary';
        dlZip.textContent = '📦 Download Full .ZIP Bundle';
        dlZip.addEventListener('click', () => {
            const activeDocName = documentsModule.getActiveDocument()?.name || 'main';
            window.location.href = '/api/export/' + encodeURIComponent(projectName) + '?doc=' + encodeURIComponent(activeDocName);
        });
        footer.appendChild(dlZip);
        dialog.append(header, body, footer);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }
    document.getElementById('btn-save').addEventListener('click', async () => {
        await saveAllDocuments();
        console.log('[App] Saved all documents');
    });
    document.getElementById('btn-build')?.addEventListener('click', async () => {
        await saveAllDocuments();
        const res = await fetch('/api/build/default');
        if (res.ok) showBuildModal('default', (await res.json()).binding || {});
    });
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); document.getElementById('btn-save').click(); return; }
        if (isTyping) return;
        if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); document.getElementById('btn-undo').click(); }
        else if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) { e.preventDefault(); document.getElementById('btn-redo').click(); }
        else if (e.ctrlKey && e.code === 'KeyD' && viewportModule.selectedUID) { e.preventDefault(); duplicateElement(viewportModule.selectedUID); }
        else if (e.key === 'Delete' && viewportModule.selectedUID) { deleteElement(viewportModule.selectedUID); }
    });
    documentsModule.loadDocuments();
})();