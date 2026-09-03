namespace AltGridLib.Utils;

using System.Security.Cryptography;
using System.Text;

/// <summary>
/// Encryption utilities for VAULT feature
/// Translated from Off Grid's encryption logic
/// </summary>
public static class EncryptionHelper
{
  private const int KeySize = 256;
  private const int IvSize = 128;
  private const int SaltSize = 32;
  private const int Iterations = 100000;

  /// <summary>
  /// Encrypt data using AES-256-GCM
  /// </summary>
  public static byte[] Encrypt(byte[] plainData, string password)
  {

    // Generate random salt and IV
    var salt = RandomNumberGenerator.GetBytes(SaltSize);
    var iv = RandomNumberGenerator.GetBytes(IvSize / 8);
    var tag = new byte[16]; // GCM tag size

    // Derive key from password using PBKDF2

    var key = Rfc2898DeriveBytes.Pbkdf2(
        password,
        salt,
        Iterations,
        HashAlgorithmName.SHA256,
        32 // 256 bits for AES-256
    );

    using var aes = new AesGcm(key, 16);
    // Encrypt
    var cipherData = new byte[plainData.Length];
    aes.Encrypt(iv, plainData, cipherData, tag);

    // Combine salt + iv + tag + encrypted data
    var result = new byte[SaltSize + iv.Length + tag.Length + cipherData.Length];
    Buffer.BlockCopy(salt, 0, result, 0, SaltSize);
    Buffer.BlockCopy(iv, 0, result, SaltSize, iv.Length);
    Buffer.BlockCopy(tag, 0, result, SaltSize + iv.Length, tag.Length);
    Buffer.BlockCopy(cipherData, 0, result, SaltSize + iv.Length + tag.Length, cipherData.Length);

    return result;
  }

  /// <summary>
  /// Decrypt data using AES-256-GCM
  /// </summary>
  public static byte[] Decrypt(byte[] encryptedData, string password)
  {
    // Extract components
    var salt = new byte[SaltSize];
    var iv = new byte[IvSize / 8];
    var tag = new byte[16];

    Buffer.BlockCopy(encryptedData, 0, salt, 0, SaltSize);
    Buffer.BlockCopy(encryptedData, SaltSize, iv, 0, iv.Length);
    Buffer.BlockCopy(encryptedData, SaltSize + iv.Length, tag, 0, tag.Length);

    var cipherData = new byte[encryptedData.Length - SaltSize - iv.Length - tag.Length];
    Buffer.BlockCopy(encryptedData, SaltSize + iv.Length + tag.Length, cipherData, 0, cipherData.Length);

    // Derive key from password
    //using var deriveBytes = new Rfc2898DeriveBytes(password, salt, Iterations, HashAlgorithmName.SHA256);
    //var key = deriveBytes.GetBytes(KeySize / 8);

    var key = Rfc2898DeriveBytes.Pbkdf2(
        password,
        salt,
        Iterations,
        HashAlgorithmName.SHA256,
        32 // 256 bits for AES-256
    );

    using var aes = new AesGcm(key, 16);
    // Decrypt
    var plainData = new byte[cipherData.Length];
    aes.Decrypt(iv, cipherData, tag, plainData);

    return plainData;
  }

  /// <summary>
  /// Encrypt string to base64-encoded ciphertext
  /// </summary>
  public static string EncryptString(string plainText, string password)
  {
    var plainBytes = Encoding.UTF8.GetBytes(plainText);
    var encryptedBytes = Encrypt(plainBytes, password);
    return Convert.ToBase64String(encryptedBytes);
  }

  /// <summary>
  /// Decrypt base64-encoded ciphertext to string
  /// </summary>
  public static string DecryptString(string encryptedBase64, string password)
  {
    var encryptedBytes = Convert.FromBase64String(encryptedBase64);
    var plainBytes = Decrypt(encryptedBytes, password);
    return Encoding.UTF8.GetString(plainBytes);
  }
}

/// <summary>
/// Compression utilities for screenshots and large data
/// </summary>
public static class CompressionHelper
{
  /// <summary>
  /// Compress byte array using Deflate
  /// </summary>
  public static byte[] Compress(byte[] data)
  {
    using var input = new MemoryStream(data);
    using var output = new MemoryStream();

    using (var deflate = new System.IO.Compression.DeflateStream(output, System.IO.Compression.CompressionLevel.Optimal))
    {
      input.CopyTo(deflate);
    }

    return output.ToArray();
  }

  /// <summary>
  /// Decompress byte array
  /// </summary>
  public static byte[] Decompress(byte[] compressedData)
  {
    using var input = new MemoryStream(compressedData);
    using var output = new MemoryStream();

    using (var deflate = new System.IO.Compression.DeflateStream(input, System.IO.Compression.CompressionMode.Decompress))
    {
      deflate.CopyTo(output);
    }

    return output.ToArray();
  }
}

/// <summary>
/// Hash utilities for data integrity and deduplication
/// </summary>
public static class HashHelper
{
  /// <summary>
  /// Calculate SHA-256 hash of data
  /// </summary>
  public static string ComputeSha256(byte[] data)
  {
    using var sha256 = SHA256.Create();
    var hashBytes = sha256.ComputeHash(data);
    return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
  }

  /// <summary>
  /// Calculate SHA-256 hash of string
  /// </summary>
  public static string ComputeSha256(string text)
  {
    return ComputeSha256(Encoding.UTF8.GetBytes(text));
  }
}
