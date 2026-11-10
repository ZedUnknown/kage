using System.Text.Json;

namespace KAGE_Client.Services;

public static class ConnectionTest {
    public static bool TryCreateReply(string json, string hubId, string pcId, DateTimeOffset now, out string? payload) {
        payload = null;
        if (json.Length > 8192) return false;

        try {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return false;

            // Connection probes share the command topic but must never start a countdown.
            if (!root.TryGetProperty("type", out var type)
                || type.ValueKind != JsonValueKind.String || type.GetString() != "connection_test") return false;

            if (!root.TryGetProperty("request_id", out var requestId)
                || requestId.ValueKind != JsonValueKind.String || !Guid.TryParseExact(requestId.GetString(), "D", out _)) return false;

            if (!root.TryGetProperty("hub_id", out var hub)
                || hub.ValueKind != JsonValueKind.String || hub.GetString() != hubId) return false;

            if (!root.TryGetProperty("pc_id", out var pc)
                || pc.ValueKind != JsonValueKind.String || pc.GetString() != pcId) return false;

            // Reply only to a fresh challenge for this exact Hub and PC.
            if (!root.TryGetProperty("expires_at", out var expires)
                || expires.ValueKind != JsonValueKind.String || !expires.TryGetDateTimeOffset(out var deadline)
                || deadline <= now || deadline > now.AddSeconds(15)) return false;

            payload = JsonSerializer.Serialize(new {
                action = "connection_test_reply",
                request_id = requestId.GetString(),
                reply_to = $"kage/client/{hubId}/{pcId}/response",
                data = new { hub_id = hubId, pc_id = pcId }
            });

            return true;
        }
        catch (JsonException) {
            return false;
        }
    }
}
