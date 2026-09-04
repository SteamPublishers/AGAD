using AltGridLib;
using Avalonia;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace AltGrid;

class Program
{
  [STAThread]
  public static void Main(string[] args)
  {
    // Setup dependency injection
    var services = new ServiceCollection();
    ConfigureServices(services);
    var serviceProvider = services.BuildServiceProvider();

    // Build and run the app
    BuildAvaloniaApp(serviceProvider).StartWithClassicDesktopLifetime(args);
  }

  private static void ConfigureServices(IServiceCollection services)
  {
    // Register AltGrid library services
    services.AddAltGrid(options =>
    {
      options.LlamaServerUrl = "http://127.0.0.1:8439";
      options.GatewayPort = 7878;
      options.EnableVerboseLogging = true;
    });

    // Register logging
    services.AddLogging(builder =>
    {
      builder.SetMinimumLevel(LogLevel.Debug);
      builder.AddConsole();
    });

    // Register views and viewmodels
    services.AddSingleton<MainViewModel>();
    services.AddSingleton<MainWindow>();
  }

  // Avalonia configuration, don't remove; also used by visual designer.
  public static AppBuilder BuildAvaloniaApp(IServiceProvider serviceProvider)
      => AppBuilder.Configure<App>(() => new App(serviceProvider))
          .UsePlatformDetect()
          .WithInterFont()
          .LogToTrace();
}
