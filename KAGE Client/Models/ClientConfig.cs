namespace KAGE_Client.Models;

public class ClientConfig {

    public int ConfigVersion { get; set; } = 1;

    public string ServerAddress { get; set; } = "";
    public string HubId { get; set; } = "";
    public string PcId { get; set; } = "";

    // null until a chair has been assigned
    public string? ChairId { get; set; }

    // MQTT configuration
    public MqttConfig Mqtt { get; set; } = new();
}


public class MqttConfig {

    public string Address { get; set; } = "";
    public int Port { get; set; } = 8883;
    public bool UseTls { get; set; } = true;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}