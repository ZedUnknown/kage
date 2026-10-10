using System.Net.Http;
using System.Text.Json;

namespace KAGE_Client.Services;

public class Api {
    private static readonly HttpClient _httpClient = new() {
        Timeout = TimeSpan.FromSeconds(5)
    };

    public string API_BASE_URL { get; }

    // Constructor
    public Api(string serverAddress) {
        API_BASE_URL = serverAddress.TrimEnd('/') + "/kage";
    }

    public virtual async Task<KAGELockResponse?> apiFetch(string endpoint, HttpMethod method, object? body = null, CancellationToken cancellationToken = default) {
        string url = $"{API_BASE_URL}/{endpoint.TrimStart('/')}";

        using HttpRequestMessage request = new(method, url);

        if (body != null) {
            string jsonBody = JsonSerializer.Serialize(body);
            request.Content = new StringContent(jsonBody, System.Text.Encoding.UTF8, "application/json");
        }

        using HttpResponseMessage response = await _httpClient.SendAsync(request, cancellationToken);

        response.EnsureSuccessStatusCode();

        string jsonResponse = await response.Content.ReadAsStringAsync(cancellationToken);

        KAGELockResponse? result = JsonSerializer.Deserialize<KAGELockResponse>(
            jsonResponse,
            new JsonSerializerOptions {
                PropertyNameCaseInsensitive = true
            }
        );

        return result;

    }
}

public class KAGELockResponse {
    public JsonElement data { get; set; }
    public KAGELockResponseDetail? detail { get; set; }
}

public class KAGELockResponseDetail {
    public string? code { get; set; }
    public string? message { get; set; }
}
