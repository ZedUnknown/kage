using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KAGE_Client.Models;

namespace KAGE_Client.Services;

// Persist before invoking Windows. An interrupted execution is never retried automatically.
public sealed class CommandJournal : IDisposable {
    public sealed class Entry {
        public ClientCommandData Command { get; set; } = new();
        public string Fingerprint { get; set; } = "";
        public string Status { get; set; } = "received";
        public string Message { get; set; } = "";
        public bool Pending { get; set; } = true;
        public string ReportId { get; set; } = Guid.NewGuid().ToString("N");
    }

    public sealed class Document {
        public long Version { get; set; }
        public Dictionary<string, Entry> Entries { get; set; } = new();
        public List<Entry> Reports { get; set; } = new();
    }

    private readonly string? _path;
    private readonly object _gate = new();
    private readonly Document _document;
    private readonly FileStream? _lease;
    public long Version {
        get {
            lock (_gate) return _document.Version;
        }
    }

    public CommandJournal(string? path) {
        _path = path;
        if (path != null) {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            _lease = new FileStream(path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        }

        try {
            // A damaged journal fails closed instead of silently discarding replay history.
            _document = path != null && File.Exists(path)
                ? JsonSerializer.Deserialize<Document>(File.ReadAllText(path)) ?? throw new IOException("Invalid command journal.")
                : new();
            foreach (Entry entry in _document.Entries.Values.Where(e => e.Status == "executing")) {
                entry.Status = "failed";
                entry.Message = "Execution interrupted. Windows outcome is unknown. Automatic replay was blocked.";
                entry.Pending = true;
                Enqueue(entry);
            }

            Save();
        }
        catch {
            _lease?.Dispose();
            throw;
        }
    }

    public static string PathFor(ClientConfig config) {
        string identity = $"{MqttAddress.Format(config.Mqtt)}|{config.Mqtt.Username}|{config.HubId}|{config.PcId}";
        string hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)));
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KAGE_Client", $"commands-{hash}.json");
    }

    public static bool IsValid(ClientCommandData c, DateTimeOffset now) =>
        c.ProtocolVersion == 1 && !string.IsNullOrWhiteSpace(c.Command)
        && Guid.TryParse(c.CommandId, out _) && c.Version is > 0 and <= 9007199254740991
        && c.ServerTimeUtc.HasValue && c.ServerTimeUtc <= now.AddSeconds(30)
        && c.DeadlineUtc.HasValue && c.ExpiresAtUtc > now
        && c.ExpiresAtUtc >= c.DeadlineUtc && c.ExpiresAtUtc <= now.AddDays(1)
        && c.Command.Trim().ToLowerInvariant() is "auto_lock" or "auto_logout" or "force_lock" or "force_logout"
            or "cancel_auto_lock" or "cancel_auto_logout" or "cancel_force_lock" or "cancel_force_logout";

    private static string Fingerprint(ClientCommandData command) {
        var copy = JsonSerializer.Deserialize<ClientCommandData>(JsonSerializer.Serialize(command))!;
        copy.ServerTimeUtc = null; // Refreshed by the server on authoritative recovery.
        return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(copy)));
    }

    public bool Receive(ClientCommandData command, bool alreadyActive) {
        lock (_gate) {
            string fingerprint = Fingerprint(command);
            if (command.Version < _document.Version) return false;

            if (_document.Entries.TryGetValue(command.CommandId, out Entry? old)) {
                // A duplicate resends its report without restarting an active or completed command.
                old.Pending = true;
                Enqueue(old);
                Save();
                return old.Fingerprint == fingerprint && old.Status == "received" && !alreadyActive;
            }

            if (command.Version == _document.Version) return false;

            _document.Version = command.Version;
            var entry = new Entry { Command = command, Fingerprint = fingerprint };
            _document.Entries.Add(command.CommandId, entry);
            Enqueue(entry);

            // Old versions can never run again, even after their entries are pruned.
            foreach (string id in _document.Entries
                .Where(e => !e.Value.Pending && e.Value.Command.ExpiresAtUtc < DateTimeOffset.UtcNow.AddDays(-1))
                .Select(e => e.Key).ToArray()) {
                _document.Entries.Remove(id);
            }

            Save();
            return true;
        }
    }

    public void Advance(long version) {
        lock (_gate) {
            foreach (var entry in _document.Entries.Values.Where(e => e.Command.Version <= version && e.Status == "received")) {
                entry.Status = "cancelled";
                entry.Message = "Authoritative recovery cleared the operation.";
                entry.Pending = true;
                Enqueue(entry);
            }

            _document.Version = Math.Max(version, _document.Version);
            Save();
        }
    }

    public void Report(ClientCommandData command, string status, string message = "") {
        lock (_gate) {
            if (!_document.Entries.TryGetValue(command.CommandId, out Entry? entry)) return;

            entry.Status = status;
            entry.Message = message;
            entry.Pending = true;
            Enqueue(entry);
            Save();
        }
    }

    public Entry[] Pending() {
        lock (_gate) {
            // The publisher gets snapshots so later status changes cannot alter an in-flight report.
            return _document.Reports
                .Select(e => JsonSerializer.Deserialize<Entry>(JsonSerializer.Serialize(e))!)
                .ToArray();
        }
    }

    public void Acknowledge(Entry report) {
        lock (_gate) {
            _document.Reports.RemoveAll(e => e.ReportId == report.ReportId);
            if (_document.Entries.TryGetValue(report.Command.CommandId, out Entry? entry)) {
                entry.Pending = _document.Reports.Any(e => e.Command.CommandId == report.Command.CommandId);
            }

            Save();
        }
    }

    private void Enqueue(Entry entry) {
        if (_document.Reports.Any(e => e.Command.CommandId == entry.Command.CommandId && e.Status == entry.Status && e.Message == entry.Message)) return;

        var report = JsonSerializer.Deserialize<Entry>(JsonSerializer.Serialize(entry))!;
        report.ReportId = Guid.NewGuid().ToString("N");
        _document.Reports.Add(report);
    }

    public void Dispose() => _lease?.Dispose();

    private void Save() {
        if (_path == null) return;

        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        string temporary = _path + ".tmp";
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) {
            JsonSerializer.Serialize(stream, _document);
            // Flush the replacement before moving it over the previous replay history.
            stream.Flush(true);
        }
        File.Move(temporary, _path, true);
    }
}
