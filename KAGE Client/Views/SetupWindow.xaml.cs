using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;
using KAGE_Client.Services;
using Wpf.Ui.Controls;
using KAGE_Client.Models;

namespace KAGE_Client.Views;

public partial class SetupWindow : FluentWindow {
    private FrameworkElement _currentPage;

    private MqttSession? _mqttSession;
    private MqttConfig? _mqttConfig;
    private readonly CancellationTokenSource _lifetime = new();

    // Setup Data
    private string? _serverAddress = null;
    private string? _hubId = null;
    private string? _pcId = null;
    private string[] _availablePcs = [];
    private bool _isPendingRequest;


    public SetupWindow() {
        InitializeComponent();
        _currentPage = ServerPage;

        // subscribe to text changed events to reset the lower class fields when the user modifies upper class configuration fields
        ServerAddressBox.TextChanged += (_, _) => {
            ServerNextButton.Visibility = Visibility.Collapsed;
            ResetAfterServerChange();
        };
        HubIdBox.TextChanged += (_, _) => ResetAfterHubChange();
        MqttUsernameBox.TextChanged += (_, _) => ResetAfterServerChange();
        MqttTokenBox.PasswordChanged += (_, _) => ResetAfterServerChange();
        Closed += (_, _) => {
            _lifetime.Cancel();
            _mqttSession?.Dispose();
        };
    }

