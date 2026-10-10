

using KAGE_Client.Models;
using System.Diagnostics;
using System.Windows.Threading;
using System.ComponentModel;

namespace KAGE_Client.Services;

public partial class CommandManager {

    private ClientCommandData? _ongoingCommand;
    private ClientCommandData? _lastCommand = null;
    private readonly Api? _api;
    private readonly ClientConfig? _config;

    public event EventHandler<string>? ExecutionFailed;

    public const bool safetyButton = true; // safety button during development to prevent accidental lock/logout during testing

    public bool ShowSafetyButton => safetyButton;

    public void safetyButtonMethod() {
        _dispatcher.VerifyAccess();
        if (!safetyButton || _disposed) return;

        // Stop the countdown and notify MainWindow to close the overlay.
        ClearCountdownState();
        CancelOngoingCommand(new ClientCommandData {
            Command = _lastCommand?.Command ?? "cancel_auto_lock",
            Priority = 0
        });
    }

    public CommandManager(
        Api? api = null,
        ClientConfig? config = null
    ) {
        _api = api;
        _config = config;

        // any state change will trigger the _lastCommand to be updated to the current _ongoingCommand
        StateChanged += (_, _) => {
            if (_disposed) return;

            // If the ongoing command has changed, update the last command reference
            if (_ongoingCommand != _lastCommand) {
                _lastCommand = _ongoingCommand;
            }
        };

    }

    public void HandleCommand(ClientCommandData command) {
        _dispatcher.VerifyAccess();
        if (_disposed) return;
        if (command == null || string.IsNullOrWhiteSpace(command.Command)) return;

        TimeSpan countdown = TimeSpan.Zero;
        if (command.DeadlineUtc.HasValue && command.ServerTimeUtc.HasValue) {
            TimeSpan timeDifference = command.DeadlineUtc.Value - command.ServerTimeUtc.Value;
            countdown = timeDifference > TimeSpan.Zero ? timeDifference : TimeSpan.Zero;
        }

        int countdownSeconds = (int) Math.Ceiling(countdown.TotalSeconds);
        string commandName = command.Command.Trim().ToLowerInvariant();
        string message = command.Message ?? "";


        switch (commandName) {
            // Lock and logout commands
            case "auto_lock":
            case "auto_logout":
            case "force_lock":
            case "force_logout":

                Trace.WriteLine($"Received command: {commandName} (Countdown: {countdownSeconds} seconds) - Message: {message}");
                StartUpdateCommand(command, countdown);
                break;

            // Cancel commands
            case "cancel_auto_lock":
            case "cancel_force_lock":
            case "cancel_auto_logout":
            case "cancel_force_logout":

                Trace.WriteLine($"Received command: {commandName} - Cancelling any ongoing command.");
                CancelOngoingCommand(command);
                break;

            default:
                Trace.WriteLine($"Unknown command: {commandName}");
                break;
        }
    }

    private TimeSpan _commandDuration = TimeSpan.Zero; // stores the ORIGINAL countdown duration
    private DispatcherTimer? _commandTimer; // Calls the tick code every 250 ms
    private Stopwatch? _commandStopwatch; // automatically tracks elapsed time

    private void StartUpdateCommand(ClientCommandData command, TimeSpan countdown) {

        ClientCommandData? ongoingCommandRef = _ongoingCommand; // store the reference to the ongoing command for comparison

        string inComingCommandName = command.Command.Trim().ToLowerInvariant();
        string ongoingCommandName = _ongoingCommand?.Command.Trim().ToLowerInvariant() ?? "";

        int inComingCommandPriority = command.Priority;
        int ongoingCommandPriority = _ongoingCommand?.Priority ?? -1;

        // check priority for already ongoing command
        if (_ongoingCommand != null) {
            if (
                // different command with same priority
                (inComingCommandName != ongoingCommandName && command.Priority == _ongoingCommand.Priority) ||
                inComingCommandPriority < ongoingCommandPriority // lower priority than ongoing command
            ) {
                Trace.WriteLine($"Ignoring incoming command {inComingCommandName} due to lower or equal priority than ongoing command {ongoingCommandName}");
                return;
            }
            else if (inComingCommandName == ongoingCommandName) { // extended dealine situations
                Trace.WriteLine($"Updating ongoing command {ongoingCommandName} with new countdown of {countdown.TotalSeconds} seconds");
                _ongoingCommand = command;

            } else { // different command with higher priority
                Trace.WriteLine($"Replacing ongoing command {ongoingCommandName} with new command {inComingCommandName} (Countdown: {countdown.TotalSeconds} seconds) - Message: {command.Message}");
                _ongoingCommand = command;
            }
        } else {
            Trace.WriteLine($"Starting new command {inComingCommandName} (Countdown: {countdown.TotalSeconds} seconds) - Message: {command.Message}");
            _ongoingCommand = command;
        }

        bool isOngoingCommandChanged = ongoingCommandRef != _ongoingCommand;

        if (isOngoingCommandChanged) {
            InvalidateRequest();
            InteractionMessage = "";
            _commandDuration = countdown;

            // stop any existing timer
            _commandTimer?.Stop();
            _commandStopwatch?.Stop();

            // start measuring elapsed time from 0 again
            _commandStopwatch = Stopwatch.StartNew();

            // if the countdown has already expired or is zero, execute the command immediately
            if (_commandDuration <= TimeSpan.Zero) {
                CompleteCommand();
                return;
            }

            // timer to update the UI and check for countdown completion
            _commandTimer = new DispatcherTimer {
                Interval = TimeSpan.FromMilliseconds(250)
            };

            // Tick event handler for the above timer
            _commandTimer.Tick += (_, _) => {

                if (_ongoingCommand == null || _commandStopwatch == null) {
                    _commandTimer?.Stop();
                    return;
                }

                // fixed countdown duration - elapsed time since the "Stopwatch.StartNew()"
                TimeSpan remaining = _commandDuration - _commandStopwatch.Elapsed;

                if (remaining <= TimeSpan.Zero) {
                    CompleteCommand();
                    return;
                }

                int secondsRemaining = (int)Math.Ceiling(remaining.TotalSeconds);

                // THIS updates what the user sees
                Trace.WriteLine($"Ongoing command: {_ongoingCommand.Command} - Remaining time: {secondsRemaining} seconds - Message: {_ongoingCommand.Message}");

                // Trigger a state change to update the UI with new values
                NotifyStateChanged();
            };

            _commandTimer.Start();

            // Trigger a state change to update the UI with new values
            NotifyStateChanged();

        }

    }

