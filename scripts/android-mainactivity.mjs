// Appelé par la compilation GitHub après « npx cap add android » (voir .github/workflows/android.yml).
// Force le cadrage de l'appli : jamais sous la barre d'état ni sous les boutons Android, et la taille du texte choisie dans les réglages du téléphone
// ne grossit plus les pages (sinon les écrans débordent sur les petits téléphones).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'capacitor.config.json'), 'utf8'));
const pkg = config.appId;
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', ...pkg.split('.'), 'MainActivity.java');

writeFileSync(file, `package ${pkg};

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        fitBetweenSystemBars();
        forceFit();
    }

    @Override
    public void onResume() {
        super.onResume();
        forceFit();
    }

    // L'appli reste toujours entre la barre d'état (en haut) et les boutons Android (en bas),
    // quels que soient le téléphone et la version d'Android (bord à bord forcé depuis Android 15).
    private void fitBetweenSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.parseColor("#0f172a"));
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);     // icônes blanches sur fond sombre
        bars.setAppearanceLightNavigationBars(false);
        ViewCompat.requestApplyInsets(content);
    }

    private void forceFit() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        WebSettings settings = webView.getSettings();
        settings.setTextZoom(100);          // ignore la taille de police du téléphone
        settings.setSupportZoom(false);     // pas de zoom à deux doigts
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);  // respecte la balise viewport (largeur = écran)
        settings.setLoadWithOverviewMode(false);
    }
}
`);
console.log('MainActivity :', file);
