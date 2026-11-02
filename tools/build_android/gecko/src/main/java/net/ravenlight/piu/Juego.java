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
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Pump It Up Extra para Android: el mismo port de la web (app\port) con el disco entero adentro, a pantalla completa
 * desde que se abre, sin barras ni toques previos. Lo sirve la app (Servidor) en 127.0.0.1 con COOP/COEP.
 * (31/10, Charles: "tiene que ser una apk... en pantalla completa de por si y no de señales de que armo un servidor")
 * Se muestra con la WebView del telefono (el motor de Chrome, adentro de la app): no tiene memoria compartida
 * (crossOriginIsolated = false, medido en el Nubia el 21/10) y el hilo del juego la reemplaza con el puente del
 * servidor (/puente/, app\port\trabajador.js). Si el telefono no tiene WebView, GeckoView (el motor de Firefox, que si
 * la tiene). Antes (1.2.0/1.3.0) era una pestaña de Chrome: tools\build_android\_archivo\1.3.0_con_Chrome.
 * Ranking y online: los del hosting (window.piuBuild). Atras = Esc (vuelve al menu; en el menu principal, o con
 * SALIR, se cierra).
 */
public class Juego extends Activity {
    private static GeckoRuntime motor;              // uno solo por proceso (Gecko no deja crear otro)
    private GeckoView vista;
    private GeckoSession sesion;
    private WebView web;
    private Servidor servidor;
    private String url;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setBackgroundColor(0xFF000000);
        servidor = new Servidor(getAssets(), getFilesDir(), new Runnable() { public void run() { runOnUiThread(new Runnable() { public void run() { cerrar(); } }); } });
        servidor.vibrador = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
        servidor.start();
        url = "http://127.0.0.1:" + servidor.puerto() + "/port/";
        if (!usarWebView()) usarGecko();
    }

    // SALIR (o Atras en el menu principal)
    void cerrar() {
        if (servidor != null) { servidor.parar(); servidor = null; }
        finishAndRemoveTask();
    }

    private boolean usarWebView() {
        try { web = new WebView(this); }
        catch (Exception e) { Log.w("PIU", "sin WebView: " + e); web = null; return false; }
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // la musica arranca sin tocar antes, como la cabina al prenderla
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // para medir desde la PC por adb (chrome://inspect): solo con el cable y la depuracion USB prendida
        WebView.setWebContentsDebuggingEnabled(true);
        web.setBackgroundColor(0xFF000000);
        // el puente sin pedidos (31/10, medido en el Nubia: con fetch el hilo esperaba 23 ms por cuadro): la pagina deja
        // su estado y el ultimo cuadro dibujado directo en el servidor (principal.js subirEstado)
        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void estado(String b64, String mostrado) {
                Servidor s = servidor;
                if (s == null) return;
                try { s.ponerEstado(android.util.Base64.decode(b64, android.util.Base64.DEFAULT), Long.parseLong(mostrado)); }
                catch (Exception e) { /* dato raro: se ignora */ }
            }
        }, "piuApp");
        web.setWebViewClient(new WebViewClient());     // todo adentro de la app (nada se abre en el navegador)
        web.setWebChromeClient(new WebChromeClient() {
            // elegir archivos (el disco propio: app\port\instalar.js) con el selector del telefono
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (archivosWeb != null) archivosWeb.onReceiveValue(null);
                archivosWeb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Elegir el disco"), ELEGIR_ARCHIVO); }
                catch (Exception e) { archivosWeb = null; return false; }
                return true;
            }
        });
        setContentView(web);
        pantallaCompleta();
        Log.w("PIU", "abriendo " + url + " (WebView)");
        web.loadUrl(url);
        return true;
    }

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
        Log.w("PIU", "abriendo " + url + " (GeckoView)");
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
    private ValueCallback<Uri[]> archivosWeb;
    private GeckoSession.PromptDelegate.FilePrompt archivoPedido;
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> archivoRespuesta;

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        if (pedido != ELEGIR_ARCHIVO) return;
        java.util.ArrayList<Uri> elegidos = new java.util.ArrayList<>();
        if (resultado == RESULT_OK && datos != null) {
            if (datos.getClipData() != null) for (int k = 0; k < datos.getClipData().getItemCount(); k++) elegidos.add(datos.getClipData().getItemAt(k).getUri());
            else if (datos.getData() != null) elegidos.add(datos.getData());
        }
        if (archivosWeb != null) {
            ValueCallback<Uri[]> cb = archivosWeb; archivosWeb = null;
            cb.onReceiveValue(elegidos.isEmpty() ? null : elegidos.toArray(new Uri[0]));
            return;
        }
        if (archivoRespuesta == null) return;
        GeckoSession.PromptDelegate.FilePrompt p = archivoPedido;
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> r = archivoRespuesta;
        archivoPedido = null; archivoRespuesta = null;
        if (elegidos.isEmpty()) r.complete(p.dismiss());
        else if (elegidos.size() == 1) r.complete(p.confirm(this, elegidos.get(0)));
        else r.complete(p.confirm(this, elegidos.toArray(new Uri[0])));
    }

    // el boton Atras del telefono hace de Esc del juego
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        View v = web != null ? web : vista;
        if (v == null) { cerrar(); return; }
        long t = android.os.SystemClock.uptimeMillis();
        v.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE, 0));
        v.dispatchKeyEvent(new KeyEvent(t, t + 80, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE, 0));
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
        if (sesion != null) sesion.setActive(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        if (sesion != null) sesion.setActive(true);
        pantallaCompleta();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        if (sesion != null) sesion.close();
        if (servidor != null) { servidor.parar(); servidor = null; }
        super.onDestroy();
    }
}
