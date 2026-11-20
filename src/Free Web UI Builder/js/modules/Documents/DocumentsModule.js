/**
 * ============================================================
 * DocumentsModule.js — Document Explorer (.ve.json)
 * ============================================================
 */

class DocumentsModule {
    constructor() {
        this.documents = [];
        this.activeDoc = null;
        this.cache = new Map();
    }

    init(content) {
        this.content = content;
        this.#render();
        this.#bindEvents();
    }

    #render() {
        this.content.innerHTML = [
            '<button class="new-doc-btn" id="btn-new-doc">+ New Document</button>',
            '<ul class="doc-list" id="doc-list"></ul>'
        ].join('\n');
    }

    #bindEvents() {
        const btnNewDoc = this.content.querySelector('#btn-new-doc');
        if (btnNewDoc) {
            btnNewDoc.addEventListener('click', () => this.#createNewDocument());
        }

        this.content.addEventListener('click', (e) => {
            const item = e.target.closest('.doc-item');
            if (item && !e.target.closest('.doc-action-btn')) {
                this.switchDocument(item.dataset.name);
            }
        });
    }

    async loadDocuments() {
        try {
            const response = await fetch('/api/documents');
            if (!response.ok) throw new Error('Failed to load documents');
            const result = await response.json();

            if (Array.isArray(result.documents) && result.documents.length > 0) {
                this.documents = result.documents.map(d => ({
                    name: d.name,
                    path: d.path,
                    isMain: d.name === 'main'
                }));
            } else {
                // Папка пуста — создаём стартовый main в кэше и сразу сохраняем на диск
                const initialMain = this.#getDemoData('main');
                this.documents = [{ name: 'main', path: 'main.ve.json', isMain: true }];
                this.cache.set('main', initialMain);
                fetch('/api/documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'main', data: initialMain })
                }).catch(() => { });
            }
        } catch (err) {
            console.warn('[DocumentsModule] Server unavailable, using demo data:', err);
            this.documents = [
                { name: 'main', path: 'main.ve.json', isMain: true },
                { name: 'card', path: 'card.ve.json', isMain: false }
            ];
        }

        this.#renderList();

        if (this.documents.length > 0) {
            const mainDoc = this.documents.find(d => d.isMain) || this.documents.at(0);
            await this.switchDocument(mainDoc.name);
        }
    }

    #renderList() {
        const list = this.content.querySelector('#doc-list');
        if (!list) return;
        list.innerHTML = '';

        this.documents.forEach((doc) => {
            const li = document.createElement('li');
            li.className = 'doc-item' + (doc.name === this.activeDoc?.name ? ' active' : '');
            li.dataset.name = doc.name;

            const icon = document.createElement('span');
            icon.className = 'doc-item-icon';
            icon.textContent = doc.isMain ? '🏠' : '📄';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'doc-item-name';
            nameSpan.textContent = doc.name + '.ve.json';

            const actions = document.createElement('div');
            actions.className = 'doc-item-actions';

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'doc-action-btn delete-doc';
            delBtn.title = 'Delete';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.#deleteDocument(doc.name);
            });

            actions.appendChild(delBtn);
            li.append(icon, nameSpan, actions);
            list.appendChild(li);
        });
    }

    async switchDocument(name) {
        this.activeDoc = this.documents.find((d) => d.name === name) || null;
        this.#renderList();
        if (!this.activeDoc) return;

        let data = this.cache.get(name);
        if (!data) {
            try {
                const res = await fetch('/api/documents/' + encodeURIComponent(name));
                if (res.ok) {
                    const payload = await res.json();
                    data = payload.data;
                }
            } catch (e) {
                console.warn('[DocumentsModule] Load failed for:', name);
            }
        }

        if (!data) {
            data = this.#getDemoData(name);
        }

        if (!Array.isArray(data.stylesheets)) {
            data.stylesheets = [];
        }

        this.cache.set(name, data);
        bus.publish('doc:switched', { name, data });
    }

    #createNewDocument() {
        const name = prompt('Document name:');
        if (!name || name.trim() === '') return;

        const docName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (this.documents.find((d) => d.name === docName)) {
            alert('Document already exists: ' + docName);
            return;
        }

        const newDoc = {
            name: docName,
            path: docName + '.ve.json',
            isMain: false
        };
        const newData = this.#getDemoData(docName);
        this.documents.push(newDoc);
        this.cache.set(docName, newData);
        this.#renderList();

        fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: docName, data: newData })
        }).catch(() => { });

        bus.publish('doc:created', { doc: newDoc });
        this.switchDocument(docName);
    }

    async #deleteDocument(name) {
        if (!confirm('Delete document: ' + name + '?')) return;

        try {
            await fetch('/api/documents/' + encodeURIComponent(name), { method: 'DELETE' });
        } catch (err) {
            console.warn('[DocumentsModule] Server unavailable:', err);
        }

        this.cache.delete(name);
        this.documents = this.documents.filter((d) => d.name !== name);

        if (this.activeDoc && this.activeDoc.name === name) {
            this.activeDoc = this.documents.length > 0 ? this.documents.at(0) : null;
            if (this.activeDoc) {
                await this.switchDocument(this.activeDoc.name);
            } else {
                bus.publish('doc:switched', { name: '', data: null });
            }
        }

        this.#renderList();
        bus.publish('doc:deleted', { name });
    }

    #getDemoData(name) {
        if (name === 'main') {
            return {
                $schema: 've-document/1.0',
                name: 'main',
                stylesheets: [],
                root: {
                    uid: this.#generateUID(),
                    name: 'rootPanel',
                    tag: 'div',
                    classes: ['panel'],
                    inlineStyles: { padding: '16px', gap: '8px', display: 'flex', flexDirection: 'column' },
                    attributes: {},
                    textContent: '',
                    children: [
                        {
                            uid: this.#generateUID(),
                            name: 'header',
                            tag: 'div',
                            classes: ['header'],
                            inlineStyles: { padding: '12px', backgroundColor: '#007acc', color: '#ffffff', minHeight: '48px' },
                            attributes: {},
                            textContent: 'Hello World',
                            children: []
                        },
                        {
                            uid: this.#generateUID(),
                            name: 'contentArea',
                            tag: 'div',
                            classes: ['content'],
                            inlineStyles: { padding: '16px', flex: '1', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px dashed #555', borderRadius: '8px' },
                            attributes: {},
                            textContent: '',
                            children: [
                                {
                                    uid: this.#generateUID(),
                                    name: 'buttonContainer',
                                    tag: 'div',
                                    classes: ['button-row'],
                                    inlineStyles: { display: 'flex', gap: '8px' },
                                    attributes: {},
                                    textContent: '',
                                    children: [
                                        {
                                            uid: this.#generateUID(),
                                            name: 'BTN_Submit',
                                            tag: 'button',
                                            classes: ['btn-primary'],
                                            inlineStyles: {},
                                            attributes: {},
                                            textContent: 'Submit',
                                            children: []
                                        },
                                        {
                                            uid: this.#generateUID(),
                                            name: 'BTN_Cancel',
                                            tag: 'button',
                                            classes: ['btn-secondary'],
                                            inlineStyles: {},
                                            attributes: {},
                                            textContent: 'Cancel',
                                            children: []
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            };
        }
        return {
            $schema: 've-document/1.0',
            name: name,
            stylesheets: [],
            root: {
                uid: this.#generateUID(),
                name: name + 'Root',
                tag: 'div',
                classes: [],
                inlineStyles: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
                attributes: {},
                textContent: '',
                children: [
                    {
                        uid: this.#generateUID(),
                        name: 'header',
                        tag: 'div',
                        classes: [],
                        inlineStyles: { padding: '12px', backgroundColor: '#007acc', color: '#ffffff', borderRadius: '4px' },
                        attributes: {},
                        textContent: name + ' Document',
                        children: []
                    }
                ]
            }
        };
    }
    #generateUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    getActiveDocument() {
        return this.activeDoc;
    }
    getDocuments() {
        return this.documents;
    }
}