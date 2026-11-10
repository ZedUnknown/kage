using System.IO;
using System.Security.Authentication;
using System.Security.Cryptography;
using MQTTnet;

namespace KAGE_Client.Services;

public sealed class MqttSetupRequiredException : IOException {
    public MqttSetupRequiredException(string message) : base(message) { }

    public static MqttSetupRequiredException? FromConnectResult(MqttClientConnectResultCode code) => code switch {
        MqttClientConnectResultCode.BadUserNameOrPassword => new("The broker rejected the saved MQTT username or password. Enter the current Client credentials to set up this PC again."),
        MqttClientConnectResultCode.NotAuthorized or MqttClientConnectResultCode.Banned
            or MqttClientConnectResultCode.BadAuthenticationMethod => new("The broker denied access for this Client. Check its credentials and broker permissions, then connect again."),
        _ => null
    };

    public static MqttSetupRequiredException? FromDisconnectReason(MqttClientDisconnectReason reason) => reason switch {
        MqttClientDisconnectReason.NotAuthorized or MqttClientDisconnectReason.BadAuthenticationMethod =>
            new("The broker revoked access for this Client. Check its credentials and broker permissions, then connect again."),
        _ => null
    };

    public static MqttSetupRequiredException? FromTlsFailure(Exception error) {
        for (Exception? current = error; current != null; current = current.InnerException) {
            if (current is AuthenticationException or CryptographicException)
                return new("The broker certificate could not be verified. Check the hostname and CA certificate in setup.");
        }
        return null;
    }
}
