using System.Text.Json.Serialization;

namespace KAGE_Client.Models;


public class ClientCommandData
{
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
