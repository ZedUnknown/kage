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

    private static readonly int CurrentConfigVersion = 2;

    static ConfigService() {
        Trace.WriteLine($"AppData path: {appDataPath}");
    }

    public static void Initialize() { }

    public static async Task SaveAsync(ClientConfig config) {
        config.ConfigVersion = CurrentConfigVersion;
        Directory.CreateDirectory(configDirectory);
        string json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(ConfigPath,json);
    }

    public static async Task<ClientConfig?> LoadAsync() {
        if (!File.Exists(ConfigPath))
            return null;

        try {
            string json = await File.ReadAllTextAsync(ConfigPath);
            ClientConfig? config = JsonSerializer.Deserialize<ClientConfig>(json);

            if (config == null) {
                Trace.WriteLine("Failed to deserialize config.");
                return null;
            }

            if (config.ConfigVersion != CurrentConfigVersion) {
                Trace.WriteLine($"Config version {config.ConfigVersion} is older than current version {CurrentConfigVersion}. Deleting old config.");
                Delete();
                return null;
            }

            return config;
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