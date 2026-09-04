using AltGridLib;
using AltGridLib.LLM;
using AltGridLib.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Collections.ObjectModel;
using System.Windows.Input;

namespace AltGrid;

public class MainViewModel
{
  private readonly ILlmService _llmService;
  private readonly ILogger<MainViewModel> _logger;
  private readonly AltGridOptions _options;

  private string _userMessage = string.Empty;
  private string _chatResponse = string.Empty;
  private string _streamingResponse = string.Empty;
  private string _statusText = "Ready";
  private bool _canSendChat = true;

  public MainViewModel(
      ILlmService llmService,
      ILogger<MainViewModel> logger,
      IOptions<AltGridOptions> options)
  {
    _llmService = llmService;
    _logger = logger;
    _options = options.Value;

    GetModelsCommand = new RelayCommand(async () => await GetModelsAsync());
    SendChatCommand = new RelayCommand(async () => await SendChatAsync(), () => CanSendChat);
    StreamChatCommand = new RelayCommand(async () => await StreamChatAsync(), () => CanSendChat);

    Models = new ObservableCollection<ModelInfo>();
  }

  // Properties for UI binding
  public string LlamaServerUrl
  {
    get => _options.LlamaServerUrl;
    set
    {
      _options.LlamaServerUrl = value;
      OnPropertyChanged(nameof(LlamaServerUrl));
    }
  }

  public string UserMessage
  {
    get => _userMessage;
    set
    {
      _userMessage = value;
      OnPropertyChanged(nameof(UserMessage));
      ((RelayCommand)SendChatCommand).RaiseCanExecuteChanged();
      ((RelayCommand)StreamChatCommand).RaiseCanExecuteChanged();
    }
  }

  public string ChatResponse
  {
    get => _chatResponse;
    set
    {
      _chatResponse = value;
      OnPropertyChanged(nameof(ChatResponse));
    }
  }

  public string StreamingResponse
  {
    get => _streamingResponse;
    set
    {
      _streamingResponse = value;
      OnPropertyChanged(nameof(StreamingResponse));
    }
  }

  public string StatusText
  {
    get => _statusText;
    set
    {
      _statusText = value;
      OnPropertyChanged(nameof(StatusText));
      OnPropertyChanged(nameof(StatusColor));
    }
  }

  public bool CanSendChat
  {
    get => _canSendChat;
    set
    {
      _canSendChat = value;
      OnPropertyChanged(nameof(CanSendChat));
      ((RelayCommand)SendChatCommand).RaiseCanExecuteChanged();
      ((RelayCommand)StreamChatCommand).RaiseCanExecuteChanged();
    }
  }

  public object StatusColor => StatusText == "Healthy" ? "#4CAF50" :
                                StatusText == "Error" ? "#F44336" : "#2196F3";

  public ObservableCollection<ModelInfo> Models { get; }

  // Commands
  public ICommand GetModelsCommand { get; }
  public ICommand SendChatCommand { get; }
  public ICommand StreamChatCommand { get; }

  // Event for property changes (simplified INotifyPropertyChanged)
  public event Action<string>? PropertyChanged;

  protected void OnPropertyChanged(string propertyName)
  {
    PropertyChanged?.Invoke(propertyName);
  }

  // Methods
  private async Task GetModelsAsync()
  {
    try
    {
      StatusText = "Fetching models...";
      Models.Clear();

      var models = await _llmService.GetModelsAsync();

      foreach (var model in models)
      {
        Models.Add(model);
      }

      StatusText = $"Found {models.Count} model(s)";
      _logger.LogInformation("Retrieved {Count} models from llama-server", models.Count);
    }
    catch (Exception ex)
    {
      StatusText = "Error: " + ex.Message;
      _logger.LogError(ex, "Failed to get models");
    }
  }

  private async Task SendChatAsync()
  {
    if (string.IsNullOrWhiteSpace(UserMessage))
      return;

    try
    {
      CanSendChat = false;
      StatusText = "Sending chat request...";
      ChatResponse = string.Empty;

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

      if (response.Choices.Length > 0)
      {
        ChatResponse = response.Choices[0].Message.Content;
      }

      StatusText = "Response received";
      _logger.LogInformation("Received chat response with {Tokens} tokens",
          response.Usage?.TotalTokens ?? 0);
    }
    catch (Exception ex)
    {
      StatusText = "Error: " + ex.Message;
      ChatResponse = "Error: " + ex.Message;
      _logger.LogError(ex, "Chat request failed");
    }
    finally
    {
      CanSendChat = true;
    }
  }

  private async Task StreamChatAsync()
  {
    if (string.IsNullOrWhiteSpace(UserMessage))
      return;

    try
    {
      CanSendChat = false;
      StatusText = "Streaming...";
      StreamingResponse = string.Empty;

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

      await foreach (var chunk in _llmService.ChatStreamAsync(request))
      {
        if (chunk.Choices.Length > 0 && chunk.Choices[0].Delta.Content != null)
        {
          StreamingResponse += chunk.Choices[0].Delta.Content;
          OnPropertyChanged(nameof(StreamingResponse));
        }
      }

      StatusText = "Streaming complete";
      _logger.LogInformation("Streaming chat completed");
    }
    catch (Exception ex)
    {
      StatusText = "Error: " + ex.Message;
      StreamingResponse = "Error: " + ex.Message;
      _logger.LogError(ex, "Streaming chat failed");
    }
    finally
    {
      CanSendChat = true;
    }
  }
}

// Simple RelayCommand implementation (no external dependencies)
public class RelayCommand : ICommand
{
  private readonly Func<Task> _execute;
  private readonly Func<bool>? _canExecute;

  public RelayCommand(Func<Task> execute, Func<bool>? canExecute = null)
  {
    _execute = execute;
    _canExecute = canExecute;
  }

  public event EventHandler? CanExecuteChanged;

  public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;

  public async void Execute(object? parameter) => await _execute();

  public void RaiseCanExecuteChanged()
  {
    CanExecuteChanged?.Invoke(this, EventArgs.Empty);
  }
}
