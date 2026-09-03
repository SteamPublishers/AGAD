# Alternative Grid Library (AltGridLib)

A cross-platform .NET library for local AI model orchestration, rebuilt from the ground up in pure .NET 8.

## 🎯 Project Goals

- **Pure .NET Implementation**: No Electron, no Node.js - just clean C# code
- **Cross-Platform**: Build once, run on Windows, Linux, and macOS
- **LLM Orchestration**: HTTP-based communication with existing `llama-server` instances
- **Modular Architecture**: Core library + optional Pro features
- **UI-Agnostic**: No UI dependencies - designed to be called by Avalonia, WPF, MAUI, or any other UI framework

## 📦 Structure

```
AltGridLib/
├── src/
│   ├── AltGridLib.csproj          # Main project file
│   ├── Core/                      # Core services (Model management, settings)
│   ├── Models/                    # Data models and DTOs
│   ├── LLM/                       # LLM orchestration (HTTP client for llama-server)
│   ├── Connectors/                # Third-party integrations (stub for now)
│   ├── Pro/                       # Pro features (Replay, Meetings, Memory, etc.)
│   └── Utils/                     # Utilities (encryption, compression, etc.)
├── tests/                         # Unit tests (future)
└── README.md                      # This file
```

## 🚀 Features

### Core (Community Version)
- ✅ Model catalog management (list, search, activate)
- ✅ LLM chat completion (streaming & non-streaming)
- ✅ OpenAI-compatible API client for llama-server
- ✅ Local SQLite storage for settings and metadata
- ✅ Cross-platform compatibility

### Pro Features (Planned)
- 🔄 **REPLAY**: Screen capture and activity timeline
- 🔄 **MEETINGS**: Audio recording and transcription orchestration
- 🔄 **TO-DOS**: Task extraction and management
- 🔄 **MEMORY**: Semantic search with vector embeddings
- 🔄 **ENTITIES**: Automatic entity extraction (people, projects, companies)
- 🔄 **DAY**: Unified daily activity feed
- 🔄 **VAULT**: Encrypted data storage

## 🔧 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Your UI App    │────▶│   AltGridLib     │────▶│  llama-server   │
│  (Avalonia/etc) │◀────│   (.NET 8 Lib)   │◀────│  (port 8439)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  SQLite Local   │
                        │  Database       │
                        └─────────────────┘
```

## 📋 Migration Plan from OffGrid (TypeScript → .NET)

### Phase 1: Foundation (Week 1-2)
- [x] Project structure setup
- [ ] Core models translation (ModelInfo, ModelCatalog, ChatMessage, etc.)
- [ ] HTTP client for llama-server (replace `llm.ts`)
- [ ] Settings management

### Phase 2: Model Management (Week 3-4)
- [ ] Model catalog logic (translate `models-manager.ts`)
- [ ] GGUF metadata parsing
- [ ] Model download/orchestration (HTTP-only, assume llama-server running)
- [ ] Model activation/deactivation

### Phase 3: Advanced Features (Week 5-8)
- [ ] RAG pipeline (chunking, embeddings, vector search)
- [ ] Entity extraction pipeline
- [ ] Todo extraction from conversations
- [ ] Conversation history management

### Phase 4: Pro Features (Week 9-16)
- [ ] REPLAY: Screen capture integration (platform-specific)
- [ ] MEETINGS: Audio recording + Whisper CLI orchestration
- [ ] MEMORY: Vector database with sqlite-vec
- [ ] ENTITIES: NLP pipeline for entity resolution
- [ ] DAY: Unified feed aggregation
- [ ] VAULT: Encryption layer (AES-256-GCM)

### Phase 5: Connectors (Week 17-20)
- [ ] OAuth2 flow implementation
- [ ] Gmail connector
- [ ] Google Calendar connector
- [ ] Slack connector
- [ ] GitHub connector

## 🔌 Usage Example

```csharp
using AltGridLib;
using AltGridLib.LLM;
using AltGridLib.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

// Setup dependency injection
var services = new ServiceCollection();
services.AddLogging(builder => builder.AddConsole());
services.AddAltGrid(options =>
{
    options.LlamaServerUrl = "http://127.0.0.1:8439";
    options.GatewayPort = 7878;
});

var serviceProvider = services.BuildServiceProvider();

// Get LLM service
var llmService = serviceProvider.GetRequiredService<ILlmService>();

// Chat with streaming
await foreach (var chunk in llmService.ChatStreamAsync(new ChatRequest
{
    Model = "llama-3.2-3b-instruct",
    Messages = new[]
    {
        new ChatMessage("system", "You are a helpful assistant."),
        new ChatMessage("user", "Hello, how are you?")
    }
}))
{
    Console.Write(chunk.Content);
}
```

## 🛠️ Building

### Prerequisites
- .NET 8 SDK or later
- Git

### Build Commands
```bash
# Build for current platform
dotnet build src/AltGridLib.csproj

# Build for all platforms
dotnet build src/AltGridLib.csproj -r win-x64
dotnet build src/AltGridLib.csproj -r linux-x64
dotnet build src/AltGridLib.csproj -r osx-x64
dotnet build src/AltGridLib.csproj -r osx-arm64

# Run tests (when available)
dotnet test
```

## 📄 License

AGPL-3.0-or-later (same as Off Grid community version)

## 🤝 Contributing

This is a community-driven reimplementation. Contributions welcome!

## 🔗 References

- Original Off Grid project: https://github.com/offgridnetwork/offgrid
- llama.cpp: https://github.com/ggerganov/llama.cpp
- .NET Documentation: https://learn.microsoft.com/dotnet/
