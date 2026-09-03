using AltGridLib.Pro;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace AltGridLib.Tests;

/// <summary>
/// Tests for Pro Features stub implementations
/// Verifies that community version gracefully handles missing pro entitlements
/// </summary>
public class ProFeaturesTests
{
  [Fact]
  public async Task ProFeaturesStub_ActivateAsync_CompletesWithoutError()
  {
    // Arrange
    var stub = new ProFeaturesStub(NullLogger<ProFeaturesStub>.Instance);
    var context = new ProActivationContext
    {
      Services = new ServiceProviderStub(),
      LoggerFactory = NullLoggerFactory.Instance,
      DataDirectory = "/tmp/test-data"
    };

    // Act
    await stub.ActivateAsync(context);

    // Assert
    // Should complete without throwing (no-op in community version)
  }

  [Fact]
  public async Task ProFeaturesStub_DeactivateAsync_CompletesWithoutError()
  {
    // Arrange
    var stub = new ProFeaturesStub(NullLogger<ProFeaturesStub>.Instance);

    // Act
    await stub.DeactivateAsync();

    // Assert
    // Should complete without throwing (no-op in community version)
  }

  [Fact]
  public void ProActivationContext_HasRequiredProperties()
  {
    // Arrange & Act
    var context = new ProActivationContext
    {
      Services = new ServiceProviderStub(),
      LoggerFactory = NullLoggerFactory.Instance,
      DataDirectory = "/test/path"
    };

    // Assert
    Assert.NotNull(context.Services);
    Assert.NotNull(context.LoggerFactory);
    Assert.Equal("/test/path", context.DataDirectory);
    Assert.Null(context.OnEntitlementChanged);
  }

  [Fact]
  public void ActivityEvent_Model_HasExpectedProperties()
  {
    // Arrange & Act
    var activity = new ActivityEvent
    {
      Timestamp = DateTime.UtcNow,
      Type = "screenshot",
      AppName = "TestApp",
      WindowTitle = "Test Window",
      ScreenshotData = new byte[] { 0x01, 0x02 }
    };

    // Assert
    Assert.Equal("screenshot", activity.Type);
    Assert.Equal("TestApp", activity.AppName);
    Assert.NotNull(activity.Metadata);
  }

  [Fact]
  public void MeetingRecording_Model_GeneratesId()
  {
    // Act
    var recording = new MeetingRecording
    {
      Title = "Test Meeting"
    };

    // Assert
    Assert.NotNull(recording.Id);
    Assert.NotEmpty(recording.Id);
    Assert.Equal("Test Meeting", recording.Title);
    Assert.True(recording.StartTime <= DateTime.UtcNow);
  }

  [Fact]
  public void Entity_Model_SupportsAllTypes()
  {
    // Arrange & Act
    var person = new Entity
    {
      Id = "p1",
      Name = "John Doe",
      Type = "person"
    };

    var project = new Entity
    {
      Id = "prj1",
      Name = "AltGrid",
      Type = "project"
    };

    var company = new Entity
    {
      Id = "c1",
      Name = "Acme Corp",
      Type = "company"
    };

    // Assert
    Assert.Equal("person", person.Type);
    Assert.Equal("project", project.Type);
    Assert.Equal("company", company.Type);
    Assert.NotNull(person.Aliases);
    Assert.NotNull(project.Metadata);
  }
}

/// <summary>
/// Stub service provider for testing
/// </summary>
public class ServiceProviderStub : IServiceProvider
{
  public object? GetService(Type serviceType) => null;
}