    private void ClearCountdownState() {
        InvalidateRequest();

        // Last Command
        _lastCommand = _ongoingCommand;

        // Stop countdown activity
        _commandTimer?.Stop();
        _commandStopwatch?.Stop();

        // Release countdown objects
        _commandTimer = null;
        _commandStopwatch = null;

        // Reset countdown values
        _commandDuration = TimeSpan.Zero;
        _ongoingCommand = null;
        InteractionMessage = "";

        // Trigger a state change to update the UI with new values
        NotifyStateChanged();
    }


    private void CancelOngoingCommand(ClientCommandData command) {
        if (_ongoingCommand == null) return;

        string ongoingCommandName = _ongoingCommand.Command.Trim().ToLowerInvariant();
        string cancelCommandName = command.Command.Trim().ToLowerInvariant();

        int ongoingCommandPriority = _ongoingCommand.Priority;
        int cancelCommandPriority = command.Priority;

        bool ongoingIsLock = ongoingCommandName == "auto_lock" || ongoingCommandName == "force_lock";
        bool cancelIsLock = cancelCommandName == "cancel_auto_lock" || cancelCommandName == "cancel_force_lock";

        bool ongoingIsLogout = ongoingCommandName == "auto_logout" || ongoingCommandName == "force_logout";
        bool cancelIsLogout = cancelCommandName == "cancel_auto_logout" || cancelCommandName == "cancel_force_logout";

        bool exactCancel = (
            (ongoingCommandName == "auto_lock" && cancelCommandName == "cancel_auto_lock") ||
            (ongoingCommandName == "force_lock" && cancelCommandName == "cancel_force_lock") ||
            (ongoingCommandName == "auto_logout" && cancelCommandName == "cancel_auto_logout") ||
            (ongoingCommandName == "force_logout" && cancelCommandName == "cancel_force_logout")
        ) &&
            cancelCommandPriority >= ongoingCommandPriority;

        bool higherPriorityCancel =
            (cancelCommandPriority > ongoingCommandPriority) &&
            (
                (ongoingIsLock && cancelIsLock) ||
                (ongoingIsLogout && cancelIsLogout)
            );

        if (exactCancel || higherPriorityCancel) {
            Trace.WriteLine($"Cancelling ongoing command: {ongoingCommandName}");

            ClearCountdownState();

            switch (ongoingCommandName) {
                case "auto_lock":
                    CancelAutoLock();
                    break;
                case "auto_logout":
                    CancelAutoLogout();
                    break;
                case "force_lock":
                    CancelForceLock();
                    break;
                case "force_logout":
                    CancelForceLogout();
                    break;
            }

            return;
        }

        Trace.WriteLine(
            $"Ignoring cancel command {cancelCommandName}; ongoing command is {ongoingCommandName}"
        );
    }


    private void ExecuteCommand(ClientCommandData command) {
        if (command == null) return;

        string commandName = command.Command.Trim().ToLowerInvariant();

        switch (commandName) {
            case "auto_lock":
                AutoLock();
                break;
            case "auto_logout":
                AutoLogout();
                break;
            case "force_lock":
                ForceLock();
                break;
            case "force_logout":
                ForceLogout();
                break;
        }
    }

    private void CompleteCommand() {
        if (_ongoingCommand == null) return;

        // Copy _ongoingCommand
        ClientCommandData? command = _ongoingCommand;

        // Clear the countdown states
        ClearCountdownState();

        try {
            // ExecuteCommand(command);
        }
        catch (Win32Exception ex) {
            Trace.WriteLine($"Command execution failed: {ex.Message}");
            ExecutionFailed?.Invoke(this, $"Windows could not execute {command.Command}: {ex.Message}");
        }
    }

    // [Command Actions]
    private void AutoLock() { LockSession(); }
    private void CancelAutoLock() {}

    private void AutoLogout() { LogoutSession(); }
    private void CancelAutoLogout() {}

    private void ForceLock() { LockSession(); }
    private void CancelForceLock() {}

    private void ForceLogout() { LogoutSession(); }
    private void CancelForceLogout() {}

}
