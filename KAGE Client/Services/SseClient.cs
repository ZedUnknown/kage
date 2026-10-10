using KAGE_Client.Models;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;

namespace KAGE_Client.Services;


public class SseClient {
    private readonly HttpClient _httpClient = new();

    public async Task ListenAsync(
        string serverAddress,
        string hubId,
        string pcId,
        Action<ClientStateData> onStateReceived,
        Action<ClientCommandData> onCommandReceived,
        CancellationToken cancellationToken)
    {
        string url =
            $"{serverAddress}/kage/client/stream" +
            $"?hub_id={Uri.EscapeDataString(hubId)}" +
            $"&pc_id={Uri.EscapeDataString(pcId)}";

        Trace.WriteLine($"Connecting SSE: {url}");

        using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, url);

        using HttpResponseMessage response =
            await _httpClient.SendAsync(
                request,

                // IMPORTANT ¯\_(ツ)_/¯
                HttpCompletionOption.ResponseHeadersRead,

                cancellationToken
            );


        response.EnsureSuccessStatusCode();

        Trace.WriteLine("SSE connected");


        using Stream stream = await response.Content.ReadAsStreamAsync(cancellationToken);

        using StreamReader reader = new StreamReader(stream);

        string? eventName = null;


        while (!cancellationToken.IsCancellationRequested) {
            string? line = await reader.ReadLineAsync(cancellationToken);

            // Server disconnected
            if (line == null) break;


            Trace.WriteLine($"SSE: {line}");

            // : keepalive
            if (line.StartsWith(":")) continue;


            // event: state
            if (line.StartsWith("event:")) {
                eventName = line["event:".Length..].Trim();
                continue;
            }


            // data: {...}
            if (line.StartsWith("data:")) {
                string json = line["data:".Length..].Trim();

                // Handle state events
                if (eventName == "state") {
                    ClientStateData? state = JsonSerializer.Deserialize<ClientStateData>(
                        json, new JsonSerializerOptions {
                            PropertyNameCaseInsensitive = true
                        }
                    );

                    if (state != null) {
                        onStateReceived(state);
                    }
                }

                // Handle command events
                else if (eventName == "command") {
                    ClientCommandData? command = JsonSerializer.Deserialize<ClientCommandData>(
                        json, new JsonSerializerOptions {
                            PropertyNameCaseInsensitive = true
                        }
                    );

                    if (command != null) {
                        onCommandReceived(command);
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(line)) {
                eventName = null;
            }
        }
    }
}