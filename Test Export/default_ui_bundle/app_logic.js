/**
 * app_logic.js — Контроллер логики приложения (View и Logic разделены)
 */
(async function() {
    const statusEl = document.getElementById('status-text');

    try {
        const root = await VisualElement.mount('main', document.getElementById('ui-root'), {
            stylesheetsBaseUrl: 'stylesheets/'
        });

        const availableIds = JSON.parse('["10Root", "header", "content", "div_1795183655391", "div_1795184385063", "button_1795184381530", "button_1795184381711", "548Root", "rootPanel", "contentArea", "buttonContainer", "BTN_Submit", "BTN_Cancel"]' || '[]');
        console.log('✅ UI смонтирован:', root._docName);
        console.log('📌 Доступные ID:', availableIds);
        if (statusEl) {
            statusEl.innerHTML = '✅ Документ <code>main.ve.json</code> загружен · ID: <b>' + availableIds.length + '</b>';
        }

        const actionBtn = root.Q('BTN_Submit', { strict: false });
        const targetContainer = root.Q('rootPanel', { strict: false }) || root;
        let clickCount = 0;

        if (actionBtn) {
            actionBtn.on('click', async () => {
                clickCount += 1;
                console.log('🖱️ Клик по ' + actionBtn.name + ' (#' + clickCount + ')');

                // Клонируем шаблон .ve.json со свежими UID и добавляем в контейнер
                const clonedItem = await VisualElement.instantiate('10');
                const badge = new VisualElement('span', {
                    name: 'CloneBadge_' + clickCount,
                    text: 'Instance #' + clickCount + ' (' + clonedItem._docName + ')',
                    style: { padding: '4px 8px', margin: '4px', backgroundColor: '#007acc', color: '#fff', borderRadius: '4px', fontSize: '12px' }
                });
                clonedItem.add(badge);
                targetContainer.add(clonedItem);

                if (statusEl) {
                    statusEl.innerHTML = '✨ Инстанцирован шаблон <code>' + clonedItem._docName + '</code> (#' + clickCount + ')';
                }
            });
        }
    } catch (err) {
        console.error('[AppLogic Error]', err);
        if (statusEl) statusEl.textContent = '❌ Ошибка: ' + err.message;
    }
})();
