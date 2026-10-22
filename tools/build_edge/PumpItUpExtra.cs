// Pump It Up Extra para PC, build liviana: una ventana con el motor de Edge que ya trae Windows (WebView2),
// en pantalla completa, con el juego adentro. Un servidor HTTP minimo en 127.0.0.1 sirve los archivos con los
// encabezados de aislamiento (COOP/COEP) que necesita la memoria compartida del port, como tools\servidor.mjs.
// Esc sale; F11 o doble clic cambian la pantalla completa. Las opciones del menu de servicio (EEPROM) quedan en
// guardado\ al lado del .exe, asi la carpeta entera se puede copiar a otra PC. Si esa PC no tiene el motor WebView2,
// pregunta y lo instala con el instalador oficial de Microsoft que viene en motor-webview2\ (1,8 MB, usa internet).
// PIU_PRUEBA=carpeta: prueba sin que se vea (ventana fuera de la pantalla): deja capturas y el registro y se cierra.
// Lo compila y arma tools\armar_build_edge.ps1 con el csc de .NET Framework (C# 5: sin $"", ?. ni =>).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Programa
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [STAThread]
    static void Main()
    {
        bool unica;
        using (Mutex m = new Mutex(true, "PumpItUpExtra_PC", out unica))
        {
            if (!unica) return;                     // ya hay una abierta
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Ventana());
        }
    }
}

// ---------- servidor de archivos (127.0.0.1, puerto libre) ----------
class Servidor
{
    readonly string raizJuego, raizVolcados, raizGuardado;
    readonly Dictionary<string, string> disco = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    TcpListener escucha;
    public int Puerto;
    const string AISLAR = "Cross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Embedder-Policy: require-corp\r\nCross-Origin-Resource-Policy: same-origin\r\n";

    public Servidor(string baseDir, string guardado)
    {
        raizJuego = Path.Combine(baseDir, "juego");
        raizVolcados = Path.Combine(raizJuego, "volcados");
        raizGuardado = guardado;
        // indice del disco sin distinguir mayusculas: el juego pide "bga\00.dat", "AUDIO\01.AUD"...
        string raizDisco = Path.Combine(raizJuego, "disco");
        if (Directory.Exists(raizDisco))
            foreach (string f in Directory.GetFiles(raizDisco, "*", SearchOption.AllDirectories))
                disco[f.Substring(raizDisco.Length + 1).Replace('\\', '/')] = f;
    }

    public void Arrancar()
    {
        escucha = new TcpListener(IPAddress.Loopback, 0);
        escucha.Start();
        Puerto = ((IPEndPoint)escucha.LocalEndpoint).Port;
        Thread t = new Thread(Aceptar);
        t.IsBackground = true;
        t.Start();
    }

    public void Parar() { try { escucha.Stop(); } catch { } }

    void Aceptar()
    {
        while (true)
        {
            TcpClient c;
            try { c = escucha.AcceptTcpClient(); } catch { return; }
            ThreadPool.QueueUserWorkItem(delegate { Atender(c); });
        }
    }

