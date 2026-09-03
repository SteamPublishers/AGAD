using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace AltGridLib.Tests;

/// <summary>
/// Tests for encryption utilities - critical for VAULT feature
/// These tests verify round-trip encryption/decryption with real crypto (not mocked)
/// </summary>
public class EncryptionTests
{
  [Fact]
  public void EncryptDecrypt_RoundTrip_ReturnsOriginalPlaintext()
  {
    // Arrange
    var key = TestFixtures.GetTestEncryptionKey();
    var plaintext = TestFixtures.GetTestPlaintext();
    var plainbytes = Encoding.UTF8.GetBytes(plaintext);
    // Act
    var encrypted = Utils.EncryptionHelper.Encrypt(plainbytes, key);
    var decrypted = Utils.EncryptionHelper.Decrypt(encrypted, key);

    // Assert
    Assert.NotNull(encrypted);
    Assert.NotEmpty(encrypted);
    Assert.NotEqual(plaintext, Encoding.UTF8.GetString(encrypted)); // Encrypted should differ
    Assert.Equal(plainbytes, decrypted);
  }

  [Fact]
  public void Encrypt_SameInput_ProducesDifferentOutputDueToIV()
  {
    // Arrange
    var key = TestFixtures.GetTestEncryptionKey();
    var plaintext = "Same text to encrypt";
    var plainbytes = Encoding.UTF8.GetBytes(plaintext);

    // Act
    var encrypted1 = Utils.EncryptionHelper.Encrypt(plainbytes, key);
    var encrypted2 = Utils.EncryptionHelper.Encrypt(plainbytes, key);

    var decrypted1 = Utils.EncryptionHelper.Decrypt(encrypted1, key);
    var decrypted2 = Utils.EncryptionHelper.Decrypt(encrypted2, key);

    // Assert
    Assert.NotEqual(encrypted1, encrypted2); // IV makes each encryption unique
    Assert.Equal(plainbytes, decrypted1);
    Assert.Equal(plainbytes, decrypted1);
  }

  [Fact]
  public void Decrypt_WrongKey_ThrowsException()
  {
    // Arrange
    var key1 = TestFixtures.GetTestEncryptionKey();
    var key2 = "WrongKey123456789012345678901234";
    var plaintext = TestFixtures.GetTestPlaintext();
    var plainbytes = Encoding.UTF8.GetBytes(plaintext);

    var encrypted = Utils.EncryptionHelper.Encrypt(plainbytes, key1);

    // Act & Assert
    Assert.ThrowsAny<CryptographicException>(() =>
        Utils.EncryptionHelper.Decrypt(encrypted, key2));
  }

  [Fact]
  public void Decrypt_TamperedData_ThrowsException()
  {
    // Arrange
    var key = TestFixtures.GetTestEncryptionKey();
    var plaintext = TestFixtures.GetTestPlaintext();

    var plainbytes = Encoding.UTF8.GetBytes(plaintext);
    var encrypted = Utils.EncryptionHelper.Encrypt(plainbytes, key);
    var tampered = new byte[encrypted.Length];
    Array.Copy(encrypted, tampered, encrypted.Length);
    tampered[10] ^= 0xFF; // Flip bits in the middle

    // Act & Assert
    Assert.ThrowsAny<CryptographicException>(() =>
        Utils.EncryptionHelper.Decrypt(tampered, key));
  }

  [Fact]
  public void Encrypt_EmptyString_ReturnsValidCiphertext()
  {
    // Arrange
    var key = TestFixtures.GetTestEncryptionKey();
    var plaintext = string.Empty;

    var plainbytes = Encoding.UTF8.GetBytes(plaintext);

    // Act
    var encrypted = Utils.EncryptionHelper.Encrypt(plainbytes, key);
    var decrypted = Utils.EncryptionHelper.Decrypt(encrypted, key);

    // Assert
    Assert.NotNull(encrypted);
    Assert.NotEmpty(encrypted); // AES-GCM produces auth tag even for empty input
    Assert.Equal(plainbytes, decrypted);
  }

  [Fact]
  public void Encrypt_LargeText_SuccessfullyEncrypts()
  {
    // Arrange
    var key = TestFixtures.GetTestEncryptionKey();
    var plaintext = new string('A', 10000); // 10KB of data
    var plainbytes = Encoding.UTF8.GetBytes(plaintext);


    // Act
    var encrypted = Utils.EncryptionHelper.Encrypt(plainbytes, key);
    var decrypted = Utils.EncryptionHelper.Decrypt(encrypted, key);

    // Assert
    Assert.Equal(plainbytes, decrypted);
  }

  [Fact]
  public void ComputeSha256_ConsistentHash_ReturnsSameHash()
  {
    // Arrange
    var input = "Consistent hash test";

    // Act
    var hash1 = Utils.HashHelper.ComputeSha256(input);
    var hash2 = Utils.HashHelper.ComputeSha256(input);

    // Assert
    Assert.Equal(hash1, hash2);
    Assert.Equal(64, hash1.Length); // SHA256 produces 64 hex characters
  }

  [Fact]
  public void ComputeSha256_DifferentInput_ProducesDifferentHash()
  {
    // Arrange
    var input1 = "Input one";
    var input2 = "Input two";

    // Act
    var hash1 = Utils.HashHelper.ComputeSha256(input1);
    var hash2 = Utils.HashHelper.ComputeSha256(input2);

    // Assert
    Assert.NotEqual(hash1, hash2);
  }

  [Fact]
  public void CompressDecompress_RoundTrip_ReturnsOriginal()
  {
    // Arrange
    var original = Encoding.UTF8.GetBytes(new string('B', 1000));

    // Act
    var compressed = Utils.CompressionHelper.Compress(original);
    var decompressed = Utils.CompressionHelper.Decompress(compressed);

    // Assert
    Assert.NotNull(compressed);
    Assert.True(compressed.Length < original.Length, "Compressed should be smaller");
    Assert.Equal(original, decompressed);
  }

  [Fact]
  public void Decompress_InvalidData_ThrowsException()
  {
    // Arrange
    var invalidData = new byte[] { 0x00, 0x01, 0x02, 0x03 };

    // Act & Assert
    Assert.ThrowsAny<Exception>(() => Utils.CompressionHelper.Decompress(invalidData));
  }
}
