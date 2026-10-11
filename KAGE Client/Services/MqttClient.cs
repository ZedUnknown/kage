using System;
using KAGE_Client.Models;
using MQTTnet;
using MQTTnet.Protocol;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

namespace KAGE_Client.Services;

/*

Client subscribes to,

: [/kage/client/{hub_id}/{pc_id}/state]
{
    "hub": {
        "hub_id": "hub123",
        "online": true,
        "last_seen": "2024-06-30T11:59:00Z"
    },
    "pc": {
        "pc_id": "pc456"
    },
    "assignment": {
        "assigned": true,
        "chair_id": "chair789"
    },
    "chair": {
        "chair_id": "chair789",
        "online": true,
        "occupied": false,
        "last_seen": "2024-06-30T11:58:00Z"
    },
    "sensor": {
        "online": true,
        "state": "active"
    }
}

: [/kage/client/{hub_id}/{pc_id}/command]
{
    "command": "auto_lock",
    "priority": 1,
    "deadline_utc": "2024-06-30T12:00:00Z",
    "server_time_utc": "2024-06-30T11:00:00Z",
    "message": "Please lock the chair.",
    "extension_active": true,
    "allow_extension": true,
    "allow_cancellation": false
}
*/

public class MqttClient : IDisposable {
    private readonly ClientConfig _config;
    private readonly IMqttClient _client = new MqttClientFactory().CreateMqttClient();
    private int _isListening;
    private volatile bool _isReady;
    private CancellationToken _lifetime;

    public MqttClient(ClientConfig config) {
        _config = config;
    }

    public async Task ListenAsync(
        Action<ClientStateData> onStateReceived,
        Action<ClientCommandData> onCommandReceived,
        Action<bool> onConnectionChanged,
        CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _isListening, 1) != 0)
            throw new InvalidOperationException("MQTT is already listening.");

        _lifetime = cancellationToken;
        string topic = $"kage/client/{_config.HubId}/{_config.PcId}";
        X509Certificate2Collection certificates = new();
        TaskCompletionSource disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);

        Task OnDisconnected(MqttClientDisconnectedEventArgs args) {
            _isReady = false;
            disconnected.TrySetResult();
            return Task.CompletedTask;
        }

        Task OnMessageReceived(MqttApplicationMessageReceivedEventArgs args) {
            if (cancellationToken.IsCancellationRequested) return Task.CompletedTask;

            try {
                string json = args.ApplicationMessage.ConvertPayloadToString();
                // [/kage/client/{hub_id}/{pc_id}/state]
                if (args.ApplicationMessage.Topic == $"{topic}/state") {
                    ClientStateData? state = JsonSerializer.Deserialize<ClientStateData>(json);
                    if (state != null && state.Hub != null && state.Pc != null && state.Assignment != null)
                        onStateReceived(state);
                // [/kage/client/{hub_id}/{pc_id}/command]
                } else if (args.ApplicationMessage.Topic == $"{topic}/command") {
                    Trace.WriteLine($"MQTT command received: {json}");
                    ClientCommandData? command = JsonSerializer.Deserialize<ClientCommandData>(json);
                    if (command != null) onCommandReceived(command);
                }
            }
            catch (JsonException ex) {
                Trace.WriteLine($"Invalid MQTT payload: {ex.Message}");
            }

            return Task.CompletedTask;
        }

        _client.DisconnectedAsync += OnDisconnected;
        _client.ApplicationMessageReceivedAsync += OnMessageReceived;

        try {
            MqttClientOptionsBuilder options = new MqttClientOptionsBuilder()
                .WithTcpServer(_config.Mqtt.Address, _config.Mqtt.Port)
                .WithCredentials(_config.Mqtt.Username, _config.Mqtt.Password);

            if (_config.Mqtt.UseTls) {
                // Optional project-root ca.crt is embedded at build time. Otherwise use Windows trust.
                using Stream? stream = typeof(MqttClient).Assembly.GetManifestResourceStream("KAGE_Client.Certificates.ca.crt");
                if (stream != null) {
                    using StreamReader reader = new(stream);
                    certificates.ImportFromPem(await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false));
                    if (certificates.Count == 0) throw new InvalidOperationException("ca.crt contains no certificates.");
                }

                options.WithTlsOptions(tls => {
                    tls.UseTls();
                    if (certificates.Count > 0) tls.WithTrustChain(certificates);
                });
            }

            MqttClientOptions connectionOptions = options.Build();
            MqttClientSubscribeOptions subscriptions = new MqttClientSubscribeOptionsBuilder()
                .WithTopicFilter($"{topic}/state", MqttQualityOfServiceLevel.AtLeastOnce)
                .WithTopicFilter($"{topic}/command", MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();

            // One loop owns connection and resubscription, including initial connection failures.
            while (!cancellationToken.IsCancellationRequested) {
                disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);
                try {
                    Trace.WriteLine($"Connecting MQTT: {_config.Mqtt.Address}:{_config.Mqtt.Port}");
                    await _client.ConnectAsync(connectionOptions, cancellationToken).ConfigureAwait(false);
                    MqttClientSubscribeResult result = await _client.SubscribeAsync(subscriptions, cancellationToken).ConfigureAwait(false);
                    if (result.Items.Any(item => (int)item.ResultCode >= 128))
                        throw new InvalidOperationException("The broker rejected an MQTT subscription.");

                    _isReady = _client.IsConnected;
                    if (_isReady) onConnectionChanged(true);
                    await disconnected.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    break;
                }
                catch (Exception ex) {
                    Trace.WriteLine($"MQTT ERROR: {ex.Message}");
                }
                finally {
                    _isReady = false;
                    if (!cancellationToken.IsCancellationRequested) onConnectionChanged(false);
                    if (_client.IsConnected) {
                        using CancellationTokenSource disconnect = new(TimeSpan.FromSeconds(5));
                        try {
                            await _client.DisconnectAsync(new MqttClientDisconnectOptions(), disconnect.Token).ConfigureAwait(false);
                        }
                        catch (Exception ex) {
                            Trace.WriteLine($"MQTT disconnect: {ex.Message}");
                        }
                    }
                }

                await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken).ConfigureAwait(false);
            }
        }
        finally {
            _isReady = false;
            _client.DisconnectedAsync -= OnDisconnected;
            _client.ApplicationMessageReceivedAsync -= OnMessageReceived;
            foreach (X509Certificate2 certificate in certificates) certificate.Dispose();
            Interlocked.Exchange(ref _isListening, 0);
        }
    }

    public async Task PublishAsync(string topic, string payload, CancellationToken cancellationToken = default) {
        if (!_isReady || !_client.IsConnected)
            throw new InvalidOperationException("MQTT is disconnected. The request was not sent.");

        using CancellationTokenSource request = CancellationTokenSource.CreateLinkedTokenSource(_lifetime, cancellationToken);
        MqttApplicationMessage message = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(payload)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(false)
            .Build();

        MqttClientPublishResult result = await _client.PublishAsync(message, request.Token).ConfigureAwait(false);
        if ((int)result.ReasonCode >= 128)
            throw new InvalidOperationException("The broker rejected the MQTT publish.");
    }

    public void Dispose() {
        _client.Dispose();
    }
}
