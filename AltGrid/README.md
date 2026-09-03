# AltGrid - .NET 10 + Avalonia Demo Application

This is a cross-platform desktop application demonstrating how to use the **AltGridLib** library with an Avalonia UI on .NET 10.

## Project Structure

```
/workspace/
├── AltGrid/                    # Avalonia Desktop Application
│   ├── AltGrid.csproj          # Project file (.NET 10, Avalonia 11.2.5)
│   ├── Program.cs              # Application entry point with DI setup
│   ├── App.axaml               # Application XAML
│   ├── App.axaml.cs            # Application code-behind
│   ├── MainWindow.axaml        # Main window UI definition
│   ├── MainWindow.axaml.cs     # Main window code-behind
│   ├── MainViewModel.cs        # ViewModel demonstrating AltGridLib usage
│   └── README.md               # This file
│
└── AltGridLib/                 # Class Library
    ├── src/
    │   ├── AltGridLib.csproj   # Library project (.NET 10)
    │   ├── Core/
    │   │   └── AltGridOptions.cs    # Configuration & DI extensions
    │   ├── LLM/
    │   │   └── LlmService.cs        # LLM service for llama-server
    │   ├── Models/
    │   │   └── ChatModels.cs        # Chat request/response models
    │   ├── Pro/
    │   │   └── ProFeatures.cs       # Pro feature interfaces (stubs)
    │   ├── Utils/
    │   │   └── Encryption.cs        # Encryption utilities
    │   └── Connectors/
    │       └── Connectors.cs        # Connector interfaces
    └── tests/
        └── AltGridLib.Tests.csproj  # Test project (.NET 10)
```

## Migration to .NET 10

Both projects have been migrated from .NET 8 to .NET 10:

### AltGridLib.csproj
```xml
<TargetFramework>net10.0</TargetFramework>
```

### AltGridLib.Tests.csproj
```xml
<TargetFramework>net10.0</TargetFramework>
```

### AltGrid.csproj (Avalonia App)
```xml
<TargetFramework>net10.0</TargetFramework>
```

## How to Use AltGridLib Features

### 1. Dependency Injection Setup

In your application startup (see `Program.cs`):

```csharp
using Microsoft.Extensions.DependencyInjection;
using AltGridLib;

var services = new ServiceCollection();

// Register AltGrid services
services.AddAltGrid(options =>
{
    options.LlamaServerUrl = "http://127.0.0.1:8439";
    options.GatewayPort = 7878;
    options.EnableVerboseLogging = true;
});

// Add logging
services.AddLogging(builder =>
{
    builder.SetMinimumLevel(LogLevel.Debug);
    builder.AddConsole();
});

var serviceProvider = services.BuildServiceProvider();
```

### 2. Using the LLM Service

The `ILlmService` provides methods to interact with llama-server:

#### Get Available Models
```csharp
using AltGridLib.LLM;

public class MyService
{
    private readonly ILlmService _llmService;

    public MyService(ILlmService llmService)
    {
        _llmService = llmService;
    }

    public async Task ListModelsAsync()
    {
        var models = await _llmService.GetModelsAsync();
        
        foreach (var model in models)
        {
            Console.WriteLine($"Model: {model.Name}");
        }
    }
}
```

#### Send a Chat Request (Non-Streaming)
```csharp
using AltGridLib.Models;

public async Task<string> SendMessageAsync(string userMessage)
{
    var request = new ChatRequest
    {
        Model = "default",
        Messages = new[]
        {
            new ChatMessage("system", "You are a helpful assistant."),
            new ChatMessage("user", userMessage)
        },
        Temperature = 0.7f,
        MaxTokens = 500
    };

    var response = await _llmService.ChatAsync(request);
    
    return response.Choices[0].Message.Content;
}
```

#### Stream Chat Response
```csharp
public async IAsyncEnumerable<string> StreamMessageAsync(string userMessage)
{
    var request = new ChatRequest
    {
        Model = "default",
        Messages = new[]
        {
            new ChatMessage("system", "You are a helpful assistant."),
            new ChatMessage("user", userMessage)
        },
        Temperature = 0.7f,
        Stream = true
    };

    await foreach (var chunk in _llmService.ChatStreamAsync(request))
    {
        if (chunk.Choices.Length > 0 && chunk.Choices[0].Delta.Content != null)
        {
            yield return chunk.Choices[0].Delta.Content;
        }
    }
}
```

#### Check Server Health
```csharp
public async Task<bool> IsServerHealthyAsync()
{
    return await _llmService.IsHealthyAsync();
}
```

### 3. Complete Example in ViewModel

See `MainViewModel.cs` for a complete MVVM implementation:

```csharp
public class MainViewModel
{
    private readonly ILlmService _llmService;
    private readonly ILogger<MainViewModel> _logger;

    public MainViewModel(
        ILlmService llmService,
        ILogger<MainViewModel> logger)
    {
        _llmService = llmService;
        _logger = logger;
    }

    // Commands and properties for UI binding...
    
    private async Task SendChatAsync()
    {
        var request = new ChatRequest
        {
            Model = "default",
            Messages = new[]
            {
                new ChatMessage("system", "You are a helpful assistant."),
                new ChatMessage("user", UserMessage)
            },
            Temperature = 0.7f,
            MaxTokens = 500
        };

        var response = await _llmService.ChatAsync(request);
        ChatResponse = response.Choices[0].Message.Content;
    }
}
```

## Key Features Demonstrated

1. **Dependency Injection**: Using Microsoft.Extensions.DependencyInjection
2. **Configuration Options**: Strongly-typed options pattern with `AltGridOptions`
3. **LLM Service**: Complete chat API with streaming support
4. **MVVM Pattern**: Clean separation of concerns in the UI layer
5. **Cross-Platform**: Runs on Windows, macOS, and Linux via Avalonia

## Building and Running

### Prerequisites
- .NET 10 SDK
- llama-server running on http://127.0.0.1:8439 (for full functionality)

### Build
```bash
cd /workspace/AltGrid
dotnet build
```

### Run
```bash
dotnet run
```

## Testing AltGridLib

Run the unit tests:

```bash
cd /workspace/AltGridLib/tests
dotnet test
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  AltGrid (Avalonia)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  MainWindow │  │    App      │  │MainViewModel│ │
│  │  (.axaml)   │  │  (.axaml)   │  │    (.cs)    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │        │
│         └────────────────┼────────────────┘        │
│                          │                         │
│         ┌────────────────▼────────────────┐        │
│         │    IServiceProvider (DI)        │        │
│         └────────────────┬────────────────┘        │
└──────────────────────────┼─────────────────────────┘
                           │
                           │ References
                           ▼
┌─────────────────────────────────────────────────────┐
│              AltGridLib (Class Library)             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │    Core     │  │     LLM     │  │   Models    │ │
│  │  (Options)  │  │  (Service)  │  │  (Classes)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                      │
│  Communicates with llama-server via HTTP REST API   │
└─────────────────────────────────────────────────────┘
```

## License

AGPL-3.0-or-later
