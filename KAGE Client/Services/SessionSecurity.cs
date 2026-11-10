using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Text;

namespace KAGE_Client.Services;

// Report the interactive user's observed desktop. Inaccessible/secure desktops remain unknown.
public sealed class SessionSecurity : IDisposable {
    private volatile string _state = "unknown";
    public SessionSecurity() { SystemEvents.SessionSwitch += OnSwitch; }
    private void OnSwitch(object sender, SessionSwitchEventArgs args) {
        _state = args.Reason switch {
            SessionSwitchReason.SessionLock => "locked",
            SessionSwitchReason.SessionUnlock => "unlocked",
            SessionSwitchReason.SessionLogoff => "logging_off",
            _ => "unknown"
        };
    }
    public string Read() {
        nint desktop = OpenInputDesktop(0, false, 1);
        if (desktop == 0) return _state is "locked" or "logging_off" ? _state : "unknown";
        try {
            var name = new StringBuilder(256);
            if (GetUserObjectInformation(desktop, 2, name, name.Capacity * 2, out _))
                _state = name.ToString() switch { "Default" => "unlocked", _ => _state == "locked" ? "locked" : "unknown" };
            return _state;
        }
        finally { CloseDesktop(desktop); }
    }
    public void Dispose() => SystemEvents.SessionSwitch -= OnSwitch;
    [DllImport("user32.dll", SetLastError = true)]
    private static extern nint OpenInputDesktop(uint flags, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint access);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetUserObjectInformation(nint handle, int index, StringBuilder value, int length, out int needed);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseDesktop(nint desktop);
}
