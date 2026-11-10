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

public partial class LockOverlay : FluentWindow, INotifyPropertyChanged, ILockOverlayWindow {
    private readonly CommandManager _commandManager;
    private OverlayDisplay _display;
    private HwndSource? _source;
    private bool _allowClose;
    private bool _hasAcrylicBackdrop;

    // Development safety mode remains controlled by CommandManager.
    private bool showMonitorFrame = true;
    private bool blockKeyboardInput = true;
    public Visibility MonitorFrameVisibility => showMonitorFrame ? Visibility.Visible : Visibility.Collapsed;
    public string KeyboardInputWarning { get; private set; } = "";
    public Visibility KeyboardWarningVisibility => string.IsNullOrEmpty(KeyboardInputWarning) ? Visibility.Collapsed : Visibility.Visible;

    public event PropertyChangedEventHandler? PropertyChanged;

    public string ExtensionDuration => _commandManager.ExtensionDurationSeconds % 60 == 0
        ? $"{_commandManager.ExtensionDurationSeconds / 60} min" : $"{_commandManager.ExtensionDurationSeconds} sec";
    public string ExtendButtonText => $"Extend by {ExtensionDuration}";
    public string ResponseTitle {
        get {
            if (_commandManager.IsForced) return "Administrator action";
            return _commandManager.IsActivityPrompt ? "Still working?" : "Need more time?";
        }
    }

    public string ActionTitle {
        get {
            if (_commandManager.IsLogout) {
                return _commandManager.IsForced ? "FORCED LOGOUT" : "LOGOUT";
            }

            return _commandManager.IsForced ? "FORCED LOCK" : "LOCK";
        }
    }

    public string ModeLabel => _commandManager.IsForced ? "ADMINISTRATOR" : "AUTOMATIC";
    public string PolicyDescription => _commandManager.IsForced ? "Administrative security action"
        : _commandManager.IsActivityPrompt ? "Inactivity confirmation" : "Automatic presence policy";
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
    public Visibility ConfirmActivityVisibility => _commandManager.IsActivityPrompt ? Visibility.Visible : Visibility.Collapsed;
    public bool CanConfirmActivity => _commandManager.CanConfirmActivity;
    public Visibility SafetyButtonVisibility => _commandManager.ShowSafetyButton ? Visibility.Visible : Visibility.Collapsed;
    public string ControlHint {
        get {
            if (_commandManager.IsForced) return "Administrator controlled. User changes are disabled.";
            if (_commandManager.IsActivityPrompt) return "Confirm you are here to dismiss this inactivity prompt.";

            return _commandManager.IsExtensionActive
                ? "Cancellation requires restored chair presence."
                : "The administrator sets extension duration and limits.";
        }
    }

    public string FeedbackMessage => string.IsNullOrWhiteSpace(_commandManager.InteractionMessage)
        ? "Security monitoring remains active during this countdown." : _commandManager.InteractionMessage;

    public LockOverlay(CommandManager commandManager) : this(commandManager, ActiveDisplay()) { }

    internal LockOverlay(CommandManager commandManager, OverlayDisplay display) {
        _commandManager = commandManager;
        _display = display;

        InitializeComponent();

        if (!DesignerProperties.GetIsInDesignMode(this)) CaptureFallbackBackdrop();

        DataContext = this;

        // Subscribe to command manager state changes to update the UI
        _commandManager.StateChanged += CommandManager_StateChanged;
        SourceInitialized += LockOverlay_SourceInitialized;
        Loaded += (_, _) => PlaceOnScreen();
        StateChanged += (_, _) => {
            if (!_commandManager.ShowSafetyButton && !_allowClose && _commandManager.ActiveCommand != null
                && WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        };
        PreviewKeyDown += (_, e) => { if (ShouldBlockKeyboard) e.Handled = true; };
        PreviewKeyUp += (_, e) => { if (ShouldBlockKeyboard) e.Handled = true; };
        PreviewTextInput += (_, e) => { if (ShouldBlockKeyboard) e.Handled = true; };

        Closing += (_, e) => e.Cancel = !_allowClose;
        Closed += (_, _) => {
            _commandManager.StateChanged -= CommandManager_StateChanged;
            _source?.RemoveHook(WindowHook);
        };
    }

    private void CommandManager_StateChanged(object? sender, EventArgs e) {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(null));
    }