    // un pedido por conexion (Connection: close): alcanza y es simple
    void Atender(TcpClient c)
    {
        try
        {
            using (c)
            using (NetworkStream s = c.GetStream())
            {
                string cabecera = LeerCabecera(s);
                if (cabecera == null) return;
                string[] lineas = cabecera.Split(new[] { "\r\n" }, StringSplitOptions.None);
                string[] pedido = lineas[0].Split(' ');
                if (pedido.Length < 2) return;
                string metodo = pedido[0], ruta = pedido[1];
                int q = ruta.IndexOf('?');
                if (q >= 0) ruta = ruta.Substring(0, q);
                ruta = Uri.UnescapeDataString(ruta);
                int largo = 0;
                foreach (string l in lineas)
                    if (l.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)) int.TryParse(l.Substring(15).Trim(), out largo);

                // lo que el juego graba: eeprom.bin (exactamente 128 bytes) y opciones.json (opciones del port, hasta 4 KB)
                if (ruta == "/guardado/eeprom.bin" || ruta == "/guardado/opciones.json")
                {
                    bool esEeprom = ruta.EndsWith(".bin");
                    string archivo = Path.Combine(raizGuardado, esEeprom ? "eeprom.bin" : "opciones.json");
                    if (metodo == "PUT")
                    {
                        byte[] datos = LeerCuerpo(s, largo);
                        if (datos == null || (esEeprom ? datos.Length != 128 : datos.Length > 4096)) { Responder(s, 400, "Bad Request", null, metodo); return; }
                        Directory.CreateDirectory(raizGuardado);
                        File.WriteAllBytes(archivo, datos);
                        Responder(s, 204, "No Content", null, metodo);
                        return;
                    }
                    ResponderArchivo(s, archivo, metodo);
                    return;
                }
                // canciones propias del editor (EDITOR_MASTER.md etapa 2): guardado\canciones\, solo estos nombres
                // (numeros 82-99) y con tope de tamano por tipo; no se puede escribir nada mas
                // y "tu version" de los pasos de una cancion del disco (editor, G): guardado\ediciones\, solo NN_xx.not
                if (ruta.StartsWith("/guardado/canciones/") || ruta.StartsWith("/guardado/ediciones/"))
                {
                    bool edicion = ruta.StartsWith("/guardado/ediciones/");
                    string n = ruta.Substring(20).ToLowerInvariant();
                    int tope = edicion ? (System.Text.RegularExpressions.Regex.IsMatch(n, "^[0-9]{2}_([nhx][12]|db)\\.not$") ? 262144 : 0) : TopeCancion(n);
                    if (tope == 0) { Responder(s, 404, "Not Found", null, metodo); return; }
                    string archivo = Path.Combine(raizGuardado, edicion ? "ediciones" : "canciones", n);
                    if (metodo == "PUT")
                    {
                        byte[] datos = (largo > 0 && largo <= tope) ? LeerCuerpo(s, largo, tope) : null;
                        if (datos == null) { Responder(s, 400, "Bad Request", null, metodo); return; }
                        Directory.CreateDirectory(Path.GetDirectoryName(archivo));
                        File.WriteAllBytes(archivo, datos);
                        Responder(s, 204, "No Content", null, metodo);
                        return;
                    }
                    ResponderArchivo(s, archivo, metodo);
                    return;
                }
                if (ruta.StartsWith("/disco/"))
                {
                    string f;
                    if (disco.TryGetValue(ruta.Substring(7).Replace('\\', '/'), out f)) ResponderArchivo(s, f, metodo);
                    else Responder(s, 404, "Not Found", null, metodo);
                    return;
                }
                string raiz = raizJuego, rel = ruta.EndsWith("/") ? ruta + "index.html" : ruta;
                if (ruta.StartsWith("/volcados/")) { raiz = raizVolcados; rel = ruta.Substring(10); }
                string completo = Path.GetFullPath(Path.Combine(raiz, rel.TrimStart('/').Replace('/', '\\')));
                if (!completo.StartsWith(raiz, StringComparison.OrdinalIgnoreCase)) { Responder(s, 403, "Forbidden", null, metodo); return; }
                ResponderArchivo(s, completo, metodo);
            }
        }
        catch { /* el navegador corto la conexion */ }
    }

    static string LeerCabecera(Stream s)
    {
        MemoryStream m = new MemoryStream();
        int b, n = 0;
        while ((b = s.ReadByte()) >= 0)
        {
            m.WriteByte((byte)b);
            n = (b == '\r' || b == '\n') ? n + 1 : 0;
            if (n == 4) return Encoding.ASCII.GetString(m.ToArray());
            if (m.Length > 65536) return null;
        }
        return null;
    }

    static int TopeCancion(string n)
    {
        string num = "(8[2-9]|9[0-9])";
        if (System.Text.RegularExpressions.Regex.IsMatch(n, "^" + num + "_([nhx][12]|db)\\.not$")) return 262144;
        if (System.Text.RegularExpressions.Regex.IsMatch(n, "^d" + num + "\\.aud$")) return 614400;
        if (System.Text.RegularExpressions.Regex.IsMatch(n, "^" + num + "\\.aud$")) return 16777216;   // entera; si pasa la placa (2,6 MB) el juego recibe una recortada
        if (System.Text.RegularExpressions.Regex.IsMatch(n, "^t" + num + "\\.pnz$")) return 2097152;
        if (n == "canciones.json") return 65536;
        return 0;
    }

    static byte[] LeerCuerpo(Stream s, int largo, int tope = 1048576)
    {
        if (largo <= 0 || largo > tope) return null;
        byte[] b = new byte[largo];
        int leido = 0;
        while (leido < largo) { int r = s.Read(b, leido, largo - leido); if (r <= 0) return null; leido += r; }
        return b;
    }

    static string Tipo(string archivo)
    {
        string e = Path.GetExtension(archivo).ToLowerInvariant();
        if (e == ".html") return "text/html; charset=utf-8";
        if (e == ".js" || e == ".mjs") return "text/javascript; charset=utf-8";
        if (e == ".json") return "application/json; charset=utf-8";
        if (e == ".md") return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    static void Responder(Stream s, int codigo, string estado, string tipo, string metodo)
    {
        string c = "HTTP/1.1 " + codigo + " " + estado + "\r\nContent-Length: 0\r\nCache-Control: no-store\r\n" + AISLAR + "Connection: close\r\n\r\n";
        byte[] b = Encoding.ASCII.GetBytes(c);
        s.Write(b, 0, b.Length);
    }

    static void ResponderArchivo(Stream s, string archivo, string metodo)
    {
        if (!File.Exists(archivo)) { Responder(s, 404, "Not Found", null, metodo); return; }
        using (FileStream f = File.OpenRead(archivo))
        {
            string c = "HTTP/1.1 200 OK\r\nContent-Type: " + Tipo(archivo) + "\r\nContent-Length: " + f.Length +
                       "\r\nCache-Control: no-store\r\n" + AISLAR + "Connection: close\r\n\r\n";
            byte[] b = Encoding.ASCII.GetBytes(c);
            s.Write(b, 0, b.Length);
            if (metodo != "HEAD") f.CopyTo(s, 262144);
        }
    }
}

