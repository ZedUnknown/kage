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
            if (config.ServerAddress == null || config.ServerAddress.Trim() == "") {
                // If the server address is not configured, show the setup window
                SetupWindow setupWindow = new SetupWindow();
                setupWindow.Show();
                return;
            }
            // If the config exists, show the main application window
            MainWindow mainWindow = new MainWindow(config);
            mainWindow.Show();
        }
    }
}