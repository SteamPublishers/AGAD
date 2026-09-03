using AltGridLib.LLM;
using AltGridLib.Models;
using System.Net;
using System.Text.Json;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;
using Xunit;

namespace AltGridLib.Tests;

/// <summary>
/// Tests for LlmService - the core orchestration layer that communicates with llama-server
/// These tests verify HTTP contract compatibility without requiring actual Ollama instance
/// </summary>
public class LlmServiceTests : IAsyncLifetime
{
  private readonly WireMockServer _wireMockServer;
  private readonly HttpClient _httpClient;
  private readonly LlmService _llmService;

  public LlmServiceTests()
  {
    _wireMockServer = WireMockServer.StartWithAdminInterface();

    _httpClient = new HttpClient
    {
      BaseAddress = new Uri(_wireMockServer.Urls[0])
    };


    var options = Microsoft.Extensions.Options.Options.Create(new LlmServiceOptions
    {
      LlamaServerUrl = _wireMockServer.Urls[0]
    });

    _llmService = new LlmService(options);

  }

  private Task InitializeAsync() => Task.CompletedTask;

  private async Task DisposeAsync()
  {
    _httpClient.Dispose();
    _wireMockServer.Stop();
  }

  [Fact]
  public async Task ChatCompletion_NonStreaming_ReturnsCorrectResponse()
  {
    // Arrange

    _wireMockServer
        .Given(Request.Create()
            .WithPath("/v1/chat/completions")
            .UsingPost())

    //        .WithBody(new JsonMatcher(TestFixtures.ChatCompletionResponse, true)))
        .RespondWith(Response.Create()
            .WithStatusCode(HttpStatusCode.OK)
            .WithBody(TestFixtures.ChatCompletionResponse));

    var requestModel = new ChatRequest
    {
      Model = "llama-3.2-3b-instruct",
      Messages = new List<ChatMessage>
            {
                new ChatMessage { Role = "user", Content = "Hello!" }
            },
      Stream = false
    };

    var response = await _llmService.ChatAsync(requestModel, CancellationToken.None);

    // Assert
    Assert.NotNull(response);
    Assert.Equal("chatcmpl-8f9a7b2c", response.Id);
    Assert.Equal("llama-3.2-3b-instruct", response.Model);
    Assert.Single(response.Choices);
    Assert.Equal("assistant", response.Choices[0].Message.Role);
    Assert.Contains("Hello!", response.Choices[0].Message.Content);
    Assert.Equal(53, response.Usage!.TotalTokens);
  }

  [Fact]
  public async Task ChatCompletion_Streaming_YieldsChunksCorrectly()
  {
    // Arrange
    var requestModel = new ChatRequest
    {
      Model = "llama-3.2-3b-instruct",
      Messages = new List<ChatMessage>
            {
                new ChatMessage { Role = "user", Content = "Hi" }
            },
      Stream = true
    };

    _wireMockServer
        .Given(Request.Create()
            .WithPath("/v1/chat/completions")
            .UsingPost())
        .RespondWith(Response.Create()
            .WithStatusCode(HttpStatusCode.OK)
            .WithHeader("Content-Type", "text/event-stream")
            .WithBody(TestFixtures.ChatChunkResponse));

    // Act
    var chunks = new List<ChatChunk>();
    await foreach (var chunk in _llmService.ChatStreamAsync(requestModel, CancellationToken.None))
    {
      chunks.Add(chunk);
    }

    // Assert
    Assert.NotEmpty(chunks);
    Assert.True(chunks.Count >= 4, $"Expected at least 4 chunks, got {chunks.Count}");

    // Verify first chunk has role
    var firstChunk = chunks.First(c => c.Choices.Any(ch => ch.Delta?.Role != null));
    Assert.Equal("assistant", firstChunk.Choices.First().Delta?.Role);

    // Verify content chunks exist
    var contentChunks = chunks.Where(c => c.Choices.Any(ch => ch.Delta?.Content != null)).ToList();
    Assert.NotEmpty(contentChunks);
    Assert.Contains("Hello", string.Join("", contentChunks.SelectMany(c => c.Choices.Select(ch => ch.Delta?.Content))));
  }

