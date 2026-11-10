using KAGE_Client.Models;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Threading;

namespace KAGE_Client.Services;

public partial class CommandManager : IDisposable {
    private readonly Dispatcher _dispatcher = Dispatcher.CurrentDispatcher;
    private CancellationTokenSource? _requestCancellation;
    private ClientStateData? _clientState;
    private long _stateVersion;
    private bool _disposed;

    public event EventHandler? StateChanged;

    public ClientCommandData? ActiveCommand => _ongoingCommand;

    public bool IsForced => _ongoingCommand?.Command.Trim().StartsWith("force_", StringComparison.OrdinalIgnoreCase) == true;
    public bool IsLogout => _ongoingCommand?.Command.Trim().EndsWith("logout", StringComparison.OrdinalIgnoreCase) == true;
    public bool IsExtensionActive => _ongoingCommand?.ExtensionActive == true;
    public bool IsRequestPending => _requestCancellation != null;
    public bool CanExtend => _ongoingCommand != null && !IsForced && _ongoingCommand.AllowExtension == true && !IsRequestPending;
    public bool IsActivityPrompt => !IsForced && _ongoingCommand?.Reason == "activity";
    public bool CanConfirmActivity => IsActivityPrompt && !IsRequestPending;
    public bool CanCancelExtension => IsExtensionActive && !IsForced && !IsActivityPrompt && _ongoingCommand?.AllowCancellation != false;
    public int ExtensionDurationSeconds => _ongoingCommand?.ExtensionDurationSeconds ?? 300;
    public string InteractionMessage { get; private set; } = "";
    public int SecondsRemaining {
        get {
            TimeSpan remaining = _commandDuration - (_commandStopwatch?.Elapsed ?? TimeSpan.Zero);
            double seconds = Math.Ceiling(Math.Max(0, remaining.TotalSeconds));
            return (int)Math.Min(int.MaxValue, seconds);
        }
    }

    public void UpdateClientState(ClientStateData? state) {
        _dispatcher.VerifyAccess();
        _clientState = state;
        _stateVersion++;
    }

    // raise the StateChanged event to notify subscribers that the state has changed
    private void NotifyStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    private void InvalidateRequest() {
        CancellationTokenSource? request = _requestCancellation;
        // Clear ownership first: a cancelled continuation must not update the next command.
        _requestCancellation = null;
        request?.Cancel();
    }

    public Task RequestExtensionAsync() => RequestChangeAsync(ExtensionDurationSeconds, false);
    public Task CancelExtensionAsync() => RequestChangeAsync(0, true);
    public Task ConfirmActivityAsync() => RequestChangeAsync(0, true, true);

