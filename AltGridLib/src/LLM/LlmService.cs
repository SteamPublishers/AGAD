namespace AltGridLib.LLM;

using AltGridLib.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Net.Http;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

/// <summary>
/// Interface for LLM service operations
/// </summary>
public interface ILlmService
{
  /// <summary>
  /// Get list of available models from llama-server
  /// </summary>
  Task<IList<ModelInfo>> GetModelsAsync(CancellationToken cancellationToken = default);

  /// <summary>
  /// Send chat request and get complete response
  /// </summary>
  Task<ChatResponse> ChatAsync(ChatRequest request, CancellationToken cancellationToken = default);

  /// <summary>
  /// Send chat request and stream response chunks
  /// </summary>
  IAsyncEnumerable<ChatChunk> ChatStreamAsync(ChatRequest request, CancellationToken cancellationToken = default);

  /// <summary>
  /// Check if llama-server is healthy and responsive
  /// </summary>
  Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Configuration options for LLM service
/// </summary>
public class LlmServiceOptions
{
  public string LlamaServerUrl { get; set; } = "http://127.0.0.1:8439";
  public int TimeoutSeconds { get; set; } = 300; // 5 minutes for long completions
  public int MaxRetries { get; set; } = 3;
}

/// <summary>
/// Implementation of LLM service that communicates with llama-server via HTTP
/// Translated from src/main/llm.ts
/// </summary>
public class LlmService : ILlmService
{
  private readonly HttpClient _httpClient;
  private readonly LlmServiceOptions _options;
  private readonly ILogger<LlmService>? _logger;
  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNameCaseInsensitive = true,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
  };

  public LlmService(
      IOptions<LlmServiceOptions> options,
      ILogger<LlmService>? logger = null)
  {
    _options = options.Value;
    _logger = logger;

    _httpClient = new HttpClient
    {
      BaseAddress = new Uri(_options.LlamaServerUrl),
      Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds)
    };
    _httpClient.DefaultRequestHeaders.Add("Accept", "application/json");
  }

  public async Task<IList<ModelInfo>> GetModelsAsync(CancellationToken cancellationToken = default)
  {
    try
    {
      var response = await _httpClient.GetAsync("/v1/models", cancellationToken);
      response.EnsureSuccessStatusCode();

      var apiResponse = await response.Content.ReadFromJsonAsync<ModelsApiResponse>(JsonOptions, cancellationToken);

      return apiResponse?.Data?
          .Select(m => new ModelInfo
          {
            Id = m.Id,
            Name = m.Id,
            IsDownloaded = true,
            IsActive = true
          })
          .ToList() ?? new List<ModelInfo>();
    }
    catch (Exception ex)
    {
      _logger?.LogError(ex, "Failed to fetch models from llama-server");
      throw new LlmException("Failed to fetch models", ex);
    }
  }

  public async Task<ChatResponse> ChatAsync(ChatRequest request, CancellationToken cancellationToken = default)
  {
    request.Stream = false;

    using var content = new StringContent(
        JsonSerializer.Serialize(request, JsonOptions),
        Encoding.UTF8,
        "application/json");

    var response = await _httpClient.PostAsync("/v1/chat/completions", content, cancellationToken);
    response.EnsureSuccessStatusCode();

    var chatResponse = await response.Content.ReadFromJsonAsync<ChatResponse>(JsonOptions, cancellationToken)
        ?? throw new LlmException("Empty response from llama-server");

    return chatResponse;
  }

  public async IAsyncEnumerable<ChatChunk> ChatStreamAsync(
      ChatRequest request,
      [EnumeratorCancellation] CancellationToken cancellationToken = default)
  {
    request.Stream = true;

    using var content = new StringContent(
        JsonSerializer.Serialize(request, JsonOptions),
        Encoding.UTF8,
        "application/json");

    using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "/v1/chat/completions")
    {
      Content = content
    };

    using var response = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    response.EnsureSuccessStatusCode();

    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
    using var reader = new StreamReader(stream);

    while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
    {
      var line = await reader.ReadLineAsync(cancellationToken);

      if (string.IsNullOrEmpty(line))
        continue;

      if (!line.StartsWith("data: "))
        continue;

      var data = line["data: ".Length..].Trim();

      if (data == "[DONE]")
        break;

      var chunk = DeserializeChatChunk(data);
      if (chunk != null)
      {
        yield return chunk;
      }
    }
  }

  private ChatChunk? DeserializeChatChunk(string? data)
  {
    if (data == null) return null;

    try
    {
      var chunk = JsonSerializer.Deserialize<ChatChunk>(data, JsonOptions);
      if (chunk != null)
      {
        return chunk;
      }
    }
    catch (JsonException ex)
    {
      _logger?.LogWarning(ex, "Failed to parse streaming chunk: {Data}", data);
    }
    return null;
  }

  public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default)
  {
    try
    {
      var response = await _httpClient.GetAsync("/health", cancellationToken);
      return response.IsSuccessStatusCode;
    }
    catch
    {
      return false;
    }
  }
}

/// <summary>
/// Internal model for API response
/// </summary>
internal class ModelsApiResponse
{
  public string Object { get; set; } = string.Empty;
  public ModelData[] Data { get; set; } = Array.Empty<ModelData>();
}

internal class ModelData
{
  public string Id { get; set; } = string.Empty;
  public string Object { get; set; } = string.Empty;
  public long Created { get; set; }
  public string OwnedBy { get; set; } = string.Empty;
}

/// <summary>
/// Exception thrown when LLM operations fail
/// </summary>
public class LlmException : Exception
{
  public LlmException(string message) : base(message) { }
  public LlmException(string message, Exception innerException) : base(message, innerException) { }
}
