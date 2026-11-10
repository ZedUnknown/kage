using KAGE_Client.Models;

namespace KAGE_Client.Services;

public static class MqttAddress {
    public static bool TryCreate(string address, string port, bool useTls, out MqttConfig config) {
        config = new();
        string host = address.Trim();
        if (host.StartsWith('[') && host.EndsWith(']')) host = host[1..^1];
        if (!int.TryParse(port.Trim(), System.Globalization.NumberStyles.None,
            System.Globalization.CultureInfo.InvariantCulture, out int portNumber)) return false;
        config.Address = host;
        config.Port = portNumber;
        config.UseTls = useTls;
        return IsValid(config);
    }

    public static bool TryParse(string address, out MqttConfig config) {
        config = new();
        if (!Uri.TryCreate(address.Trim(), UriKind.Absolute, out Uri? uri)
            || (uri.Scheme != "mqtt" && uri.Scheme != "mqtts")
            || string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)
            || (uri.AbsolutePath != "" && uri.AbsolutePath != "/")) return false;
        config.Address = uri.IdnHost;
        config.UseTls = uri.Scheme == "mqtts";
        config.Port = uri.Port == -1 ? (config.UseTls ? 8883 : 1883) : uri.Port;
        return IsValid(config);
    }

    public static bool IsValid(MqttConfig? config) => config != null
        && Uri.CheckHostName(config.Address) != UriHostNameType.Unknown
        && config.Port is > 0 and <= 65535;

    public static bool IsTopicId(string? id) => !string.IsNullOrWhiteSpace(id)
        && id.IndexOfAny(['/', '+', '#', '\0']) < 0;

    public static string Format(MqttConfig config) =>
        new UriBuilder(config.UseTls ? "mqtts" : "mqtt", config.Address, config.Port).Uri.GetLeftPart(UriPartial.Authority);
}