  [Fact]
  public async Task ChatCompletion_Handles503Error()
  {
    // Arrange
    var requestModel = new ChatRequest
    {
      Model = "llama-3.2-3b-instruct",
      Messages = new List<ChatMessage>
            {
                new ChatMessage { Role = "user", Content = "Test" }
            },
      Stream = false
    };

    _wireMockServer
        .Given(Request.Create()
            .WithPath("/v1/chat/completions")
            .UsingPost())
        .RespondWith(Response.Create()
            .WithStatusCode(HttpStatusCode.ServiceUnavailable)
            .WithBody(TestFixtures.ErrorResponse503));
    // Act & Assert
    var exception = await Assert.ThrowsAnyAsync<Exception>(async () =>
        await _llmService.ChatAsync(requestModel, CancellationToken.None));

    Assert.Contains("503", exception.Message, StringComparison.OrdinalIgnoreCase);
  }

  [Fact]
  public async Task ChatCompletion_Handles404Error()
  {
    // Arrange
    var requestModel = new ChatRequest
    {
      Model = "nonexistent-model",
      Messages = new List<ChatMessage>
            {
                new ChatMessage { Role = "user", Content = "Test" }
            },
      Stream = false
    };

    _wireMockServer
        .Given(Request.Create()
            .WithPath("/v1/chat/completions")
            .UsingPost())
        .RespondWith(Response.Create()
            .WithStatusCode(HttpStatusCode.NotFound)
            .WithBody(TestFixtures.ErrorResponse404));

    // Act & Assert

    var exception = await Assert.ThrowsAnyAsync<Exception>(async () =>
        await _llmService.ChatAsync(requestModel, CancellationToken.None));

    Assert.Contains("not found", exception.Message, StringComparison.OrdinalIgnoreCase);
  }

  [Fact]
  public async Task GetModels_ReturnsModelList()
  {
    // Arrange
    _wireMockServer
        .Given(Request.Create()
            .WithPath("/v1/models")
            .UsingGet())
        .RespondWith(Response.Create()
            .WithStatusCode(HttpStatusCode.OK)
            .WithBody(TestFixtures.ModelsListResponse));

    // Act
    var models = await _llmService.GetModelsAsync(CancellationToken.None);

    // Assert
    Assert.NotNull(models);
    Assert.Equal(2, models.Count);
    Assert.Contains(models, m => m.Id == "llama-3.2-3b-instruct");
    Assert.Contains(models, m => m.Id == "mistral-7b-instruct-v0.3");
  }

  [Fact]
  public void ChatRequest_SerializesCorrectly()
  {
    // Arrange
    var request = new ChatRequest
    {
      Model = "test-model",
      Messages = new List<ChatMessage>
            {
                new ChatMessage { Role = "system", Content = "You are helpful" },
                new ChatMessage { Role = "user", Content = "Hello" }
            },
      Temperature = 0.7f,
      MaxTokens = 100,
      Stream = false
    };

    // Act
    var json = JsonSerializer.Serialize(request);
    var deserialized = JsonSerializer.Deserialize<ChatRequest>(json);

    // Assert
    Assert.NotNull(deserialized);
    Assert.Equal("test-model", deserialized.Model);
    Assert.Equal(2, deserialized.Messages.Count);
    Assert.Equal("system", deserialized.Messages[0].Role);
    Assert.Equal(0.7f, deserialized.Temperature);
    Assert.Equal(100, deserialized.MaxTokens);
  }

  ValueTask IAsyncLifetime.InitializeAsync()
  {
    return new ValueTask(InitializeAsync());
  }

  ValueTask IAsyncDisposable.DisposeAsync()
  {
    return new ValueTask(DisposeAsync());
  }
}
