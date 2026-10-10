using Wpf.Ui.Controls;

using KAGE_Client.Services;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Diagnostics;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace KAGE_Client.Views;

public partial class LockOverlay : FluentWindow, INotifyPropertyChanged {
    private readonly CommandManager _commandManager;
    private Forms.Screen _screen;
    private HwndSource? _source;
    private bool _allowClose;
    private OverlayKeyboardGuard? _keyboardGuard;

    // Appearance/input switches. safetyButton keeps keyboard input enabled during development.
    private bool showMonitorFrame = true;
    private bool blockKeyboardInput = true;
    public Visibility MonitorFrameVisibility => showMonitorFrame ? Visibility.Visible : Visibility.Collapsed;
    public string KeyboardInputWarning { get; private set; } = "";
    public Visibility KeyboardWarningVisibility => string.IsNullOrEmpty(KeyboardInputWarning) ? Visibility.Collapsed : Visibility.Visible;

    public event PropertyChangedEventHandler? PropertyChanged;

    public int[] ExtensionDurations { get; } = { 1, 2, 5, 10 };
    public int SelectedDuration { get; set; } = 1;
    public string ActionTitle => _commandManager.IsLogout ? _commandManager.IsForced ? "FORCED LOGOUT" : "LOGOUT" : _commandManager.IsForced ? "FORCED LOCK" : "LOCK";
    public string ModeLabel => _commandManager.IsForced ? "ADMINISTRATOR" : "AUTOMATIC";
    public string PolicyDescription => _commandManager.IsForced ? "Administrative security action" : "Automatic presence policy";
    public string CommandMessage => string.IsNullOrWhiteSpace(_commandManager.ActiveCommand?.Message)
        ? "A workstation security action is pending." : _commandManager.ActiveCommand.Message;
    public string CountdownText {
        get {
            int seconds = _commandManager.SecondsRemaining;
            return seconds >= 3600 ? $"{seconds / 3600:00}:{seconds / 60 % 60:00}:{seconds % 60:00}" : $"{seconds / 60:00}:{seconds % 60:00}";
        }
    }
    public string CountdownLabel => _commandManager.IsExtensionActive ? "EXTENSION ACTIVE" : "TIME REMAINING";
    public bool IsUrgent => _commandManager.SecondsRemaining <= 10;
    public bool CanExtend => _commandManager.CanExtend;
    public bool CanCancel => _commandManager.CanCancelExtension && !_commandManager.IsRequestPending;
    public Visibility CancelVisibility => _commandManager.CanCancelExtension ? Visibility.Visible : Visibility.Collapsed;
    public Visibility SafetyButtonVisibility => _commandManager.ShowSafetyButton ? Visibility.Visible : Visibility.Collapsed;
    public string ControlHint => _commandManager.IsForced ? "Administrator controlled. User changes are disabled."
        : _commandManager.IsExtensionActive ? "Cancellation requires restored chair presence." : "Select minutes to request more time.";
    public string FeedbackMessage => string.IsNullOrWhiteSpace(_commandManager.InteractionMessage)
        ? "Security monitoring remains active during this countdown." : _commandManager.InteractionMessage;

    public LockOverlay(CommandManager commandManager) {
        _commandManager = commandManager;
        // Capture the active display before the overlay itself takes focus.
        _screen = Forms.Screen.FromHandle(GetForegroundWindow());

        InitializeComponent();

        CaptureFallbackBackdrop();

        DataContext = this;

        // Subscribe to command manager state changes to update the UI
        _commandManager.StateChanged += CommandManager_StateChanged;
        SourceInitialized += LockOverlay_SourceInitialized;
        IsVisibleChanged += (_, _) => UpdateKeyboardGuard();
        StateChanged += (_, _) => {
            if (!_commandManager.ShowSafetyButton && !_allowClose && _commandManager.ActiveCommand != null
                && WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        };
        PreviewKeyDown += (_, e) => { if (ShouldBlockKeyboard) e.Handled = true; };
        PreviewKeyUp += (_, e) => { if (ShouldBlockKeyboard) e.Handled = true; };
        PreviewTextInput += (_, e) => { if (ShouldBlockKeyboard) e.Handled = true; };

        Closing += (_, e) => e.Cancel = !_allowClose;
        Closed += (_, _) => {
            ReleaseKeyboardGuard();
            _commandManager.StateChanged -= CommandManager_StateChanged;
            _source?.RemoveHook(WindowHook);
        };
    }

    private void CommandManager_StateChanged(object? sender, EventArgs e) {
        UpdateKeyboardGuard();
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(null));
    }

    private async void ExtendButton_Click(object sender, RoutedEventArgs e) {
        await _commandManager.RequestExtensionAsync(SelectedDuration);
    }

    private async void CancelButton_Click(object sender, RoutedEventArgs e) {
        await _commandManager.CancelExtensionAsync();
    }

