using KAGE_Client.Services;
using Microsoft.Win32;
using System.Diagnostics;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace KAGE_Client.Views;

// Owns the display windows and a single keyboard hook for this countdown.
internal sealed class LockOverlayController : IDisposable {
    private readonly Dispatcher _dispatcher = Dispatcher.CurrentDispatcher;
    private readonly LockOverlaySet _windows;
    private OverlayKeyboardGuard? _keyboardGuard;
    private bool _refreshQueued;
    private bool _disposed;
    private bool _shown;

    public LockOverlayController(CommandManager commandManager) {
        _windows = new(display => new LockOverlay(commandManager, display));
    }

    public void Show() {
        _dispatcher.VerifyAccess();
        if (_disposed || _shown) return;
        _shown = true;
        SystemEvents.DisplaySettingsChanged += DisplaySettingsChanged;
        try {
            SynchronizeDisplays();
            StartKeyboardGuard();
        }
        catch {
            Dispose();
            throw;
        }
    }

    private void SynchronizeDisplays() {
        _windows.Synchronize(Forms.Screen.AllScreens.Select(screen => new OverlayDisplay(screen.DeviceName, screen.Bounds)));
    }

    private void DisplaySettingsChanged(object? sender, EventArgs e) {
        // SystemEvents is raised off the UI thread. Re-read the screens only on
        // the dispatcher, after WinForms has invalidated its cached screen list.
        _dispatcher.BeginInvoke(new Action(() => {
            if (_disposed || _refreshQueued) return;
            _refreshQueued = true;
            _dispatcher.BeginInvoke(DispatcherPriority.Loaded, new Action(() => {
                _refreshQueued = false;
                if (_disposed) return;
                try { SynchronizeDisplays(); }
                catch (Exception ex) { Trace.WriteLine($"Overlay display refresh failed: {ex}"); }
            }));
        }));
    }

    private async void StartKeyboardGuard() {
        if (_keyboardGuard != null) return;
        OverlayKeyboardGuard guard = new();
        _keyboardGuard = guard;
        try { await guard.StartAsync(); }
        catch (Exception ex) {
            guard.Dispose();
            if (_disposed || !ReferenceEquals(_keyboardGuard, guard)) return;
            _keyboardGuard = null;
            _windows.SetInputWarning("Keyboard protection is unavailable. The countdown remains active.");
            Trace.WriteLine($"Overlay keyboard hook failed: {ex.Message}");
        }
    }

    public void Dispose() {
        _dispatcher.VerifyAccess();
        if (_disposed) return;
        _disposed = true;
        SystemEvents.DisplaySettingsChanged -= DisplaySettingsChanged;
        _keyboardGuard?.Dispose();
        _keyboardGuard = null;
        _windows.Dispose();
    }
}
