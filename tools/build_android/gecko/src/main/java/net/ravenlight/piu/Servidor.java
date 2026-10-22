package net.ravenlight.piu;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Servidor HTTP minimo en 127.0.0.1, como el de la build de Edge (tools\build_edge\PumpItUpExtra.cs): sirve el juego
 * desde los assets del APK (port, motor, volcados y disco) con los encabezados de aislamiento (COOP/COEP) que necesita
 * la memoria compartida del port, y guarda lo que el juego graba en la memoria interna de la app (guardado\: EEPROM,
 * opciones, canciones propias y "tu version" de los pasos), con los mismos nombres y topes que la build.
 * En cada pagina .html mete el puente (window.piuBuild): el juego usa el ranking y el online del hosting.
 */
class Servidor extends Thread {
    private final AssetManager assets;
    private final File guardado;
    private final ServerSocket escucha;
    private final ExecutorService hilos = Executors.newCachedThreadPool();
    private final Map<String, String> disco = new HashMap<String, String>();   // en minuscula -> nombre real en los assets
    private boolean indiceListo = false;
    private static final String AISLAR = "Cross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Embedder-Policy: require-corp\r\nCross-Origin-Resource-Policy: same-origin\r\n";
    private static final String PUENTE = "<script>(function(){window.__errores=[];"
            + "addEventListener('error',function(e){window.__errores.push((e.message||e.type)+' '+(e.filename||'')+':'+(e.lineno||''));});"
            // la app ya esta en pantalla completa desde que abre (no hace falta tocar); SALIR le pide al servidor que la cierre
            // cada 5 s, los cuadros por segundo y la pantalla al registro del telefono (adb logcat | GeckoConsole): para medir
            + "setInterval(function(){if(window.__port){var t=(window.__port.ultimos||[]).filter(function(l){return /tiron/.test(l);}).slice(-2).join(' | ');"
            + "fetch('/medida?c='+window.__port.cuadrosSeg+'&p='+window.__port.menu().pantalla+(t?'&t='+encodeURIComponent(t):'')).catch(function(){});}},5000);"
            + "window.piuBuild={android:true,salir:function(){fetch('/salir').catch(function(){});},pantallaCompleta:function(){},estaCompleta:function(){return true;}};})();</script>";
    private static final Pattern EDICION = Pattern.compile("^[0-9]{2}_([nhx][12]|db)\\.not$");

    private final Runnable alSalir;