    public void CloseForCommand() {
        _allowClose = true;
        ReleaseKeyboardGuard();
        Close();
    }

    private bool ShouldBlockKeyboard => blockKeyboardInput && IsVisible &&
    !_allowClose && _commandManager.ActiveCommand != null;

    private async void UpdateKeyboardGuard() {
        if (!ShouldBlockKeyboard) {
            ReleaseKeyboardGuard();
            return;
        }
        if (_keyboardGuard != null || !string.IsNullOrEmpty(KeyboardInputWarning)) return;

        OverlayKeyboardGuard guard = new();
        _keyboardGuard = guard;
        try {
            await guard.StartAsync();
        }
        catch (Exception ex) {
            guard.Dispose();
            if (!ReferenceEquals(_keyboardGuard, guard)) return;
            _keyboardGuard = null;
            KeyboardInputWarning = "Keyboard protection is unavailable. The countdown remains active.";
            Trace.WriteLine($"Overlay keyboard hook failed: {ex.Message}");
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(null));
        }
    }

    private void ReleaseKeyboardGuard() {
        OverlayKeyboardGuard? guard = _keyboardGuard;
        _keyboardGuard = null;
        guard?.Dispose();
    }

    private void SafetyButton_Click(object sender, RoutedEventArgs e) {
        _commandManager.safetyButtonMethod();
    }

    private void LockOverlay_SourceInitialized(object? sender, EventArgs e) {
        IntPtr handle = new WindowInteropHelper(this).Handle;
        _source = HwndSource.FromHwnd(handle);
        _source?.AddHook(WindowHook);
        // Reuse the backdrop support already provided by WPF-UI.
        WindowBackdrop.RemoveBackground(this);
        if (WindowBackdrop.ApplyBackdrop(this, WindowBackdropType.Acrylic)) {
            DesktopSnapshot.Source = null;
        }
        PlaceOnScreen();
    }

    private void CaptureFallbackBackdrop() {
        // Keep an in-memory frosted desktop for systems without native acrylic.
        // Capture before showing our HWND so the overlay never captures itself.
        try {
            System.Drawing.Rectangle bounds = _screen.Bounds;
            using System.Drawing.Bitmap bitmap = new(bounds.Width, bounds.Height);
            using (System.Drawing.Graphics graphics = System.Drawing.Graphics.FromImage(bitmap)) {
                graphics.CopyFromScreen(bounds.Location, System.Drawing.Point.Empty, bounds.Size);
            }
            IntPtr image = bitmap.GetHbitmap();
            try {
                BitmapSource source = Imaging.CreateBitmapSourceFromHBitmap(image, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                source.Freeze();
                DesktopSnapshot.Source = source;
            }
            finally { DeleteObject(image); }
        }
        catch (Exception ex) when (ex is Win32Exception || ex is ExternalException || ex is ArgumentException) {
            Trace.WriteLine($"Desktop backdrop unavailable: {ex.Message}");
            Background = new SolidColorBrush(Color.FromRgb(16, 16, 18));
        }
    }

    private void PlaceOnScreen() {
        IntPtr handle = new WindowInteropHelper(this).Handle;
        System.Drawing.Rectangle bounds = _screen.Bounds;
        Topmost = !_commandManager.ShowSafetyButton;
        ShowInTaskbar = _commandManager.ShowSafetyButton;
        // -1 = HWND_TOPMOST, -2 = HWND_NOTOPMOST, 0 = HWND_TOP
        SetWindowPos(handle, new IntPtr(CommandManager.safetyButton ? -2 : -1), bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x0040);
        // Keep a horizontal band even on small displays or high scaling settings.
        double dpi = VisualTreeHelper.GetDpi(this).DpiScaleX;
        double scale = Math.Min(1, Math.Min(bounds.Width / dpi / 1100, bounds.Height / dpi / 700));
        WarningBand.LayoutTransform = new ScaleTransform(scale, scale);
    }

    private IntPtr WindowHook(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled) {
        if (message == 0x0112 && ((long)wParam & 0xFFF0) == 0xF060) { // WM_SYSCOMMAND / SC_CLOSE
            handled = !_allowClose;
        } else if (message == 0x0112 && !_commandManager.ShowSafetyButton && !_allowClose) {
            long systemCommand = (long)wParam & 0xFFF0;
            // Prevent system-menu move, resize, minimize and maximize in normal operation.
            handled = systemCommand is 0xF000 or 0xF010 or 0xF020 or 0xF030;
        } else if (message == 0x007E || message == 0x02E0) { // display or DPI changed
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, new Action(() => {
                if (_allowClose) return;
                _screen = Forms.Screen.AllScreens.FirstOrDefault(screen => screen.DeviceName == _screen.DeviceName)
                    ?? Forms.Screen.PrimaryScreen!;
                PlaceOnScreen();
            }));
        }
        return IntPtr.Zero;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteObject(IntPtr handle);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
