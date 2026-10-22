# Extrae los paquetes de graficos del disco (.DAT de Piu\Bga y de empty) a carpetas sueltas.
# Formato RES (los de Extra): "RES\0", u32 version (2), u32 cantidad, u32 tamano de datos, 8 bytes sin cifrar;
#   cifrado igual que los pasos B (byte XOR k, k arranca en 0xD2 y suma 0x95 por byte), en dos partes:
#   el indice desde 0x18 (una entrada de 28 bytes por archivo: nombre[16], u32 tamano,
#   u32 posicion desde el comienzo de los datos, u32 control) y cada archivo por separado (la llave arranca de nuevo).
#   Los datos empiezan en 0x18 + cantidad * 28.
# Formato F2 System (las canciones que estreno Extra): sin cifrar, ver ExtraerF2 mas abajo.
# Lee  ..\extraido\Piu\Bga\*.dat y ..\extraido\empty\*.dat   ->   ..\descifrado\graficos\<carpeta>\<paquete>\...
# Uso: powershell -ExecutionPolicy Bypass -File extraer_paquetes.ps1 [-Pisar]
param([switch]$Pisar)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$out = Join-Path $base 'descifrado\graficos'
if ((Test-Path -LiteralPath $out) -and -not $Pisar) { Write-Host "Ya existe $out - no piso nada (usar -Pisar para regenerar)."; exit 1 }
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -TypeDefinition @"
using System; using System.IO; using System.Text; using System.Collections.Generic;
public static class Res {
    // Formato F2 System (sin cifrar): nombre de relleno en 0x00, u32 cantidad en 0x34, firma de 20 bytes en 0x38,
    // y desde 0x4C una entrada de 40 bytes por archivo (nombre[32], u32 posicion absoluta, u32 tamano).
    public static string ExtraerF2(byte[] c, string destino) {
        int n = BitConverter.ToInt32(c, 0x34);
        if (n <= 0 || 0x4C + (long)n * 40 > c.Length) return "desconocido";
        Directory.CreateDirectory(destino);
        int malos = 0; var sb = new StringBuilder();
        for (int e = 0; e < n; e++) {
            int o = 0x4C + e * 40;
            int fin = 0; while (fin < 32 && c[o + fin] != 0) fin++;
            string nombre = Encoding.ASCII.GetString(c, o, fin);
            foreach (char ch in Path.GetInvalidFileNameChars()) nombre = nombre.Replace(ch, '_');
            int pos = BitConverter.ToInt32(c, o + 32), tam = BitConverter.ToInt32(c, o + 36);
            if (tam < 0 || pos < 0 || (long)pos + tam > c.Length || nombre.Length == 0) { malos++; sb.AppendLine("  ENTRADA RARA " + e + ": " + nombre + " tam " + tam + " pos " + pos); continue; }
            var arch = new byte[tam]; Array.Copy(c, pos, arch, 0, tam);
            File.WriteAllBytes(Path.Combine(destino, nombre), arch);
        }
        return "F2 " + n + " archivos" + (malos > 0 ? ", " + malos + " raros\n" + sb : "");
    }
    public static string Extraer(string ruta, string destino) {
        var c = File.ReadAllBytes(ruta);
        // firma F2 en 0x38: "fa!^" (comparada por bytes: la firma completa lleva una comilla invertida)
        if (c.Length >= 0x4C && c[0x38] == 0x66 && c[0x39] == 0x61 && c[0x3A] == 0x21 && c[0x3B] == 0x5E) return ExtraerF2(c, destino);
        if (c.Length < 0x20 || Encoding.ASCII.GetString(c, 0, 3) != "RES") return "desconocido";
        int n = BitConverter.ToInt32(c, 8);
        // el indice se descifra desde 0x18 con la llave arrancando en 0xD2
        var p = (byte[])c.Clone(); byte k = 0xD2;
        for (int i = 0x18; i < 0x18 + n * 28 && i < p.Length; i++) { p[i] = (byte)(c[i] ^ k); k = (byte)(k + 0x95); }
        int datos = 0x18 + n * 28;
        Directory.CreateDirectory(destino);
        var sb = new StringBuilder(); int malos = 0;
        for (int e = 0; e < n; e++) {
            int o = 0x18 + e * 28;
            int fin = 0; while (fin < 16 && p[o + fin] != 0) fin++;
            string nombre = Encoding.ASCII.GetString(p, o, fin);
            foreach (char ch in Path.GetInvalidFileNameChars()) nombre = nombre.Replace(ch, '_');
            int tam = BitConverter.ToInt32(p, o + 16), pos = BitConverter.ToInt32(p, o + 20);
            if (tam < 0 || pos < 0 || (long)datos + pos + tam > p.Length || nombre.Length == 0) { malos++; sb.AppendLine("  ENTRADA RARA " + e + ": " + nombre + " tam " + tam + " pos " + pos); continue; }
            // cada archivo va cifrado por separado: la llave vuelve a arrancar en 0xD2
            var arch = new byte[tam]; byte kk = 0xD2;
            for (int i = 0; i < tam; i++) { arch[i] = (byte)(c[datos + pos + i] ^ kk); kk = (byte)(kk + 0x95); }
            File.WriteAllBytes(Path.Combine(destino, nombre), arch);
        }
        return "RES " + n + " archivos" + (malos > 0 ? ", " + malos + " raros\n" + sb : "");
    }
}
"@
$resumen = New-Object System.Collections.Generic.List[string]
foreach ($carpeta in @('Piu\Bga', 'empty')) {
    $src = Join-Path $base "extraido\$carpeta"
    foreach ($f in Get-ChildItem -LiteralPath $src -Filter *.dat | Sort-Object Name) {
        $dest = Join-Path $out ((Split-Path $carpeta -Leaf) + '\' + $f.BaseName.ToUpper())
        $r = [Res]::Extraer($f.FullName, $dest)
        $linea = "{0}\{1}: {2}" -f (Split-Path $carpeta -Leaf), $f.Name, $r
        $resumen.Add($linea)
    }
}
[IO.File]::WriteAllLines((Join-Path $out 'resumen.txt'), $resumen, (New-Object Text.UTF8Encoding($false)))
$resumen | Where-Object { $_ -notmatch ': (RES|F2) \d+ archivos$' } | ForEach-Object { Write-Host $_ }
Write-Host ("Andamiro (RES): {0}  F2 System: {1}  desconocidos: {2}" -f @($resumen | Where-Object { $_ -match ': RES ' }).Count, @($resumen | Where-Object { $_ -match ': F2 ' }).Count, @($resumen | Where-Object { $_ -match ': desconocido' }).Count)
