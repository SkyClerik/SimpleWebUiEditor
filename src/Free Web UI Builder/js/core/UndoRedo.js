/**
 * ============================================================
 * UndoRedo.js — Система Undo/Redo (Command Pattern)
 * ============================================================
 *
 * Назначение:
 * - Отмена/повтор действий пользователя
 * - Command Pattern на уровне JSON-дерева
 * - Изолированная история для каждого документа
 * - Лимит 50 шагов
 * ============================================================
 */

class UndoRedo {
    constructor(maxSteps = 50) {
        this.maxSteps = maxSteps;
        this.undoStack = [];
        this.redoStack = [];
        this.isUndoing = false;
        this.isRedoing = false;
    }

    /**
     * Выполнить команду с автоматическим сохранением в undo
     */
    execute(command) {
        if (this.isUndoing || this.isRedoing) {
            command.execute();
            return;
        }

        command.execute();
        this.undoStack.push(command);

        // Очистить redo при новом действии
        this.redoStack = [];

        // Лимит шагов
        if (this.undoStack.length > this.maxSteps) {
            this.undoStack.shift();
        }
    }

    /**
     * Отменить последнее действие
     */
    undo() {
        if (this.undoStack.length === 0) return;

        this.isUndoing = true;
        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);
        this.isUndoing = false;
    }

    /**
     * Повторить последнее действие
     */
    redo() {
        if (this.redoStack.length === 0) return;

        this.isRedoing = true;
        const command = this.redoStack.pop();
        command.execute();
        this.undoStack.push(command);
        this.isRedoing = false;
    }

    /**
     * Очистить историю
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Имеются ли отмены
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Имеется ли повтор
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Получить состояние истории
     */
    getState() {
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }
}

// Команды мутаций JSON-дерева

/**
 * Создать новый элемент
 */
class CreateElementCommand {
    constructor(parentNode, newElement, index) {
        this.parentNode = parentNode;
        this.newElement = newElement;
        this.index = index;
    }

    execute() {
        if (!this.parentNode.children) this.parentNode.children = [];
        this.parentNode.children.splice(this.index, 0, this.newElement);
    }

    undo() {
        if (this.parentNode.children) {
            this.parentNode.children.splice(this.index, 1);
        }
    }
}

/**
 * Удалить элемент
 */
class DeleteElementCommand {
    constructor(parentNode, deletedElement, index) {
        this.parentNode = parentNode;
        this.deletedElement = deletedElement;
        this.index = index;
    }

    execute() {
        if (this.parentNode.children) {
            this.parentNode.children.splice(this.index, 1);
        }
    }

    undo() {
        if (!this.parentNode.children) this.parentNode.children = [];
        this.parentNode.children.splice(this.index, 0, this.deletedElement);
    }
}

/**
 * Переместить элемент
 */
class MoveElementCommand {
    constructor(sourceParent, targetParent, element, sourceIndex, targetIndex) {
        this.sourceParent = sourceParent;
        this.targetParent = targetParent;
        this.element = element;
        this.sourceIndex = sourceIndex;
        this.targetIndex = targetIndex;
    }

    execute() {
        // Удалить из старого места
        this.sourceParent.children.splice(this.sourceIndex, 1);
        // Вставить в новое место
        if (!this.targetParent.children) this.targetParent.children = [];
        this.targetParent.children.splice(this.targetIndex, 0, this.element);
    }

    undo() {
        // Удалить из текущего места
        this.targetParent.children.splice(this.targetIndex, 1);
        // Вернуть на старое место
        if (!this.sourceParent.children) this.sourceParent.children = [];
        this.sourceParent.children.splice(this.sourceIndex, 0, this.element);
    }
}

/**
 * Изменить свойство элемента
 */
class UpdatePropertyCommand {
    constructor(node, property, oldValue, newValue) {
        this.node = node;
        this.property = property;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    execute() {
        this.node[this.property] = this.newValue;
    }

    undo() {
        this.node[this.property] = this.oldValue;
    }
}

/**
 * Изменить inline style
 */
class UpdateStyleCommand {
    constructor(node, cssProperty, oldValue, newValue) {
        this.node = node;
        this.cssProperty = cssProperty;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    execute() {
        if (!this.node.inlineStyles) this.node.inlineStyles = {};
        this.node.inlineStyles[this.cssProperty] = this.newValue;
    }

    undo() {
        if (this.node.inlineStyles) {
            if (this.newValue === undefined) {
                delete this.node.inlineStyles[this.cssProperty];
            } else {
                this.node.inlineStyles[this.cssProperty] = this.newValue;
            }
        }
    }
}

/**
 * Добавить/удалить класс
 */
class UpdateClassesCommand {
    constructor(node, oldClasses, newClasses) {
        this.node = node;
        this.oldClasses = oldClasses;
        this.newClasses = newClasses;
    }

    execute() {
        this.node.classes = [...this.newClasses];
    }

    undo() {
        this.node.classes = [...this.oldClasses];
    }
}

/**
 * Добавить атрибут
 */
class AddAttributeCommand {
    constructor(node, key, value) {
        this.node = node;
        this.key = key;
        this.value = value;
        this.oldValue = node.attributes ? node.attributes[key] : undefined;
    }

    execute() {
        if (!this.node.attributes) this.node.attributes = {};
        this.node.attributes[this.key] = this.value;
    }

    undo() {
        if (this.node.attributes) {
            if (this.oldValue === undefined) {
                delete this.node.attributes[this.key];
            } else {
                this.node.attributes[this.key] = this.oldValue;
            }
        }
    }
}

/**
 * Удалить атрибут
 */
class RemoveAttributeCommand {
    constructor(node, key, oldValue) {
        this.node = node;
        this.key = key;
        this.oldValue = oldValue;
    }

    execute() {
        if (this.node.attributes) {
            delete this.node.attributes[this.key];
        }
    }

    undo() {
        if (!this.node.attributes) this.node.attributes = {};
        this.node.attributes[this.key] = this.oldValue;
    }
}
