using KAGE_Client.Models;
using KAGE_Client.Services;
using System.ComponentModel;
using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using Wpf.Ui.Controls;
using System.IO;

using Forms = System.Windows.Forms;
using System.Windows.Threading;

namespace KAGE_Client.Views;

public partial class MainWindow : FluentWindow, INotifyPropertyChanged {

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged(string propertyName) {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    private readonly ClientConfig _config;
    private readonly CommandManager commandManager;
    private LockOverlay? _lockOverlay;
    private readonly CancellationTokenSource _lifetime = new();
    private readonly Forms.NotifyIcon _trayIcon;
    private readonly Forms.ContextMenuStrip _trayMenu;
    private WindowState _restoreWindowState = WindowState.Normal;

    public string ServerAddress => _config.ServerAddress.Trim();

    // Colors and brushes for status
    private readonly Brush _mutedBrush;
    private readonly Brush _accentBrush;
    private readonly Brush _waitingBrush;
    public Brush ServerColor { get; private set; }
    public Brush HubColor { get; private set; }
    public Brush SensorColor { get; private set; }
    public Brush MonitoringColor { get; private set; }

    // IDs
    public string HubId => DisplayId(_config.HubId);
    public string PcId => DisplayId(_config.PcId);
    public string ChairId => DisplayId(_config.ChairId);

    // Status labels
    public string ServerStatus { get; private set; } = "Waiting";
    public string ServerMessage { get; private set; } = "Waiting for the initial state request.";
    public string HubStatus { get; private set; } = "Unknown";
    public string SensorStatus { get; private set; } = "Unknown";

    // Other labels
    public string MonitoringTitle { get; private set; } = "Waiting for client state";
    public string MonitoringDescription { get; private set; } = "Waiting for current server data.";
    public string MonitoringLabel { get; private set; } = "MONITORING / WAITING FOR DATA";
    public string RequestType { get; private set; } = "INITIAL REQUEST";
    public string SeatStatus { get; private set; } = "Unknown";
    public string SeatDescription { get; private set; } = "Waiting for current chair presence data.";
    public string ChairLabel => string.IsNullOrWhiteSpace(_config.ChairId) ? "No chair assigned to this PC" : $"Chair · {DisplayId(_config.ChairId)}";

    // Event labels
    public string LastChecked { get; private set; } = "Waiting for first request…";
    public string LastEvent { get; private set; } = "Configuration loaded";
    public string LastEventTime { get; private set; } = DateTime.Now.ToString("HH:mm:ss");

    // State variables
    public bool CanRefresh => !_isChecking && !_isClosed;


    // SSE Client
    private ClientStateData? _state;
    private SseClient? _sseClient;
    private CancellationTokenSource? _sseCancellation;

// ============================================================

    public MainWindow(ClientConfig config) {
        _config = config;

        InitializeComponent();

        // Use this class as the source for XAML binding values
        DataContext = this;

        // Server address as API object
        Api api = new(_config.ServerAddress);

        // Initialize the command manager and subscribe to its events
        commandManager = new CommandManager(api, _config);
        commandManager.StateChanged += CommandManager_StateChanged; // subscribe to state changes to show/hide the lock overlay
        commandManager.ExecutionFailed += CommandManager_ExecutionFailed;

        // Subscribe to window events
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        StateChanged += MainWindow_StateChanged;
        Closed += MainWindow_Closed;

        // Brushes for status indicators
        _mutedBrush = (Brush)FindResource("MutedBrush");
        _accentBrush = (Brush)FindResource("AccentBrush");
        _waitingBrush = (Brush)FindResource("WaitingBrush");

        ServerColor = _mutedBrush;
        HubColor = _mutedBrush;
        SensorColor = _mutedBrush;
        MonitoringColor = _waitingBrush;

        // System tray icon and context menu

        string iconPath = Path.Combine(AppContext.BaseDirectory,
            "Assets",
            "Icons",
            "kage.ico"
        );

        _trayMenu = new Forms.ContextMenuStrip();
        _trayMenu.Items.Add("Open KAGE Client", null, (_, _) => RestoreFromTray());
        _trayIcon = new Forms.NotifyIcon {
            Icon = new System.Drawing.Icon(iconPath),
            Text = "KAGE Client",
            ContextMenuStrip = _trayMenu,
            Visible = true
        };
        _trayIcon.MouseDoubleClick += TrayIcon_MouseDoubleClick;
    }

    // [Window Events]
    private async void MainWindow_Loaded(object sender, RoutedEventArgs e) {
        // Unsubscribe to prevent multiple calls if the window is reloaded
        Loaded -= MainWindow_Loaded;

        // Overlay Simulation
        DateTimeOffset now = DateTimeOffset.UtcNow;
        commandManager.HandleCommand(new ClientCommandData {
            Command = "auto_lock",
            Message = "This is a mock command for testing purposes.",
            DeadlineUtc = now.AddSeconds(5000),
            ServerTimeUtc = now,
            Priority = 10,
            AllowExtension = true,
            AllowCancellation = true
        });

        await LoadStateAsync();

        // Start SSE
        if (!_isClosed) StartSse();
    }

    private void MainWindow_Closing(object? sender, CancelEventArgs e) {
        // Closing the dashboard must leave monitoring running in the tray.
        e.Cancel = true;
        HideToTray();
    }

    private void MainWindow_StateChanged(object? sender, EventArgs e) {
        if (WindowState == WindowState.Minimized) {
            HideToTray();
        } else {
            _restoreWindowState = WindowState;
        }
    }

    private void HideToTray() {
        Hide();
        ShowInTaskbar = false;
    }

    private void TrayIcon_MouseDoubleClick(object? sender, Forms.MouseEventArgs e) {
        if (e.Button == Forms.MouseButtons.Left) RestoreFromTray();
    }

    private void RestoreFromTray() {
        if (_isClosed) return;

        WindowState = _restoreWindowState;
        ShowInTaskbar = true;
        Show();
        Activate();
    }

    private void MainWindow_Closed(object? sender, EventArgs e) {
        _isClosed = true;
        commandManager.StateChanged -= CommandManager_StateChanged;
        commandManager.ExecutionFailed -= CommandManager_ExecutionFailed;
        commandManager.Dispose();
        _lockOverlay?.CloseForCommand();
        _lockOverlay = null;
        _trayIcon.Visible = false;
        _trayIcon.MouseDoubleClick -= TrayIcon_MouseDoubleClick;
        _trayIcon.Dispose();
        _trayMenu.Dispose();
        _sseCancellation?.Cancel();
        _sseCancellation?.Dispose();
        _lifetime.Cancel();
        _lifetime.Dispose();
    }

    // [Refresh Button]
    private async void RefreshButton_Click(object sender, RoutedEventArgs e) {
        await LoadStateAsync();
    }

    // [Initial Full Load and Refresh]
    private bool _isChecking;
    private bool _isClosed;

    private async Task LoadStateAsync() {
        if (_isChecking || _isClosed) return;

        _isChecking = true;

        bool _shouldRetry = false;


        SetServerStatus("Checking…", "Requesting current state from the server", _waitingBrush);
        UpdateBindings();

        try {
            if (!Uri.TryCreate(ServerAddress, UriKind.Absolute, out Uri? address)
                || (address.Scheme != Uri.UriSchemeHttp && address.Scheme != Uri.UriSchemeHttps)) {
                ShowError("Invalid server address", "The configured server address is not valid. Please check the configuration.");
                return;
            }

            Api api = new(ServerAddress);

            // sending hub and pc id to server to get client state
            KAGELockResponse? result = await api.apiFetch("/client/state", HttpMethod.Post, new {
                hub_id = _config.HubId,
                pc_id = _config.PcId
            }, _lifetime.Token);

            if (_isClosed) return; // just in case the window was closed while waiting for the server response
            if (result == null) {
                ShowError("No response", "The server did not return any data. Please check the server status.");
                _shouldRetry = true;
                return;
            }

            // Read client state data and update the config and bindings
            ClientStateData state = ReadState(result.data);
            ApplyState(state);

        }
        catch (OperationCanceledException) {
            if (!_isClosed){
                ShowError("Timed out", "Server connection timed out");
                _shouldRetry = true;
            }
        }
        catch (HttpRequestException) {
            if (!_isClosed) {
                ShowError("Disconnected", "Could not reach the KAGE server");
                _shouldRetry = true;
            }
        }
        catch (JsonException) {
            if (!_isClosed) {
                ShowError("Invalid response", "The server returned an invalid response");
                _shouldRetry = true;
            }

        }
        finally {
            _isChecking = false;
            if (!_isClosed) {
                LastChecked = $"Checked at {DateTime.Now:HH:mm:ss}";
                UpdateBindings();
            }

            if (_shouldRetry && !_isClosed) {
                await WaitAndTryAsync();
            }
        }
    }

    private void ApplyState(ClientStateData state) {
        if (_isClosed)
            return;

        _state = state;
        SetServerStatus("Connected", "KAGE server connected", _accentBrush);

        // Update relevant sections of the UI
        UpdateAssignment(_state);
        commandManager.UpdateClientState(_state);
        UpdateConnections(_state);
        UpdateMonitoring(_state);
        UpdateSeatPresence(_state);

        // construct event message
        string message = $"{MonitoringTitle} · {ChairLabel} · Seat: {SeatStatus} · Sensor: {SensorStatus}";
        if (!string.IsNullOrWhiteSpace(_state.Sensor?.State)) {
            message += $" ({_state.Sensor.State})";
        }

        RecordEvent(message);

        // Update all bindings
        UpdateBindings();
    }

    private void UpdateAssignment(ClientStateData state) {
        _config.HubId = state.Hub.HubId;
        _config.PcId = state.Pc.PcId;
        _config.ChairId = state.Assignment.ChairId;
    }

    private void UpdateConnections(ClientStateData state) {
        HubStatus = state.Hub.Online ? "Online" : "Offline";
        HubColor = state.Hub.Online ? _accentBrush : _waitingBrush;

        SensorStatus = "Unknown";
        SensorColor = _mutedBrush;
        if (state.Assignment.Assigned && state.Sensor != null) {
            SensorStatus = state.Sensor.Online ? "Online" : "Offline";
            SensorColor = state.Sensor.Online ? _accentBrush : _waitingBrush;
        }
    }

    private void UpdateMonitoring(ClientStateData state) {
        MonitoringLabel = "MONITORING / WAITING FOR DEVICE";
        MonitoringColor = _waitingBrush;

        if (!state.Assignment.Assigned) {
            MonitoringLabel = "MONITORING / AWAITING ASSIGNMENT";
            MonitoringTitle = "Chair assignment required";
            MonitoringDescription = "Assign a chair to this PC to enable presence monitoring.";
        } else if (!state.Hub.Online) {
            MonitoringTitle = "Hub offline";
            MonitoringDescription = "Waiting for the hub to reconnect.";
        } else if (state.Chair == null) {
            MonitoringTitle = "Waiting for chair data";
            MonitoringDescription = "The assigned chair has not reported its status yet.";
        } else if (!state.Chair.Online) {
            MonitoringTitle = "Chair offline";
            MonitoringDescription = "Waiting for the assigned chair to reconnect.";
        } else if (state.Sensor == null) {
            MonitoringTitle = "Waiting for sensor data";
            MonitoringDescription = "The sensor has not reported its status yet.";
        } else if (!state.Sensor.Online) {
            MonitoringTitle = "Sensor offline";
            MonitoringDescription = "Waiting for the sensor to reconnect.";
        } else {
            MonitoringLabel = "MONITORING / ACTIVE";
            MonitoringColor = _accentBrush;
            MonitoringTitle = "Presence monitoring active";
            MonitoringDescription = "Receiving presence data.";
            if (!string.IsNullOrWhiteSpace(state.Sensor.State)) {
                MonitoringDescription = $"Sensor state: {state.Sensor.State}";
            }
        }
    }

    private void UpdateSeatPresence(ClientStateData state) {
        if (!state.Assignment.Assigned) {
            SeatStatus = "No chair assigned";
            SeatDescription = "Presence status will appear once a chair is assigned.";
        } else if (!state.Hub.Online || state.Chair == null || !state.Chair.Online) {
            SeatStatus = "Unknown";
            SeatDescription = "Waiting for current chair presence data.";
        } else if (state.Chair.Occupied) {
            SeatStatus = "Occupied";
            SeatDescription = "Someone is sitting in the assigned chair.";
        } else {
            SeatStatus = "Unoccupied";
            SeatDescription = "The assigned chair is empty.";
        }
    }

    // [SSE]
    private void StartSse() {
        _sseCancellation =
            new CancellationTokenSource();

        _sseClient =
            new SseClient();

        _ = RunSseAsync(
            _sseCancellation.Token
        );
    }

    private async Task RunSseAsync(CancellationToken cancellationToken) {
        if (_sseClient == null)
            return;

        RequestType = "SSE STREAM";

        try {
            await _sseClient.ListenAsync(
                serverAddress: ServerAddress,
                hubId: _config.HubId,
                pcId: _config.PcId,
                onStateReceived: state => {
                    Dispatcher.Invoke(() => ApplyState(state));
                },
                onCommandReceived: command => {
                    Dispatcher.Invoke(() => commandManager.HandleCommand(command));

                },
                cancellationToken
            );
        }
        catch (OperationCanceledException) {
            Trace.WriteLine("SSE stopped");
        }
        catch (Exception ex) {
            Trace.WriteLine($"SSE ERROR: {ex.Message}");
        }
        finally {
            if (!_isClosed) commandManager.UpdateClientState(null);
        }
    }

    // [Command Overlay]
    private void CommandManager_StateChanged(object? sender, EventArgs e) {
        // opens the overlay when a command exists
        if (_isClosed) return;
        if (commandManager.ActiveCommand == null) {
            _lockOverlay?.CloseForCommand();
            _lockOverlay = null;
        } else if (_lockOverlay == null) {
            _lockOverlay = new LockOverlay(commandManager);
            _lockOverlay.Show();
        }
    }

    private void CommandManager_ExecutionFailed(object? sender, string message) {
        RecordEvent(message);
        UpdateBindings();
        _trayIcon.ShowBalloonTip(5000, "KAGELOCK / Action failed", message, Forms.ToolTipIcon.Error);
    }

    // [Helpers]
    private static string DisplayId(string? value) => string.IsNullOrWhiteSpace(value) ? "Not assigned" : value.Trim();

    private static ClientStateData ReadState(JsonElement data) {
        if (data.ValueKind != JsonValueKind.Object) {
            throw new JsonException("Missing client state.");
        }

        // The chair and sensor objects can be absent. These three cannot.
        foreach (string name in new[] { "hub", "pc", "assignment" }) {
            if (!data.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.Object) {
                throw new JsonException($"Missing {name} state.");
            }
        }

        ClientStateData? state = data.Deserialize<ClientStateData>();
        if (state == null) throw new JsonException("Missing client state.");
        return state;
    }

    private void SetServerStatus(string status, string message, Brush color) {
        ServerStatus = status;
        ServerMessage = message;
        ServerColor = color;
    }

    private void RecordEvent(string message) {
        if (LastEvent == message) return;
        LastEvent = message;
        LastEventTime = DateTime.Now.ToString("HH:mm:ss");
    }

    private void UpdateBindings() {
        OnPropertyChanged(nameof(HubId));
        OnPropertyChanged(nameof(PcId));
        OnPropertyChanged(nameof(ChairId));
        OnPropertyChanged(nameof(CanRefresh));
        OnPropertyChanged(nameof(ServerStatus));
        OnPropertyChanged(nameof(ServerMessage));
        OnPropertyChanged(nameof(HubStatus));
        OnPropertyChanged(nameof(SensorStatus));
        OnPropertyChanged(nameof(ServerColor));
        OnPropertyChanged(nameof(HubColor));
        OnPropertyChanged(nameof(SensorColor));
        OnPropertyChanged(nameof(MonitoringTitle));
        OnPropertyChanged(nameof(RequestType));
        OnPropertyChanged(nameof(MonitoringDescription));
        OnPropertyChanged(nameof(MonitoringLabel));
        OnPropertyChanged(nameof(MonitoringColor));
        OnPropertyChanged(nameof(SeatStatus));
        OnPropertyChanged(nameof(SeatDescription));
        OnPropertyChanged(nameof(LastChecked));
        OnPropertyChanged(nameof(LastEvent));
        OnPropertyChanged(nameof(LastEventTime));
        OnPropertyChanged(nameof(ChairLabel));
    }

    private void ShowError(string status, string message) {
        commandManager.UpdateClientState(null);
        SetServerStatus(status, message, _waitingBrush);
        HubStatus = "Unknown";
        HubColor = _mutedBrush;
        SensorStatus = "Unknown";
        SensorColor = _mutedBrush;
        MonitoringTitle = "Waiting for client state";
        MonitoringDescription = "Monitoring will resume when current server data is available.";
        MonitoringLabel = "MONITORING / WAITING FOR DATA";
        MonitoringColor = _waitingBrush;
        SeatStatus = "Unknown";
        SeatDescription = "Waiting for current chair presence data.";
        RecordEvent(message);
    }

    private async Task WaitAndTryAsync() {
        int seconds = 3;

        while (seconds > 0 && !_isClosed) {
            LastEvent = $"Retrying in {seconds} seconds…";
            LastEventTime = DateTime.Now.ToString("HH:mm:ss");

            UpdateBindings();

            await Task.Delay(1200);

            seconds--;
        }

        if (!_isClosed) {
            LastEvent = "Connecting to server…";
            LastEventTime = DateTime.Now.ToString("HH:mm:ss");
            await LoadStateAsync();
        }
    }
}
