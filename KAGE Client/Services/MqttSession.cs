using System.Collections.Concurrent;
using System.IO;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using KAGE_Client.Models;
using MQTTnet;
using MQTTnet.Protocol;

namespace KAGE_Client.Services;

// One MQTT connection, with replies correlated independently of live state/command messages.
public sealed class MqttSession : IDisposable {
    private readonly IMqttClient _client = new MqttClientFactory().CreateMqttClient();
    private readonly X509Certificate2Collection _certificates = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<MqttResponse>> _pending = new();
    private string _responseTopic;
    private readonly bool _setup;
    private volatile bool _ready;
    private volatile MqttSetupRequiredException? _setupError;
    private bool _disposed;

    public string ClientId { get; } = $"kage-pc-{Guid.NewGuid():N}";
    public bool IsConnected => _ready && _client.IsConnected;
    public string SetupRequestTopic { get; private set; } = "";
    public string PresenceSession { get; private set; } = "";
    public event Action<string, string>? MessageReceived;
    public event Action? Disconnected;

    public MqttSession(string? responseTopic = null) {
        _setup = responseTopic == null;
        _responseTopic = responseTopic ?? "";
        _client.ApplicationMessageReceivedAsync += args => {
            var message = args.ApplicationMessage;
            string payload = message.ConvertPayloadToString();
            if (message.Topic == _responseTopic) {
                // Retained or late replies must never satisfy a new request.
                if (!message.Retain) {
                    try {
                        MqttResponse? response = JsonSerializer.Deserialize<MqttResponse>(payload);
                        if (response?.request_id != null && _pending.TryGetValue(response.request_id, out var pending)) {
                            pending.TrySetResult(response);
                        }
                    }
                    catch (JsonException) {
                        // Ignore malformed replies. The pending request still has its deadline.
                    }
                }
            } else if (!message.Retain) {
                MessageReceived?.Invoke(message.Topic, payload);
            }
            return Task.CompletedTask;
        };
        _client.DisconnectedAsync += args => {
            _ready = false;
            // Keep a permanent setup failure even if a later callback reports a generic disconnect.
            _setupError ??= MqttSetupRequiredException.FromDisconnectReason(args.Reason)
                ?? (args.ConnectResult == null ? null : MqttSetupRequiredException.FromConnectResult(args.ConnectResult.ResultCode));
            FailPending(_setupError ?? (Exception)new IOException("MQTT disconnected. Reconnect to the broker and try again."));
            Disconnected?.Invoke();
            return Task.CompletedTask;
        };
    }

    public async Task ConnectAsync(MqttConfig config, IEnumerable<string> topics, CancellationToken cancellationToken,
        string? presenceTopic = null) {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _setupError = null;
        if (!MqttAddress.IsValid(config)) throw new ArgumentException("Invalid MQTT broker configuration.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(config.Username, "^[a-zA-Z0-9_-]{1,64}$"))
            throw new MqttSetupRequiredException("Enter the provisioned MQTT username (letters, digits, underscore or hyphen).");
        if (_setup) {
            SetupRequestTopic = $"kage/client/setup/by-user/{config.Username}/request";
            _responseTopic = $"kage/client/setup/by-user/{config.Username}/response/{ClientId}";
        }
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        var options = new MqttClientOptionsBuilder().WithClientId(ClientId)
            .WithTcpServer(config.Address, config.Port).WithCleanSession();
        options.WithKeepAlivePeriod(TimeSpan.FromSeconds(20));
        PresenceSession = $"kage-session-{Guid.NewGuid():N}";
        if (presenceTopic != null) {
            options.WithWillTopic(presenceTopic)
                .WithWillPayload(JsonSerializer.Serialize(new { session_id = PresenceSession, online = false }))
                .WithWillQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce).WithWillRetain(false);
        }

        if (!string.IsNullOrEmpty(config.Username) || !string.IsNullOrEmpty(config.Password)) {
            options.WithCredentials(config.Username, config.Password);
        }

        if (config.UseTls) {
            // Each attempt uses its current trust configuration, including a return to Windows trust.
            foreach (var certificate in _certificates) certificate.Dispose();
            _certificates.Clear();

            try {
                _certificates.AddRange(MqttCertificates.Load(config.CertificateAuthorityPem));
            }
            catch (System.Security.Cryptography.CryptographicException ex) {
                throw _setupError = MqttSetupRequiredException.FromTlsFailure(ex)!;
            }
            options.WithTlsOptions(tls => {
                tls.UseTls();
                if (_certificates.Count > 0) tls.WithTrustChain(_certificates);
            });
        }

        try {
            var connection = await _client.ConnectAsync(options.Build(), timeout.Token).ConfigureAwait(false);
            _setupError ??= MqttSetupRequiredException.FromConnectResult(connection.ResultCode);
            ThrowIfSetupRequired();
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested) {
            _setupError ??= MqttSetupRequiredException.FromTlsFailure(ex);
            if (_setupError != null) throw _setupError;
            throw;
        }

        var subscriptions = new MqttClientSubscribeOptionsBuilder();
        foreach (string topic in topics.Append(_responseTopic).Distinct()) {
            subscriptions.WithTopicFilter(topic, MqttQualityOfServiceLevel.AtLeastOnce);
        }

        var result = await _client.SubscribeAsync(subscriptions.Build(), timeout.Token).ConfigureAwait(false);
        if (result.Items.Any(item => item.ResultCode == MqttClientSubscribeResultCode.NotAuthorized))
            throw _setupError = new MqttSetupRequiredException("The broker denied a Client subscription. Check its topic permissions, then connect again.");
        if (result.Items.Any(item => (int)item.ResultCode >= 128))
            throw new IOException("The broker rejected an MQTT subscription. Retrying the connection.");

        // Connected is exposed only after both login and topic subscriptions succeed.
        _ready = _client.IsConnected;
        if (!_ready) throw new IOException("MQTT disconnected during setup.");
    }

