using System.Drawing;

namespace KAGE_Client.Services;

// Bounds are physical pixels, including negative coordinates and the taskbar area.
internal sealed record OverlayDisplay(string DeviceName, Rectangle Bounds);

internal interface ILockOverlayWindow {
    void Show();
    void UpdateDisplay(OverlayDisplay display);
    void SetInputWarning(string warning);
    void CloseForCommand();
}

// One window per display. Topology changes never restart the command/countdown.
internal sealed class LockOverlaySet(Func<OverlayDisplay, ILockOverlayWindow> create) : IDisposable {
    private readonly Dictionary<string, (OverlayDisplay Display, ILockOverlayWindow Window)> _windows = new(StringComparer.Ordinal);
    private string _inputWarning = "";
    private bool _disposed;

    public void Synchronize(IEnumerable<OverlayDisplay> displays) {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var targets = displays.ToDictionary(display => display.DeviceName, StringComparer.Ordinal);
        // Cover new displays before removing windows for disconnected displays.
        foreach (OverlayDisplay display in targets.Values) {
            if (_windows.TryGetValue(display.DeviceName, out var existing)) {
                if (existing.Display != display) {
                    existing.Window.UpdateDisplay(display);
                    _windows[display.DeviceName] = (display, existing.Window);
                }
            } else {
                ILockOverlayWindow window = create(display);
                try {
                    window.SetInputWarning(_inputWarning);
                    window.Show();
                    _windows.Add(display.DeviceName, (display, window));
                }
                catch {
                    window.CloseForCommand();
                    throw;
                }
            }
        }
        foreach (string name in _windows.Keys.Except(targets.Keys).ToArray()) {
            _windows[name].Window.CloseForCommand();
            _windows.Remove(name);
        }
    }

    public void SetInputWarning(string warning) {
        _inputWarning = warning;
        foreach (var entry in _windows.Values) entry.Window.SetInputWarning(warning);
    }

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        foreach (var entry in _windows.Values) entry.Window.CloseForCommand();
        _windows.Clear();
    }
}
