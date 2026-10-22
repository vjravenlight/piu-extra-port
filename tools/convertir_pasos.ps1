# Convierte los pasos del disco (.NOT, formatos A y B) a JSON limpio para el port.
# Formato A ("pump 5.0"): cabecera 216 bytes + 3 tablas de N u16 (notas, comienzo de larga, fin de larga).
#   Columna c (0..9) = bit (9 - c).
# Formato B (cifrado):   cabecera 0x88 bytes + N eventos de 4 bytes (u16 fila, u16 mascara),
#   descifrado: byte XOR k, k arranca en 0xD2 y suma 0x95 por byte (funcion 0x3689C de Piu.exe).
#   Columna c (0..12) = bit (15 - c). Columnas 10-12 son extras (pulsos / compases / luces).
# Columnas 0-4 = pad izquierdo (abajo-izq, arriba-izq, centro, arriba-der, abajo-der), 5-9 = pad derecho.
# Lee  ..\extraido\Piu\step\*.NOT   y escribe  ..\descifrado\pasos\*.json  (+ resumen.csv). No pisa nada.
# Uso: powershell -ExecutionPolicy Bypass -File convertir_pasos.ps1 [-Pisar]
#   -Pisar: vuelve a generar los .json aunque ya existan (son derivados del disco, no originales)
param([switch]$Pisar)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$src = Join-Path $base 'extraido\Piu\step'
$out = Join-Path $base 'descifrado\pasos'
if ((Test-Path -LiteralPath $out) -and -not $Pisar) { Write-Host "Ya existe $out - no piso nada (usar -Pisar para regenerar)."; exit 1 }
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Globalization;
public static class Pasos {
    static string F(float f) { return f.ToString("0.###", CultureInfo.InvariantCulture); }
    static string Lista(IEnumerable<string> xs) { return "[" + string.Join(",", xs) + "]"; }
    public static string Convertir(string nombre, byte[] c, out string fila) {
        bool a = c.Length >= 8 && Encoding.ASCII.GetString(c, 0, 8) == "pump 5.0";
        var bpms = new List<float>(); var valores = new List<int>(); var cambios = new List<int>();
        int porPulso, numero, N; string titulo = "";
        var notas = new List<int[]>(); var largas = new List<int[]>(); var extras = new List<int[]>();
        if (a) {
            N = BitConverter.ToUInt16(c, 0x0A);
            for (int i = 0; i < 10; i++) { bpms.Add(BitConverter.ToSingle(c, 0x10 + 4 * i)); valores.Add(BitConverter.ToInt32(c, 0x38 + 4 * i)); cambios.Add(BitConverter.ToInt32(c, 0x60 + 4 * i)); }
            porPulso = BitConverter.ToInt32(c, 0x88); numero = BitConverter.ToInt32(c, 0x90);
            var t1 = new int[N]; var t2 = new int[N]; var t3 = new int[N];
            for (int r = 0; r < N; r++) { t1[r] = BitConverter.ToUInt16(c, 216 + 2 * r); t2[r] = BitConverter.ToUInt16(c, 216 + 2 * (N + r)); t3[r] = BitConverter.ToUInt16(c, 216 + 2 * (2 * N + r)); }
            var abierta = new int[10]; for (int k = 0; k < 10; k++) abierta[k] = -1;
            var enLarga = new bool[N, 10];
            for (int r = 0; r < N; r++) for (int col = 0; col < 10; col++) {
                int bit = 1 << (9 - col);
                if ((t2[r] & bit) != 0) abierta[col] = r;
                if ((t3[r] & bit) != 0 && abierta[col] >= 0) { largas.Add(new[] { col, abierta[col], r }); for (int q = abierta[col]; q <= r; q++) enLarga[q, col] = true; abierta[col] = -1; }
            }
            for (int r = 0; r < N; r++) for (int col = 0; col < 10; col++) if ((t1[r] & (1 << (9 - col))) != 0 && !enLarga[r, col]) notas.Add(new[] { r, col });
        } else {
            N = BitConverter.ToInt32(c, 0);
            for (int i = 0; i < 4; i++) { bpms.Add(BitConverter.ToSingle(c, 0x08 + 4 * i)); valores.Add(BitConverter.ToInt32(c, 0x18 + 4 * i)); cambios.Add(BitConverter.ToInt32(c, 0x28 + 4 * i)); }
            porPulso = BitConverter.ToInt32(c, 0x38); numero = BitConverter.ToInt32(c, 0x40);
            int fin = 0x44; while (fin < 0x84 && c[fin] != 0) fin++; titulo = Encoding.ASCII.GetString(c, 0x44, fin - 0x44);
            var p = new byte[N * 4]; byte k = 0xD2;
            for (int i = 0; i < N * 4 && 0x88 + i < c.Length; i++) { p[i] = (byte)(c[0x88 + i] ^ k); k = (byte)(k + 0x95); }
            for (int j = 0; j < N; j++) {
                int r = BitConverter.ToUInt16(p, 4 * j), m = BitConverter.ToUInt16(p, 4 * j + 2);
                for (int col = 0; col < 13; col++) if ((m & (1 << (15 - col))) != 0) { if (col < 10) notas.Add(new[] { r, col }); else extras.Add(new[] { r, col }); }
            }
        }
        // doble = solo DB y XD (por el nombre). En las simples de A el lado derecho suele repetir el izquierdo
        // (se deja solo el izquierdo); en las variantes _2 el derecho es otra version (espejada) para el pad derecho.
        bool doble = System.Text.RegularExpressions.Regex.IsMatch(nombre, "_(DB|XD)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        bool usaDerecho = false, espejo = true;
        var porFila = new Dictionary<int, int>();
        foreach (var n in notas) { int v; porFila.TryGetValue(n[0], out v); porFila[n[0]] = v | (1 << n[1]); if (n[1] >= 5) usaDerecho = true; }
        foreach (var l in largas) { int v; porFila.TryGetValue(l[1], out v); porFila[l[1]] = v | (1 << l[0]); if (l[0] >= 5) usaDerecho = true; }
        foreach (var kv in porFila) if (((kv.Value) & 0x1F) != ((kv.Value >> 5) & 0x1F)) espejo = false;
        bool ladosDistintos = !doble && usaDerecho && !espejo;
        if (!doble && usaDerecho && espejo) { notas.RemoveAll(n => n[1] >= 5); largas.RemoveAll(l => l[0] >= 5); }
        notas.Sort((x, y) => x[0] != y[0] ? x[0].CompareTo(y[0]) : x[1].CompareTo(y[1]));
        int ultima = 0; foreach (var n in notas) ultima = Math.Max(ultima, n[0]); foreach (var l in largas) ultima = Math.Max(ultima, l[2]);
        double seg = porPulso > 0 && bpms.Count > 0 && bpms[0] > 0 ? ultima / (double)porPulso * 60.0 / bpms[0] : 0;
        var sb = new StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"archivo\": \"" + nombre + "\",\n");
        sb.Append("  \"formato\": \"" + (a ? "A" : "B") + "\",\n");
        sb.Append("  \"tipo\": \"" + (doble ? "doble" : "simple") + "\",\n");
        sb.Append("  \"ladosDistintos\": " + (ladosDistintos ? "true" : "false") + ",\n");
        sb.Append("  \"numeroInterno\": " + numero + ",\n");
        if (titulo.Length > 0) sb.Append("  \"titulo\": \"" + titulo.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\n");
        sb.Append("  \"filasPorPulso\": " + porPulso + ",\n");
        sb.Append("  \"bpms\": " + Lista(bpms.ConvertAll(F)) + ",\n");
        sb.Append("  \"cambiosBpm\": " + Lista(cambios.ConvertAll(x => x.ToString())) + ",\n");
        sb.Append("  \"valores\": " + Lista(valores.ConvertAll(x => x.ToString())) + ",\n");
        sb.Append("  \"ultimaFila\": " + ultima + ",\n");
        sb.Append("  \"notas\": " + Lista(notas.ConvertAll(n => "[" + n[0] + "," + n[1] + "]")) + ",\n");
        sb.Append("  \"largas\": " + Lista(largas.ConvertAll(l => "[" + l[0] + "," + l[1] + "," + l[2] + "]")) + ",\n");
        sb.Append("  \"extras\": " + Lista(extras.ConvertAll(n => "[" + n[0] + "," + n[1] + "]")) + "\n");
        sb.Append("}\n");
        fila = string.Join(";", new[] { nombre, a ? "A" : "B", doble ? "doble" : (ladosDistintos ? "simple-2lados" : "simple"), F(bpms.Count > 0 ? bpms[0] : 0), porPulso.ToString(), ultima.ToString(), seg.ToString("0.0", CultureInfo.InvariantCulture), notas.Count.ToString(), largas.Count.ToString(), extras.Count.ToString(), titulo });
        return sb.ToString();
    }
}
"@
$csv = New-Object System.Collections.Generic.List[string]
$csv.Add('archivo;formato;tipo;bpm;filas_por_pulso;ultima_fila;segundos;notas;largas;extras;titulo')
$utf8 = New-Object Text.UTF8Encoding($false)
foreach ($f in Get-ChildItem -LiteralPath $src -Filter *.NOT | Sort-Object Name) {
    $c = [IO.File]::ReadAllBytes($f.FullName)
    $linea = $null
    $json = [Pasos]::Convertir($f.Name.ToUpper(), $c, [ref]$linea)
    [IO.File]::WriteAllText((Join-Path $out ($f.BaseName.ToUpper() + '.json')), $json, $utf8)
    $csv.Add($linea)
}
[IO.File]::WriteAllLines((Join-Path $out 'resumen.csv'), $csv, $utf8)
Write-Host ("Listo: {0} archivos en {1}" -f ($csv.Count - 1), $out)