    private async void ServerConnectButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        ResetAfterServerChange();
        if (!MqttAddress.TryParse(ServerAddressBox.Text, out MqttConfig config)) {
            StatusText.Text = "Enter an MQTT address, such as mqtts://192.168.1.23:8883 (or mqtt://host:1883).";
            StatusText.Foreground = Brushes.Red;
            return;
        }
        if (string.IsNullOrWhiteSpace(MqttTokenBox.Password)) {
            StatusText.Text = "Enter your MQTT token.";
            StatusText.Foreground = Brushes.Red;
            return;
        }
        config.Username = MqttUsernameBox.Text.Trim();
        config.Password = MqttTokenBox.Password;
        PendingRequest(true);
        StatusText.Text = $"Connecting to MQTT broker {config.Address}...";
        StatusText.Foreground = Brushes.Gray;
        MqttSession session = new();
        _mqttSession = session;
        try {
            await session.ConnectAsync(config, [], _lifetime.Token);
            _lifetime.Token.ThrowIfCancellationRequested();
            _mqttConfig = config;
            _serverAddress = MqttAddress.Format(config);
            StatusText.Text = "Connected to the MQTT broker. Continue to verify your Hub ID.";
            StatusText.Foreground = Brushes.LimeGreen;
            ServerNextButton.Visibility = Visibility.Visible;
            ServerNextButton.Appearance = ControlAppearance.Primary;
            HubNavigationButton.IsEnabled = true;
        }
        catch (OperationCanceledException) {
            ResetAfterServerChange();
            StatusText.Text = "MQTT connection timed out. Check the address and try again.";
            StatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            ResetAfterServerChange();
            StatusText.Text = $"Could not connect to MQTT. Check the token, broker permissions and CA certificate. {ex.GetBaseException().Message}";
            StatusText.Foreground = Brushes.Red;
        }
        finally { PendingRequest(false); }
    }

    private async Task<MqttResponse> RequestSetupAsync(string action, object data) {
        if (_mqttSession == null) throw new InvalidOperationException("Connect to the MQTT broker first.");
        MqttResponse response = await _mqttSession.RequestAsync("kage/client/setup/request", action, data, _lifetime.Token);
        _lifetime.Token.ThrowIfCancellationRequested();
        return response;
    }

    private async void HubConnectButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        string hubId = HubIdBox.Text.Trim();
        ResetAfterHubChange();
        if (!MqttAddress.IsTopicId(hubId)) {
            ShowHubError("Enter the Hub ID provided by your administrator.");
            return;
        }
        if (_mqttSession == null) {
            ShowHubError("Connect to the MQTT broker before checking a Hub ID.");
            return;
        }
        await LoadAvailablePcsAsync(hubId, refreshing: false);
    }

    private async void RefreshAvailablePcsButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest || _mqttSession == null || string.IsNullOrWhiteSpace(_hubId)) return;
        await LoadAvailablePcsAsync(_hubId, refreshing: true);
    }

    private async Task LoadAvailablePcsAsync(string hubId, bool refreshing) {
        string? previousSelection = AvailablePcsList.SelectedItem as string;
        PendingRequest(true);
        ResetAfterPcChange();
        HubNextButton.Visibility = Visibility.Collapsed;
        PcNavigationButton.IsEnabled = false;
        HubStatusText.Text = refreshing ? "Refreshing available PCs..." : "Checking Hub ID...";
        HubStatusText.Foreground = Brushes.Gray;
        PcStatusText.Text = HubStatusText.Text;
        PcStatusText.Foreground = Brushes.Gray;
        try {
            MqttResponse? result = await RequestSetupAsync("hub_check", new { hub_id = hubId });
            if (!TryReadAvailablePcs(result, out string[] pcs, out string message)) {
                ShowHubError(message);
                if (refreshing) NavigateTo(HubPage, HubNavigationButton);
                return;
            }
            _hubId = hubId;
            SetAvailablePcs(pcs, previousSelection);
            HubStatusText.Text = $"{result?.detail?.message ?? "Hub verified."} {pcs.Length} PC(s) available.";
            HubStatusText.Foreground = Brushes.LimeGreen;
            HubNextButton.Visibility = Visibility.Visible;
            PcNavigationButton.IsEnabled = true;
            PcStatusText.Text = refreshing && previousSelection != null && AvailablePcsList.SelectedItem == null
                ? "The previously selected PC is no longer available. Choose another PC."
                : refreshing ? "PC list refreshed. Select a PC and verify it to continue."
                : "Select the PC assigned to this computer by your administrator.";
            PcStatusText.Foreground = Brushes.Gray;
        }
        catch (OperationCanceledException) {
            ShowHubError("No Hub reply. Check that the KAGE MQTT service is running, then retry.");
        }
        catch (JsonException) {
            ShowHubError("The server returned an invalid response.");
        }
        catch (Exception ex) {
            ShowHubError($"Could not load available PCs: {ex.Message}");
        }
        finally {
            PendingRequest(false);
        }
    }

    private static bool TryReadAvailablePcs(MqttResponse? result, out string[] pcs, out string message) {
        pcs = [];
        message = "The server returned an invalid Hub response. Try again.";
        if (result == null) return false;
        // Invalid hubs can return a string ("False") instead of an object.
        if (!string.Equals(result.detail?.code, "SUCCESS", StringComparison.OrdinalIgnoreCase)) {
            message = result.detail?.message ?? "This Hub is not available. Check the ID with your administrator.";
            return false;
        }
        if (result.data.ValueKind != JsonValueKind.Object ||
            !result.data.TryGetProperty("available", out JsonElement available) ||
            (available.ValueKind != JsonValueKind.True && available.ValueKind != JsonValueKind.False)) return false;
        if (!available.GetBoolean()) {
            message = result.detail?.message ?? "This Hub is not available. Check the ID with your administrator.";
            return false;
        }
        if (!result.data.TryGetProperty("available_pcs", out JsonElement list) || list.ValueKind != JsonValueKind.Array) return false;
        pcs = list.EnumerateArray()
            .Where(pc => pc.ValueKind == JsonValueKind.String)
            .Select(pc => pc.GetString()!)
            .Where(MqttAddress.IsTopicId)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (pcs.Length == 0) {
            message = "This Hub has no available PCs. Ask your administrator to add or make a PC available, then check again.";
            return false;
        }
        return true;
    }

    private void ShowHubError(string message) {
        SetAvailablePcs([], null);
        ResetAfterPcChange();
        HubNextButton.Visibility = Visibility.Collapsed;
        PcNavigationButton.IsEnabled = false;
        HubStatusText.Text = message;
        HubStatusText.Foreground = Brushes.Red;
        PcStatusText.Text = message;
        PcStatusText.Foreground = Brushes.Red;
    }

    private void SetAvailablePcs(string[] pcs, string? selectedPc) {
        _availablePcs = pcs;
        AvailablePcsList.ItemsSource = pcs;
        AvailablePcsList.SelectedItem = selectedPc != null && pcs.Contains(selectedPc, StringComparer.Ordinal)
            ? selectedPc : null;
        AvailablePcsCountText.Text = $"{pcs.Length} AVAILABLE";
        UpdatePcActions();
    }

    private bool HasAvailableSelection() => AvailablePcsList.SelectedItem is string selectedPc &&
        _availablePcs.Contains(selectedPc, StringComparer.Ordinal);

    private void AvailablePcsList_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e) {
        ResetAfterPcChange();
        PcStatusText.Text = HasAvailableSelection() ? "Verify the selected PC to continue." : "Select an available PC to continue.";
        PcStatusText.Foreground = Brushes.Gray;
        UpdatePcActions();
    }

    private void UpdatePcActions() {
        PcConnectButton.IsEnabled = !_isPendingRequest && HasAvailableSelection();
        RefreshAvailablePcsButton.IsEnabled = !_isPendingRequest && _mqttSession != null && _hubId != null;
    }

    private void PendingRequest(bool isPending) {
        _isPendingRequest = isPending;
        NavigationGrid.IsEnabled = !isPending;
        ServerAddressBox.IsEnabled = !isPending;
        MqttUsernameBox.IsEnabled = !isPending;
        MqttTokenBox.IsEnabled = !isPending;
        HubIdBox.IsEnabled = !isPending;
        ServerConnectButton.IsEnabled = !isPending;
        HubConnectButton.IsEnabled = !isPending;
        ServerNextButton.IsEnabled = !isPending;
        HubNextButton.IsEnabled = !isPending;
        PcNextButton.IsEnabled = !isPending;
        AvailablePcsList.IsEnabled = !isPending;
        RefreshAvailablePcsButton.Content = isPending ? "PLEASE WAIT..." : "↻ REFRESH";
        UpdatePcActions();
    }

    private async void PcConnectButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        ResetAfterPcChange();
        if (!HasAvailableSelection()) {
            PcStatusText.Text = "Select a PC from the current available list before continuing.";
            PcStatusText.Foreground = Brushes.Red;
            return;
        }
        if (_mqttSession == null || string.IsNullOrWhiteSpace(_hubId)) {
            PcStatusText.Text = "Connect to MQTT and verify a Hub before selecting a PC.";
            PcStatusText.Foreground = Brushes.Red;
            return;
        }
        string pcId = (string)AvailablePcsList.SelectedItem;
        PendingRequest(true);
        PcStatusText.Text = "Verifying selected PC...";
        PcStatusText.Foreground = Brushes.Gray;
        try {
            MqttResponse? result = await RequestSetupAsync("pc_check", new { hub_id = _hubId, pc_id = pcId });
            if (result == null || result.data.ValueKind != JsonValueKind.Object ||
                !result.data.TryGetProperty("available", out JsonElement available) ||
                available.ValueKind != JsonValueKind.True ||
                !string.Equals(result.detail?.code, "SUCCESS", StringComparison.OrdinalIgnoreCase)) {
                PcStatusText.Text = result?.detail?.message ?? "This PC is not available. Refresh the list and choose an available PC.";
                PcStatusText.Foreground = Brushes.Red;
                return;
            }
            // Only a selection still present in the current list may reach registration.
            if (!HasAvailableSelection() || (string)AvailablePcsList.SelectedItem != pcId) return;
            _pcId = pcId;
            PcStatusText.Text = result.detail?.message ?? $"PC {pcId} is available.";
            PcStatusText.Foreground = Brushes.LimeGreen;
            PcNextButton.Visibility = Visibility.Visible;
            FinishNavigationButton.IsEnabled = true;
            FinishServerText.Text = _serverAddress ?? "Unknown";
            FinishHubText.Text = _hubId;
            FinishPcText.Text = _pcId;
        }
        catch (OperationCanceledException) {
            PcStatusText.Text = "No PC reply. Check that the KAGE MQTT service is running, then retry.";
            PcStatusText.Foreground = Brushes.Red;
        }
        catch (JsonException) {
            PcStatusText.Text = "The server returned an invalid response.";
            PcStatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            PcStatusText.Text = $"Could not verify the PC: {ex.Message}";
            PcStatusText.Foreground = Brushes.Red;
        }
        finally {
            PendingRequest(false);
        }
    }


    private void ResetAfterServerChange() {
        _mqttSession?.Dispose();
        _mqttSession = null;
        _mqttConfig = null;
        _serverAddress = null;
        ServerNextButton.Visibility = Visibility.Collapsed;

        HubNavigationButton.IsEnabled = false;
        HubNextButton.Visibility = Visibility.Collapsed;
        HubStatusText.Text = "Awaiting Hub ID";
        HubStatusText.Foreground = Brushes.Gray;

        ResetAfterHubChange();
    }

    private void ResetAfterHubChange() {
        _hubId = null;
        HubNextButton.Visibility = Visibility.Collapsed;
        HubStatusText.Text = "Awaiting Hub ID";
        HubStatusText.Foreground = Brushes.Gray;
        SetAvailablePcs([], null);

        PcNavigationButton.IsEnabled = false;
        PcNextButton.Visibility = Visibility.Collapsed;
        PcStatusText.Text = "Select an available PC to continue.";
        PcStatusText.Foreground = Brushes.Gray;

        ResetAfterPcChange();
    }

    private void ResetAfterPcChange() {
        _pcId = null;
        PcNextButton.Visibility = Visibility.Collapsed;
        FinishNavigationButton.IsEnabled = false;
        FinishStatusText.Text = string.Empty;
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Collapsed;

        FinishServerText.Text = _serverAddress ?? "-";
        FinishHubText.Text = _hubId ?? "-";
        FinishPcText.Text = "-";
    }


    private async void RegisterPcButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        if (_mqttSession == null || _mqttConfig == null || !MqttAddress.IsTopicId(_hubId) || !MqttAddress.IsTopicId(_pcId)
            || !HasAvailableSelection() || AvailablePcsList.SelectedItem as string != _pcId) {
            FinishStatusText.Text = "Connect to MQTT and verify a Hub ID and PC before registering.";
            FinishStatusText.Foreground = Brushes.Red;
            FinishStatusText.Visibility = Visibility.Visible;
            return;
        }
        PendingRequest(true);
        RegisterPcButton.IsEnabled = false;
        FinishStatusText.Text = "Registering this PC through MQTT...";
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Visible;
        try {
            MqttResponse result = await RequestSetupAsync("register", new { hub_id = _hubId, pc_id = _pcId });
            if (!result.IsSuccess || !result.data.TryGetProperty("registered", out JsonElement registered)
                || registered.ValueKind != JsonValueKind.True) {
                FinishStatusText.Text = result.detail?.message ?? "The MQTT service rejected registration.";
                FinishStatusText.Foreground = Brushes.Red;
                return;
            }
            ClientConfig config = new() { HubId = _hubId!, PcId = _pcId!, Mqtt = _mqttConfig };
            await ConfigService.SaveAsync(config);
            _lifetime.Token.ThrowIfCancellationRequested();
            MainWindow mainWindow = new(config);
            mainWindow.Show();
            Close();
        }
        catch (OperationCanceledException) {
            FinishStatusText.Text = "No registration reply. Check that the KAGE MQTT service is running, then retry.";
            FinishStatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            FinishStatusText.Text = $"Could not register this PC: {ex.Message}";
            FinishStatusText.Foreground = Brushes.Red;
        }
        finally {
            RegisterPcButton.IsEnabled = true;
            PendingRequest(false);
        }
    }

    private void NavigateTo(FrameworkElement page, System.Windows.Controls.RadioButton navigationButton) {
        navigationButton.IsChecked = true;

        if (_currentPage == page) {
            return;
        }

        _currentPage.Visibility = Visibility.Collapsed;
        _currentPage = page;
        page.Visibility = Visibility.Visible;

        TranslateTransform slideTransform = new TranslateTransform(18, 0);
        page.RenderTransform = slideTransform;
        page.Opacity = 0;

        Duration duration = new Duration(TimeSpan.FromMilliseconds(180));
        CubicEase easing = new CubicEase { EasingMode = EasingMode.EaseOut };

        page.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, duration)
        {
            EasingFunction = easing
        });
        slideTransform.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(18, 0, duration)
        {
            EasingFunction = easing
        });
    }

    // Next Buttons
    private void ServerNextButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(HubPage, HubNavigationButton);
        HubIdBox.Focus();
    }

    private void HubNextButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(PcPage, PcNavigationButton);
        AvailablePcsList.Focus();
    }

    private void PcNextButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(FinishPage, FinishNavigationButton);
    }

    // Left Navigation Panel Buttons
    private void ServerNavigationButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(ServerPage, ServerNavigationButton);
        ServerAddressBox.Focus();
    }

    private void HubNavigationButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(HubPage, HubNavigationButton);
        HubIdBox.Focus();
    }

    private void PcNavigationButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(PcPage, PcNavigationButton);
        AvailablePcsList.Focus();
    }

    private void FinishNavigationButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(FinishPage, FinishNavigationButton);
    }

    private void CloseSetupButton_Click(object sender, RoutedEventArgs e) {
        Close();
    }

}
