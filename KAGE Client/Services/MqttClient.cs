using KAGE_Client.Models;
using System.Diagnostics;
using System.IO;
using System.Text.Json;

namespace KAGE_Client.Services;

public sealed class MqttClient : IDisposable {
    private readonly ClientConfig _config;
    private readonly MqttSession _session;
    private readonly string _topic;
    private int _isListening;
    private readonly SessionSecurity _security = new();
    private readonly SemaphoreSlim _reportLock = new(1, 1);
    public CommandJournal Journal { get; }
    public bool IsConnected => _session.IsConnected;

    public MqttClient(ClientConfig config, CommandJournal? journal = null) {
        if (!MqttAddress.IsTopicId(config.HubId) || !MqttAddress.IsTopicId(config.PcId))
            throw new ArgumentException("A valid Hub ID and PC ID are required for MQTT.");
        _config = config;
        Journal = journal ?? new CommandJournal(CommandJournal.PathFor(config));
        _topic = $"kage/client/{config.HubId}/{config.PcId}";
        _session = new MqttSession($"{_topic}/response");
    }

    public async Task ListenAsync(Action<ClientStateData> onStateReceived,
        Action<ClientCommandData> onCommandReceived, Action<bool> onConnectionChanged,
        CancellationToken cancellationToken) {
        if (Interlocked.Exchange(ref _isListening, 1) != 0)
            throw new InvalidOperationException("MQTT is already listening.");

        TaskCompletionSource disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var messageGate = new object();
        bool recovering = true;
        var buffered = new List<ClientCommandData>();

        void OnDisconnected() => disconnected.TrySetResult();

        void OnMessage(string topic, string json) {
            if (cancellationToken.IsCancellationRequested) return;

            try {
                if (topic == $"{_topic}/state") {
                    lock (messageGate) {
                        if (!recovering) onStateReceived(ReadState(JsonSerializer.Deserialize<JsonElement>(json)));
                    }
                }
                else if (topic == $"{_topic}/command") {
                    if (ConnectionTest.TryCreateReply(json, _config.HubId, _config.PcId, DateTimeOffset.UtcNow, out string? testReply)) {
                        _ = ReplyConnectionTestAsync(testReply!, cancellationToken);
                        return;
                    }

                    var command = JsonSerializer.Deserialize<ClientCommandData>(json);
                    if (command != null) {
                        lock (messageGate) {
                            // Recover the server snapshot before delivering live commands in version order.
                            if (recovering) {
                                if (buffered.Count < 100) buffered.Add(command);
                            } else {
                                onCommandReceived(command);
                            }
                        }
                    }
                }
            }
            catch (JsonException ex) {
                Trace.WriteLine($"Invalid MQTT payload: {ex.Message}");
            }
        }

        _session.Disconnected += OnDisconnected;
        _session.MessageReceived += OnMessage;
        try {
            while (!cancellationToken.IsCancellationRequested) {
                disconnected = new(TaskCreationOptions.RunContinuationsAsynchronously);
                lock (messageGate) {
                    recovering = true;
                    buffered.Clear();
                }

                try {
                    await _session.ConnectAsync(_config.Mqtt, [$"{_topic}/state", $"{_topic}/command"], cancellationToken, $"{_topic}/presence").ConfigureAwait(false);
                    MqttResponse hello = await RequestAsync("hello", new {
                        hub_id = _config.HubId,
                        pc_id = _config.PcId,
                        protocol_version = 1,
                        capabilities = new[] { "command_lifecycle_v1", "presence_v1", "security_state_v1", "connection_test_v1", "activity_v1" },
                        safety_button = CommandManager.safetyButton,
                        session_id = _session.PresenceSession
                    }, cancellationToken).ConfigureAwait(false);
                    if (!hello.IsSuccess) throw new IOException("The server does not support command lifecycle v1.");

                    // Send queued outcomes before requesting the authoritative recovery snapshot.
                    await FlushReportsAsync(cancellationToken).ConfigureAwait(false);
                    ClientStateData recovered = await RequestStateAsync(cancellationToken).ConfigureAwait(false);
                    if (recovered.ProtocolVersion != 1 || !recovered.ServerTimeUtc.HasValue)
                        throw new IOException("The server returned an unsupported recovery snapshot.");
                    onStateReceived(recovered);
                    lock (messageGate) {
                        recovering = false;
                        foreach (var command in buffered.OrderBy(c => c.Version)) onCommandReceived(command);
                        buffered.Clear();
                    }

                    onConnectionChanged(true);
                    while (!disconnected.Task.IsCompleted) {
                        _session.ThrowIfSetupRequired();
                        await PublishPresenceAsync(true, cancellationToken).ConfigureAwait(false);
                        await FlushReportsAsync(cancellationToken).ConfigureAwait(false);
                        await Task.WhenAny(disconnected.Task, Task.Delay(TimeSpan.FromSeconds(2), cancellationToken)).ConfigureAwait(false);
                        cancellationToken.ThrowIfCancellationRequested();
                    }
                    _session.ThrowIfSetupRequired();
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    break;
                }
                catch (MqttSetupRequiredException) {
                    // Invalid credentials need setup. Retrying the same connection will not help.
                    throw;
                }
                catch (Exception ex) {
                    _session.ThrowIfSetupRequired();
                    Trace.WriteLine($"MQTT ERROR: {ex.Message}");
                }
                finally {
                    if (_session.IsConnected) {
                        try {
                            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                            await PublishPresenceAsync(false, deadline.Token).ConfigureAwait(false);
                        }
                        catch (Exception ex) {
                            Trace.WriteLine($"MQTT presence: {ex.Message}");
                        }
                    }

                    if (!cancellationToken.IsCancellationRequested) onConnectionChanged(false);

                    try {
                        await _session.DisconnectAsync().ConfigureAwait(false);
                    }
                    catch (Exception ex) {
                        Trace.WriteLine($"MQTT disconnect: {ex.Message}");
                    }
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

    private async Task ReplyConnectionTestAsync(string payload, CancellationToken cancellationToken) {
        try {
            await _session.PublishAsync($"{_topic}/request", payload, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) {
            Trace.WriteLine($"MQTT connection test reply: {ex.Message}");
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

    private Task PublishPresenceAsync(bool online, CancellationToken cancellationToken) {
        InputActivitySample? activity = online ? InputActivity.Read() : null;
        return PublishAsync($"{_topic}/presence", JsonSerializer.Serialize(new {
            session_id = _session.PresenceSession, online, security_state = _security.Read(),
            safety_button = CommandManager.safetyButton, protocol_version = 1,
            idle_ms = activity?.IdleMilliseconds, input_tick = activity?.InputTick
        }), cancellationToken);
    }

    public async Task FlushReportsAsync(CancellationToken cancellationToken = default) {
        // Heartbeats and command updates can both flush reports. Keep one publisher at a time.
        await _reportLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try {
            foreach (var report in Journal.Pending()) {
                var response = await RequestAsync("command_report", new {
                    hub_id = _config.HubId,
                    pc_id = _config.PcId,
                    command_id = report.Command.CommandId,
                    version = report.Command.Version,
                    status = report.Status,
                    message = report.Message
                }, cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccess) throw new IOException("The server rejected a command report.");
                Journal.Acknowledge(report);
            }
        }
        finally {
            _reportLock.Release();
        }
    }

    public void Dispose() {
        _security.Dispose();
        _session.Dispose();
        Journal.Dispose();
    }
}
