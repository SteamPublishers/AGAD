namespace AltGridLib.Models;

/// <summary>
/// Represents a single chat message in a conversation
/// </summary>
public class ChatMessage
{
  public string Role { get; set; } = "user"; // "system", "user", "assistant"
  public string Content { get; set; } = string.Empty;

  public ChatMessage() { }

  public ChatMessage(string role, string content)
  {
    Role = role;
    Content = content;
  }
}

/// <summary>
/// Request object for chat completion
/// </summary>
public class ChatRequest
{
  public string Model { get; set; } = string.Empty;
  public IList<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
  public float Temperature { get; set; } = 0.7f;
  public int MaxTokens { get; set; } = -1; // -1 means unlimited
  public bool Stream { get; set; } = false;
  public ChatCompletionOptions? Options { get; set; }
}

/// <summary>
/// Additional options for chat completion
/// </summary>
public class ChatCompletionOptions
{
  public float TopP { get; set; } = 0.9f;
  public int TopK { get; set; } = 40;
  public float RepeatPenalty { get; set; } = 1.1f;
  public int RepeatLastN { get; set; } = 64;
}

/// <summary>
/// Response from chat completion (non-streaming)
/// </summary>
public class ChatResponse
{
  public string Id { get; set; } = Guid.NewGuid().ToString("N");
  public string Object { get; set; } = "chat.completion";
  public long Created { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  public string Model { get; set; } = string.Empty;
  public ChatChoice[] Choices { get; set; } = Array.Empty<ChatChoice>();
  public UsageInfo? Usage { get; set; }
}

/// <summary>
/// A single choice in chat response
/// </summary>
public class ChatChoice
{
  public int Index { get; set; }
  public ChatMessage Message { get; set; } = new();
  public string FinishReason { get; set; } = "stop";
}

/// <summary>
/// Streaming chunk from chat completion
/// </summary>
public class ChatChunk
{
  public string Id { get; set; } = Guid.NewGuid().ToString("N");
  public string Object { get; set; } = "chat.completion.chunk";
  public long Created { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  public string Model { get; set; } = string.Empty;
  public ChatChunkChoice[] Choices { get; set; } = Array.Empty<ChatChunkChoice>();
}

/// <summary>
/// A single choice in streaming chunk
/// </summary>
public class ChatChunkChoice
{
  public int Index { get; set; }
  public ChatChunkDelta Delta { get; set; } = new();
  public string? FinishReason { get; set; }
}

/// <summary>
/// Delta content in streaming chunk
/// </summary>
public class ChatChunkDelta
{
  public string? Role { get; set; }
  public string? Content { get; set; }
}

/// <summary>
/// Token usage information
/// </summary>
public class UsageInfo
{
  public int PromptTokens { get; set; }
  public int CompletionTokens { get; set; }
  public int TotalTokens { get; set; }
}
