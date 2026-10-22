package net.ravenlight.piu;

import android.app.Activity;
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
    private Servidor servidor;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        servidor = new Servidor(getAssets(), getFilesDir(), new Runnable() { public void run() { runOnUiThread(new Runnable() { public void run() { finishAndRemoveTask(); } }); } });
        servidor.start();
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
        sesion.open(motor);
        vista = new GeckoView(this);
        vista.setSession(sesion);
        setContentView(vista);
        pantallaCompleta();
        String url = "http://127.0.0.1:" + servidor.puerto() + "/port/";
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

    // el boton Atras del telefono hace de Esc del juego
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        long t = android.os.SystemClock.uptimeMillis();
        vista.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE, 0));
        vista.dispatchKeyEvent(new KeyEvent(t, t + 80, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE, 0));
    }

    @Override
    protected void onPause() { super.onPause(); if (sesion != null) sesion.setActive(false); }

    @Override
    protected void onResume() { super.onResume(); if (sesion != null) sesion.setActive(true); pantallaCompleta(); }

    @Override
    protected void onDestroy() { if (sesion != null) sesion.close(); if (servidor != null) servidor.parar(); super.onDestroy(); }
}
