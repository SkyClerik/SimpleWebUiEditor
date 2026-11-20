/**
 * ============================================================
 * ViewportCascade.js — Генерация CSS-каскада и DOM-дерева
 * ============================================================
 */

class ViewportCascade {
    static DEFAULT_THEME_CSS = [
        ':host { display: block; width: 100%; height: 100%; font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; color: #e0e0e0; }',
        '#canvas { width: 100%; height: 100%; background: #1e1e1e; overflow: auto; padding: 20px; box-sizing: border-box; }',
        '[data-uid] { position: relative; box-sizing: border-box; }',
        'button { background: #3c3c3c; color: #ffffff; border: 1px solid #555555; border-radius: 4px; padding: 6px 14px; font-size: 13px; font-family: inherit; }',
        '#canvas.mode-preview button { cursor: pointer; }',
        '#canvas.mode-preview button:hover { background: #4a4a4a; }',
        'input { background: #2d2d30; color: #e0e0e0; border: 1px solid #555555; border-radius: 4px; padding: 6px 8px; font-size: 13px; font-family: inherit; }',
        'span { display: inline-block; }',
        '#canvas.mode-editor [data-uid] { cursor: default; }',
        '#canvas.mode-editor [data-ve-hovered] { outline: 1px dashed #38bdf8 !important; outline-offset: -1px; }',
        '#canvas.mode-editor [data-ve-selected] { outline: 2px dashed #ff8c00 !important; outline-offset: -2px; box-shadow: inset 0 0 0 1px rgba(255, 140, 0, 0.35) !important; }'
    ].join('\n');

    static AUTO_PX_PROPS = new Set([
        'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
        'fontSize', 'lineHeight', 'letterSpacing', 'gap',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'
    ]);

    static STRETCH_MAP = {
        'none': { size: 'auto', repeat: 'no-repeat' },
        'stretch': { size: '100% 100%', repeat: 'no-repeat' },
        'scale': { size: 'contain', repeat: 'no-repeat' },
        'scale-to-fill': { size: 'cover', repeat: 'no-repeat' },
        'tile': { size: 'auto', repeat: 'repeat' }
    };

    static ALIGNMENT_MAP = {
        'topleft': 'top left', 'topcenter': 'top center', 'topright': 'top right',
        'centerleft': 'center left', 'center': 'center center', 'centerright': 'center right',
        'bottomleft': 'bottom left', 'bottomcenter': 'bottom center', 'bottomright': 'bottom right'
    };

    static buildElementClassCss(rootNode, orderedSheets) {
        if (!rootNode || !Array.isArray(orderedSheets) || !orderedSheets.length) return '';

        const selPattern = new RegExp('^\\.([a-zA-Z0-9_-]+)(:[a-zA-Z-]+)?$');
        const classRulesMap = new Map();

        for (const sheet of orderedSheets) {
            if (!sheet.rules) continue;
            sheet.rules.forEach((stylesObj, selector) => {
                const selMatch = selector.match(selPattern);
                if (!selMatch) return;
                const className = selMatch.at(1);
                const pseudo = selMatch.at(2) || '';
                if (!classRulesMap.has(className)) classRulesMap.set(className, { base: {}, states: new Map() });
                const entry = classRulesMap.get(className);
                if (pseudo) entry.states.set(pseudo, { ...(entry.states.get(pseudo) || {}), ...stylesObj });
                else Object.assign(entry.base, stylesObj);
            });
        }

        const blocks = [];
        const walk = (node) => {
            if (!node) return;
            if (Array.isArray(node.classes) && node.classes.length > 0) {
                const mergedBase = {};
                const mergedStates = new Map();

                for (const cls of node.classes) {
                    const entry = classRulesMap.get(cls);
                    if (!entry) continue;
                    Object.assign(mergedBase, entry.base);
                    entry.states.forEach((st, pseudo) => {
                        mergedStates.set(pseudo, { ...(mergedStates.get(pseudo) || {}), ...st });
                    });
                }

                const baseDecls = ViewportCascade.stylesToCssDeclarations(mergedBase);
                if (baseDecls) blocks.push('[data-uid="' + node.uid + '"] {\n' + baseDecls + '\n}');

                mergedStates.forEach((st, pseudo) => {
                    const stDecls = ViewportCascade.stylesToCssDeclarations(st);
                    if (stDecls) blocks.push('#canvas.mode-preview [data-uid="' + node.uid + '"]' + pseudo + ' {\n' + stDecls + '\n}');
                });
            }
            if (Array.isArray(node.children)) node.children.forEach(walk);
        };

        walk(rootNode);
        return blocks.join('\n');
    }

