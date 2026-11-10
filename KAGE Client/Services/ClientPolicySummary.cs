using KAGE_Client.Models;

namespace KAGE_Client.Services;

public sealed record ClientPolicyRow(string Name, string Description, string Status, bool IsReady);

public sealed record ClientPolicySummary(IReadOnlyList<ClientPolicyRow> Policies, string Message, bool HasSnapshot = false) {
    public string CountLabel => HasSnapshot ? $"{Policies.Count} enabled" : "Not synced";

    public static ClientPolicySummary Create(ClientStateData? state, bool connected) {
        if (state?.Policies?.EnforcementVersion != 1) {
            return new(Array.Empty<ClientPolicyRow>(), connected
                ? "Policy data unavailable. Restart or update the KAGE MQTT worker."
                : "Waiting for server policy data.");
        }

        ClientPolicyState policy = state.Policies;
        List<ClientPolicyRow> rows = new();
        string action = policy.Action == "auto_logout" ? "Logout" : "Lock";

        if (policy.Enabled) {
            bool ready = state.Assignment.Assigned && state.Hub.Online && state.Sensor?.Online == true;
            string status;
            if (!state.Assignment.Assigned) {
                status = "Needs chair assignment";
            } else {
                status = ready ? "Active" : "Waiting for presence";
            }

            rows.Add(new("Chair presence", $"{action} after {policy.DelaySeconds} seconds when your assigned chair is empty.",
                connected ? status : "Last known", connected && ready));
        }

        if (policy.InactivityMonitoringEnabled) {
            string status;
            if (!connected) {
                status = "Last known";
            } else {
                status = policy.ActivitySupported ? "Enabled" : "Client update required";
            }

            rows.Add(new("Inactivity", $"Prompt after {policy.InactivityTimeoutSeconds} seconds without keyboard or mouse input. "
                + $"{action} if you do not confirm within {policy.ConfirmationTimeoutSeconds} seconds.",
                status, connected && policy.ActivitySupported));
        }

        if (policy.AllowExtension) {
            bool ready = policy.Enabled || (policy.InactivityMonitoringEnabled && policy.ActivitySupported);
            string status;
            if (!connected) {
                status = "Last known";
            } else {
                status = ready ? "Available" : "Needs automatic policy";
            }

            rows.Add(new("Countdown extensions", $"Add {policy.ExtensionDurationSeconds} seconds, up to {policy.MaximumExtensions} "
                + (policy.MaximumExtensions == 1 ? "extension per countdown." : "extensions per countdown."),
                status, connected && ready));
        }

        // A disconnected snapshot describes saved settings, not current enforcement.
        string message;
        if (!connected) {
            message = "Disconnected. Showing the last received policies.";
        } else if (rows.Count == 0) {
            message = "No policies are enabled for this workstation.";
        } else {
            message = "Settings received from your KAGE server. Changes refresh automatically.";
        }

        return new(rows, message, true);
    }
}
