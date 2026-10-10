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


    public SetupWindow() {
        InitializeComponent();
        _currentPage = ServerPage;
    }

    private async void ServerConnectButton_Click(object sender, RoutedEventArgs e) {
        string serverAddress = ServerAddressBox.Text.Trim();

        ServerNextButton.Visibility = Visibility.Collapsed;
        StatusText.Foreground = Brushes.Gray;

        // A new server invalidates every verification performed against the old one.
        ResetAfterServerChange();

        if (!TryValidateServerAddress(serverAddress, out Uri? serverUri)) {
            StatusText.Foreground = Brushes.Red;
            return;
        }

        ServerConnectButton.IsEnabled = false;
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
            ServerConnectButton.IsEnabled = true;
        }
    }

    private async void HubConnectButton_Click(object sender, RoutedEventArgs e) {
        string hubId = HubIdBox.Text.Trim();

        HubNextButton.Visibility = Visibility.Collapsed;

        // A new Hub must be verified before its PC assignment can be trusted.
        ResetAfterHubChange();

        if (string.IsNullOrWhiteSpace(hubId)) {
            HubStatusText.Text = "Enter your Hub ID to continue.";
            HubStatusText.Foreground = Brushes.Red;
            return;
        }

        if (_apiClient == null) {
            HubStatusText.Text = "Connect to the KAGE server before checking a Hub ID.";
            HubStatusText.Foreground = Brushes.Red;
            return;
        }

        HubConnectButton.IsEnabled = false;
        HubStatusText.Text = "Checking Hub ID...";
        HubStatusText.Foreground = Brushes.Gray;

        try {
            KAGELockResponse? result = await _apiClient.apiFetch($"/setup/hub/{hubId}/check", HttpMethod.Get);

            // Check for null response
            if (result == null) {
                HubStatusText.Text = "The server returned a corrupted response.";
                HubStatusText.Foreground = Brushes.Red;
                return;
            }

            // Check availability of the hub
            if (result.data.TryGetProperty("available", out JsonElement keyElement)) {
                bool available = keyElement.GetBoolean();
                if (!available) {
                    HubStatusText.Text = result.detail?.message ?? $"Hub ID {hubId} is not available.";
                    HubStatusText.Foreground = Brushes.Red;
                    return;
                }
            } else { // not necessary but just in case the server returns a different response structure during development
                HubStatusText.Text = "The server returned an unexpected response.";
                HubStatusText.Foreground = Brushes.Red;
                return;
            }

            // Save
            _hubId = hubId;

            HubStatusText.Text = result?.detail?.message ?? $"Hub ID {hubId} is valid.";
            HubStatusText.Foreground = Brushes.LimeGreen;
            HubNextButton.Visibility = Visibility.Visible;
            HubNextButton.Appearance = ControlAppearance.Primary;
            PcNavigationButton.IsEnabled = true;

        }
        catch (TaskCanceledException) {
            HubStatusText.Text = "The Hub ID check timed out. Try again.";
            HubStatusText.Foreground = Brushes.Red;
        }
        catch (HttpRequestException ex) {
            HubStatusText.Text = $"Could not check the Hub ID: {ex.Message}";
            HubStatusText.Foreground = Brushes.Red;
        }
        catch (JsonException) {
            HubStatusText.Text = "The server returned an invalid response.";
            HubStatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            HubStatusText.Text = $"Unexpected error: {ex.Message}";
            HubStatusText.Foreground = Brushes.Red;
        }
        finally {
            HubConnectButton.IsEnabled = true;
        }
    }

    private async void PcConnectButton_Click(object sender, RoutedEventArgs e) {
        string pcId = PcIdBox.Text.Trim();

        PcNextButton.Visibility = Visibility.Collapsed;

        // A new PC ID invalidates the enrollment summary until it is verified.
        ResetAfterPcChange();

        if (string.IsNullOrWhiteSpace(pcId)) {
            PcStatusText.Text = "Enter your PC ID to continue.";
            PcStatusText.Foreground = Brushes.Red;
            return;
        }

        if (_apiClient == null || string.IsNullOrWhiteSpace(_hubId)) {
            PcStatusText.Text = "Connect to the KAGE server and check a Hub ID before checking a PC ID.";
            PcStatusText.Foreground = Brushes.Red;
            return;
        }

        PcConnectButton.IsEnabled = false;
        PcStatusText.Text = "Checking PC ID...";
        PcStatusText.Foreground = Brushes.Gray;

        try {
            KAGELockResponse? result = await _apiClient.apiFetch($"/setup/hub/{_hubId}/pc/{pcId}/check", HttpMethod.Get);

            // Check for null response
            if (result == null) {
                PcStatusText.Text = "The server returned a corrupted response.";
                PcStatusText.Foreground = Brushes.Red;
                return;
            }

            // Check availability of the PC ID
            if (result.data.TryGetProperty("available", out JsonElement keyElement)) {
                bool available = keyElement.GetBoolean();
                if (!available) {
                    PcStatusText.Text = result.detail?.message ?? $"PC ID {pcId} is not available.";
                    PcStatusText.Foreground = Brushes.Red;
                    return;
                }
            } else { // not necessary but just in case the server returns a different response structure during development
                PcStatusText.Text = "The server returned an unexpected response.";
                PcStatusText.Foreground = Brushes.Red;
                return;
            }

            // Save
            _pcId = pcId;

            PcStatusText.Text = result?.detail?.message ?? $"PC ID {pcId} is valid.";
            PcStatusText.Foreground = Brushes.LimeGreen;
            PcNextButton.Visibility = Visibility.Visible;
            PcNextButton.Appearance = ControlAppearance.Primary;
            FinishNavigationButton.IsEnabled = true;

            FinishServerText.Text = _serverAddress ?? "Unknown";
            FinishHubText.Text = _hubId ?? "Unknown";
            FinishPcText.Text = _pcId ?? "Unknown";

        }
        catch (TaskCanceledException) {
            PcStatusText.Text = "The PC ID check timed out. Try again.";
            PcStatusText.Foreground = Brushes.Red;
        }
        catch (HttpRequestException ex) {
            PcStatusText.Text = $"Could not check the PC ID: {ex.Message}";
            PcStatusText.Foreground = Brushes.Red;
        }
        catch (JsonException) {
            PcStatusText.Text = "The server returned an invalid response.";
            PcStatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            PcStatusText.Text = $"Unexpected error: {ex.Message}";
            PcStatusText.Foreground = Brushes.Red;
        }
        finally {
            PcConnectButton.IsEnabled = true;
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

        PcNavigationButton.IsEnabled = false;
        PcNextButton.Visibility = Visibility.Collapsed;
        PcStatusText.Text = "Awaiting PC ID";
        PcStatusText.Foreground = Brushes.Gray;

        ResetAfterPcChange();
    }

    private void ResetAfterPcChange() {
        _pcId = null;
        FinishNavigationButton.IsEnabled = false;
        FinishStatusText.Text = string.Empty;
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Collapsed;

        FinishServerText.Text = _serverAddress ?? "-";
        FinishHubText.Text = _hubId ?? "-";
        FinishPcText.Text = "-";
    }


    private async void RegisterPcButton_Click(object sender, RoutedEventArgs e) {
        if (_apiClient == null || string.IsNullOrWhiteSpace(_hubId) || string.IsNullOrWhiteSpace(_pcId)) {
            FinishStatusText.Text = "Connect to the KAGE server and verify a Hub ID and PC ID before registering.";
            FinishStatusText.Foreground = Brushes.Red;
            FinishStatusText.Visibility = Visibility.Visible;
            return;
        }

        RegisterPcButton.IsEnabled = false;

        FinishStatusText.Text = "Registering this PC...";
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Visible;

        try {
            KAGELockResponse? result = await _apiClient.apiFetch($"/setup/hub/{_hubId}/pc/{_pcId}/register", HttpMethod.Get);

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

            // Save the configuration to a file
            ClientConfig config = new ClientConfig
            {
                ServerAddress = _serverAddress ?? "",
                HubId = _hubId ?? "",
                PcId = _pcId ?? "",
            };

            await ConfigService.SaveAsync(config);

            // Switch to the main application window
            MainWindow mainWindow = new MainWindow(config);
            mainWindow.Show();
            Close();

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
        PcIdBox.Focus();
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
        PcIdBox.Focus();
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