    private async Task RequestChangeAsync(int seconds, bool cancel, bool confirmActivity = false) {
        _dispatcher.VerifyAccess();
        if (_disposed || IsRequestPending || _ongoingCommand == null) return;
        if (IsForced) {
            SetInteractionMessage("This administrative action cannot be extended or cancelled here.");
            return;
        }
        bool canRequestChange;
        if (confirmActivity) {
            canRequestChange = CanConfirmActivity;
        } else if (cancel) {
            canRequestChange = CanCancelExtension;
        } else {
            canRequestChange = CanExtend;
        }

        if (!canRequestChange) {
            SetInteractionMessage(cancel ? "There is no cancellable extension." : "Extensions are not allowed for this action.");
            return;
        }
        if (!cancel && (seconds < 10 || seconds > 3600)) {
            SetInteractionMessage("The configured extension duration is invalid.");
            return;
        }
        if (_config == null || _mqttClient == null) {
            SetInteractionMessage("Server connection is unavailable. The countdown is still active.");
            return;
        }

        ClientCommandData requestedCommand = _ongoingCommand;
        using CancellationTokenSource request = new(TimeSpan.FromSeconds(10));
        _requestCancellation = request;
        if (confirmActivity) {
            SetInteractionMessage("Confirming activity…");
        } else if (cancel) {
            SetInteractionMessage("Checking assigned chair presence…");
        } else {
            SetInteractionMessage("Requesting extension…");
        }

        try {
            // Request fresh presence through MQTT because a retained state may predate a disconnect.
            if (cancel && !confirmActivity) {
                long stateVersion = _stateVersion;
                ClientStateData freshState = await _mqttClient.RequestStateAsync(request.Token);
                if (!IsCurrentRequest(requestedCommand, request)) return;
                if (!HasPresence(freshState) || (_stateVersion != stateVersion && !HasPresence(_clientState))) {
                    SetInteractionMessage("Cancel rejected: the assigned chair must be online and occupied. The countdown is still active.");
                    return;
                }
                if (_stateVersion == stateVersion) UpdateClientState(freshState);
                SetInteractionMessage("Presence restored. Requesting cancellation…");
            }

            // These requests never change the local timer. Only an approved command does.
            string action;
            if (confirmActivity) {
                action = "confirm_activity";
            } else {
                action = cancel ? "cancel_extension" : "extend";
            }

            MqttResponse result = await _mqttClient.RequestAsync(action, new {
                hub_id = _config.HubId,
                pc_id = _config.PcId,
                command = requestedCommand.Command,
                command_id = requestedCommand.CommandId,
                version = requestedCommand.Version,
                deadline_utc = requestedCommand.DeadlineUtc,
                requested_seconds = seconds
            }, request.Token);

            if (!IsCurrentRequest(requestedCommand, request)) return;
            if (!result.IsSuccess) {
                SetInteractionMessage(result?.detail?.message ?? "The server rejected the request. The countdown is still active.");
                return;
            }

            ClientCommandData? approved = result!.data.Deserialize<ClientCommandData>();
            string expectedName = (cancel ? "cancel_" : "") + requestedCommand.Command.Trim();
            if (approved == null || !string.Equals(approved.Command, expectedName, StringComparison.OrdinalIgnoreCase)
                || approved.Priority < requestedCommand.Priority
                || (!cancel && (!approved.ExtensionActive || !approved.DeadlineUtc.HasValue || !approved.ServerTimeUtc.HasValue))) {
                SetInteractionMessage("The server did not return an approved command. The countdown is still active.");
                return;
            }
            if (cancel && !confirmActivity && !HasPresence(_clientState)) {
                SetInteractionMessage("Chair presence changed. Cancellation rejected. The countdown is still active.");
                return;
            }

            HandleCommand(approved);
            if (_ongoingCommand != null && !cancel) SetInteractionMessage("Extension approved by the server.");
        }
        catch (OperationCanceledException) {
            if (IsCurrentRequest(requestedCommand, request)) SetInteractionMessage("Request timed out. The countdown is still active.");
        }
        catch (JsonException) {
            if (IsCurrentRequest(requestedCommand, request)) SetInteractionMessage("Invalid server response. The countdown is still active.");
        }
        catch (Exception ex) {
            Trace.WriteLine($"MQTT extension request failed: {ex.Message}");
            if (IsCurrentRequest(requestedCommand, request))
                SetInteractionMessage("Could not send or confirm the MQTT request. The countdown is still active.");
        }
        finally {
            if (ReferenceEquals(_requestCancellation, request)) {
                _requestCancellation = null;
                NotifyStateChanged();
            }
        }
    }

    private bool HasPresence(ClientStateData? state) {
        return state != null && state.Hub != null && state.Pc != null && state.Assignment != null
            && state.Hub.HubId == _config?.HubId && state.Pc.PcId == _config?.PcId
            && state.Hub.Online && state.Assignment.Assigned
            && !string.IsNullOrWhiteSpace(state.Assignment.ChairId)
            && state.Assignment.ChairId == _config?.ChairId
            && state.Chair != null && state.Chair.ChairId == state.Assignment.ChairId
            && state.Chair.Online && state.Chair.Occupied && state.Sensor?.Online == true;
    }

    private bool IsCurrentRequest(ClientCommandData command, CancellationTokenSource request) {
        if (_disposed || !ReferenceEquals(_ongoingCommand, command) || !ReferenceEquals(_requestCancellation, request)) return false;
        // Request continuations may run before the next 250 ms timer tick.
        if (_commandStopwatch != null && _commandStopwatch.Elapsed >= _commandDuration) {
            CompleteCommand();
            return false;
        }
        return true;
    }

    private void SetInteractionMessage(string message) {
        InteractionMessage = message;
        NotifyStateChanged();
    }

    private static void LockSession() {
        if (!LockWorkStation()) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    private static void LogoutSession() {
        // EWX_LOGOFF: let Windows handle application shutdown and unsaved-work prompts.
        if (!ExitWindowsEx(0, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool LockWorkStation();

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ExitWindowsEx(uint flags, uint reason);

    public void Dispose() {
        _dispatcher.VerifyAccess();
        if (_disposed) return;
        _disposed = true;
        ClearCountdownState();
    }
}