// ---------- la ventana ----------
class Ventana : Form
{
    readonly WebView2 vista = new WebView2();
    readonly Servidor servidor;
    readonly string prueba = Environment.GetEnvironmentVariable("PIU_PRUEBA");
    bool completa;

    // lo que la pagina (app\port\principal.js) puede pedirle a la ventana: salir y la pantalla completa
    const string PUENTE =
        "(function(){ var completa = true; window.__errores = [];" +
        " addEventListener('error', function(e){ window.__errores.push((e.message || e.type) + ' ' + (e.filename || '') + ':' + (e.lineno || '')); });" +
        " addEventListener('unhandledrejection', function(e){ window.__errores.push('promesa: ' + (e.reason && e.reason.message || e.reason)); });" +
        " window.piuBuild = {" +
        " salir: function(){ window.chrome.webview.postMessage('salir'); }," +
        " pantallaCompleta: function(si){ completa = !!si; window.chrome.webview.postMessage(si ? 'completa' : 'ventana'); }," +
        " estaCompleta: function(){ return completa; } }; })();";

    public Ventana()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        bool esPrueba = !string.IsNullOrEmpty(prueba);
        servidor = new Servidor(baseDir, esPrueba ? Path.Combine(prueba, "guardado") : Path.Combine(baseDir, "guardado"));
        Text = "Pump It Up Extra";
        BackColor = Color.Black;
        vista.Dock = DockStyle.Fill;
        vista.DefaultBackgroundColor = Color.Black;
        Controls.Add(vista);
        if (esPrueba)
        {
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-4000, 0);
            Size = new Size(1280, 960);
            ShowInTaskbar = false;
        }
        else PonerCompleta(true);
        Load += async delegate { await Iniciar(); };
        FormClosed += delegate { servidor.Parar(); };
    }

    void PonerCompleta(bool si)
    {
        completa = si;
        if (si)
        {
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = FormWindowState.Normal;
            Size = new Size(1024, 800);
            CenterToScreen();
        }
    }

    // ---------- el motor WebView2: si la PC no lo tiene, se instala con el instalador oficial que viene en la carpeta ----------
    static bool HayMotor()
    {
        try { return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()); }
        catch { return false; }
    }

    async Task<bool> InstalarMotor()
    {
        string instalador = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "motor-webview2", "MicrosoftEdgeWebview2Setup.exe");
        if (!File.Exists(instalador)) return false;
        DialogResult r = MessageBox.Show(
            "Esta PC no tiene el motor WebView2 de Microsoft, que el juego usa para dibujar y sonar.\n\n" +
            "¿Lo instalo ahora? Es el instalador oficial de Microsoft que viene en la carpeta del juego; tarda un minuto y necesita internet.",
            "Pump It Up Extra", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (r != DialogResult.Yes) return false;
        Label aviso = new Label { Text = "Instalando el motor de Microsoft...\n(tarda un minuto)", ForeColor = Color.White, BackColor = Color.Black,
                                  Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 20) };
        Controls.Add(aviso);
        aviso.BringToFront();
        int codigo = -1;
        try
        {
            codigo = await Task.Run(() =>
            {
                System.Diagnostics.Process p = System.Diagnostics.Process.Start(instalador, "/silent /install");
                p.WaitForExit();
                return p.ExitCode;
            });
        }
        catch { }
        Controls.Remove(aviso);
        if (HayMotor()) return true;
        MessageBox.Show("No se pudo instalar el motor (código " + codigo + ").\n\nFijate que haya internet y volvé a abrir el juego, " +
            "o instalalo a mano desde developer.microsoft.com/microsoft-edge/webview2 (\"Evergreen Bootstrapper\").",
            "Pump It Up Extra", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return false;
    }

    async Task Iniciar()
    {
        try
        {
            if (!HayMotor() && !await InstalarMotor()) { Close(); return; }
            servidor.Arrancar();
            string datos = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pump It Up Extra", "WebView2");
            string args = "--autoplay-policy=no-user-gesture-required";
            if (!string.IsNullOrEmpty(prueba)) args += " --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling";
            CoreWebView2Environment entorno = await CoreWebView2Environment.CreateAsync(null, datos, new CoreWebView2EnvironmentOptions(args));
            await vista.EnsureCoreWebView2Async(entorno);
            CoreWebView2 w = vista.CoreWebView2;
            w.Settings.AreDefaultContextMenusEnabled = false;
            w.Settings.AreDevToolsEnabled = false;
            w.Settings.IsStatusBarEnabled = false;
            w.Settings.IsZoomControlEnabled = false;
            w.Settings.AreBrowserAcceleratorKeysEnabled = false;   // F5, Ctrl+F, etc. no hacen nada: las teclas son del juego
            await w.AddScriptToExecuteOnDocumentCreatedAsync(PUENTE);
            w.WebMessageReceived += Mensaje;
            w.Navigate("http://127.0.0.1:" + servidor.Puerto + "/port/");
            if (!string.IsNullOrEmpty(prueba)) await Probar();
        }
        catch (Exception e)
        {
            MessageBox.Show("No se pudo abrir el juego:\n\n" + e.Message +
                "\n\nHace falta el motor WebView2 de Microsoft. Su instalador oficial está en la carpeta motor-webview2 del juego.",
                "Pump It Up Extra", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    void Mensaje(object emisor, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string m;
        try { m = e.TryGetWebMessageAsString(); } catch { return; }
        if (m == "salir") Close();
        else if (m == "completa") PonerCompleta(true);
        else if (m == "ventana") PonerCompleta(false);
    }

    async Task Probar()
    {
        Directory.CreateDirectory(prueba);
        // los primeros segundos: ahi se veia la pantalla de inicio del navegador antes de arrancar (no tiene que aparecer).
        // Mientras la pagina carga, la captura puede no terminar nunca: se espera como mucho 3 s.
        int esperado = 0;
        foreach (int ms in new[] { 800, 1600 })
        {
            await Task.Delay(ms - esperado);
            esperado = ms;
            MemoryStream m = new MemoryStream();
            Task captura = vista.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, m);
            if (await Task.WhenAny(captura, Task.Delay(3000)) == captura && m.Length > 0)
                File.WriteAllBytes(Path.Combine(prueba, "edge_" + ms + "ms.png"), m.ToArray());
        }
        foreach (int s in new[] { 8, 16, 24 })
        {
            await Task.Delay(8000);
            // a los 16 s aprieta F7 (lista con todo), para probar que el servidor guarda guardado\opciones.json
            if (s == 16) await vista.CoreWebView2.ExecuteScriptAsync("dispatchEvent(new KeyboardEvent('keydown', { code: 'F7' }))");
            using (FileStream f = File.Create(Path.Combine(prueba, "edge_" + s + "s.png")))
                await vista.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, f);
        }
        string r = await vista.CoreWebView2.ExecuteScriptAsync(
            "JSON.stringify({ build: !!window.piuBuild, aislado: crossOriginIsolated, errores: window.__errores, port: window.__port ? { cuadrosSeg: window.__port.cuadrosSeg, fin: window.__port.fin, todo: window.__port.todo } : null })");
        File.WriteAllText(Path.Combine(prueba, "edge_registro.json"), r);
        Close();
    }
}
