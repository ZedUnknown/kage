using System.Runtime.InteropServices;

namespace KAGE_Client.Services;

public readonly record struct InputActivitySample(uint InputTick, uint IdleMilliseconds);

public static class InputActivity {
    public static InputActivitySample? Read() {
        LastInputInfo info = new() { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        if (!GetLastInputInfo(ref info)) return null;
        return new(info.Tick, Elapsed(unchecked((uint)Environment.TickCount64), info.Tick));
    }

    // Both Windows counters are unsigned 32-bit milliseconds and wrap together.
    public static uint Elapsed(uint now, uint input) => unchecked(now - input);

    [StructLayout(LayoutKind.Sequential)]
    private struct LastInputInfo { public uint Size; public uint Tick; }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetLastInputInfo(ref LastInputInfo info);
}
