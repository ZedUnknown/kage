using System.Text.Json.Serialization;

namespace KAGE_Client.Models;


public class ClientCommandData
{
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("extension_duration_seconds")]
    public int ExtensionDurationSeconds { get; set; } = 300;

    [JsonPropertyName("command_id")]
    public string CommandId { get; set; } = "";

    [JsonPropertyName("version")]
    public long Version { get; set; }

    [JsonPropertyName("protocol_version")]
    public int ProtocolVersion { get; set; }

    [JsonPropertyName("expires_at_utc")]
    public DateTimeOffset? ExpiresAtUtc { get; set; }

    [JsonPropertyName("target_command_id")]
    public string? TargetCommandId { get; set; }

    [JsonPropertyName("target_deadline_utc")]
    public DateTimeOffset? TargetDeadlineUtc { get; set; }

    [JsonPropertyName("command")]
    public string Command { get; set; } = "";

    [JsonPropertyName("priority")]
    public int Priority { get; set; }

    [JsonPropertyName("deadline_utc")]
    public DateTimeOffset? DeadlineUtc { get; set; }

    [JsonPropertyName("server_time_utc")]
    public DateTimeOffset? ServerTimeUtc { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("extension_active")]
    public bool ExtensionActive { get; set; }

    [JsonPropertyName("allow_extension")]
    public bool? AllowExtension { get; set; }

    [JsonPropertyName("allow_cancellation")]
    public bool? AllowCancellation { get; set; }
}