    private async void ExtendButton_Click(object sender, RoutedEventArgs e) {
        await _commandManager.RequestExtensionAsync();
    }

    private async void ConfirmActivityButton_Click(object sender, RoutedEventArgs e) {
        await _commandManager.ConfirmActivityAsync();
    }

    private async void CancelButton_Click(object sender, RoutedEventArgs e) {
        await _commandManager.CancelExtensionAsync();
    }

    public void CloseForCommand() {
        _allowClose = true;
        Close();
    }

    private bool ShouldBlockKeyboard => blockKeyboardInput && IsVisible &&
    !_allowClose && _commandManager.ActiveCommand != null;

    void ILockOverlayWindow.SetInputWarning(string warning) {
        KeyboardInputWarning = warning;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(null));
    }

    void ILockOverlayWindow.UpdateDisplay(OverlayDisplay display) {
        _display = display;
        // A changed layout invalidates the old screenshot. Keep the opaque
        // fallback rather than capturing other overlay windows into the image.
        DesktopSnapshot.Source = null;
        if (!_hasAcrylicBackdrop) Background = new SolidColorBrush(Color.FromRgb(16, 16, 18));
        PlaceOnScreen();
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
        _hasAcrylicBackdrop = WindowBackdrop.ApplyBackdrop(this, WindowBackdropType.Acrylic);
        if (_hasAcrylicBackdrop) {
            DesktopSnapshot.Source = null;
        }
        PlaceOnScreen();
    }

    private void CaptureFallbackBackdrop() {
        // Keep an in-memory frosted desktop for systems without native acrylic.
        // Capture before showing our HWND so the overlay never captures itself.
        try {
            System.Drawing.Rectangle bounds = _display.Bounds;
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
        System.Drawing.Rectangle bounds = _display.Bounds;
        Topmost = !_commandManager.ShowSafetyButton;
        ShowInTaskbar = _commandManager.ShowSafetyButton;
        // -1 = HWND_TOPMOST, -2 = HWND_NOTOPMOST, 0 = HWND_TOP
        if (!SetWindowPos(handle, new IntPtr(Topmost ? -1 : -2), bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x0050))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        // Keep a horizontal band even on small displays or high scaling settings.
        DpiScale dpi = VisualTreeHelper.GetDpi(this);
        double scale = Math.Min(1, Math.Min(bounds.Width / dpi.DpiScaleX / 1100, bounds.Height / dpi.DpiScaleY / 700));
        WarningBand.LayoutTransform = new ScaleTransform(scale, scale);
    }

    private IntPtr WindowHook(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled) {
        if (message == 0x0112 && ((long)wParam & 0xFFF0) == 0xF060) { // WM_SYSCOMMAND / SC_CLOSE
            handled = !_allowClose;
        } else if (message == 0x0112 && !_commandManager.ShowSafetyButton && !_allowClose) {
            long systemCommand = (long)wParam & 0xFFF0;
            // Prevent system-menu move, resize, minimize and maximize in normal operation.
            handled = systemCommand is 0xF000 or 0xF010 or 0xF020 or 0xF030;
        } else if (message == 0x02E0) { // DPI changed. The controller owns display topology changes.
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, new Action(() => {
                if (_allowClose) return;
                PlaceOnScreen();
            }));
        }
        return IntPtr.Zero;
    }

    private static OverlayDisplay ActiveDisplay() {
        Forms.Screen screen = Forms.Screen.FromHandle(GetForegroundWindow());
        return new OverlayDisplay(screen.DeviceName, screen.Bounds);
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
