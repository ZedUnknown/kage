using System.Text.Json;
using System.IO;
using Microsoft.Win32;
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
    private bool _isPendingRequest;


    public SetupWindow(MqttConfig? previous = null, string? message = null) {
        InitializeComponent();
        _currentPage = ServerPage;

        // Changing connection details invalidates the server-confirmed assignment.
        ServerAddressBox.TextChanged += (_, _) => {
            ServerNextButton.Visibility = Visibility.Collapsed;
            ResetAfterServerChange();
        };
        MqttUsernameBox.TextChanged += (_, _) => ResetAfterServerChange();
        MqttTokenBox.PasswordChanged += (_, _) => ResetAfterServerChange();
        MqttPortBox.TextChanged += (_, _) => ResetAfterServerChange();
        MqttCertificateBox.TextChanged += (_, _) => ResetAfterServerChange();
        MqttCertificateModeBox.SelectionChanged += (_, _) => {
            MqttCustomCertificatePanel.Visibility = MqttCertificateModeBox.SelectedIndex == 1
                ? Visibility.Visible : Visibility.Collapsed;
            ResetAfterServerChange();
        };
        MqttTlsBox.Checked += (_, _) => UpdateTlsInputs();
        MqttTlsBox.Unchecked += (_, _) => UpdateTlsInputs();
        Closed += (_, _) => {
            _lifetime.Cancel();
            _mqttSession?.Dispose();
        };
        if (previous != null) {
            ServerAddressBox.Text = previous.Address;
            MqttTlsBox.IsChecked = previous.UseTls;
            MqttPortBox.Text = previous.Port.ToString();
            MqttUsernameBox.Text = previous.Username;
            MqttCertificateModeBox.SelectedIndex = string.IsNullOrWhiteSpace(previous.CertificateAuthorityPem) ? 0 : 1;
            MqttCertificateBox.Text = previous.CertificateAuthorityPem ?? "";
            MqttTokenBox.Password = "";
        }
        if (message != null) {
            StatusText.Text = message;
            StatusText.Foreground = Brushes.Red;
        }
    }

    private void UpdateTlsInputs() {
        bool useTls = MqttTlsBox.IsChecked == true;
        MqttSchemeText.Text = useTls ? "mqtts://" : "mqtt://";
        if (MqttPortBox.Text == (useTls ? "1883" : "8883"))
            MqttPortBox.Text = useTls ? "8883" : "1883";
        MqttCertificateArea.IsEnabled = useTls;
        ResetAfterServerChange();
    }

    private void MqttCertificateBrowseButton_Click(object sender, RoutedEventArgs e) {
        var dialog = new OpenFileDialog {
            Title = "Select the MQTT broker CA certificate",
            Filter = "PEM certificates (*.pem;*.crt;*.cer)|*.pem;*.crt;*.cer|All files (*.*)|*.*"
        };
        if (dialog.ShowDialog(this) != true) return;
        try {
            MqttCertificateBox.Text = File.ReadAllText(dialog.FileName);
            StatusText.Text = "Certificate loaded. Connect to verify the broker.";
            StatusText.Foreground = Brushes.Gray;
        }
        catch (Exception ex) {
            StatusText.Text = $"Could not read the certificate: {ex.Message}";
            StatusText.Foreground = Brushes.Red;
        }
    }

    private async void ServerConnectButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        ResetAfterServerChange();
        if (!MqttAddress.TryCreate(ServerAddressBox.Text, MqttPortBox.Text, MqttTlsBox.IsChecked == true, out MqttConfig config)) {
            StatusText.Text = "Enter a broker hostname or IP address without a prefix or port, and a port from 1 to 65535.";
            StatusText.Foreground = Brushes.Red;
            return;
        }
        config.CertificateAuthorityPem = MqttCertificateModeBox.SelectedIndex == 1 ? MqttCertificateBox.Text : "";
        if (config.UseTls && MqttCertificateModeBox.SelectedIndex == 1 && string.IsNullOrWhiteSpace(config.CertificateAuthorityPem)) {
            StatusText.Text = "Paste a PEM CA certificate or browse for a certificate file.";
            StatusText.Foreground = Brushes.Red;
            return;
        }
        if (string.IsNullOrWhiteSpace(MqttTokenBox.Password)) {
            StatusText.Text = "Enter your MQTT token.";
            StatusText.Foreground = Brushes.Red;
            return;
        }
        config.Username = MqttUsernameBox.Text;
        config.Password = MqttTokenBox.Password;
        PendingRequest(true);
        StatusText.Text = $"Connecting to MQTT broker {config.Address}...";
        StatusText.Foreground = Brushes.Gray;
        MqttSession session = new();
        _mqttSession = session;
        bool brokerConnected = false;

        session.Disconnected += () => Dispatcher.BeginInvoke(new Action(() => {
            // An old connection can finish disconnecting after a replacement has already started.
            if (!ReferenceEquals(_mqttSession, session) || _lifetime.IsCancellationRequested) return;
            ResetAfterServerChange();
            NavigateTo(ServerPage, ServerNavigationButton);
            StatusText.Text = "MQTT disconnected. Reconnect to verify your assigned Hub and PC.";
            StatusText.Foreground = Brushes.Red;
        }));
        try {
            await session.ConnectAsync(config, [], _lifetime.Token);
            _lifetime.Token.ThrowIfCancellationRequested();
            brokerConnected = true;
            StatusText.Text = "Connected to MQTT. Retrieving your assigned Hub and PC...";
            MqttResponse response = await RequestSetupAsync("assignment", new { });
            if (!ReferenceEquals(_mqttSession, session) || !session.IsConnected)
                throw new IOException("MQTT disconnected while verifying the Client. Reconnect and retry.");
            if (!TryReadAssignment(response, out string hubId, out string pcId, out string message))
                throw new InvalidOperationException(message);
            _mqttConfig = config;
            _serverAddress = MqttAddress.Format(config);
            _hubId = hubId;
            _pcId = pcId;
            FinishServerText.Text = _serverAddress;
            FinishHubText.Text = hubId;
            FinishPcText.Text = pcId;
            StatusText.Text = $"Client verified. Assigned to Hub {hubId}, PC {pcId}. Continue to review.";
            StatusText.Foreground = Brushes.LimeGreen;
            ServerNextButton.Visibility = Visibility.Visible;
            FinishNavigationButton.IsEnabled = true;
        }
        catch (OperationCanceledException) {
            ResetAfterServerChange();
            if (_lifetime.IsCancellationRequested) return;
            StatusText.Text = brokerConnected
                ? "No reply from the KAGE admin service. Check its MQTT worker and setup topic permissions, then retry."
                : "MQTT connection timed out. Check the address and try again.";
            StatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            ResetAfterServerChange();
            if (_lifetime.IsCancellationRequested) return;
            StatusText.Text = brokerConnected
                ? $"Could not verify this Client: {ex.GetBaseException().Message}"
                : $"Could not connect to MQTT. Check the Client token, broker permissions and CA certificate. {ex.GetBaseException().Message}";
            StatusText.Foreground = Brushes.Red;
        }
        finally { PendingRequest(false); }
    }

    private async Task<MqttResponse> RequestSetupAsync(string action, object data) {
        if (_mqttSession == null) throw new InvalidOperationException("Connect to the MQTT broker first.");
        MqttResponse response = await _mqttSession.RequestAsync(_mqttSession.SetupRequestTopic, action, data, _lifetime.Token);
        _lifetime.Token.ThrowIfCancellationRequested();
        return response;
    }

    private static bool TryReadAssignment(MqttResponse response, out string hubId, out string pcId, out string message) {
        hubId = pcId = "";
        message = response.detail?.message ?? "The admin service could not verify this Client.";
        if (!response.IsSuccess) return false;

        message = "The admin service returned an invalid Hub/PC assignment. Update the admin server and retry.";
        if (!response.data.TryGetProperty("hub_id", out JsonElement hub) || hub.ValueKind != JsonValueKind.String) return false;
        if (!response.data.TryGetProperty("pc_id", out JsonElement pc) || pc.ValueKind != JsonValueKind.String) return false;
        if (!MqttAddress.IsTopicId(hub.GetString()) || !MqttAddress.IsTopicId(pc.GetString())) return false;

        hubId = hub.GetString()!;
        pcId = pc.GetString()!;
        return true;
    }

    private void PendingRequest(bool isPending) {
        _isPendingRequest = isPending;
        NavigationGrid.IsEnabled = !isPending;
        ServerAddressBox.IsEnabled = !isPending;
        MqttPortBox.IsEnabled = !isPending;
        MqttTlsBox.IsEnabled = !isPending;
        MqttCertificateArea.IsEnabled = !isPending && MqttTlsBox.IsChecked == true;
        MqttUsernameBox.IsEnabled = !isPending;
        MqttTokenBox.IsEnabled = !isPending;
        ServerConnectButton.IsEnabled = !isPending;
        ServerNextButton.IsEnabled = !isPending;
        RegisterPcButton.IsEnabled = !isPending;
    }

    private void ResetAfterServerChange() {
        MqttSession? session = _mqttSession;
        // Drop ownership before disposal so its disconnect callback cannot reset a newer session.
        _mqttSession = null;
        session?.Dispose();
        _mqttConfig = null;
        _serverAddress = null;
        _hubId = _pcId = null;
        ServerNextButton.Visibility = Visibility.Collapsed;
        FinishNavigationButton.IsEnabled = false;
        StatusText.Text = "Awaiting Client connection";
        StatusText.Foreground = Brushes.Gray;
        FinishStatusText.Text = string.Empty;
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Collapsed;
        FinishServerText.Text = FinishHubText.Text = FinishPcText.Text = "-";
    }

    private async void RegisterPcButton_Click(object sender, RoutedEventArgs e) {
        if (_isPendingRequest) return;
        if (_mqttSession == null || _mqttConfig == null || !MqttAddress.IsTopicId(_hubId) || !MqttAddress.IsTopicId(_pcId)) {
            FinishStatusText.Text = "Connect with your Client credentials to retrieve its assignment before finishing setup.";
            FinishStatusText.Foreground = Brushes.Red;
            FinishStatusText.Visibility = Visibility.Visible;
            return;
        }
        PendingRequest(true);
        MqttSession session = _mqttSession;
        ClientConfig config = new() { HubId = _hubId!, PcId = _pcId!, Mqtt = _mqttConfig };
        FinishStatusText.Text = "Registering this PC through MQTT...";
        FinishStatusText.Foreground = Brushes.Gray;
        FinishStatusText.Visibility = Visibility.Visible;
        try {
            MqttResponse result = await RequestSetupAsync("register", new { hub_id = _hubId, pc_id = _pcId });
            if (!ReferenceEquals(_mqttSession, session) || !session.IsConnected)
                throw new IOException("MQTT disconnected during registration. Reconnect and retry.");
            if (!result.IsSuccess || !result.data.TryGetProperty("registered", out JsonElement registered)
                || registered.ValueKind != JsonValueKind.True) {
                string message = result.detail?.message ?? "The MQTT service rejected registration.";
                ResetAfterServerChange();
                NavigateTo(ServerPage, ServerNavigationButton);
                StatusText.Text = $"{message} Reconnect to retrieve your current assignment.";
                StatusText.Foreground = Brushes.Red;
                return;
            }
            await ConfigService.SaveAsync(config);
            _lifetime.Token.ThrowIfCancellationRequested();
            MainWindow mainWindow = new(config);
            Application.Current.MainWindow = mainWindow;
            mainWindow.Show();
            Close();
        }
        catch (OperationCanceledException) {
            FinishStatusText.Text = "No registration reply from the KAGE admin service. Check its MQTT worker and setup topic permissions, then retry.";
            FinishStatusText.Foreground = Brushes.Red;
        }
        catch (Exception ex) {
            FinishStatusText.Text = $"Could not register this PC: {ex.Message}";
            FinishStatusText.Foreground = Brushes.Red;
        }
        finally {
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

    private void ServerNextButton_Click(object sender, RoutedEventArgs e) {
        if (!FinishNavigationButton.IsEnabled || _isPendingRequest) return;
        NavigateTo(FinishPage, FinishNavigationButton);
        RegisterPcButton.Focus();
    }

    private void ServerNavigationButton_Click(object sender, RoutedEventArgs e) {
        NavigateTo(ServerPage, ServerNavigationButton);
        ServerAddressBox.Focus();
    }

    private void FinishNavigationButton_Click(object sender, RoutedEventArgs e) {
        if (!FinishNavigationButton.IsEnabled || _isPendingRequest) return;
        NavigateTo(FinishPage, FinishNavigationButton);
    }

    private void CloseSetupButton_Click(object sender, RoutedEventArgs e) {
        Close();
    }

}
