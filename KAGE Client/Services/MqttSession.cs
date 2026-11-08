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
    private readonly string _responseTopic;
    private volatile bool _ready;
    private bool _disposed;

    public string ClientId { get; } = $"kage-pc-{Guid.NewGuid():N}";
    public bool IsConnected => _ready && _client.IsConnected;
    public event Action<string, string>? MessageReceived;
    public event Action? Disconnected;

    public MqttSession(string? responseTopic = null) {
        _responseTopic = responseTopic ?? $"kage/client/setup/{ClientId}/response";
        _client.ApplicationMessageReceivedAsync += args => {
            var message = args.ApplicationMessage;
            string payload = message.ConvertPayloadToString();
            if (message.Topic == _responseTopic) {
                // Retained or late replies must never satisfy a new request.
                if (!message.Retain) {
                    try {
                        MqttResponse? response = JsonSerializer.Deserialize<MqttResponse>(payload);
                        if (response?.request_id != null && _pending.TryGetValue(response.request_id, out var pending))
                            pending.TrySetResult(response);
                    }
                    catch (JsonException) { /* Ignore malformed messages; the request has a deadline. */ }
                }
            } else {
                MessageReceived?.Invoke(message.Topic, payload);
            }
            return Task.CompletedTask;
        };
        _client.DisconnectedAsync += _ => {
            _ready = false;
            FailPending(new IOException("MQTT disconnected. Reconnect to the broker and try again."));
            Disconnected?.Invoke();
            return Task.CompletedTask;
        };
    }

    public async Task ConnectAsync(MqttConfig config, IEnumerable<string> topics, CancellationToken cancellationToken) {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!MqttAddress.IsValid(config)) throw new ArgumentException("Invalid MQTT broker configuration.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        var options = new MqttClientOptionsBuilder().WithClientId(ClientId)
            .WithTcpServer(config.Address, config.Port).WithCleanSession();
        if (!string.IsNullOrEmpty(config.Username) || !string.IsNullOrEmpty(config.Password))
            options.WithCredentials(config.Username, config.Password);
        if (config.UseTls) {
            if (_certificates.Count == 0) {
                using Stream? stream = typeof(MqttSession).Assembly.GetManifestResourceStream("KAGE_Client.Certificates.ca.crt");
                if (stream != null) {
                    using var reader = new StreamReader(stream);
                    _certificates.ImportFromPem(await reader.ReadToEndAsync(timeout.Token).ConfigureAwait(false));
                    if (_certificates.Count == 0) throw new InvalidOperationException("The embedded ca.crt contains no certificates.");
                }
            }
            options.WithTlsOptions(tls => {
                tls.UseTls();
                if (_certificates.Count > 0) tls.WithTrustChain(_certificates);
            });
        }
        await _client.ConnectAsync(options.Build(), timeout.Token).ConfigureAwait(false);
        var subscriptions = new MqttClientSubscribeOptionsBuilder();
        foreach (string topic in topics.Append(_responseTopic).Distinct())
            subscriptions.WithTopicFilter(topic, MqttQualityOfServiceLevel.AtLeastOnce);
        var result = await _client.SubscribeAsync(subscriptions.Build(), timeout.Token).ConfigureAwait(false);
        if (result.Items.Any(item => (int)item.ResultCode >= 128))
            throw new InvalidOperationException("The broker denied an MQTT subscription. Check its topic permissions.");
        _ready = _client.IsConnected;
        if (!_ready) throw new IOException("MQTT disconnected during setup.");
    }

    public async Task<MqttResponse> RequestAsync(string topic, string action, object data, CancellationToken cancellationToken = default) {
        ObjectDisposedException.ThrowIf(_disposed, this);
        string requestId = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<MqttResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        _pending[requestId] = completion;
        try {
            await PublishAsync(topic, JsonSerializer.Serialize(new {
                request_id = requestId, reply_to = _responseTopic, action, data
            }), timeout.Token).ConfigureAwait(false);
            return await completion.Task.WaitAsync(timeout.Token).ConfigureAwait(false);
        }
        finally { _pending.TryRemove(requestId, out _); }
    }

    public async Task PublishAsync(string topic, string payload, CancellationToken cancellationToken = default) {
        if (!IsConnected) throw new IOException("MQTT is disconnected. Reconnect to the broker and try again.");
        var message = new MqttApplicationMessageBuilder().WithTopic(topic).WithPayload(payload)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce).WithRetainFlag(false).Build();
        var result = await _client.PublishAsync(message, cancellationToken).ConfigureAwait(false);
        if ((int)result.ReasonCode >= 128) throw new IOException("The broker rejected the MQTT request.");
    }

    public async Task DisconnectAsync() {
        _ready = false;
        if (!_client.IsConnected) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await _client.DisconnectAsync(new MqttClientDisconnectOptions(), timeout.Token).ConfigureAwait(false);
    }

    private void FailPending(Exception error) {
        foreach (var entry in _pending)
            if (_pending.TryRemove(entry.Key, out var completion)) completion.TrySetException(error);
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
