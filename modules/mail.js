// E-mail du chantier (v3.8.6)
// Téléphone : ouvre l'app de mail (Gmail sur Android) avec le message déjà préparé.
// Ordinateur : ouvre la fenêtre « Nouveau message » de Gmail dans un onglet.

export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || !!window.Capacitor?.isNativePlatform?.();

export function mailHref(email, subject = '') {
    const to = String(email || '').trim();
    if (isMobile()) {
        return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
    }
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}${subject ? `&su=${encodeURIComponent(subject)}` : ''}`;
}

const MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';

// Bouton « Envoyer un e-mail » (balise <a>) prêt à insérer
export function mailButtonHTML(chantier, cls = 'mail-btn') {
    if (!chantier || !isValidEmail(chantier.email)) return '';
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const href = mailHref(chantier.email, `Chantier ${chantier.name || ''}`.trim());
    return `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${MAIL_ICON}<span>Envoyer un e-mail</span></a>`;
}
