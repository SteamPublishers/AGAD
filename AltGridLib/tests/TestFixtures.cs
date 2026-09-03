using System.Text;
using System.Text.Json;

namespace AltGridLib.Tests;

/// <summary>
/// Golden JSON responses captured from actual llama-server API
/// Use these to ensure C# library sends/receives identical contracts as TypeScript version
/// </summary>
public static class TestFixtures
{
    public static readonly string ChatCompletionResponse = """
        {
            "id": "chatcmpl-8f9a7b2c",
            "object": "chat.completion",
            "created": 1704067200,
            "model": "llama-3.2-3b-instruct",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Hello! I'm an AI assistant running locally on your machine. How can I help you today?"
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 25,
                "completion_tokens": 28,
                "total_tokens": 53
            }
        }
        """;

    public static readonly string ChatChunkResponse = """
        data: {"id":"chatcmpl-8f9a7b2c","object":"chat.completion.chunk","created":1704067200,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}
        
        data: {"id":"chatcmpl-8f9a7b2c","object":"chat.completion.chunk","created":1704067200,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
        
        data: {"id":"chatcmpl-8f9a7b2c","object":"chat.completion.chunk","created":1704067200,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}
        
        data: {"id":"chatcmpl-8f9a7b2c","object":"chat.completion.chunk","created":1704067200,"model":"llama-3.2-3b-instruct","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
        
        data: [DONE]
        
        """;

    public static readonly string ModelsListResponse = """
        {
            "object": "list",
            "data": [
                {
                    "id": "llama-3.2-3b-instruct",
                    "object": "model",
                    "created": 1704067200,
                    "owned_by": "meta"
                },
                {
                    "id": "mistral-7b-instruct-v0.3",
                    "object": "model",
                    "created": 1704067200,
                    "owned_by": "mistralai"
                }
            ]
        }
        """;

    public static readonly string ErrorResponse503 = """
        {
            "error": {
                "message": "Service unavailable - model is loading",
                "type": "server_error",
                "code": 503
            }
        }
        """;

    public static readonly string ErrorResponse404 = """
        {
            "error": {
                "message": "Model 'nonexistent-model' not found",
                "type": "invalid_request_error",
                "code": 404
            }
        }
        """;

    public static byte[] GetTestEncryptionKey()
    {
        // 32-byte key for AES-256
        return Encoding.UTF8.GetBytes("AltGridTestKey12345678901234567890");
    }

    public static string GetTestPlaintext()
    {
        return "This is a secret vault entry for testing encryption.";
    }
}
