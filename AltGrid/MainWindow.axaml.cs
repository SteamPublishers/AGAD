using Avalonia.Controls;
using Microsoft.Extensions.DependencyInjection;

namespace AltGrid;

public partial class MainWindow : Window
{
    public MainWindow(MainViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
        
        Title = "AltGrid - .NET 10 + Avalonia Demo";
        Width = 900;
        Height = 700;
    }
}
