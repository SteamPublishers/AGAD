namespace AltGridLib.Models;

/// <summary>
/// Represents information about an AI model
/// </summary>
public class ModelInfo
{
  public string Id { get; set; } = string.Empty;
  public string Name { get; set; } = string.Empty;
  public string? Kind { get; set; } // "text", "vision", "image", "voice", "transcription"
  public string? Source { get; set; } // "catalog", "downloaded", "imported"
  public bool IsDownloaded { get; set; }
  public bool IsActive { get; set; }
  public long? SizeBytes { get; set; }
  public string? Path { get; set; }
  public string? HuggingFaceId { get; set; }
  public DateTime? DownloadedAt { get; set; }
  public IDictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>();
}

/// <summary>
/// Catalog response containing available models
/// </summary>
public class ModelCatalog
{
  public string[] Kinds { get; set; } = Array.Empty<string>();
  public ModelInfo[] Models { get; set; } = Array.Empty<ModelInfo>();
}

/// <summary>
/// Search parameters for finding models
/// </summary>
public class ModelSearchQuery
{
  public string Query { get; set; } = string.Empty;
  public string? Kind { get; set; }
  public int Limit { get; set; } = 30;
}

/// <summary>
/// Model download progress
/// </summary>
public class DownloadProgress
{
  public string ModelId { get; set; } = string.Empty;
  public long TotalBytes { get; set; }
  public long DownloadedBytes { get; set; }
  public double Percentage => TotalBytes > 0 ? (double)DownloadedBytes / TotalBytes * 100 : 0;
  public string Status { get; set; } = "pending"; // "pending", "downloading", "completed", "failed"
  public string? Error { get; set; }
}
