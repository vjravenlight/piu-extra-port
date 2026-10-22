# Arma Pump It Up Extra para Linux (64 bits) y Mac (Apple e Intel): build\Pump It Up Extra - Linux y Mac\
# Es el mismo juego que la build de Edge (build\Pump It Up Extra - Edge\juego: port, motor, volcados y el disco entero)
# en una ventana de Electron 44.5.1 (tools\build_electron\main.js), con el ranking y el online del hosting.
# Electron de Linux y Mac: los zips oficiales en Documents\CLAUDE\_herramientas\electron-44.5.1 (o los baja y comprueba
# sus sumas: herramientas.ps1).
# Sale en .tar.gz y no en .zip: un zip hecho en Windows pierde los permisos de ejecucion (Linux) y los enlaces de los
# frameworks (Mac). El tar se escribe aca mismo, con el modo de cada archivo y los enlaces tal cual vienen en el zip.
# Antes: correr tools\armar_build_edge.ps1 (deja juego\ al dia).
# Uso: powershell -ExecutionPolicy Bypass -File armar_multiplataforma.ps1 [-Solo linux,apple,intel]
param([string[]]$Solo = @('linux', 'apple', 'intel'))
$ErrorActionPreference = 'Stop'
$Solo = @($Solo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$base = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'herramientas.ps1')
$kit = Conseguir $base 'electron-44.5.1'
$juego = Join-Path $base 'build\Pump It Up Extra - Edge\juego'
$prog = Join-Path $PSScriptRoot 'build_electron'
$salida = Join-Path $base 'build\Pump It Up Extra - Linux y Mac'
if (-not (Test-Path (Join-Path $juego 'port\index.html'))) { throw "Falta $juego (correr antes tools\armar_build_edge.ps1)" }
New-Item -ItemType Directory -Force $salida | Out-Null
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

Add-Type -ReferencedAssemblies System.IO.Compression -TypeDefinition @'
using System;
using System.IO;
using System.IO.Compression;
using System.Text;

// .tar.gz (ustar + pax para los nombres largos) con el modo unix de cada archivo y enlaces simbolicos
public class TarGz : IDisposable
{
    readonly FileStream fs; readonly GZipStream gz;
    readonly long hora = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;
    public TarGz(string ruta) { fs = File.Create(ruta); gz = new GZipStream(fs, CompressionLevel.Fastest); }

    static void Poner(byte[] h, int en, int largo, string s) { byte[] b = Encoding.UTF8.GetBytes(s); Array.Copy(b, 0, h, en, Math.Min(largo, b.Length)); }
    static string Octal(long v, int digitos) { return Convert.ToString(v, 8).PadLeft(digitos, '0'); }

    void Cabecera(string nombre, long largo, int modo, char tipo, string enlace)
    {
        string pax = "";
        if (Encoding.UTF8.GetByteCount(nombre) > 99) pax += Registro("path", nombre);
        if (enlace != null && Encoding.UTF8.GetByteCount(enlace) > 99) pax += Registro("linkpath", enlace);
        if (pax.Length > 0)
        {
            byte[] p = Encoding.UTF8.GetBytes(pax);
            Bloque("PaxHeader/" + Corto(nombre), p.Length, 420, 'x', null);
            gz.Write(p, 0, p.Length); Rellenar(p.Length);
        }
        Bloque(Corto(nombre), largo, modo, tipo, enlace == null ? null : Corto(enlace));
    }
    static string Corto(string s) { while (Encoding.UTF8.GetByteCount(s) > 99) s = s.Substring(s.Length - 90); return s; }
    static string Registro(string clave, string valor)
    {
        string resto = " " + clave + "=" + valor + "\n";
        int n = Encoding.UTF8.GetByteCount(resto), total = n + 1;
        while (total.ToString().Length + n != total) total = total.ToString().Length + n;
        return total.ToString() + resto;
    }
    void Bloque(string nombre, long largo, int modo, char tipo, string enlace)
    {
        byte[] h = new byte[512];
        Poner(h, 0, 100, nombre);
        Poner(h, 100, 8, Octal(modo, 7)); Poner(h, 108, 8, Octal(0, 7)); Poner(h, 116, 8, Octal(0, 7));
        Poner(h, 124, 12, Octal(largo, 11)); Poner(h, 136, 12, Octal(hora, 11));
        for (int i = 148; i < 156; i++) h[i] = 32;
        h[156] = (byte)tipo;
        if (enlace != null) Poner(h, 157, 100, enlace);
        Poner(h, 257, 6, "ustar"); h[262] = 0; Poner(h, 263, 2, "00");
        Poner(h, 265, 32, "ravenlight"); Poner(h, 297, 32, "ravenlight");
        int suma = 0; foreach (byte b in h) suma += b;
        Poner(h, 148, 8, Octal(suma, 6)); h[154] = 0; h[155] = 32;
        gz.Write(h, 0, 512);
    }
    void Rellenar(long largo) { int r = (int)(largo % 512); if (r != 0) gz.Write(new byte[512 - r], 0, 512 - r); }

