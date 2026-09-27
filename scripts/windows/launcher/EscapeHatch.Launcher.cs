// Thin EscapeHatch.exe launcher (packaging Candidate 1).
// Delegates Start/Stop/Status/Restart to scripts/windows/EscapeHatch-Runtime.ps1.
// Does not own process identity, listener termination, or install state.
using System;
using System.Diagnostics;
using System.IO;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            var action = ResolveAction(args);
            var installRoot = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var manager = Path.Combine(installRoot, "scripts", "windows", "EscapeHatch-Runtime.ps1");
            if (!File.Exists(manager))
            {
                Console.Error.WriteLine("ERROR: lifecycle manager missing at " + manager);
                return 1;
            }

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + manager + "\" -Action " + action,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    Console.Error.WriteLine("ERROR: failed to start lifecycle manager.");
                    return 1;
                }
                var stdout = process.StandardOutput.ReadToEnd();
                var stderr = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (!string.IsNullOrWhiteSpace(stdout)) Console.Write(stdout);
                if (!string.IsNullOrWhiteSpace(stderr)) Console.Error.Write(stderr);
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERROR: " + ex.Message);
            return 1;
        }
    }

    private static string ResolveAction(string[] args)
    {
        if (args == null || args.Length == 0) return "Start";
        var raw = (args[0] ?? "Start").Trim().TrimStart('-', '/');
        switch (raw.ToLowerInvariant())
        {
            case "start": return "Start";
            case "stop": return "Stop";
            case "restart": return "Restart";
            case "status": return "Status";
            default:
                throw new ArgumentException("Unsupported action '" + raw + "'. Use Start|Stop|Restart|Status.");
        }
    }
}
