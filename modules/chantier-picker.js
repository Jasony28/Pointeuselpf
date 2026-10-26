// Liste de choix du chantier au nouveau style (v3.8.5)
// Remplace la liste blanche du téléphone par une fenêtre qui suit le thème,
// avec recherche et groupes (chantiers du jour, de la semaine, autres).
// Le <select> d'origine reste en place (caché) : la valeur est toujours lue dessus.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

export function enhanceChantierSelect(select) {
    if (!select) return;
    let trigger = select._pickerTrigger;
    if (!trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'input cpick-trigger';
        trigger.setAttribute('aria-haspopup', 'dialog');
        select.insertAdjacentElement('afterend', trigger);
        select.classList.add('cpick-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        select._pickerTrigger = trigger;
        trigger.addEventListener('click', () => openPicker(select));
        select.addEventListener('change', () => refreshTrigger(select));
        const label = select.id && document.querySelector(`label[for="${select.id}"]`);
        if (label) label.addEventListener('click', (e) => { e.preventDefault(); trigger.focus(); });
    }
    refreshTrigger(select);
}

function refreshTrigger(select) {
    const trigger = select._pickerTrigger;
    if (!trigger) return;
    const opt = select.options[select.selectedIndex];
    const group = opt?.parentElement?.tagName === 'OPTGROUP' ? opt.parentElement.label : '';
    const usable = [...select.options].some(o => o.value && !o.disabled);
    trigger.disabled = !usable;
    trigger.innerHTML = `
        <span class="cpick-trigger-text">
            <span class="cpick-trigger-name">${esc(opt?.textContent || 'Choisir un chantier')}</span>
            ${group && usable ? `<span class="cpick-trigger-group">${esc(group)}</span>` : ''}
        </span>
        <span class="cpick-chevron">${CHEVRON}</span>`;
}

function readGroups(select) {
    const groups = [];
    let loose = null;
    [...select.children].forEach(node => {
        if (node.tagName === 'OPTGROUP') {
            groups.push({ label: node.label, items: [...node.children].filter(o => o.value && !o.disabled) });
        } else if (node.tagName === 'OPTION' && node.value && !node.disabled) {
            if (!loose) { loose = { label: '', items: [] }; groups.push(loose); }
            loose.items.push(node);
        }
    });
    return groups.filter(g => g.items.length);
}

function openPicker(select) {
    const groups = readGroups(select);
    if (!groups.length) return;
    const total = groups.reduce((n, g) => n + g.items.length, 0);

    const overlay = document.createElement('div');
    overlay.className = 'cpick-overlay';
    overlay.innerHTML = `
        <div class="cpick-sheet" role="dialog" aria-modal="true" aria-label="Choisir un chantier">
            <div class="cpick-handle" aria-hidden="true"></div>
            <div class="cpick-head">
                <h3 class="cpick-title">Choisir un chantier</h3>
                <button type="button" class="cpick-close" aria-label="Fermer">✕</button>
            </div>
            ${total > 8 ? `<label class="cpick-search">${SEARCH}<input type="search" placeholder="Rechercher un chantier…" autocomplete="off" enterkeyhint="search"></label>` : ''}
            <div class="cpick-list" role="listbox"></div>
        </div>`;
    document.body.appendChild(overlay);

    const list = overlay.querySelector('.cpick-list');
    const input = overlay.querySelector('.cpick-search input');

    const render = (q = '') => {
        const nq = norm(q.trim());
        let html = '';
        let count = 0;
        groups.forEach((g, gi) => {
            const items = nq ? g.items.filter(o => norm(o.textContent).includes(nq)) : g.items;
            if (!items.length) return;
            const today = gi === 0 && /jour/i.test(g.label);
            if (g.label) html += `<div class="cpick-group${today ? ' is-today' : ''}">${esc(g.label)}<span>${items.length}</span></div>`;
            items.forEach(o => {
                count++;
                const sel = o.value === select.value;
                html += `<button type="button" role="option" aria-selected="${sel}" class="cpick-item${sel ? ' is-selected' : ''}${today ? ' is-today' : ''}" data-value="${esc(o.value)}">
                    <span class="cpick-item-name">${esc(o.textContent)}</span>
                    <span class="cpick-check">${sel ? CHECK : ''}</span>
                </button>`;
            });
        });
        list.innerHTML = count ? html : `<p class="cpick-empty">Aucun chantier ne correspond à « ${esc(q)} »</p>`;
    };
    render();

    const close = () => {
        overlay.classList.add('is-closing');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => overlay.remove(), 160);
        select._pickerTrigger?.focus({ preventScroll: true });
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.cpick-close').addEventListener('click', close);
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.cpick-item');
        if (!btn) return;
        select.value = btn.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
    });
    input?.addEventListener('input', () => render(input.value));

    requestAnimationFrame(() => {
        list.querySelector('.is-selected')?.scrollIntoView({ block: 'center' });
    });
}
