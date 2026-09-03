namespace AltGridLib.Pro;

using Microsoft.Extensions.Logging;

/// <summary>
/// Interface for Pro features activation
/// Translated from pro/main.ts activateMain() signature
/// </summary>
public interface IProFeatures
{
  /// <summary>
  /// Activate all Pro features
  /// </summary>
  /// <param name="context">Pro activation context with required services</param>
  Task ActivateAsync(ProActivationContext context);

  /// <summary>
  /// Deactivate Pro features
  /// </summary>
  Task DeactivateAsync();
}

/// <summary>
/// Context provided to Pro features during activation
/// </summary>
public class ProActivationContext
{
  /// <summary>
  /// Service provider for resolving dependencies
  /// </summary>
  public IServiceProvider Services { get; set; } = default!;

  /// <summary>
  /// Logger factory for creating loggers
  /// </summary>
  public ILoggerFactory LoggerFactory { get; set; } = default!;

  /// <summary>
  /// Data directory for storing Pro feature data
  /// </summary>
  public string DataDirectory { get; set; } = default!;

  /// <summary>
  /// Callback when entitlement status changes
  /// </summary>
  public Action<bool>? OnEntitlementChanged { get; set; }
}

/// <summary>
/// Stub implementation - placeholder until Pro features are implemented
/// This mirrors the proStub.ts behavior in the TypeScript version
/// </summary>
public class ProFeaturesStub : IProFeatures
{
  private readonly ILogger<ProFeaturesStub>? _logger;

  public ProFeaturesStub(ILogger<ProFeaturesStub>? logger = null)
  {
    _logger = logger;
  }

  public Task ActivateAsync(ProActivationContext context)
  {
    _logger?.LogInformation("Pro features stub activated (no-op). Pro submodule not available.");
    return Task.CompletedTask;
  }

  public Task DeactivateAsync()
  {
    _logger?.LogInformation("Pro features stub deactivated (no-op)");
    return Task.CompletedTask;
  }
}

/// <summary>
/// REPLAY feature - Screen capture and activity timeline
/// TODO: Implement when migrating from pro/src/main/features/replay/
/// </summary>
public interface IReplayService
{
  Task StartCaptureAsync(TimeSpan interval, CancellationToken cancellationToken = default);
  Task StopCaptureAsync();
  IAsyncEnumerable<ActivityEvent> GetTimelineAsync(DateTime start, DateTime end);
  Task<DaySummary> SummarizeDayAsync(DateTime date);
}

/// <summary>
/// MEETINGS feature - Audio recording and transcription
/// TODO: Implement when migrating from pro/src/main/features/meetings/
/// </summary>
public interface IMeetingsService
{
  Task<MeetingRecording> StartRecordingAsync(string title);
  Task StopRecordingAsync(string meetingId);
  Task<MeetingTranscript> GetTranscriptAsync(string meetingId);
  Task<MeetingSummary> SummarizeMeetingAsync(string meetingId);
}

/// <summary>
/// MEMORY feature - Semantic search with vector embeddings
/// TODO: Implement when migrating from pro/src/main/features/memory/
/// </summary>
public interface IMemoryService
{
  Task StoreMemoryAsync(string content, MemoryMetadata? metadata = null);
  IAsyncEnumerable<MemoryResult> SearchMemoriesAsync(string query, int limit = 10);
  Task DeleteMemoryAsync(string memoryId);
}

/// <summary>
/// ENTITIES feature - Automatic entity extraction
/// TODO: Implement when migrating from pro/src/main/features/entities/
/// </summary>
public interface IEntityService
{
  Task<IEnumerable<Entity>> ExtractEntitiesAsync(string text);
  Task<Entity?> GetEntityAsync(string entityId);
  Task<IEnumerable<Entity>> SearchEntitiesAsync(string query, string? type = null);
  Task LinkEntitiesAsync(string entityId1, string entityId2, string relationship);
}

/// <summary>
/// Placeholder models for Pro features
/// </summary>
public class ActivityEvent
{
  public DateTime Timestamp { get; set; }
  public string Type { get; set; } = string.Empty; // "screenshot", "app_switch", "window_change"
  public string? AppName { get; set; }
  public string? WindowTitle { get; set; }
  public byte[]? ScreenshotData { get; set; }
  public IDictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>();
}

public class DaySummary
{
  public DateTime Date { get; set; }
  public string Summary { get; set; } = string.Empty;
  public int TotalActivities { get; set; }
  public IEnumerable<ActivityEvent> Highlights { get; set; } = Array.Empty<ActivityEvent>();
}

public class MeetingRecording
{
  public string Id { get; set; } = Guid.NewGuid().ToString("N");
  public string Title { get; set; } = string.Empty;
  public DateTime StartTime { get; set; } = DateTime.UtcNow;
  public string? FilePath { get; set; }
}

public class MeetingTranscript
{
  public string MeetingId { get; set; } = string.Empty;
  public string Transcript { get; set; } = string.Empty;
  public TimeSpan Duration { get; set; }
  public IEnumerable<TranscriptSegment> Segments { get; set; } = Array.Empty<TranscriptSegment>();
}

public class TranscriptSegment
{
  public TimeSpan Start { get; set; }
  public TimeSpan End { get; set; }
  public string Text { get; set; } = string.Empty;
  public float Confidence { get; set; }
}

public class MeetingSummary
{
  public string MeetingId { get; set; } = string.Empty;
  public string Summary { get; set; } = string.Empty;
  public IEnumerable<string> ActionItems { get; set; } = Array.Empty<string>();
  public IEnumerable<string> Participants { get; set; } = Array.Empty<string>();
}

public class MemoryResult
{
  public string Id { get; set; } = string.Empty;
  public string Content { get; set; } = string.Empty;
  public float Score { get; set; }
  public DateTime CreatedAt { get; set; }
  public MemoryMetadata? Metadata { get; set; }
}

public class MemoryMetadata
{
  public string? Source { get; set; }
  public string[]? Tags { get; set; }
  public IDictionary<string, object> Extra { get; set; } = new Dictionary<string, object>();
}

public class Entity
{
  public string Id { get; set; } = string.Empty;
  public string Name { get; set; } = string.Empty;
  public string Type { get; set; } = string.Empty; // "person", "project", "company"
  public string? Description { get; set; }
  public DateTime CreatedAt { get; set; }
  public IEnumerable<string> Aliases { get; set; } = Array.Empty<string>();
  public IDictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>();
}
