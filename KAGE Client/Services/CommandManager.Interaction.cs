using KAGE_Client.Models;
using System.ComponentModel;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
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

    public ClientCommandData? ActiveCommand => _ongoingCommand; // `ActiveCommand` takes the current command every time `ActiveCommand` is accessed.

    public bool IsForced => _ongoingCommand?.Command.Trim().StartsWith("force_", StringComparison.OrdinalIgnoreCase) == true;
    public bool IsLogout => _ongoingCommand?.Command.Trim().EndsWith("logout", StringComparison.OrdinalIgnoreCase) == true;
    public bool IsExtensionActive => _ongoingCommand?.ExtensionActive == true;
    public bool IsRequestPending => _requestCancellation != null;
    public bool CanExtend => _ongoingCommand != null && !IsForced && _ongoingCommand.AllowExtension != false && !IsRequestPending;
    public bool CanCancelExtension => IsExtensionActive && !IsForced && _ongoingCommand?.AllowCancellation != false;
    public string InteractionMessage { get; private set; } = "";
    public int SecondsRemaining => (int)Math.Min(int.MaxValue, Math.Ceiling(Math.Max(0,
        (_commandDuration - (_commandStopwatch?.Elapsed ?? TimeSpan.Zero)).TotalSeconds)));

    public void UpdateClientState(ClientStateData? state) {
        _dispatcher.VerifyAccess();
        _clientState = state;
        _stateVersion++;
    }

    // raise the StateChanged event to notify subscribers that the state has changed
    private void NotifyStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    private void InvalidateRequest() {
        CancellationTokenSource? request = _requestCancellation;
        _requestCancellation = null;
        request?.Cancel();
    }

    public Task RequestExtensionAsync(int minutes) => RequestChangeAsync(minutes, false);
    public Task CancelExtensionAsync() => RequestChangeAsync(0, true);

    private async Task RequestChangeAsync(int minutes, bool cancel) {
        _dispatcher.VerifyAccess();
        if (_disposed || IsRequestPending || _ongoingCommand == null) return;
        if (IsForced) {
            SetInteractionMessage("This administrative action cannot be extended or cancelled here.");
            return;
        }
        if (cancel ? !CanCancelExtension : !CanExtend) {
            SetInteractionMessage(cancel ? "There is no cancellable extension." : "Extensions are not allowed for this action.");
            return;
        }
        if (!cancel && minutes != 1 && minutes != 2 && minutes != 5 && minutes != 10) {
            SetInteractionMessage("Choose an extension of 1, 2, 5 or 10 minutes.");
            return;
        }
        if (_api == null || _config == null) {
            SetInteractionMessage("Server connection is unavailable. The countdown is still active.");
            return;
        }

        ClientCommandData requestedCommand = _ongoingCommand;
        using CancellationTokenSource request = new(TimeSpan.FromSeconds(10));
        _requestCancellation = request;
        SetInteractionMessage(cancel ? "Checking assigned chair presence…" : "Requesting extension…");

        try {
            // Recheck presence over HTTP; a cached occupied state may predate a disconnect.
            if (cancel) {
                long stateVersion = _stateVersion;
                KAGELockResponse? stateResult = await _api.apiFetch("/client/state", HttpMethod.Post, new {
                    hub_id = _config.HubId, pc_id = _config.PcId
                }, request.Token);
                if (!IsCurrentRequest(requestedCommand, request)) return;
                if (!IsSuccess(stateResult)) {
                    SetInteractionMessage("Could not verify chair presence. The countdown is still active.");
                    return;
                }
                ClientStateData? freshState = stateResult!.data.Deserialize<ClientStateData>();
                if (!HasPresence(freshState) || (_stateVersion != stateVersion && !HasPresence(_clientState))) {
                    SetInteractionMessage("Cancel rejected: the assigned chair must be online and occupied. The countdown is still active.");
                    return;
                }
                if (_stateVersion == stateVersion) UpdateClientState(freshState);
                SetInteractionMessage("Presence restored. Requesting cancellation…");
            }

            // These requests never change the local timer. Only an approved command does.
            KAGELockResponse? result = await _api.apiFetch(
                cancel ? "/client/cancel-extension" : "/client/extend", HttpMethod.Post, new {
                    hub_id = _config.HubId,
                    pc_id = _config.PcId,
                    command = requestedCommand.Command,
                    deadline_utc = requestedCommand.DeadlineUtc,
                    duration_seconds = cancel ? 0 : minutes * 60
                }, request.Token);
            if (!IsCurrentRequest(requestedCommand, request)) return;
            if (!IsSuccess(result)) {
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
            if (cancel && !HasPresence(_clientState)) {
                SetInteractionMessage("Chair presence changed. Cancellation rejected; the countdown is still active.");
                return;
            }

            HandleCommand(approved);
            if (_ongoingCommand != null && !cancel) SetInteractionMessage("Extension approved by the server.");
        }
        catch (OperationCanceledException) {
            if (IsCurrentRequest(requestedCommand, request)) SetInteractionMessage("Request timed out. The countdown is still active.");
        }
        catch (HttpRequestException ex) {
            if (IsCurrentRequest(requestedCommand, request)) {
                SetInteractionMessage(ex.StatusCode == HttpStatusCode.NotFound || ex.StatusCode == HttpStatusCode.MethodNotAllowed
                    ? "This server does not support this request yet. The countdown is still active."
                    : "Could not reach the server. The countdown is still active.");
            }
        }
        catch (JsonException) {
            if (IsCurrentRequest(requestedCommand, request)) SetInteractionMessage("Invalid server response. The countdown is still active.");
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
        // HTTP continuations may run before the next 250 ms timer tick.
        if (_commandStopwatch != null && _commandStopwatch.Elapsed >= _commandDuration) {
            CompleteCommand();
            return false;
        }
        return true;
    }

    private static bool IsSuccess(KAGELockResponse? result) =>
        string.Equals(result?.detail?.code, "SUCCESS", StringComparison.OrdinalIgnoreCase)
        && result!.data.ValueKind == JsonValueKind.Object;

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
