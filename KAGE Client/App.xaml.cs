using KAGE_Client.Models;
using KAGE_Client.Services;
using System.Windows;
using KAGE_Client.Views;

namespace KAGE_Client;

public partial class App : Application {

    private async void Application_Startup(object sender, StartupEventArgs e) {
        // Load the client configuration
        ClientConfig? config = await ConfigService.LoadAsync();

        if (config == null) {
            // If the config doesn't exist, show the setup window
            SetupWindow setupWindow = new SetupWindow();
            setupWindow.Show();
        } else {
            if (config.RequiresSetup || !MqttAddress.IsValid(config.Mqtt) || !MqttAddress.IsTopicId(config.HubId) || !MqttAddress.IsTopicId(config.PcId)) {
                // MQTT configuration is the only connection required at startup.
                SetupWindow setupWindow = new SetupWindow(config.Mqtt, config.RequiresSetup
                    ? "The saved Client connection needs setup again. Check its credentials and broker permissions." : null);
                setupWindow.Show();
                return;
            }
            // If the config exists, show the main application window
            MainWindow mainWindow = new MainWindow(config);
            mainWindow.Show();
        }
    }
}
