namespace AltGridLib;

using AltGridLib.LLM;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Extension methods for setting up AltGrid services in DI container
/// </summary>
public static class AltGridServiceCollectionExtensions
{
  /// <summary>
  /// Adds AltGrid services to the service collection
  /// </summary>
  public static IServiceCollection AddAltGrid(
      this IServiceCollection services,
      Action<AltGridOptions>? configureOptions = null)
  {
    // Register options
    services.AddOptions<AltGridOptions>()
        .Configure(configureOptions ?? (_ => { }));

    // Register LLM service
    services.AddSingleton<ILlmService, LlmService>();

    // TODO: Register other services when implemented
    // services.AddSingleton<IModelManager, ModelManager>();
    // services.AddSingleton<IMemoryService, MemoryService>();
    // services.AddSingleton<IEntityService, EntityService>();

    return services;
  }
}

/// <summary>
/// Configuration options for AltGrid library
/// </summary>
public class AltGridOptions
{
  /// <summary>
  /// URL of the llama-server instance (default: http://127.0.0.1:8439)
  /// </summary>
  public string LlamaServerUrl { get; set; } = "http://127.0.0.1:8439";

  /// <summary>
  /// Port for the local gateway server (default: 7878)
  /// </summary>
  public int GatewayPort { get; set; } = 7878;

  /// <summary>
  /// Bind host for gateway server (default: 0.0.0.0 for all interfaces)
  /// </summary>
  public string GatewayBindHost { get; set; } = "0.0.0.0";

  /// <summary>
  /// Path to local data directory for models, databases, etc.
  /// </summary>
  public string DataDirectory { get; set; } =
      Path.Combine(
          Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
          "AltGrid");

  /// <summary>
  /// Enable verbose logging
  /// </summary>
  public bool EnableVerboseLogging { get; set; } = false;
}