    Servidor(AssetManager assets, File dirApp, Runnable alSalir) {
        this.assets = assets;
        this.alSalir = alSalir;
        this.guardado = new File(dirApp, "guardado");
        try { escucha = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1")); }
        catch (IOException e) { throw new RuntimeException(e); }
        setDaemon(true);
    }

    int puerto() { return escucha.getLocalPort(); }

    void parar() { try { escucha.close(); } catch (IOException e) { /* ya cerrado */ } hilos.shutdownNow(); }

    @Override
    public void run() {
        while (true) {
            final Socket c;
            try { c = escucha.accept(); } catch (IOException e) { return; }
            hilos.execute(new Runnable() { public void run() { atender(c); } });
        }
    }

    // un pedido por conexion (Connection: close), como la build de Edge
    private void atender(Socket c) {
        try {
            InputStream ent = c.getInputStream();
            OutputStream sal = c.getOutputStream();
            String cabecera = leerCabecera(ent);
            if (cabecera == null) return;
            String[] lineas = cabecera.split("\r\n");
            String[] pedido = lineas[0].split(" ");
            if (pedido.length < 2) return;
            String metodo = pedido[0], ruta = pedido[1];
            // la medida de la pagina (cuadros por segundo y pantalla, cada 5 s) al registro: adb logcat -s PIU
            if (ruta.startsWith("/medida?")) { android.util.Log.w("PIU", "medida " + ruta.substring(8)); responder(sal, 204, "No Content"); return; }
            int q = ruta.indexOf('?');
            if (q >= 0) ruta = ruta.substring(0, q);
            ruta = URLDecoder.decode(ruta.replace("+", "%2B"), "UTF-8");
            int largo = 0;
            for (String l : lineas) if (l.regionMatches(true, 0, "Content-Length:", 0, 15)) try { largo = Integer.parseInt(l.substring(15).trim()); } catch (NumberFormatException e) { largo = 0; }
            // SALIR del menu principal (o Esc/ATRAS en el menu): la pagina avisa y la app se cierra
            if (ruta.equals("/salir")) { responder(sal, 204, "No Content"); if (alSalir != null) alSalir.run(); return; }

            // lo que el juego graba: eeprom.bin (exactamente 128 bytes) y opciones.json (hasta 4 KB)
            if (ruta.equals("/guardado/eeprom.bin") || ruta.equals("/guardado/opciones.json")) {
                boolean esEeprom = ruta.endsWith(".bin");
                File f = new File(guardado, esEeprom ? "eeprom.bin" : "opciones.json");
                if (metodo.equals("PUT")) {
                    byte[] d = leerCuerpo(ent, largo, 4096);
                    if (d == null || (esEeprom ? d.length != 128 : d.length > 4096)) { responder(sal, 400, "Bad Request"); return; }
                    grabar(f, d); responder(sal, 204, "No Content"); return;
                }
                responderArchivo(sal, f, metodo); return;
            }
            // canciones propias del editor (numeros 82-99) y "tu version" de los pasos: solo esos nombres, con tope
            if (ruta.startsWith("/guardado/canciones/") || ruta.startsWith("/guardado/ediciones/")) {
                boolean edicion = ruta.startsWith("/guardado/ediciones/");
                String n = ruta.substring(20).toLowerCase();
                int tope = edicion ? (EDICION.matcher(n).matches() ? 262144 : 0) : topeCancion(n);
                if (tope == 0) { responder(sal, 404, "Not Found"); return; }
                File f = new File(new File(guardado, edicion ? "ediciones" : "canciones"), n);
                if (metodo.equals("PUT")) {
                    byte[] d = (largo > 0 && largo <= tope) ? leerCuerpo(ent, largo, tope) : null;
                    if (d == null) { responder(sal, 400, "Bad Request"); return; }
                    grabar(f, d); responder(sal, 204, "No Content"); return;
                }
                responderArchivo(sal, f, metodo); return;
            }
            String asset;
            if (ruta.startsWith("/disco/")) {
                indice();
                asset = disco.get(ruta.substring(7).replace('\\', '/').toLowerCase());
                if (asset == null) { responder(sal, 404, "Not Found"); return; }
            } else {
                String rel = ruta.endsWith("/") ? ruta + "index.html" : ruta;
                rel = rel.replaceFirst("^/+", "");
                if (rel.contains("..") || rel.isEmpty()) { responder(sal, 403, "Forbidden"); return; }
                asset = rel;
            }
            responderAsset(sal, asset, metodo);
        } catch (IOException e) {
            /* el navegador corto la conexion */
        } finally {
            try { c.close(); } catch (IOException e) { /* ya cerrada */ }
        }
    }

    // indice del disco sin distinguir mayusculas: el juego pide "bga\00.dat", "AUDIO\01.AUD"...
    private synchronized void indice() {
        if (indiceListo) return;
        recorrer("disco");
        indiceListo = true;
    }

    private void recorrer(String dir) {
        try {
            String[] hijos = assets.list(dir);
            if (hijos == null) return;
            for (String h : hijos) {
                String p = dir + "/" + h;
                String[] nietos = assets.list(p);
                if (nietos != null && nietos.length > 0) recorrer(p);
                else disco.put(p.substring(6).toLowerCase(), p);
            }
        } catch (IOException e) { /* sin esa carpeta */ }
    }

    private static int topeCancion(String n) {
        String num = "(8[2-9]|9[0-9])";
        if (n.matches("^" + num + "_([nhx][12]|db)\\.not$")) return 262144;
        if (n.matches("^d" + num + "\\.aud$")) return 614400;
        if (n.matches("^" + num + "\\.aud$")) return 16777216;
        if (n.matches("^t" + num + "\\.pnz$")) return 2097152;
        if (n.equals("canciones.json")) return 65536;
        return 0;
    }

    private static String leerCabecera(InputStream s) throws IOException {
        ByteArrayOutputStream m = new ByteArrayOutputStream();
        int b, n = 0;
        while ((b = s.read()) >= 0) {
            m.write(b);
            n = (b == '\r' || b == '\n') ? n + 1 : 0;
            if (n == 4) return new String(m.toByteArray(), StandardCharsets.ISO_8859_1);
            if (m.size() > 65536) return null;
        }
        return null;
    }

    private static byte[] leerCuerpo(InputStream s, int largo, int tope) throws IOException {
        if (largo <= 0 || largo > tope) return null;
        byte[] b = new byte[largo];
        int leido = 0;
        while (leido < largo) { int r = s.read(b, leido, largo - leido); if (r <= 0) return null; leido += r; }
        return b;
    }

    private static void grabar(File f, byte[] d) throws IOException {
        f.getParentFile().mkdirs();
        File tmp = new File(f.getPath() + ".tmp");
        FileOutputStream o = new FileOutputStream(tmp);
        try { o.write(d); } finally { o.close(); }
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
    }

    private static String tipo(String nombre) {
        String n = nombre.toLowerCase();
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".md") || n.endsWith(".txt")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    private static void responder(OutputStream s, int codigo, String estado) throws IOException {
        s.write(("HTTP/1.1 " + codigo + " " + estado + "\r\nContent-Length: 0\r\nCache-Control: no-store\r\n" + AISLAR + "Connection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        s.flush();
    }

    private static void cabecera200(OutputStream s, String nombre, long largo) throws IOException {
        s.write(("HTTP/1.1 200 OK\r\nContent-Type: " + tipo(nombre) + "\r\nContent-Length: " + largo + "\r\nCache-Control: no-store\r\n" + AISLAR + "Connection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
    }

    private static void copiar(InputStream de, OutputStream a) throws IOException {
        byte[] b = new byte[262144];
        int n;
        while ((n = de.read(b)) > 0) a.write(b, 0, n);
    }

    private static void responderArchivo(OutputStream s, File f, String metodo) throws IOException {
        if (!f.isFile()) { responder(s, 404, "Not Found"); return; }
        cabecera200(s, f.getName(), f.length());
        if (!metodo.equals("HEAD")) { FileInputStream e = new FileInputStream(f); try { copiar(e, s); } finally { e.close(); } }
        s.flush();
    }

    private void responderAsset(OutputStream s, String asset, String metodo) throws IOException {
        // las paginas llevan el puente al principio del <head>
        if (asset.toLowerCase().endsWith(".html")) {
            byte[] b;
            try { b = todo(assets.open(asset)); } catch (IOException e) { responder(s, 404, "Not Found"); return; }
            String h = new String(b, StandardCharsets.UTF_8);
            int i = h.toLowerCase().indexOf("<head>");
            h = i >= 0 ? h.substring(0, i + 6) + PUENTE + h.substring(i + 6) : PUENTE + h;
            b = h.getBytes(StandardCharsets.UTF_8);
            cabecera200(s, asset, b.length);
            if (!metodo.equals("HEAD")) s.write(b);
            s.flush();
            return;
        }
        // sin comprimir (armar_apk.ps1 usa --no-compress): se sabe el largo sin leerlo entero
        AssetFileDescriptor fd = null;
        try { fd = assets.openFd(asset); } catch (IOException e) { fd = null; }
        if (fd != null) {
            try {
                cabecera200(s, asset, fd.getLength());
                if (!metodo.equals("HEAD")) { InputStream e = fd.createInputStream(); try { long falta = fd.getLength(); byte[] b = new byte[262144]; while (falta > 0) { int n = e.read(b, 0, (int) Math.min(b.length, falta)); if (n <= 0) break; s.write(b, 0, n); falta -= n; } } finally { e.close(); } }
                s.flush();
            } finally { fd.close(); }
            return;
        }
        byte[] b;
        try { b = todo(assets.open(asset)); } catch (IOException e) { responder(s, 404, "Not Found"); return; }
        cabecera200(s, asset, b.length);
        if (!metodo.equals("HEAD")) s.write(b);
        s.flush();
    }

    private static byte[] todo(InputStream e) throws IOException {
        try { ByteArrayOutputStream m = new ByteArrayOutputStream(); copiar(e, m); return m.toByteArray(); } finally { e.close(); }
    }
}
