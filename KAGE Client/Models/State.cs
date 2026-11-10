using System.Text.Json.Serialization;

namespace KAGE_Client.Models;

// JsonPropertyName maps a JSON field such as "hub" to its C# property, Hub.
public class ClientStateData {
    [JsonPropertyName("policies")]
    public ClientPolicyState? Policies { get; set; }

    [JsonPropertyName("protocol_version")]
    public int ProtocolVersion { get; set; }

    [JsonPropertyName("command_version")]
    public long CommandVersion { get; set; }

    [JsonPropertyName("active_command")]
    public ClientCommandData? ActiveCommand { get; set; }

    [JsonPropertyName("server_time_utc")]
    public DateTimeOffset? ServerTimeUtc { get; set; }

    [JsonPropertyName("hub")]
    public HubState Hub { get; set; } = new();

    [JsonPropertyName("pc")]
    public PcState Pc { get; set; } = new();

    [JsonPropertyName("assignment")]
    public AssignmentState Assignment { get; set; } = new();

    [JsonPropertyName("chair")]
    public ChairState? Chair { get; set; }

    [JsonPropertyName("sensor")]
    public SensorState? Sensor { get; set; }
}

public class ClientPolicyState {
    [JsonPropertyName("enforcement_version")]
    public int EnforcementVersion { get; set; }

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; } = "auto_lock";

    [JsonPropertyName("delay_seconds")]
    public int DelaySeconds { get; set; }

    [JsonPropertyName("allow_extension")]
    public bool AllowExtension { get; set; }

    [JsonPropertyName("extension_duration_seconds")]
    public int ExtensionDurationSeconds { get; set; }

    [JsonPropertyName("maximum_extensions")]
    public int MaximumExtensions { get; set; }

    [JsonPropertyName("inactivity_monitoring_enabled")]
    public bool InactivityMonitoringEnabled { get; set; }

    [JsonPropertyName("inactivity_timeout_seconds")]
    public int InactivityTimeoutSeconds { get; set; }

    [JsonPropertyName("confirmation_timeout_seconds")]
    public int ConfirmationTimeoutSeconds { get; set; }

    [JsonPropertyName("activity_supported")]
    public bool ActivitySupported { get; set; }
}


public class HubState {
    [JsonPropertyName("hub_id")]
    public string HubId { get; set; } = "";

    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("last_seen")]
    public string LastSeen { get; set; } = "";
}


public class PcState {
    [JsonPropertyName("pc_id")]
    public string PcId { get; set; } = "";
}


public class AssignmentState {
    [JsonPropertyName("assigned")]
    public bool Assigned { get; set; }

    [JsonPropertyName("chair_id")]
    public string? ChairId { get; set; }
}


public class ChairState {
    [JsonPropertyName("chair_id")]
    public string ChairId { get; set; } = "";

    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("occupied")]
    public bool Occupied { get; set; }

    [JsonPropertyName("last_seen")]
    public string LastSeen { get; set; } = "";
}


public class SensorState {
    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("state")]
    public string State { get; set; } = "";
}