    public void Carpeta(string nombre, int modo) { Cabecera(nombre.TrimEnd('/') + "/", 0, modo, '5', null); }
    public void Enlace(string nombre, string destino) { Cabecera(nombre, 0, 511, '2', destino); }
    public void Bytes(string nombre, int modo, byte[] datos) { Cabecera(nombre, datos.Length, modo, '0', null); gz.Write(datos, 0, datos.Length); Rellenar(datos.Length); }
    public void Flujo(string nombre, int modo, Stream s, long largo)
    {
        Cabecera(nombre, largo, modo, '0', null);
        byte[] b = new byte[1 << 20]; long falta = largo; int n;
        while (falta > 0 && (n = s.Read(b, 0, (int)Math.Min(b.Length, falta))) > 0) { gz.Write(b, 0, n); falta -= n; }
        if (falta != 0) throw new IOException("faltaron bytes en " + nombre);
        Rellenar(largo);
    }
    public void Archivo(string nombre, int modo, string ruta) { using (FileStream f = File.OpenRead(ruta)) Flujo(nombre, modo, f, f.Length); }
    public void Dispose() { gz.Write(new byte[1024], 0, 1024); gz.Dispose(); fs.Dispose(); }
}
'@

# el programa de la ventana y el juego entero, adentro de "<raiz>app/"
function SumarJuego($tar, $raiz) {
    $tar.Carpeta($raiz + 'app', 493)
    foreach ($f in 'main.js', 'preload.js', 'package.json') { $tar.Archivo($raiz + "app/$f", 420, (Join-Path $prog $f)) }
    $tar.Carpeta($raiz + 'app/juego', 493)
    $largo = (Resolve-Path $juego).Path.Length
    foreach ($e in Get-ChildItem $juego -Recurse | Sort-Object FullName) {
        $rel = $raiz + 'app/juego/' + $e.FullName.Substring($largo + 1).Replace('\', '/')
        if ($e.PSIsContainer) { $tar.Carpeta($rel, 493) } else { $tar.Archivo($rel, 420, $e.FullName) }
    }
}
# las entradas del zip oficial de Electron: carpetas, archivos con su modo y enlaces; $cambiar(nombre) -> nombre nuevo o $null (no va)
function CopiarElectron($tar, $zipRuta, $cambiar, $retocar) {
    $z = [IO.Compression.ZipFile]::OpenRead($zipRuta)
    try {
        foreach ($e in $z.Entries) {
            $nombre = & $cambiar $e.FullName
            if (-not $nombre) { continue }
            $modo = ($e.ExternalAttributes -shr 16) -band 0xFFFF
            $tipo = $modo -band 0xF000
            if ($e.FullName.EndsWith('/') -or $tipo -eq 0x4000) { $tar.Carpeta($nombre, 493); continue }
            $s = $e.Open()
            try {
                if ($tipo -eq 0xA000) {
                    $m = New-Object IO.MemoryStream; $s.CopyTo($m)
                    $tar.Enlace($nombre, [Text.Encoding]::UTF8.GetString($m.ToArray()))
                } elseif ($retocar -and ($r = & $retocar $e.FullName $s)) {
                    $tar.Bytes($nombre, 420, $r)
                } else {
                    $perm = $modo -band 0xFFF; if ($perm -eq 0) { $perm = 420 }
                    $tar.Flujo($nombre, $perm, $s, $e.Length)
                }
            } finally { $s.Dispose() }
        }
    } finally { $z.Dispose() }
}

if ($Solo -contains 'linux') {
    Write-Host 'Linux (64 bits)...'
    $tar = New-Object TarGz (Join-Path $salida 'Pump It Up Extra - Linux.tar.gz')
    try {
        $raiz = 'Pump It Up Extra/'
        $tar.Carpeta($raiz, 493)
        CopiarElectron $tar (Join-Path $kit 'electron-v44.5.1-linux-x64.zip') {
            param($n)
            if ($n -eq 'resources/default_app.asar') { return $null }
            if ($n -eq 'electron') { return $raiz + 'pump-it-up-extra' }
            return $raiz + $n
        } $null
        SumarJuego $tar ($raiz + 'resources/')
        # JUGAR.sh con fin de linea de Linux; --no-sandbox porque chrome-sandbox necesita ser de root
        $sh = "#!/bin/sh`n# Pump It Up Extra para Linux (port de Ravenlight): abre el juego. Lo guardado queda en guardado/, al lado.`ncd `"`$(dirname `"`$0`")`"`nchmod +x ./pump-it-up-extra 2>/dev/null`nexec ./pump-it-up-extra --no-sandbox `"`$@`"`n"
        $tar.Bytes($raiz + 'JUGAR.sh', 493, [Text.Encoding]::ASCII.GetBytes($sh))
        $tar.Archivo($raiz + 'LEEME.txt', 420, (Join-Path $prog 'LEEME_LINUX.txt'))
    } finally { $tar.Dispose() }
}
foreach ($mac in @(@('apple', 'darwin-arm64', 'Apple'), @('intel', 'darwin-x64', 'Intel'))) {
    if ($Solo -notcontains $mac[0]) { continue }
    Write-Host "Mac $($mac[2])..."
    $tar = New-Object TarGz (Join-Path $salida "Pump It Up Extra - Mac $($mac[2]).tar.gz")
    try {
        $app = 'Pump It Up Extra.app/'
        CopiarElectron $tar (Join-Path $kit "electron-v44.5.1-$($mac[1]).zip") {
            param($n)
            if (-not $n.StartsWith('Electron.app/')) { return $null }        # LICENSE, version, etc. no van
            if ($n -eq 'Electron.app/Contents/Resources/default_app.asar') { return $null }
            return $app + $n.Substring('Electron.app/'.Length)
        } {
            # el nombre que se ve en el Dock y en el menu (el ejecutable y los ayudantes siguen llamandose Electron)
            param($n, $s)
            if ($n -ne 'Electron.app/Contents/Info.plist') { return $null }
            $t = (New-Object IO.StreamReader $s).ReadToEnd()
            $t = [regex]::Replace($t, '(<key>CFBundle(Display)?Name</key>\s*<string>)Electron(</string>)', '${1}Pump It Up Extra${3}')
            return , ([Text.Encoding]::UTF8.GetBytes($t))      # la coma: que PowerShell no lo desarme en una lista
        }
        SumarJuego $tar ($app + 'Contents/Resources/')
        $tar.Archivo('LEEME - Mac.txt', 420, (Join-Path $prog 'LEEME_MAC.txt'))
    } finally { $tar.Dispose() }
}
Get-ChildItem $salida -Filter *.tar.gz | ForEach-Object { '{0}  {1} MB' -f $_.Name, [math]::Round($_.Length / 1MB) }
