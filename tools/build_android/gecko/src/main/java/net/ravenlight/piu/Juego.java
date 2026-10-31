package net.ravenlight.piu;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Pump It Up Extra para Android: el mismo port de la web (app\port) con el disco entero adentro, a pantalla completa
 * desde que se abre, sin barras ni toques previos. Lo sirve la app (Servidor) en 127.0.0.1 con COOP/COEP y se muestra
 * con GeckoView, el motor de Firefox: la WebView de Android no da memoria compartida (crossOriginIsolated = false,
 * medido en el Nubia el 21/10) y el hilo del juego la necesita. Ranking y online: los del hosting (window.piuBuild).
 * Atras = Esc (vuelve al menu; en el menu principal, o con SALIR, se cierra).
 */
public class Juego extends Activity {
    private static GeckoRuntime motor;              // uno solo por proceso (Gecko no deja crear otro)
    private GeckoView vista;
    private GeckoSession sesion;
    // el servidor es uno por proceso: con Chrome encima esta ventana queda detras y el servidor tiene que seguir andando
    private static Servidor servidor;
    private static Juego actual;
    // (30/10, Charles: "arreglalo") medido en el Nubia con SurfaceFlinger: GeckoView entrega 52-54 cuadros por segundo
    // con saltos (38-43 en el menu) y Chrome 60 parejos. Si hay un navegador de Chrome (o hecho con su motor), el juego
    // se abre en una pestaña suya a pantalla completa, servido igual desde la app; si no, en GeckoView como antes.
    private boolean conChrome = false, chromeEncima = false, reabrir = false;
    private String url;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        actual = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (servidor == null) {
            servidor = new Servidor(getAssets(), getFilesDir(), new Runnable() { public void run() { final Juego j = actual; if (j != null) j.runOnUiThread(new Runnable() { public void run() { j.cerrar(); } }); } });
            servidor.vibrador = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
            servidor.start();
        }
        url = "http://127.0.0.1:" + servidor.puerto() + "/port/";
        String chrome = buscarChrome();
        if (chrome != null) {
            conChrome = true;
            setContentView(new View(this));
            getWindow().getDecorView().setBackgroundColor(0xFF000000);
            Sosten.prender(this);
            abrirEnChrome(chrome);
            return;
        }
        usarGecko();
    }

    // los navegadores con el motor de Chrome que abren pestañas para otra app (Custom Tabs); Firefox no (es Gecko)
    private static final String[] CHROMES = { "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.sec.android.app.sbrowser", "com.microsoft.emmx", "com.brave.browser" };
    private String buscarChrome() {
        try {
            java.util.List<android.content.pm.ResolveInfo> l = getPackageManager().queryIntentServices(new Intent("android.support.customtabs.action.CustomTabsService"), 0);
            for (String p : CHROMES) for (android.content.pm.ResolveInfo r : l) if (r.serviceInfo != null && p.equals(r.serviceInfo.packageName)) return p;
        } catch (Exception e) { Log.w("PIU", "sin lista de navegadores: " + e); }
        return null;
    }

    private void abrirEnChrome(String paquete) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(paquete);
        Bundle b = new Bundle();
        b.putBinder("android.support.customtabs.extra.SESSION", null);     // esto la hace pestaña de la app (Custom Tab)
        i.putExtras(b);
        i.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", 0xFF000000);
        i.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 0);
        i.putExtra("android.support.customtabs.extra.ENABLE_URLBAR_HIDING", true);
        i.putExtra("androidx.browser.customtabs.extra.SHARE_STATE", 2);
        i.putExtra("org.chromium.chrome.browser.customtabs.EXTRA_DISABLE_DOWNLOAD_BUTTON", true);
        i.putExtra("org.chromium.chrome.browser.customtabs.EXTRA_DISABLE_STAR_BUTTON", true);
        Log.w("PIU", "abriendo " + url + " en " + paquete);
        try { startActivity(i); }
        catch (Exception e) { Log.w("PIU", "Chrome no abrio: " + e); conChrome = false; Sosten.apagar(this); usarGecko(); }
    }

    // SALIR (o Atras en el menu principal): se cierra todo, la pestaña de Chrome incluida (esta en la misma tarea)
    void cerrar() {
        Sosten.apagar(this);
        if (servidor != null) { servidor.parar(); servidor = null; }
        finishAndRemoveTask();
    }

    @Override
    protected void onNewIntent(Intent i) { super.onNewIntent(i); if (conChrome) reabrir = true; }

    @Override
    protected void onStop() { super.onStop(); if (conChrome) chromeEncima = true; }

    private void usarGecko() {
        if (motor == null) {
            GeckoRuntimeSettings.Builder ajustes = new GeckoRuntimeSettings.Builder()
                    .consoleOutput(true)                       // la consola de la pagina al registro (adb logcat)
                    .configFilePath(configuracion());          // la musica arranca sin tocar antes, como la cabina al prenderla
            motor = GeckoRuntime.create(getApplicationContext(), ajustes.build());
        }
        sesion = new GeckoSession();
        sesion.setPermissionDelegate(new GeckoSession.PermissionDelegate() {
            @Override
            public GeckoResult<Integer> onContentPermissionRequest(GeckoSession s, ContentPermission p) {
                // sonido sin gesto previo (autoplay) y lo que pida el juego: todo es de la propia app
                return GeckoResult.fromValue(ContentPermission.VALUE_ALLOW);
            }
        });
        // elegir archivos (el disco propio: app\port\instalar.js): GeckoView no tiene selector propio, se usa el del telefono
        sesion.setPromptDelegate(new GeckoSession.PromptDelegate() {
            @Override
            public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onFilePrompt(GeckoSession s, GeckoSession.PromptDelegate.FilePrompt pedido) {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                if (pedido.type == GeckoSession.PromptDelegate.FilePrompt.Type.MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                archivoPedido = pedido; archivoRespuesta = new GeckoResult<>();
                try { startActivityForResult(Intent.createChooser(i, "Elegir el disco"), ELEGIR_ARCHIVO); }
                catch (Exception e) { archivoRespuesta.complete(pedido.dismiss()); }
                return archivoRespuesta;
            }
        });
        sesion.open(motor);
        vista = new GeckoView(this);
        vista.setSession(sesion);
        setContentView(vista);
        pantallaCompleta();
        Log.w("PIU", "abriendo " + url);
        sesion.loadUri(url);
    }

    // preferencias de Gecko (archivo YAML que lee al arrancar): sonido sin gesto y nada de pantallas propias de Firefox
    private String configuracion() {
        File f = new File(getFilesDir(), "gecko-config.yaml");
        try {
            FileOutputStream o = new FileOutputStream(f);
            o.write(("prefs:\n"
                    + "  media.autoplay.default: 0\n"
                    + "  media.autoplay.blocking_policy: 0\n"
                    + "  media.autoplay.block-webaudio: false\n"
                    + "  dom.postMessage.sharedArrayBuffer.withCOOP_COEP: true\n").getBytes("UTF-8"));
            o.close();
        } catch (Exception e) { Log.w("PIU", "sin config de Gecko: " + e); }
        return f.getAbsolutePath();
    }

    private void pantallaCompleta() {
        View d = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean foco) { super.onWindowFocusChanged(foco); if (foco) pantallaCompleta(); }

    // lo que eligio en el selector de archivos del telefono, para la pagina
    private static final int ELEGIR_ARCHIVO = 7;
    private GeckoSession.PromptDelegate.FilePrompt archivoPedido;
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> archivoRespuesta;

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        if (pedido != ELEGIR_ARCHIVO || archivoRespuesta == null) return;
        GeckoSession.PromptDelegate.FilePrompt p = archivoPedido;
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> r = archivoRespuesta;
        archivoPedido = null; archivoRespuesta = null;
        if (resultado != RESULT_OK || datos == null) { r.complete(p.dismiss()); return; }
        java.util.ArrayList<Uri> elegidos = new java.util.ArrayList<>();
        if (datos.getClipData() != null) for (int k = 0; k < datos.getClipData().getItemCount(); k++) elegidos.add(datos.getClipData().getItemAt(k).getUri());
        else if (datos.getData() != null) elegidos.add(datos.getData());
        if (elegidos.isEmpty()) r.complete(p.dismiss());
        else if (elegidos.size() == 1) r.complete(p.confirm(this, elegidos.get(0)));
        else r.complete(p.confirm(this, elegidos.toArray(new Uri[0])));
    }

    // el boton Atras del telefono hace de Esc del juego
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (vista == null) { cerrar(); return; }
        long t = android.os.SystemClock.uptimeMillis();
        vista.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE, 0));
        vista.dispatchKeyEvent(new KeyEvent(t, t + 80, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE, 0));
    }

    @Override
    protected void onPause() { super.onPause(); if (sesion != null) sesion.setActive(false); }

    @Override
    protected void onResume() {
        super.onResume();
        actual = this;
        if (sesion != null) sesion.setActive(true);
        pantallaCompleta();
        // con Chrome: si se volvio a esta ventana es porque la pestaña se cerro (Atras de mas). Tocando el icono otra vez
        // (onNewIntent) se abre de nuevo; si no, se cierra la app
        if (conChrome && reabrir) { reabrir = false; chromeEncima = false; String p = buscarChrome(); if (p != null) abrirEnChrome(p); }
        else if (conChrome && chromeEncima) cerrar();
    }

    @Override
    protected void onDestroy() {
        if (sesion != null) sesion.close();
        if (!conChrome && servidor != null) { servidor.parar(); servidor = null; }
        if (actual == this) actual = null;
        super.onDestroy();
    }
}
