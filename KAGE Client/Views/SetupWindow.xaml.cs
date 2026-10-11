using System.Net.Http;
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

    private Api? _apiClient = null;

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
    }

    private async void ServerConnectButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        string serverAddress = ServerAddressBox.Text.Trim();

        ServerNextButton.Visibility = Visibility.Collapsed;
        StatusText.Foreground = Brushes.Gray;

        // A new server invalidates every verification performed against the old one.
        ResetAfterServerChange();

        if (!TryValidateServerAddress(serverAddress, out Uri? serverUri)) {
            StatusText.Foreground = Brushes.Red;
            return;
        }

        PendingRequest(true);
        StatusText.Text = $"Connecting to {serverUri!.Host}...";
        StatusText.Foreground = Brushes.Gray;

        try {
            Api apiClient = new Api(serverAddress);
            KAGELockResponse? result = await apiClient.apiFetch("/setup/ping", HttpMethod.Get, null);

            // Check for null response
            if (result == null) {
                StatusText.Text = "The server returned a corrupted response.";
                StatusText.Foreground = Brushes.Red;
                return;
            }

            // Check for success code
            if (!string.Equals(result.detail?.code, "SUCCESS", StringComparison.OrdinalIgnoreCase)) {
                StatusText.Text = result.detail?.message ?? "The server rejected the connection.";
                StatusText.Foreground = Brushes.Red;
                return;
            }

            if (result.data.TryGetProperty("key", out JsonElement keyElement)) {
                string? key = keyElement.GetString();
                if (key != "KAGELOCK") {
                    StatusText.Text = "The server responded, but it is not a KAGE Lock server.";
                    StatusText.Foreground = Brushes.Red;
                    return;
                }
            }

            // Save
            _apiClient = apiClient;
            _serverAddress = serverAddress;

            StatusText.Text = result.detail?.message ?? $"Connected to {serverUri.Host} successfully.";
            StatusText.Foreground = Brushes.LimeGreen;
            ServerNextButton.Visibility = Visibility.Visible;
            ServerNextButton.Appearance = ControlAppearance.Primary;
            HubNavigationButton.IsEnabled = true;

        }
        catch (TaskCanceledException) {
            StatusText.Text = "Connection timed out. Check the address and try again.";
            StatusText.Foreground = Brushes.Red;
        }
        catch (HttpRequestException ex) {
            StatusText.Text = $"Could not connect to the server: {ex.Message}";
            StatusText.Foreground = Brushes.Red;
        }
        catch (JsonException) {
            StatusText.Text = "The server returned an invalid response.";
            StatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            StatusText.Text = $"Unexpected error: {ex.Message}";
            StatusText.Foreground = Brushes.Red;
        }
        finally {
            PendingRequest(false);
        }
    }

    private async void HubConnectButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        string hubId = HubIdBox.Text.Trim();
        ResetAfterHubChange();
        if (string.IsNullOrWhiteSpace(hubId)) {
            ShowHubError("Enter the Hub ID provided by your administrator.");
            return;
        }
        if (_apiClient == null) {
            ShowHubError("Connect to the KAGE server before checking a Hub ID.");
            return;
        }
        await LoadAvailablePcsAsync(hubId, refreshing: false);
    }

    private async void RefreshAvailablePcsButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest || _apiClient == null || string.IsNullOrWhiteSpace(_hubId)) return;
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
            KAGELockResponse? result = await _apiClient!.apiFetch(
                $"/setup/hub/{Uri.EscapeDataString(hubId)}/check", HttpMethod.Get);
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
        catch (TaskCanceledException) {
            ShowHubError("The Hub ID check timed out. Try again.");
        }
        catch (HttpRequestException ex) {
            ShowHubError($"Could not load available PCs: {ex.Message}");
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

    private static bool TryReadAvailablePcs(KAGELockResponse? result, out string[] pcs, out string message) {
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
            .Where(pc => !string.IsNullOrWhiteSpace(pc))
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
        RefreshAvailablePcsButton.IsEnabled = !_isPendingRequest && _apiClient != null && _hubId != null;
    }

    private void PendingRequest(bool isPending) {
        _isPendingRequest = isPending;
        NavigationGrid.IsEnabled = !isPending;
        ServerAddressBox.IsEnabled = !isPending;
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
        if (_apiClient == null || string.IsNullOrWhiteSpace(_hubId)) {
            PcStatusText.Text = "Connect to the server and verify a Hub before selecting a PC.";
            PcStatusText.Foreground = Brushes.Red;
            return;
        }
        string pcId = (string)AvailablePcsList.SelectedItem;
        PendingRequest(true);
        PcStatusText.Text = "Verifying selected PC...";
        PcStatusText.Foreground = Brushes.Gray;
        try {
            KAGELockResponse? result = await _apiClient.apiFetch(
                $"/setup/hub/{Uri.EscapeDataString(_hubId)}/pc/{Uri.EscapeDataString(pcId)}/check", HttpMethod.Get);
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
        catch (TaskCanceledException) {
            PcStatusText.Text = "The PC check timed out. Try again.";
            PcStatusText.Foreground = Brushes.Red;
        }
        catch (HttpRequestException ex) {
            PcStatusText.Text = $"Could not verify the PC: {ex.Message}";
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
        _apiClient = null;
        _serverAddress = null;

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
        if (_apiClient == null || string.IsNullOrWhiteSpace(_hubId) || string.IsNullOrWhiteSpace(_pcId) ||
            !HasAvailableSelection() || !string.Equals(AvailablePcsList.SelectedItem as string, _pcId, StringComparison.Ordinal)) {
            FinishStatusText.Text = "Connect to the KAGE server and verify a Hub ID and PC ID before registering.";
            FinishStatusText.Foreground = Brushes.Red;
            FinishStatusText.Visibility = Visibility.Visible;
            return;
        }

        PendingRequest(true);
        RegisterPcButton.IsEnabled = false;

        FinishStatusText.Text = "Registering this PC...";
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Visible;

        try {
            KAGELockResponse? result = await _apiClient.apiFetch($"/setup/hub/{Uri.EscapeDataString(_hubId)}/pc/{Uri.EscapeDataString(_pcId)}/register", HttpMethod.Get);

            // Check for null response
            if (result == null) {
                FinishStatusText.Text = "The server returned a corrupted response.";
                FinishStatusText.Foreground = Brushes.Red;
                return;
            }

            if (result.data.TryGetProperty("registered", out JsonElement keyElement)) {
                bool registered = keyElement.GetBoolean();
                if (!registered) {
                    FinishStatusText.Text = result.detail?.message ?? $"PC {_pcId} could not be registered.";
                    FinishStatusText.Foreground = Brushes.Red;
                    return;
                }

            } else { // not necessary but just in case the server returns a different response structure during development
                FinishStatusText.Text = "The server returned an unexpected response.";
                FinishStatusText.Foreground = Brushes.Red;
                return;
            }

            FinishStatusText.Text = result.detail?.message ?? $"PC {_pcId} was registered successfully.";
            FinishStatusText.Foreground = Brushes.LimeGreen;

            // LOCK ALL NAVIGATION BUTTONS AND HIDE
            ServerNavigationButton.IsEnabled = false;
            HubNavigationButton.IsEnabled = false;
            PcNavigationButton.IsEnabled = false;
            FinishNavigationButton.IsEnabled = false;
            RegisterPcButton.IsEnabled = false;

            NavigationGrid.Visibility = Visibility.Collapsed;
            RegisterPcButton.Visibility = Visibility.Collapsed;

            // extract MQTT configuration from the server response
            if (result.data.TryGetProperty("mqtt", out JsonElement mqttElement)) {
                MqttConfig mqttConfig = new MqttConfig();

                if (mqttElement.TryGetProperty("address", out JsonElement addressElement)) {
                    mqttConfig.Address = addressElement.GetString() ?? "";
                }

                if (mqttElement.TryGetProperty("port", out JsonElement portElement)) {
                    mqttConfig.Port = portElement.GetInt32();
                }

                if (mqttElement.TryGetProperty("use_tls", out JsonElement useTlsElement)) {
                    mqttConfig.UseTls = useTlsElement.GetBoolean();
                }

                if (mqttElement.TryGetProperty("username", out JsonElement usernameElement)) {
                    mqttConfig.Username = usernameElement.GetString() ?? "";
                }

                if (mqttElement.TryGetProperty("password", out JsonElement passwordElement)) {
                    mqttConfig.Password = passwordElement.GetString() ?? "";
                }

                // Save the configuration to a local file
                ClientConfig config = new ClientConfig
                {
                    ServerAddress = _serverAddress ?? "",
                    HubId = _hubId ?? "",
                    PcId = _pcId ?? "",
                    Mqtt = mqttConfig
                };

                await ConfigService.SaveAsync(config);

                // Switch to the main application window
                MainWindow mainWindow = new MainWindow(config);
                mainWindow.Show();
                Close();

            } else {
                FinishStatusText.Text = "The server did not provide MQTT configuration.";
                FinishStatusText.Foreground = Brushes.Red;
                return;
            }

        }
        catch (TaskCanceledException) {
            FinishStatusText.Text = "The registration request timed out. Try again.";
            FinishStatusText.Foreground = Brushes.Red;
        }
        catch (HttpRequestException ex) {
            FinishStatusText.Text = $"Could not register this PC: {ex.Message}";
            FinishStatusText.Foreground = Brushes.Red;
        }
        catch (JsonException) {
            FinishStatusText.Text = "The server returned an invalid response.";
            FinishStatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            FinishStatusText.Text = $"Unexpected error: {ex.Message}";
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

    private bool TryValidateServerAddress(string address, out Uri? uri) {
        uri = null;

        if (string.IsNullOrWhiteSpace(address)) {
            StatusText.Text = "Enter a server address.";
            return false;
        }

        if (!Uri.TryCreate(address, UriKind.Absolute, out uri)) {
            StatusText.Text = "Enter a valid address, such as http://localhost:8000.";
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) {
            StatusText.Text = "The server address must use http:// or https://.";
            return false;
        }

        return true;
    }
}
