// Mise en forme Tailwind précompilée dans styles/tailwind.css (plus de compilation dans le téléphone).
// Après avoir ajouté des classes dans le HTML ou le JS : npm run css (le workflow « Styles » le refait aussi).
module.exports = {
    content: ['./index.html', './app.js', './splash.js', './modules/**/*.js'],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-sans)'],
                mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
            },
            colors: {
                gray: {
                    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
                    500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
                },
                yellow: {
                    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
                    500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f',
                },
                primary: 'var(--color-primary)',
            },
            // Arrondis pilotés par le thème (--radius-scale, voir styles/app.css)
            borderRadius: { DEFAULT: 'calc(6px * var(--radius-scale))', md: 'calc(7px * var(--radius-scale))', lg: 'calc(10px * var(--radius-scale))', xl: 'calc(14px * var(--radius-scale))', '2xl': 'calc(18px * var(--radius-scale))' },
            zIndex: { 60: '60' },
        },
    },
};
