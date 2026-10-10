using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Threading;

namespace KAGE_Client.Services;

// Suppresses ordinary keyboard input on the current desktop while the overlay is
// visible. Windows secure attention (Ctrl+Alt+Delete) is outside this hook's scope.
internal sealed class OverlayKeyboardGuard : IDisposable {
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly KeyboardHookProc _callback;
    private volatile Dispatcher? _dispatcher;
    private volatile bool _disposed;
    private volatile bool _blocking;
    private IntPtr _hook;

    public OverlayKeyboardGuard() {
        _callback = KeyboardHook;
    }

    public Task StartAsync() {
        // A dedicated message loop keeps painting, HTTP and UI work from delaying
        // the hook callback. Windows can remove hooks whose callbacks time out.
        Thread thread = new(Run) { IsBackground = true, Name = "KAGE overlay keyboard" };
        thread.Start();
        return _ready.Task;
    }

    private void Run() {
        try {
            _dispatcher = Dispatcher.CurrentDispatcher;
            if (_disposed) { _ready.TrySetCanceled(); return; }

            _hook = SetWindowsHookEx(13, _callback, GetModuleHandle(null), 0); // WH_KEYBOARD_LL
            if (_hook == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());

            _blocking = !_disposed;
            _ready.TrySetResult();
            if (!_disposed) Dispatcher.Run();
        }
        catch (Exception ex) {
            _ready.TrySetException(ex);
        }
        finally {
            _blocking = false;
            if (_hook != IntPtr.Zero) {
                UnhookWindowsHookEx(_hook);
                _hook = IntPtr.Zero;
            }
            GC.KeepAlive(_callback);
        }
    }

    private IntPtr KeyboardHook(int code, IntPtr message, IntPtr data) {
        // Never log keys, marshal key data, or perform UI/network work here.
        if (code >= 0 && _blocking && !_disposed) return new IntPtr(1);
        return CallNextHookEx(IntPtr.Zero, code, message, data);
    }

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        _blocking = false; // Pass input through immediately, even before unhooking.
        Dispatcher? dispatcher = _dispatcher;
        if (dispatcher != null && !dispatcher.HasShutdownStarted) {
            dispatcher.BeginInvokeShutdown(DispatcherPriority.Send);
        }
    }

    private delegate IntPtr KeyboardHookProc(int code, IntPtr message, IntPtr data);

    [DllImport("user32.dll", EntryPoint = "SetWindowsHookExW", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int hookId, KeyboardHookProc callback, IntPtr module, uint threadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);

    [DllImport("kernel32.dll", EntryPoint = "GetModuleHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string? moduleName);
}
