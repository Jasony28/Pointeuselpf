// Appelé par la compilation GitHub après « npx cap add android » (voir .github/workflows/android.yml).
// Force le cadrage de l'appli : la taille du texte choisie dans les réglages du téléphone
// ne grossit plus les pages (sinon les écrans débordent sur les petits téléphones).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'capacitor.config.json'), 'utf8'));
const pkg = config.appId;
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', ...pkg.split('.'), 'MainActivity.java');

writeFileSync(file, `package ${pkg};

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        forceFit();
    }

    @Override
    public void onResume() {
        super.onResume();
        forceFit();
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
