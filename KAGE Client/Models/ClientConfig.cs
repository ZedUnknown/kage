namespace KAGE_Client.Models;

public class ClientConfig {
    public string ServerAddress { get; set; } = "";
    public string HubId { get; set; } = "";
    public string PcId { get; set; } = "";

    // null until a chair has been assigned
    public string? ChairId { get; set; }

    // to be implemented in the future :)
    public string? DeviceToken { get; set; }
}