    static stylesToCssDeclarations(stylesObj) {
        const lines = [];
        const numRegex = new RegExp('^-?\\d+(\\.\\d+)?$');
        const rawImg = (stylesObj.backgroundImage || '').trim();
        const tint = (stylesObj.backgroundImageTint || '').trim();

        for (const [prop, value] of Object.entries(stylesObj)) {
            if (value === '' || value === null || value === undefined) continue;
            if (prop === 'backgroundImage' || prop === 'backgroundImageTint') continue;

            if (prop === 'backgroundImageStretch') {
                const cfg = ViewportCascade.STRETCH_MAP[value] || { size: 'cover', repeat: 'no-repeat' };
                lines.push('    background-size: ' + cfg.size + ';', '    background-repeat: ' + cfg.repeat + ';');
                continue;
            }
            if (prop === 'backgroundImageAlignment') {
                lines.push('    background-position: ' + (ViewportCascade.ALIGNMENT_MAP[value] || value) + ';');
                continue;
            }

            let cssVal = String(value).trim();
            if (ViewportCascade.AUTO_PX_PROPS.has(prop) && numRegex.test(cssVal) && cssVal !== '0') cssVal += 'px';
            const kebab = prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
            lines.push('    ' + kebab + ': ' + cssVal + ';');
        }

        if (rawImg && rawImg !== 'none') {
            const imgUrl = rawImg.startsWith('url(') ? rawImg : 'url("' + rawImg + '")';
            if (tint && tint !== 'none' && tint !== 'transparent') {
                lines.push('    background-image: linear-gradient(' + tint + ', ' + tint + '), ' + imgUrl + ';', '    background-blend-mode: multiply, normal;');
            } else {
                lines.push('    background-image: ' + imgUrl + ';');
            }
        }
        return lines.join('\n');
    }

    static renderNodeDOM(node) {
        if (!node) return document.createDocumentFragment();
        const el = document.createElement(node.tag || 'div');
        el.dataset.uid = node.uid;
        if (node.name) el.dataset.veId = node.name;
        if (Array.isArray(node.classes) && node.classes.length) el.className = node.classes.join(' ');
        if (node.inlineStyles) ViewportCascade.applyAllInlineStyles(el, node.inlineStyles);

        if (node.attributes) {
            Object.entries(node.attributes).forEach(([k, v]) => {
                if (k !== 'style' && k !== 'class') el.setAttribute(k, v);
            });
        }

        const text = node.textContent !== undefined ? node.textContent : node.text;
        if (text !== undefined && text !== null && text !== '') el.appendChild(document.createTextNode(text));
        if (Array.isArray(node.children)) node.children.forEach((c) => el.appendChild(ViewportCascade.renderNodeDOM(c)));
        return el;
    }

    static applyAllInlineStyles(el, styles) {
        el.removeAttribute('style');
        for (const [prop, val] of Object.entries(styles)) {
            if (prop === 'backgroundImage' || prop === 'backgroundImageTint') continue;
            ViewportCascade.applySingleInlineStyle(el, prop, val, styles);
        }
        ViewportCascade.applyBackgroundTint(el, styles);
    }

    static applyBackgroundTint(el, styles = {}) {
        const rawImg = (styles.backgroundImage || '').trim();
        const tint = (styles.backgroundImageTint || '').trim();
        if (!rawImg || rawImg === 'none' || rawImg === 'url("")' || rawImg === "url('')") {
            el.style.removeProperty('background-image');
            el.style.removeProperty('background-blend-mode');
            return;
        }
        const imgUrl = rawImg.startsWith('url(') ? rawImg : 'url("' + rawImg + '")';
        if (tint && tint !== 'none' && tint !== 'transparent') {
            el.style.backgroundImage = 'linear-gradient(' + tint + ', ' + tint + '), ' + imgUrl;
            el.style.backgroundBlendMode = 'multiply, normal';
        } else {
            el.style.backgroundImage = imgUrl;
            el.style.removeProperty('background-blend-mode');
        }
    }

    static applySingleInlineStyle(el, prop, value, allStyles = {}) {
        if (prop === 'backgroundImage' || prop === 'backgroundImageTint') {
            ViewportCascade.applyBackgroundTint(el, allStyles);
            return;
        }
        if (value === '' || value === null || value === undefined) { el.style[prop] = ''; return; }

        let cssVal = String(value).trim();
        const numRegex = new RegExp('^-?\\d+(\\.\\d+)?$');
        if (ViewportCascade.AUTO_PX_PROPS.has(prop) && numRegex.test(cssVal) && cssVal !== '0') cssVal += 'px';

        if (prop === 'border') {
            el.style.border = numRegex.test(cssVal) ? cssVal + 'px solid #000000' : cssVal;
            return;
        }
        if (prop.startsWith('border') && prop.endsWith('Width') && cssVal !== '0' && cssVal !== '0px') {
            if (!el.style.borderStyle && !allStyles.borderStyle) el.style.borderStyle = 'solid';
        }
        if (prop === 'backgroundImageStretch') {
            const cfg = ViewportCascade.STRETCH_MAP[cssVal] || { size: 'cover', repeat: 'no-repeat' };
            el.style.backgroundSize = cfg.size; el.style.backgroundRepeat = cfg.repeat;
            return;
        }
        if (prop === 'backgroundImageAlignment') {
            el.style.backgroundPosition = ViewportCascade.ALIGNMENT_MAP[cssVal] || cssVal;
            return;
        }
        el.style[prop] = cssVal;
    }
}