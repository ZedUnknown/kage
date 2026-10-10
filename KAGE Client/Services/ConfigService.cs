using KAGE_Client.Models;
using System.Diagnostics;
using System.IO;
using System.Text.Json;

namespace KAGE_Client.Services;

public static class ConfigService {

    // AppData path for the current user to store the config file
    private static readonly string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    private static readonly string configDirectory = Path.Combine(appDataPath, "KAGE_Client");
    private static readonly string ConfigPath = Path.Combine(configDirectory,"client.json");

    static ConfigService() {
        Trace.WriteLine($"AppData path: {appDataPath}");
    }

    public static void Initialize() { }

    public static async Task SaveAsync(ClientConfig config) {
        Directory.CreateDirectory(configDirectory );

        string json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(ConfigPath,json);
    }

    public static async Task<ClientConfig?> LoadAsync() {
        if (!File.Exists(ConfigPath))
            return null;

        try {
            string json = await File.ReadAllTextAsync(ConfigPath);

            return JsonSerializer.Deserialize<ClientConfig>(json);
        }
        catch (Exception ex) {
            Console.WriteLine($"Error loading config: {ex.Message}");
            return null;
        }
    }

    public static void Delete() {
        if (File.Exists(ConfigPath)) File.Delete(ConfigPath);
    }
}