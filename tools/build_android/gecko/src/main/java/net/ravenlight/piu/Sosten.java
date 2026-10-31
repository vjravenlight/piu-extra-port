package net.ravenlight.piu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Con el juego en una pestaña de Chrome (Juego.java), la ventana de la app queda detras y Android podria cerrar el
 * proceso, y con el el servidor que le da el juego a Chrome. Este servicio en primer plano lo sostiene mientras el juego
 * esta abierto (aviso "Pump It Up Extra abierto"; si no hay permiso de notificaciones, igual anda sin el aviso).
 */
public class Sosten extends Service {
    static void prender(Context c) {
        try { c.startForegroundService(new Intent(c, Sosten.class)); } catch (Exception e) { Log.w("PIU", "sin sosten: " + e); }
    }

    static void apagar(Context c) { try { c.stopService(new Intent(c, Sosten.class)); } catch (Exception e) { /* ya apagado */ } }

    @Override
    public int onStartCommand(Intent i, int banderas, int id) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel("piu", "Juego abierto", NotificationManager.IMPORTANCE_MIN));
        Notification n = new Notification.Builder(this, "piu")
                .setSmallIcon(R.mipmap.icono)
                .setContentTitle("Pump It Up Extra abierto")
                .setOngoing(true)
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(1, n);
        } catch (Exception e) { Log.w("PIU", "sosten sin primer plano: " + e); }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
