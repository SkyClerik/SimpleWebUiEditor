/**
 * ============================================================
 * HierarchyModule.js — Дерево элементов документа
 * ============================================================
 */

class HierarchyModule {
    constructor() {
        this.treeContainer = null;
        this.activeDoc = null;
        this.selectedUID = null;
        this._collapsedUIDs = new Set();
        this._draggingUID = null;
    }

    init(content) {
        this.content = content;
        this.content.innerHTML = '<div class="hierarchy-tree" id="hierarchy-tree"></div>';
        this.treeContainer = this.content.querySelector('#hierarchy-tree');
    }

    buildTree(data) {
        if (!this.treeContainer) return;
        this.treeContainer.innerHTML = '';
        this.activeDoc = data;
        if (data && data.root) {
            this.treeContainer.appendChild(this.#createTreeItem(data.root, 0, true));
            if (this.selectedUID) {
                const item = this.treeContainer.querySelector('[data-uid="' + this.selectedUID + '"]');
                if (item) item.classList.add('tree-item-selected');
            }
        }
    }

    toggleCollapsed(uid) {
        if (this._collapsedUIDs.has(uid)) this._collapsedUIDs.delete(uid);
        else this._collapsedUIDs.add(uid);
    }

    isCollapsed(uid) {
        return this._collapsedUIDs.has(uid);
    }

    #createTreeItem(node, depth = 0, isRoot = false) {
        const item = document.createElement('div');
        item.className = 'tree-item';
        if (node.uid === this.selectedUID) item.classList.add('tree-item-selected');
        item.dataset.uid = node.uid;
        item.style.paddingLeft = (depth * 14 + 6) + 'px';

        const header = document.createElement('div');
        header.className = 'tree-item-header';
        header.style.cssText = 'display:flex;align-items:center;gap:6px;';
        header.draggable = !isRoot;

        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const collapsed = this.isCollapsed(node.uid);

        const arrow = document.createElement('span');
        arrow.style.cssText = 'width:12px;display:inline-block;text-align:center;cursor:' + (hasChildren ? 'pointer' : 'default') + ';';
        arrow.textContent = hasChildren ? (collapsed ? '▶' : '▼') : '';
        header.appendChild(arrow);

        const icon = document.createElement('span');
        icon.className = 'tree-item-icon';
        icon.textContent = this.#getTagIcon(node.tag);
        header.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'tree-item-name';
        name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        name.textContent = node.name || node.tag;
        header.appendChild(name);

        if (node.uid) {
            const uid = document.createElement('span');
            uid.className = 'tree-item-uid';
            uid.textContent = node.uid.substring(0, 6);
            header.appendChild(uid);
        }

        if (!isRoot) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.title = 'Delete element';
            delBtn.textContent = '✕';
            delBtn.style.cssText = 'background:transparent;border:none;color:#888;cursor:pointer;padding:0 4px;font-size:11px;';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                bus.publish('ve:delete', { uid: node.uid });
            });
            header.appendChild(delBtn);
        }

        item.appendChild(header);

        let childrenContainer = null;
        if (hasChildren) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            if (collapsed) childrenContainer.style.display = 'none';

            for (const child of node.children) {
                childrenContainer.appendChild(this.#createTreeItem(child, depth + 1, false));
            }
            item.appendChild(childrenContainer);

            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCollapsed(node.uid);
                const isNowCollapsed = this.isCollapsed(node.uid);
                childrenContainer.style.display = isNowCollapsed ? 'none' : 'block';
                arrow.textContent = isNowCollapsed ? '▶' : '▼';
            });
        }

        header.addEventListener('click', () => {
            this.#selectItem(node.uid);
        });

        header.addEventListener('dragstart', (e) => {
            if (isRoot) { e.preventDefault(); return; }
            this._draggingUID = node.uid;
            e.dataTransfer.setData('text/plain', node.uid);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('dragging');
        });

        header.addEventListener('dragend', () => {
            this._draggingUID = null;
            item.classList.remove('dragging');
            this.#clearDropIndicators();
        });

        header.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (this._draggingUID && this._draggingUID !== node.uid) {
                item.classList.add('drag-over');
            }
        });

        header.addEventListener('dragleave', () => item.classList.remove('drag-over'));

        header.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('drag-over');
            const sourceUID = e.dataTransfer.getData('text/plain') || this._draggingUID;
            const targetUID = node.uid;
            if (sourceUID && targetUID && sourceUID !== targetUID) {
                if (!this.#isDescendant(this.activeDoc.root, sourceUID, targetUID)) {
                    bus.publish('ve:moved', { sourceUID, targetUID });
                }
            }
        });

        return item;
    }

    #selectItem(uid) {
        const prev = this.treeContainer?.querySelector('.tree-item-selected');
        if (prev) prev.classList.remove('tree-item-selected');
        this.selectedUID = uid;
        if (!uid) return;
        const item = this.treeContainer?.querySelector('[data-uid="' + uid + '"]');
        if (item) {
            item.classList.add('tree-item-selected');
            bus.publish('tree:selected', { uid });
        }
    }

    updateSelection(uid) {
        const prev = this.treeContainer?.querySelector('.tree-item-selected');
        if (prev) prev.classList.remove('tree-item-selected');
        this.selectedUID = uid;
        if (!uid) return;
        const item = this.treeContainer?.querySelector('[data-uid="' + uid + '"]');
        if (item) item.classList.add('tree-item-selected');
    }

    highlightHover(uid) {
        this.treeContainer?.querySelector('[data-uid="' + uid + '"]')?.classList.add('tree-item-hover');
    }

    removeHoverHighlight(uid) {
        this.treeContainer?.querySelector('[data-uid="' + uid + '"]')?.classList.remove('tree-item-hover');
    }

    #clearDropIndicators() {
        this.treeContainer?.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    }

    #getTagIcon(tag) {
        const icons = { div: '📦', button: '🔘', span: '🔤', input: '⌨️', img: '🖼️', label: '☑️', h1: '📰', h2: '📰', h3: '📰', p: '¶' };
        return icons[tag] || '📄';
    }

    #isDescendant(root, ancestorUID, targetUID) {
        if (!root) return false;
        if (root.uid === ancestorUID) return this.#findNode(root, targetUID) !== null;
        if (root.children) {
            for (const child of root.children) {
                if (this.#isDescendant(child, ancestorUID, targetUID)) return true;
            }
        }
        return false;
    }

    #findNode(root, uid) {
        if (!root) return null;
        if (root.uid === uid) return root;
        if (root.children) {
            for (const child of root.children) {
                const found = this.#findNode(child, uid);
                if (found) return found;
            }
        }
        return null;
    }
}
