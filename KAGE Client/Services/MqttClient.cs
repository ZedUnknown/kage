using KAGE_Client.Models;
using System.Diagnostics;
using System.Text.Json;

namespace KAGE_Client.Services;

public sealed class MqttClient : IDisposable {
    private readonly ClientConfig _config;
    private readonly MqttSession _session;
    private readonly string _topic;
    private int _isListening;
    public bool IsConnected => _session.IsConnected;

    public MqttClient(ClientConfig config) {
        if (!MqttAddress.IsTopicId(config.HubId) || !MqttAddress.IsTopicId(config.PcId))
            throw new ArgumentException("A valid Hub ID and PC ID are required for MQTT.");
        _config = config;
        _topic = $"kage/client/{config.HubId}/{config.PcId}";
        _session = new MqttSession($"{_topic}/response");
    }

    public async Task ListenAsync(Action<ClientStateData> onStateReceived,
        Action<ClientCommandData> onCommandReceived, Action<bool> onConnectionChanged,
        CancellationToken cancellationToken) {
        if (Interlocked.Exchange(ref _isListening, 1) != 0)
            throw new InvalidOperationException("MQTT is already listening.");
        TaskCompletionSource disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);
        void OnDisconnected() => disconnected.TrySetResult();
        void OnMessage(string topic, string json) {
            if (cancellationToken.IsCancellationRequested) return;
            try {
                if (topic == $"{_topic}/state") onStateReceived(ReadState(JsonSerializer.Deserialize<JsonElement>(json)));
                else if (topic == $"{_topic}/command") {
                    var command = JsonSerializer.Deserialize<ClientCommandData>(json);
                    if (command != null) onCommandReceived(command);
                }
            }
            catch (JsonException ex) { Trace.WriteLine($"Invalid MQTT payload: {ex.Message}"); }
        }
        _session.Disconnected += OnDisconnected;
        _session.MessageReceived += OnMessage;
        try {
            while (!cancellationToken.IsCancellationRequested) {
                disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);
                try {
                    await _session.ConnectAsync(_config.Mqtt, [$"{_topic}/state", $"{_topic}/command"], cancellationToken).ConfigureAwait(false);
                    onConnectionChanged(true);
                    await disconnected.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { break; }
                catch (Exception ex) { Trace.WriteLine($"MQTT ERROR: {ex.Message}"); }
                finally {
                    if (!cancellationToken.IsCancellationRequested) onConnectionChanged(false);
                    try { await _session.DisconnectAsync().ConfigureAwait(false); }
                    catch (Exception ex) { Trace.WriteLine($"MQTT disconnect: {ex.Message}"); }
                }
                await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken).ConfigureAwait(false);
            }
        }
        finally {
            _session.Disconnected -= OnDisconnected;
            _session.MessageReceived -= OnMessage;
            Interlocked.Exchange(ref _isListening, 0);
        }
    }

    public async Task<ClientStateData> RequestStateAsync(CancellationToken cancellationToken = default) {
        MqttResponse response = await RequestAsync("state", new { hub_id = _config.HubId, pc_id = _config.PcId }, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccess) throw new InvalidOperationException(response.detail?.message ?? "The MQTT state request was rejected.");
        return ReadState(response.data);
    }

    private ClientStateData ReadState(JsonElement data) {
        if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("hub", out _)
            || !data.TryGetProperty("pc", out _) || !data.TryGetProperty("assignment", out _))
            throw new JsonException("Missing client state.");
        ClientStateData? state = data.Deserialize<ClientStateData>();
        if (state?.Hub?.HubId != _config.HubId || state.Pc?.PcId != _config.PcId || state.Assignment == null)
            throw new JsonException("The state does not belong to this Hub and PC.");
        return state;
    }

    public Task<MqttResponse> RequestAsync(string action, object data, CancellationToken cancellationToken = default) =>
        _session.RequestAsync($"{_topic}/request", action, data, cancellationToken);

    public Task PublishAsync(string topic, string payload, CancellationToken cancellationToken = default) =>
        _session.PublishAsync(topic, payload, cancellationToken);

    public void Dispose() => _session.Dispose();
}