    public async Task<MqttResponse> RequestAsync(string topic, string action, object data, CancellationToken cancellationToken = default) {
        ObjectDisposedException.ThrowIf(_disposed, this);
        string requestId = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<MqttResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        // Register before publishing: a local broker can reply before PublishAsync returns.
        _pending[requestId] = completion;

        try {
            await PublishAsync(topic, JsonSerializer.Serialize(new {
                request_id = requestId,
                reply_to = _responseTopic,
                action,
                data
            }), timeout.Token).ConfigureAwait(false);

            return await completion.Task.WaitAsync(timeout.Token).ConfigureAwait(false);
        }
        finally {
            // Timeouts and cancellations must also stop late replies from finding this request.
            _pending.TryRemove(requestId, out _);
        }
    }

    public async Task PublishAsync(string topic, string payload, CancellationToken cancellationToken = default) {
        if (!IsConnected) throw new IOException("MQTT is disconnected. Reconnect to the broker and try again.");
        var message = new MqttApplicationMessageBuilder().WithTopic(topic).WithPayload(payload)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce).WithRetainFlag(false).Build();
        var result = await _client.PublishAsync(message, cancellationToken).ConfigureAwait(false);
        if (result.ReasonCode == MqttClientPublishReasonCode.NotAuthorized)
            throw _setupError = new MqttSetupRequiredException("The broker denied a Client publish. Check its topic permissions, then connect again.");
        if ((int)result.ReasonCode >= 128) throw new IOException("The broker rejected the MQTT request.");
    }

    public void ThrowIfSetupRequired() {
        if (_setupError != null) throw _setupError;
    }

    public async Task DisconnectAsync() {
        _ready = false;
        if (!_client.IsConnected) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await _client.DisconnectAsync(new MqttClientDisconnectOptions(), timeout.Token).ConfigureAwait(false);
    }

    private void FailPending(Exception error) {
        foreach (var entry in _pending) {
            if (_pending.TryRemove(entry.Key, out var completion)) completion.TrySetException(error);
        }
    }

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        _ready = false;
        FailPending(new ObjectDisposedException(nameof(MqttSession)));
        _client.Dispose();
        foreach (var certificate in _certificates) certificate.Dispose();
    }
}

public sealed class MqttResponse {
    public string? request_id { get; set; }
    public JsonElement data { get; set; }
    public MqttResponseDetail? detail { get; set; }
    public bool IsSuccess => string.Equals(detail?.code, "SUCCESS", StringComparison.OrdinalIgnoreCase)
        && data.ValueKind == JsonValueKind.Object;
}

public sealed class MqttResponseDetail {
    public string? code { get; set; }
    public string? message { get; set; }
}
