using System.Text.Json.Serialization;

namespace KAGE_Client.Models;

/*
[JsonPropertyName("hub")]
public HubState Hub { get; set; } = new();

When the JSON contains a property called "hub", put its value into the C# property "Hub".
*/
public class ClientStateData {
    [JsonPropertyName("hub")]
    public HubState Hub { get; set; } = new();

    [JsonPropertyName("pc")]
    public PcState Pc { get; set; } = new();

    [JsonPropertyName("assignment")]
    public AssignmentState Assignment { get; set; } = new();

    [JsonPropertyName("chair")]
    public ChairState? Chair { get; set; }

    [JsonPropertyName("sensor")]
    public SensorState? Sensor { get; set; }
}


public class HubState {
    [JsonPropertyName("hub_id")]
    public string HubId { get; set; } = "";

    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("last_seen")]
    public string LastSeen { get; set; } = "";
}


public class PcState {
    [JsonPropertyName("pc_id")]
    public string PcId { get; set; } = "";
}


public class AssignmentState {
    [JsonPropertyName("assigned")]
    public bool Assigned { get; set; }

    [JsonPropertyName("chair_id")]
    public string? ChairId { get; set; }
}


public class ChairState {
    [JsonPropertyName("chair_id")]
    public string ChairId { get; set; } = "";

    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("occupied")]
    public bool Occupied { get; set; }

    [JsonPropertyName("last_seen")]
    public string LastSeen { get; set; } = "";
}


public class SensorState {
    [JsonPropertyName("online")]
    public bool Online { get; set; }

    [JsonPropertyName("state")]
    public string State { get; set; } = "";
}